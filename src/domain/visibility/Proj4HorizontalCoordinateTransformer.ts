import proj4 from "proj4";
import type {
  GeographicCoordinate,
  GeographicCoordinateReferenceSystem,
  HorizontalCoordinateTransformer,
  ProjectedCoordinate,
  ProjectedCoordinateReferenceSystem,
} from "./horizontalCoordinates";
import { UnsupportedHorizontalTransformError } from "./horizontalCoordinates";

export interface Proj4CrsDefinition {
  /** Must exactly match the code used by calls to this adapter. */
  code: string;
  /** Local PROJ string or WKT definition. Never fetched by this adapter. */
  definition: string;
}

/**
 * Proj4js-backed horizontal transform adapter. Each CRS definition must be supplied
 * explicitly when constructing the adapter; no EPSG lookup or network access is used.
 * Coordinates are passed to Proj4js as [longitude, latitude] and [X, Y], independently
 * of any axis metadata embedded in the definition. This adapter does not accept heights
 * and does not perform vertical datum conversion.
 */
export class Proj4HorizontalCoordinateTransformer implements HorizontalCoordinateTransformer {
  private readonly definitions = new Map<string, string>();

  constructor(definitions: readonly Proj4CrsDefinition[]) {
    for (const definition of definitions) this.registerDefinition(definition);
  }

  /** Register one locally approved CRS definition. A code cannot be silently redefined. */
  registerDefinition(definition: Proj4CrsDefinition): void {
    if (!definition || typeof definition.code !== "string" || !definition.code.trim()) {
      throw new RangeError("CRS definition code is required");
    }
    if (typeof definition.definition !== "string" || !definition.definition.trim()) {
      throw new RangeError(`CRS definition for ${definition.code} must be a non-empty PROJ or WKT string`);
    }
    const existing = this.definitions.get(definition.code);
    if (existing !== undefined) {
      if (existing !== definition.definition) throw new RangeError(`CRS ${definition.code} is already registered`);
      return;
    }
    this.definitions.set(definition.code, definition.definition);
  }

  geographicToProjected(
    coordinate: GeographicCoordinate,
    sourceCrs: GeographicCoordinateReferenceSystem,
    targetCrs: ProjectedCoordinateReferenceSystem,
  ): ProjectedCoordinate {
    const sourceDefinition = this.requireDefinition(sourceCrs.code, sourceCrs.code, targetCrs.code);
    const targetDefinition = this.requireDefinition(targetCrs.code, sourceCrs.code, targetCrs.code);
    let result: unknown;
    try {
      result = proj4(sourceDefinition, targetDefinition, [coordinate.longitudeDegrees, coordinate.latitudeDegrees]);
    } catch (error) {
      throw this.transformError(sourceCrs.code, targetCrs.code, error);
    }
    return this.validateProjectedResult(result, sourceCrs.code, targetCrs.code);
  }

  projectedToGeographic(
    coordinate: ProjectedCoordinate,
    sourceCrs: ProjectedCoordinateReferenceSystem,
    targetCrs: GeographicCoordinateReferenceSystem,
  ): GeographicCoordinate {
    const sourceDefinition = this.requireDefinition(sourceCrs.code, sourceCrs.code, targetCrs.code);
    const targetDefinition = this.requireDefinition(targetCrs.code, sourceCrs.code, targetCrs.code);
    let result: unknown;
    try {
      result = proj4(sourceDefinition, targetDefinition, [coordinate.x, coordinate.y]);
    } catch (error) {
      throw this.transformError(sourceCrs.code, targetCrs.code, error);
    }
    if (!Array.isArray(result) || result.length < 2 ||
      !Number.isFinite(result[0]) || !Number.isFinite(result[1])) {
      throw new RangeError(`Proj4js returned a non-finite coordinate for ${sourceCrs.code} -> ${targetCrs.code}`);
    }
    return { longitudeDegrees: result[0], latitudeDegrees: result[1] };
  }

  private requireDefinition(code: string, sourceCode: string, targetCode: string): string {
    const definition = this.definitions.get(code);
    if (definition === undefined) {
      throw new UnsupportedHorizontalTransformError(sourceCode, targetCode);
    }
    return definition;
  }

  private validateProjectedResult(
    result: unknown,
    sourceCode: string,
    targetCode: string,
  ): ProjectedCoordinate {
    if (!Array.isArray(result) || result.length < 2 ||
      !Number.isFinite(result[0]) || !Number.isFinite(result[1])) {
      throw new RangeError(`Proj4js returned a non-finite coordinate for ${sourceCode} -> ${targetCode}`);
    }
    return { x: result[0], y: result[1] };
  }

  private transformError(sourceCode: string, targetCode: string, cause: unknown): Error {
    const detail = cause instanceof Error ? `: ${cause.message}` : "";
    return new UnsupportedHorizontalTransformError(sourceCode, targetCode, detail);
  }
}
