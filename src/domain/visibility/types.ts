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

/** Target summit position and explicit height above the terrain at that position. */
export interface SummitTarget {
  id: string;
  position: GeographicPosition;
  /** Metres above the terrain surface (AGL); must not be inferred from waypoint altitude. */
  heightAboveTerrainMeters: number;
}

/** One terrain elevation sample returned by a future DEM provider. */
export interface TerrainElevationSample {
  position: GeographicPosition;
  elevation: Elevation;
}

/** Result of looking up terrain at a requested position. */
export type TerrainElevationLookup =
  | { state: "available"; sample: TerrainElevationSample }
  | { state: "missing" }
  | { state: "outside-coverage" };

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
  | "insufficient-terrain-samples";

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
