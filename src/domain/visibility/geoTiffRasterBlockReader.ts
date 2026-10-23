import { fromArrayBuffer, fromBlob, fromUrl } from "geotiff";
import type { GeoTIFFImage, RemoteSourceOptions } from "geotiff";
import type { TerrainDatasetMetadata } from "./terrainDataset";
import { validateTerrainDatasetMetadata } from "./terrainDataset";
import { RasterGeoreferencing } from "./rasterGeoreferencing";
import type { RasterAffineTransform } from "./terrainDataset";
import type { RasterBlock, RasterBlockReader } from "./rasterElevationProvider";
import type { DatasetLicense, DatasetVerticalReference } from "./terrainDataset";

/** Product-level facts that GeoTIFF tags cannot authoritatively establish. */
export interface GeoTiffProductMetadata {
  id: string;
  producer: string;
  source: string;
  version: string;
  dataDate: string;
  license: DatasetLicense;
  nominalResolutionMeters: number;
  effectiveResolutionMeters: number;
  horizontalCrs: { code: string; definition?: string };
  verticalReference: DatasetVerticalReference;
  /** Required only when the TIFF contains a vertical EPSG GeoKey. */
  verticalCrsCode?: string;
}

export interface GeoTiffOpenOptions {
  product: GeoTiffProductMetadata;
  /** Both selections are mandatory so an image/band is never silently guessed. */
  imageIndex: number;
  sampleIndex: number;
  signal?: AbortSignal;
  remoteOptions?: RemoteSourceOptions;
}

export type GeoTiffSource = Blob | ArrayBuffer | string;

export interface OpenedGeoTiffRaster {
  metadata: TerrainDatasetMetadata;
  reader: GeoTiffRasterBlockReader;
}

/**
 * Reads one selected GeoTIFF sample by native image blocks. Opening reads metadata;
 * readBlock decodes only the requested pixel window. Vertical reference and product
 * provenance are supplied by the caller and must be confirmed independently.
 */
export class GeoTiffRasterBlockReader implements RasterBlockReader {
  readonly blockWidth: number;
  readonly blockHeight: number;

  private constructor(
    private readonly image: GeoTIFFImage,
    private readonly sampleIndex: number,
    readonly metadata: TerrainDatasetMetadata,
  ) {
    this.blockWidth = image.getBlockWidth();
    this.blockHeight = image.getBlockHeight(0);
  }

  static async open(source: GeoTiffSource, options: GeoTiffOpenOptions): Promise<OpenedGeoTiffRaster> {
    validateProductMetadata(options.product);
    validateSelection(options.imageIndex, "image");
    validateSelection(options.sampleIndex, "sample");

    const tiff = await openSource(source, options);
    const imageCount = await tiff.getImageCount();
    if (options.imageIndex >= imageCount) {
      throw new RangeError(`GeoTIFF image index ${options.imageIndex} is outside the ${imageCount} available image(s)`);
    }
    const image = await tiff.getImage(options.imageIndex);
    if (options.sampleIndex >= image.getSamplesPerPixel()) {
      throw new RangeError(`GeoTIFF sample index ${options.sampleIndex} is unavailable`);
    }
    validatePixelEncoding(image, options.sampleIndex);

    const geoKeys = image.getGeoKeys();
    if (geoKeys?.GTModelTypeGeoKey !== 1) {
      throw new Error("GeoTIFF must explicitly declare a projected horizontal CRS model");
    }
    const projectedCrsCode = resolveProjectedCrsCode(geoKeys?.ProjectedCSTypeGeoKey);
    if (projectedCrsCode !== options.product.horizontalCrs.code) {
      throw new Error(
        `GeoTIFF horizontal CRS ${projectedCrsCode} does not match product CRS ${options.product.horizontalCrs.code}`,
      );
    }
    validateVerticalGeoKey(geoKeys?.VerticalCSTypeGeoKey, options.product.verticalCrsCode);

    const rasterType = geoKeys?.GTRasterTypeGeoKey;
    if (rasterType !== 1 && rasterType !== 2) {
      throw new Error("GeoTIFF must explicitly declare PixelIsArea or PixelIsPoint");
    }
    const transform = readAffineTransform(image, rasterType === 2);
    const width = image.getWidth();
    const height = image.getHeight();
    const georeferencing = new RasterGeoreferencing(transform, { width, height });
    const extent = rasterExtent(georeferencing, width, height);
    const noDataValue = image.getGDALNoData();
    if (noDataValue === null) throw new Error("GeoTIFF has no GDAL_NODATA value; an explicit nodata policy is required");
    if (!Number.isFinite(noDataValue) && !Number.isNaN(noDataValue)) {
      throw new Error("GeoTIFF nodata value must be finite or NaN");
    }

    validateScaleOffsetAndUnits(await image.getGDALMetadata(options.sampleIndex));

    const blockWidth = image.getBlockWidth();
    const blockHeight = image.getBlockHeight(0);
    if (!Number.isSafeInteger(blockWidth) || blockWidth <= 0 ||
      !Number.isSafeInteger(blockHeight) || blockHeight <= 0) {
      throw new Error("GeoTIFF block dimensions are missing or invalid");
    }
    const metadata: TerrainDatasetMetadata = {
      ...options.product,
      format: "GeoTIFF",
      width,
      height,
      extent,
      geotransform: transform,
      noData: Number.isNaN(noDataValue) ? { kind: "nan" } : { kind: "value", value: noDataValue },
      blockSize: { width: blockWidth, height: blockHeight },
    };
    const validation = validateTerrainDatasetMetadata(metadata);
    if (!validation.valid) {
      throw new Error(`GeoTIFF product metadata is not production-ready: ${validation.errors.join("; ")}`);
    }

    const reader = new GeoTiffRasterBlockReader(image, options.sampleIndex, metadata);
    return { metadata, reader };
  }

  async readBlock(blockColumn: number, blockRow: number): Promise<RasterBlock | null> {
    const columnCount = Math.ceil(this.metadata.width / this.blockWidth);
    const rowCount = Math.ceil(this.metadata.height / this.blockHeight);
    if (!Number.isSafeInteger(blockColumn) || !Number.isSafeInteger(blockRow) ||
      blockColumn < 0 || blockColumn >= columnCount || blockRow < 0 || blockRow >= rowCount) return null;

    const left = blockColumn * this.blockWidth;
    const top = blockRow * this.blockHeight;
    const right = Math.min(left + this.blockWidth, this.metadata.width);
    const bottom = Math.min(top + this.image.getBlockHeight(blockRow), this.metadata.height);
    const expectedWidth = right - left;
    const expectedHeight = bottom - top;
    try {
      const result = await this.image.readRasters({
        window: [left, top, right, bottom],
        samples: [this.sampleIndex],
        interleave: false,
      });
      const values = result[0];
      if (result.width !== expectedWidth || result.height !== expectedHeight ||
        values.length !== expectedWidth * expectedHeight) {
        throw new Error("GeoTIFF decoder returned dimensions inconsistent with the requested block");
      }
      return { blockColumn, blockRow, width: expectedWidth, height: expectedHeight, values };
    } catch (error) {
      const detail = error instanceof Error ? `: ${error.message}` : "";
      throw new Error(`Could not decode GeoTIFF block ${blockColumn},${blockRow}${detail}`);
    }
  }
}

async function openSource(source: GeoTiffSource, options: GeoTiffOpenOptions) {
  if (typeof source === "string") {
    return fromUrl(source, { ...options.remoteOptions, allowFullFile: false }, options.signal);
  }
  if (source instanceof ArrayBuffer) return fromArrayBuffer(source, options.signal);
  if (typeof Blob !== "undefined" && source instanceof Blob) return fromBlob(source, options.signal);
  throw new TypeError("GeoTIFF source must be a URL, Blob, or ArrayBuffer");
}

function validateProductMetadata(product: GeoTiffProductMetadata): void {
  if (!product || typeof product !== "object") throw new TypeError("Explicit GeoTIFF product metadata is required");
  if (product.verticalReference?.status !== "confirmed") {
    throw new Error("GeoTIFF elevation queries require a confirmed vertical reference from product documentation");
  }
  if (product.license?.status !== "confirmed") {
    throw new Error("GeoTIFF elevation queries require confirmed license and attribution metadata");
  }
}

function validateSelection(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`GeoTIFF ${label} index must be a non-negative integer`);
}

function validatePixelEncoding(image: GeoTIFFImage, sampleIndex: number): void {
  const bits = image.getBitsPerSample(sampleIndex);
  const format = image.getSampleFormat(sampleIndex);
  const supported = (format === 1 || format === 2) && [8, 16, 32].includes(bits) ||
    format === 3 && (bits === 32 || bits === 64);
  if (!supported) {
    throw new Error(`Unsupported GeoTIFF sample encoding: sample format ${format}, ${bits} bits`);
  }

  const compression = image.getFileDirectory().getValue("Compression") ?? 1;
  // Only lossless, registered TIFF compression schemes are accepted for elevation values.
  if (![1, 5, 8, 32773, 32946, 50000].includes(compression)) {
    throw new Error(`Unsupported or potentially lossy GeoTIFF compression: ${compression}`);
  }
  const orientation = image.getFileDirectory().toObject().Orientation;
  if (orientation !== undefined && orientation !== 1) {
    throw new Error(`Unsupported TIFF orientation ${orientation}; only top-left orientation is supported`);
  }
}

function resolveProjectedCrsCode(value: unknown): string {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0 || value === 32767) {
    throw new Error("GeoTIFF must contain a supported ProjectedCSTypeGeoKey");
  }
  return `EPSG:${value}`;
}

function validateVerticalGeoKey(value: unknown, configuredCode?: string): void {
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0 || value === 32767) {
    throw new Error("GeoTIFF contains an unsupported vertical CRS GeoKey");
  }
  if (!configuredCode || configuredCode !== `EPSG:${value}`) {
    throw new Error(`GeoTIFF vertical CRS EPSG:${value} does not match an explicitly configured product vertical CRS`);
  }
}

function readAffineTransform(image: GeoTIFFImage, pixelIsPoint: boolean): RasterAffineTransform {
  const directory = image.getFileDirectory();
  const matrix = directory.getValue("ModelTransformation") as number[] | undefined;
  if (matrix !== undefined) {
    if (matrix.length !== 16 || !matrix.every(Number.isFinite) ||
      matrix[2] !== 0 || matrix[6] !== 0 || matrix[8] !== 0 || matrix[9] !== 0 ||
      matrix[10] !== 1 || matrix[11] !== 0 || matrix[12] !== 0 ||
      matrix[13] !== 0 || matrix[14] !== 0 || matrix[15] !== 1) {
      throw new Error("GeoTIFF ModelTransformation is not a supported 2D affine transform");
    }
    const pixelX = matrix[0];
    const rowX = matrix[1];
    const pixelY = matrix[4];
    const rowY = matrix[5];
    // The contract affine is corner-based. PixelIsPoint tags identify sample centers,
    // while PixelIsArea tags identify pixel corners, so only Point needs a half-cell shift.
    const halfCellOffset = pixelIsPoint ? 0.5 : 0;
    return {
      originX: matrix[3] - halfCellOffset * (pixelX + rowX),
      pixelX,
      rowX,
      originY: matrix[7] - halfCellOffset * (pixelY + rowY),
      pixelY,
      rowY,
    };
  }

  const scale = directory.getValue("ModelPixelScale") as number[] | undefined;
  const tiePoints = directory.getValue("ModelTiepoint") as number[] | undefined;
  if (!scale || scale.length !== 3 || !scale.every(Number.isFinite) ||
    scale[0] <= 0 || scale[1] <= 0 || !tiePoints || tiePoints.length !== 6 ||
    !tiePoints.every(Number.isFinite)) {
    throw new Error("GeoTIFF needs an unambiguous ModelTransformation or one ModelPixelScale/ModelTiepoint pair");
  }
  const pixelX = scale[0];
  const rowY = -scale[1];
  // GeoTIFF ModelTiepoint coordinates refer to a point center for PixelIsPoint and
  // to the upper-left pixel corner for PixelIsArea; normalize both to corner origin.
  const pointOffset = pixelIsPoint ? 0.5 : 0;
  return {
    originX: tiePoints[3] - tiePoints[0] * pixelX - pointOffset * pixelX,
    pixelX,
    rowX: 0,
    originY: tiePoints[4] - tiePoints[1] * rowY - pointOffset * rowY,
    pixelY: 0,
    rowY,
  };
}

function rasterExtent(
  georeferencing: RasterGeoreferencing,
  width: number,
  height: number,
): TerrainDatasetMetadata["extent"] {
  const corners = [
    georeferencing.pixelToWorld({ column: -0.5, row: -0.5 }),
    georeferencing.pixelToWorld({ column: width - 0.5, row: -0.5 }),
    georeferencing.pixelToWorld({ column: -0.5, row: height - 0.5 }),
    georeferencing.pixelToWorld({ column: width - 0.5, row: height - 0.5 }),
  ];
  return {
    minX: Math.min(...corners.map(({ x }) => x)),
    minY: Math.min(...corners.map(({ y }) => y)),
    maxX: Math.max(...corners.map(({ x }) => x)),
    maxY: Math.max(...corners.map(({ y }) => y)),
  };
}

function validateScaleOffsetAndUnits(metadata: Record<string, unknown> | null): void {
  if (!metadata) return;
  const normalized = new Map(Object.entries(metadata).map(([key, value]) => [key.toLowerCase(), value]));
  for (const [key, identity] of [["scale", 1], ["offset", 0]] as const) {
    const value = normalized.get(key);
    if (value === undefined) continue;
    const number = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(number) || number !== identity) {
      throw new Error(`GeoTIFF GDAL ${key} ${String(value)} requires an unsupported sample conversion`);
    }
  }
  const units = normalized.get("unittype");
  if (units !== undefined && !["m", "meter", "meters", "metre", "metres"].includes(String(units).toLowerCase())) {
    throw new Error(`GeoTIFF vertical units ${String(units)} are not metres`);
  }
}

