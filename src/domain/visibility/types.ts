/** Geographic coordinates in decimal degrees using WGS 84 latitude/longitude. */
export interface GeographicPosition {
  latitudeDegrees: number;
  longitudeDegrees: number;
}

/**
 * A named vertical reference. Ellipsoidal heights and orthometric elevations
 * are different quantities and must not be compared without conversion.
 */
export type VerticalReference =
  | { kind: "ellipsoidal"; datum: string }
  | { kind: "orthometric"; datum: string };

/** Elevation in metres; null means its vertical reference is not documented. */
export interface Elevation {
  meters: number;
  verticalReference: VerticalReference | null;
}

/** Observer location with terrain elevation and eye height above local ground. */
export interface ObserverPosition {
  position: GeographicPosition;
  terrainElevation: Elevation;
  /** Metres above the terrain surface (AGL), not an absolute altitude. */
  eyeHeightAboveGroundMeters: number;
}

/** Summit target height is either terrain-relative or an explicitly referenced absolute elevation. */
export type SummitTarget = {
  id: string;
  position: GeographicPosition;
} & (
  | {
      /** Metres above local terrain; must not be populated from a catalog altitude. */
      heightAboveTerrainMeters: number;
      absoluteElevation?: never;
    }
  | {
      /** Absolute elevation whose vertical reference must match the observer and terrain. */
      absoluteElevation: Elevation;
      heightAboveTerrainMeters?: never;
    }
);

/** One terrain elevation sample returned by a future DEM provider. */
export interface TerrainElevationSample {
  position: GeographicPosition;
  elevation: Elevation;
}

/** Result of looking up terrain at a requested position. */
export type TerrainElevationLookup =
  | { state: "available"; sample: TerrainElevationSample }
  | { state: "missing" }
  | { state: "outside-coverage" }
  | { state: "incompatible-vertical-reference" };

export type IndeterminateVisibilityReason =
  | "missing-terrain-data"
  | "outside-terrain-coverage"
  | "missing-vertical-reference"
  | "incompatible-vertical-reference"
  | "invalid-coordinate"
  | "invalid-elevation"
  | "invalid-observer-height"
  | "invalid-target-height"
  | "invalid-configuration"
  | "coincident-endpoints"
  | "insufficient-terrain-samples"
  | "terrain-provider-error";

/** Line-of-sight classification, including reasons when the result is unknown. */
export type VisibilityStatus =
  | { state: "visible"; distanceMeters: number }
  | {
      state: "occluded";
      distanceMeters: number;
      blockingTerrain: TerrainElevationSample;
      blockingDistanceMeters: number;
    }
  | {
      state: "indeterminate";
      reason: IndeterminateVisibilityReason;
      distanceMeters?: number;
    };
