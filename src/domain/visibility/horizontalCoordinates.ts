/** Geographic CRS using explicit longitude-latitude axis order in decimal degrees. */
export interface GeographicCoordinateReferenceSystem {
  kind: "geographic";
  code: string;
  axisOrder: "longitude-latitude";
  angularUnit: "degree";
}

/** Projected CRS whose coordinates are expressed as X then Y in its declared linear unit. */
export interface ProjectedCoordinateReferenceSystem {
  kind: "projected";
  code: string;
  axisOrder: "x-y";
  linearUnit: string;
}

export interface GeographicCoordinate {
  longitudeDegrees: number;
  latitudeDegrees: number;
}

export interface ProjectedCoordinate {
  x: number;
  y: number;
}

/** Thrown by an implementation when its configured CRS operation is unavailable. */
export class UnsupportedHorizontalTransformError extends Error {
  constructor(sourceCode: string, targetCode: string, detail = "") {
    super(`Unsupported horizontal coordinate transformation: ${sourceCode} -> ${targetCode}${detail}`);
    this.name = "UnsupportedHorizontalTransformError";
  }
}

/**
 * Library-independent horizontal transform port. Implementations receive fully identified
 * CRSs and must throw UnsupportedHorizontalTransformError for unsupported pairs. This port
 * handles no elevations, heights, geoid models, or vertical datum conversions.
 */
export interface HorizontalCoordinateTransformer {
  geographicToProjected(
    coordinate: GeographicCoordinate,
    sourceCrs: GeographicCoordinateReferenceSystem,
    targetCrs: ProjectedCoordinateReferenceSystem,
  ): ProjectedCoordinate;
  projectedToGeographic(
    coordinate: ProjectedCoordinate,
    sourceCrs: ProjectedCoordinateReferenceSystem,
    targetCrs: GeographicCoordinateReferenceSystem,
  ): GeographicCoordinate;
}

/** Validates longitude/latitude and delegates one explicitly horizontal forward operation. */
export function transformGeographicToProjected(
  transformer: HorizontalCoordinateTransformer,
  coordinate: GeographicCoordinate,
  sourceCrs: GeographicCoordinateReferenceSystem,
  targetCrs: ProjectedCoordinateReferenceSystem,
): ProjectedCoordinate {
  validateGeographicCrs(sourceCrs);
  validateProjectedCrs(targetCrs);
  validateGeographicCoordinate(coordinate);
  return validateProjectedCoordinate(transformer.geographicToProjected(coordinate, sourceCrs, targetCrs));
}

/** Validates projected X/Y and delegates one explicitly horizontal inverse operation. */
export function transformProjectedToGeographic(
  transformer: HorizontalCoordinateTransformer,
  coordinate: ProjectedCoordinate,
  sourceCrs: ProjectedCoordinateReferenceSystem,
  targetCrs: GeographicCoordinateReferenceSystem,
): GeographicCoordinate {
  validateProjectedCrs(sourceCrs);
  validateGeographicCrs(targetCrs);
  validateProjectedCoordinate(coordinate);
  return validateGeographicCoordinate(transformer.projectedToGeographic(coordinate, sourceCrs, targetCrs));
}

function validateGeographicCrs(crs: GeographicCoordinateReferenceSystem): void {
  if (!crs || crs.kind !== "geographic" || crs.axisOrder !== "longitude-latitude" ||
    crs.angularUnit !== "degree" || typeof crs.code !== "string" || !crs.code.trim()) {
    throw new RangeError("A geographic CRS with longitude-latitude degree axes is required");
  }
}

function validateProjectedCrs(crs: ProjectedCoordinateReferenceSystem): void {
  if (!crs || crs.kind !== "projected" || crs.axisOrder !== "x-y" ||
    typeof crs.code !== "string" || !crs.code.trim() ||
    typeof crs.linearUnit !== "string" || !crs.linearUnit.trim()) {
    throw new RangeError("A projected CRS with X-Y axes and a declared linear unit is required");
  }
}

function validateGeographicCoordinate(coordinate: GeographicCoordinate): GeographicCoordinate {
  if (!coordinate || !Number.isFinite(coordinate.longitudeDegrees) ||
    coordinate.longitudeDegrees < -180 || coordinate.longitudeDegrees > 180 ||
    !Number.isFinite(coordinate.latitudeDegrees) ||
    coordinate.latitudeDegrees < -90 || coordinate.latitudeDegrees > 90) {
    throw new RangeError("Geographic coordinate must contain valid longitude and latitude in degrees");
  }
  return coordinate;
}

function validateProjectedCoordinate(coordinate: ProjectedCoordinate): ProjectedCoordinate {
  if (!coordinate || !Number.isFinite(coordinate.x) || !Number.isFinite(coordinate.y)) {
    throw new RangeError("Projected coordinate must contain finite X and Y values");
  }
  return coordinate;
}
