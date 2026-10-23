import type { RasterAffineTransform } from "./terrainDataset";

export interface RasterDimensions {
  width: number;
  height: number;
}

/** Pixel coordinates use integer indices at pixel centers; (0, 0) is the first center. */
export interface RasterPixelPosition {
  column: number;
  row: number;
}

/** Coordinates in the raster's horizontal CRS. No vertical transformation is performed. */
export interface RasterWorldPosition {
  x: number;
  y: number;
}

export type RasterCoordinateLookup =
  | { state: "inside"; pixel: RasterPixelPosition }
  | { state: "outside-coverage" };

/**
 * Maps raster pixel centers and CRS coordinates using the raster's full affine transform.
 * The transform origin describes the upper-left pixel corner. The coverage footprint
 * includes all four outer edges; consequently an exact outer edge is inside coverage,
 * while any coordinate beyond it is outside. This class does not reproject between CRSs.
 */
export class RasterGeoreferencing {
  private readonly determinant: number;

  constructor(
    private readonly transform: RasterAffineTransform,
    private readonly dimensions: RasterDimensions,
  ) {
    if (!Number.isSafeInteger(dimensions.width) || dimensions.width <= 0 ||
      !Number.isSafeInteger(dimensions.height) || dimensions.height <= 0) {
      throw new RangeError("Raster dimensions must be positive integers");
    }
    if (!Object.values(transform).every(Number.isFinite)) {
      throw new RangeError("Affine transform coefficients must be finite");
    }
    this.determinant = transform.pixelX * transform.rowY - transform.rowX * transform.pixelY;
    if (!Number.isFinite(this.determinant) || Math.abs(this.determinant) <= Number.EPSILON) {
      throw new RangeError("Affine transform must be invertible");
    }
  }

  /** Convert center-indexed pixel coordinates to horizontal CRS coordinates. */
  pixelToWorld(pixel: RasterPixelPosition): RasterWorldPosition {
    if (!Number.isFinite(pixel.column) || !Number.isFinite(pixel.row)) {
      throw new RangeError("Pixel coordinates must be finite");
    }
    const cornerColumn = pixel.column + 0.5;
    const cornerRow = pixel.row + 0.5;
    return {
      x: this.transform.originX + cornerColumn * this.transform.pixelX + cornerRow * this.transform.rowX,
      y: this.transform.originY + cornerColumn * this.transform.pixelY + cornerRow * this.transform.rowY,
    };
  }

  /** Convert horizontal CRS coordinates to center-indexed pixel coordinates, if covered. */
  worldToPixel(world: RasterWorldPosition): RasterCoordinateLookup {
    if (!Number.isFinite(world.x) || !Number.isFinite(world.y)) {
      throw new RangeError("World coordinates must be finite");
    }
    const dx = world.x - this.transform.originX;
    const dy = world.y - this.transform.originY;
    const cornerColumn = (dx * this.transform.rowY - this.transform.rowX * dy) / this.determinant;
    const cornerRow = (this.transform.pixelX * dy - dx * this.transform.pixelY) / this.determinant;
    const epsilon = 1e-10;
    if (cornerColumn < -epsilon || cornerColumn > this.dimensions.width + epsilon ||
      cornerRow < -epsilon || cornerRow > this.dimensions.height + epsilon) {
      return { state: "outside-coverage" };
    }
    return {
      state: "inside",
      pixel: { column: cornerColumn - 0.5, row: cornerRow - 0.5 },
    };
  }
}

/**
 * Integration point for a future horizontal CRS library. Implementations must transform
 * coordinates only; vertical datum conversion is a separate operation and is not implied.
 */
export interface HorizontalCoordinateTransformer {
  transform(position: { x: number; y: number }, sourceCrs: string, targetCrs: string): { x: number; y: number };
}
