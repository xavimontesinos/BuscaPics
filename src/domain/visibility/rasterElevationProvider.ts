import type {
  GeographicCoordinateReferenceSystem,
  HorizontalCoordinateTransformer,
  ProjectedCoordinateReferenceSystem,
} from "./horizontalCoordinates";
import { transformGeographicToProjected } from "./horizontalCoordinates";
import { RasterGeoreferencing } from "./rasterGeoreferencing";
import { validateTerrainDatasetMetadata } from "./terrainDataset";
import type { TerrainDatasetMetadata } from "./terrainDataset";
import type {
  GeographicPosition,
  TerrainElevationSample,
  VerticalReference,
} from "./types";

/** A decoded raster block. Values are row-major and the optional mask uses 1 for valid cells. */
export interface RasterBlock {
  blockColumn: number;
  blockRow: number;
  width: number;
  height: number;
  values: ArrayLike<number>;
  validityMask?: ArrayLike<number>;
}

/** Async data boundary. Implementations may read local files, IndexedDB, or a future COG source. */
export interface RasterBlockReader {
  readBlock(blockColumn: number, blockRow: number): Promise<RasterBlock | null>;
}

export interface RasterBlockCacheStats {
  cachedBlocks: number;
  blockReadRequests: number;
}

export interface RasterBlockCoordinate {
  blockColumn: number;
  blockRow: number;
}

export type RasterElevationLookup =
  | { state: "available"; sample: TerrainElevationSample }
  | { state: "missing" }
  | { state: "outside-coverage" }
  | { state: "incompatible-vertical-reference" };

/**
 * In-memory source used by deterministic tests and small prepared regions. It exposes
 * the same asynchronous block boundary a file-backed reader can implement later.
 */
export class InMemoryRasterBlockReader implements RasterBlockReader {
  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly blockWidth: number,
    private readonly blockHeight: number,
    private readonly values: ArrayLike<number>,
    private readonly validityMask?: ArrayLike<number>,
  ) {
    if (![width, height, blockWidth, blockHeight].every(Number.isSafeInteger) ||
      width <= 0 || height <= 0 || blockWidth <= 0 || blockHeight <= 0) {
      throw new RangeError("Raster and block dimensions must be positive integers");
    }
    if (values.length !== width * height ||
      (validityMask !== undefined && validityMask.length !== width * height)) {
      throw new RangeError("Raster values and mask must match the raster dimensions");
    }
  }

  async readBlock(blockColumn: number, blockRow: number): Promise<RasterBlock | null> {
    const columns = Math.ceil(this.width / this.blockWidth);
    const rows = Math.ceil(this.height / this.blockHeight);
    if (!Number.isSafeInteger(blockColumn) || !Number.isSafeInteger(blockRow) ||
      blockColumn < 0 || blockColumn >= columns || blockRow < 0 || blockRow >= rows) return null;

    const startColumn = blockColumn * this.blockWidth;
    const startRow = blockRow * this.blockHeight;
    const width = Math.min(this.blockWidth, this.width - startColumn);
    const height = Math.min(this.blockHeight, this.height - startRow);
    const values = new Float64Array(width * height);
    const validityMask = this.validityMask === undefined ? undefined : new Uint8Array(width * height);
    for (let row = 0; row < height; row += 1) {
      for (let column = 0; column < width; column += 1) {
        const sourceIndex = (startRow + row) * this.width + startColumn + column;
        const targetIndex = row * width + column;
        values[targetIndex] = this.values[sourceIndex];
        if (validityMask && this.validityMask) validityMask[targetIndex] = this.validityMask[sourceIndex];
      }
    }
    return { blockColumn, blockRow, width, height, values, validityMask };
  }
}

/**
 * Synchronous elevation queries over blocks prepared asynchronously beforehand.
 * Coordinates are horizontally transformed into the raster CRS; elevations are
 * returned unchanged with their declared vertical reference.
 */
export class PreparedRasterElevationProvider {
  private readonly georeferencing: RasterGeoreferencing;
  private readonly blockWidth: number;
  private readonly blockHeight: number;
  private readonly blocks = new Map<string, RasterBlock | null>();
  private readonly verticalReference: VerticalReference;
  private blockReadRequests = 0;

  constructor(
    private readonly metadata: TerrainDatasetMetadata,
    private readonly reader: RasterBlockReader,
    private readonly transformer: HorizontalCoordinateTransformer,
    private readonly geographicCrs: GeographicCoordinateReferenceSystem,
    private readonly rasterCrs: ProjectedCoordinateReferenceSystem,
    private readonly maxCachedBlocks = 64,
  ) {
    const validation = validateTerrainDatasetMetadata(metadata);
    if (!validation.valid) throw new RangeError(`Invalid terrain metadata: ${validation.errors.join("; ")}`);
    if (!metadata.blockSize) throw new RangeError("Block dimensions are required for block-based raster access");
    if (metadata.horizontalCrs.code !== rasterCrs.code) {
      throw new RangeError("Raster CRS must match the dataset horizontal CRS");
    }
    if (!Number.isSafeInteger(maxCachedBlocks) || maxCachedBlocks <= 0) {
      throw new RangeError("Maximum cached block count must be a positive integer");
    }
    if (metadata.verticalReference.status !== "confirmed") {
      throw new RangeError("A confirmed vertical reference is required for elevation queries");
    }
    this.verticalReference = metadata.verticalReference.reference;
    this.blockWidth = metadata.blockSize.width;
    this.blockHeight = metadata.blockSize.height;
    this.georeferencing = new RasterGeoreferencing(metadata.geotransform, {
      width: metadata.width,
      height: metadata.height,
    });
  }

  /** Load all blocks needed by these positions. Throws if the request exceeds the cache limit. */
  async prepareForPositions(positions: readonly GeographicPosition[]): Promise<void> {
    const required = new Map<string, RasterBlockCoordinate>();
    for (const position of positions) {
      const pixel = this.toPixel(position);
      if (pixel === null) continue;
      const columns = interpolationIndices(pixel.column, this.metadata.width);
      const rows = interpolationIndices(pixel.row, this.metadata.height);
      for (const row of rows) for (const column of columns) {
        const coordinate = {
          blockColumn: Math.floor(column / this.blockWidth),
          blockRow: Math.floor(row / this.blockHeight),
        };
        required.set(blockKey(coordinate.blockColumn, coordinate.blockRow), coordinate);
      }
    }
    if (required.size > this.maxCachedBlocks) {
      throw new RangeError("Requested positions require more blocks than the configured cache can hold");
    }

    for (const [key, coordinate] of required) {
      if (this.blocks.has(key)) {
        this.touch(key);
        continue;
      }
      this.blockReadRequests += 1;
      const block = await this.reader.readBlock(coordinate.blockColumn, coordinate.blockRow);
      if (block !== null) this.validateBlock(block, coordinate);
      this.blocks.set(key, block);
      this.evictExcessBlocks();
    }
  }

  /** Reports native raster-block reads, which correspond to the provider's MDT cache misses. */
  getCacheStats(): RasterBlockCacheStats {
    return { cachedBlocks: this.blocks.size, blockReadRequests: this.blockReadRequests };
  }

  /** Synchronous lookup. A missing/unprepared cell never becomes a zero elevation. */
  getElevationAt(
    position: GeographicPosition,
    expectedVerticalReference: VerticalReference = this.verticalReference,
  ): RasterElevationLookup {
    if (!sameVerticalReference(this.verticalReference, expectedVerticalReference)) {
      return { state: "incompatible-vertical-reference" };
    }
    const pixel = this.toPixel(position);
    if (pixel === null) return { state: "outside-coverage" };

    const clampedColumn = clamp(pixel.column, 0, this.metadata.width - 1);
    const clampedRow = clamp(pixel.row, 0, this.metadata.height - 1);
    const columns = interpolationIndices(clampedColumn, this.metadata.width);
    const rows = interpolationIndices(clampedRow, this.metadata.height);
    const columnFraction = columns.length === 1 ? 0 : clampedColumn - columns[0];
    const rowFraction = rows.length === 1 ? 0 : clampedRow - rows[0];

    const values: number[][] = [];
    for (const row of rows) {
      const valueRow: number[] = [];
      for (const column of columns) {
        const value = this.readCell(column, row);
        if (value === null) return { state: "missing" };
        valueRow.push(value);
      }
      values.push(valueRow);
    }

    const top = values[0][0] + (values[0][values[0].length - 1] - values[0][0]) * columnFraction;
    const bottom = values[values.length - 1][0] +
      (values[values.length - 1][values[values.length - 1].length - 1] - values[values.length - 1][0]) * columnFraction;
    const elevation = top + (bottom - top) * rowFraction;
    if (!Number.isFinite(elevation)) return { state: "missing" };
    return {
      state: "available",
      sample: {
        position,
        elevation: { meters: elevation, verticalReference: this.verticalReference },
      },
    };
  }

  private toPixel(position: GeographicPosition) {
    const projected = transformGeographicToProjected(
      this.transformer,
      { longitudeDegrees: position.longitudeDegrees, latitudeDegrees: position.latitudeDegrees },
      this.geographicCrs,
      this.rasterCrs,
    );
    const lookup = this.georeferencing.worldToPixel(projected);
    return lookup.state === "inside" ? lookup.pixel : null;
  }

  private readCell(column: number, row: number): number | null {
    const blockColumn = Math.floor(column / this.blockWidth);
    const blockRow = Math.floor(row / this.blockHeight);
    const key = blockKey(blockColumn, blockRow);
    if (!this.blocks.has(key)) return null;
    this.touch(key);
    const block = this.blocks.get(key);
    if (!block) return null;
    const localColumn = column - blockColumn * this.blockWidth;
    const localRow = row - blockRow * this.blockHeight;
    const index = localRow * block.width + localColumn;
    const value = block.values[index];
    if (value === undefined || !Number.isFinite(value) || this.isNoData(value)) return null;
    if (this.metadata.noData.kind === "mask" && block.validityMask?.[index] !== 1) return null;
    if (this.metadata.noData.kind === "value-or-mask" &&
      block.validityMask !== undefined && block.validityMask[index] !== 1) return null;
    return value;
  }

  private isNoData(value: number): boolean {
    const policy = this.metadata.noData;
    return (policy.kind === "nan" && Number.isNaN(value)) ||
      ((policy.kind === "value" || policy.kind === "value-or-mask") && value === policy.value);
  }

  private validateBlock(block: RasterBlock, coordinate: RasterBlockCoordinate): void {
    const expectedWidth = Math.min(this.blockWidth, this.metadata.width - coordinate.blockColumn * this.blockWidth);
    const expectedHeight = Math.min(this.blockHeight, this.metadata.height - coordinate.blockRow * this.blockHeight);
    if (block.blockColumn !== coordinate.blockColumn || block.blockRow !== coordinate.blockRow ||
      block.width !== expectedWidth || block.height !== expectedHeight ||
      block.values.length !== block.width * block.height ||
      (block.validityMask !== undefined && block.validityMask.length !== block.values.length)) {
      throw new RangeError("Raster reader returned a malformed block");
    }
  }

  private touch(key: string): void {
    const value = this.blocks.get(key);
    this.blocks.delete(key);
    this.blocks.set(key, value ?? null);
  }

  private evictExcessBlocks(): void {
    while (this.blocks.size > this.maxCachedBlocks) {
      const oldest = this.blocks.keys().next().value as string | undefined;
      if (oldest === undefined) return;
      this.blocks.delete(oldest);
    }
  }
}

function interpolationIndices(value: number, size: number): number[] {
  const lower = Math.floor(value);
  const fraction = value - lower;
  if (fraction <= 1e-12) return [clamp(lower, 0, size - 1)];
  return [clamp(lower, 0, size - 1), clamp(lower + 1, 0, size - 1)];
}

function sameVerticalReference(first: VerticalReference, second: VerticalReference): boolean {
  return first.kind === second.kind && first.datum === second.datum;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function blockKey(column: number, row: number): string {
  return `${column}:${row}`;
}
