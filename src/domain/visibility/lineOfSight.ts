import {
  distanceMeters,
  generateIntermediateSamplePoints,
  validateGeographicPosition,
} from "./geometry";
import type {
  Elevation,
  GeographicPosition,
  ObserverPosition,
  SummitTarget,
  TerrainElevationLookup,
  TerrainElevationSample,
  VerticalReference,
  VisibilityStatus,
} from "./types";

/** Synchronous, deterministic terrain lookup; implementations may wrap in-memory grids. */
export interface TerrainElevationProvider {
  getElevationAt(position: GeographicPosition): TerrainElevationLookup;
}

export interface LineOfSightOptions {
  /** Maximum distance between interior terrain checks, in metres. */
  sampleSpacingMeters: number;
  /** Vertical numerical tolerance in metres; terrain must exceed the ray by more than this. */
  verticalToleranceMeters?: number;
}

const DEFAULT_VERTICAL_TOLERANCE_METERS = 1;

function indeterminate(
  reason: NonNullable<Extract<VisibilityStatus, { state: "indeterminate" }>["reason"]>,
  distance?: number,
): VisibilityStatus {
  return distance === undefined
    ? { state: "indeterminate", reason }
    : { state: "indeterminate", reason, distanceMeters: distance };
}

function validateElevation(elevation: Elevation): "invalid-elevation" | "missing-vertical-reference" | null {
  if (!elevation || !Number.isFinite(elevation.meters)) return "invalid-elevation";
  const reference = elevation.verticalReference;
  if (reference === null || typeof reference?.datum !== "string" || !reference.datum.trim()) {
    return "missing-vertical-reference";
  }
  if (reference.kind !== "ellipsoidal" && reference.kind !== "orthometric") {
    return "invalid-elevation";
  }
  return null;
}

function sameVerticalReference(first: VerticalReference, second: VerticalReference): boolean {
  return first.kind === second.kind && first.datum === second.datum;
}

function lookupTerrain(
  provider: TerrainElevationProvider,
  position: GeographicPosition,
  distance: number,
): { sample: TerrainElevationSample } | { result: VisibilityStatus } {
  let lookup: TerrainElevationLookup;
  try {
    lookup = provider.getElevationAt(position);
  } catch {
    return { result: indeterminate("terrain-provider-error", distance) };
  }
  if (!lookup || lookup.state === "missing") {
    return { result: indeterminate("missing-terrain-data", distance) };
  }
  if (lookup.state === "outside-coverage") {
    return { result: indeterminate("outside-terrain-coverage", distance) };
  }
  if (lookup.state === "incompatible-vertical-reference") {
    return { result: indeterminate("incompatible-vertical-reference", distance) };
  }

  try {
    validateGeographicPosition(lookup.sample.position);
  } catch {
    return { result: indeterminate("invalid-coordinate", distance) };
  }
  const elevationProblem = validateElevation(lookup.sample.elevation);
  if (elevationProblem) return { result: indeterminate(elevationProblem, distance) };
  return { sample: lookup.sample };
}

/**
 * Tests a straight, non-refracted line of sight against terrain samples.
 * Elevations must share the same named vertical datum. No Earth-curvature
 * correction is applied; a future DEM adapter must also choose sample spacing
 * appropriate to its raster resolution. Missing samples never mean clear terrain.
 */
export function calculateLineOfSight(
  observer: ObserverPosition,
  target: SummitTarget,
  terrain: TerrainElevationProvider,
  options: LineOfSightOptions,
): VisibilityStatus {
  try {
    validateGeographicPosition(observer.position);
    validateGeographicPosition(target.position);
  } catch {
    return indeterminate("invalid-coordinate");
  }

  const distance = distanceMeters(observer.position, target.position);
  if (distance === 0) return indeterminate("coincident-endpoints", distance);

  if (
    !Number.isFinite(observer.eyeHeightAboveGroundMeters) ||
    observer.eyeHeightAboveGroundMeters < 0
  ) {
    return indeterminate("invalid-observer-height", distance);
  }
  if (target.absoluteElevation !== undefined) {
    const targetElevationProblem = validateElevation(target.absoluteElevation);
    if (targetElevationProblem) return indeterminate(targetElevationProblem, distance);
  } else if (
    !Number.isFinite(target.heightAboveTerrainMeters) || target.heightAboveTerrainMeters < 0
  ) {
    return indeterminate("invalid-target-height", distance);
  }
  if (
    !Number.isFinite(options.sampleSpacingMeters) ||
    options.sampleSpacingMeters <= 0 ||
    (options.verticalToleranceMeters !== undefined &&
      (!Number.isFinite(options.verticalToleranceMeters) || options.verticalToleranceMeters < 0))
  ) {
    return indeterminate("invalid-configuration", distance);
  }

  const observerElevationProblem = validateElevation(observer.terrainElevation);
  if (observerElevationProblem) return indeterminate(observerElevationProblem, distance);
  const observerReference = observer.terrainElevation.verticalReference;
  if (!observerReference) return indeterminate("missing-vertical-reference", distance);
  const observerAbsoluteHeight =
    observer.terrainElevation.meters + observer.eyeHeightAboveGroundMeters;

  const targetGroundLookup = lookupTerrain(terrain, target.position, distance);
  if ("result" in targetGroundLookup) return targetGroundLookup.result;
  const targetReference = targetGroundLookup.sample.elevation.verticalReference;
  if (!targetReference) return indeterminate("missing-vertical-reference", distance);
  if (!sameVerticalReference(observerReference, targetReference)) {
    return indeterminate("incompatible-vertical-reference", distance);
  }
  let targetAbsoluteHeight: number;
  if (target.absoluteElevation !== undefined) {
    const absoluteReference = target.absoluteElevation.verticalReference;
    if (!absoluteReference) return indeterminate("missing-vertical-reference", distance);
    if (!sameVerticalReference(observerReference, absoluteReference)) {
      return indeterminate("incompatible-vertical-reference", distance);
    }
    targetAbsoluteHeight = target.absoluteElevation.meters;
  } else {
    targetAbsoluteHeight =
      targetGroundLookup.sample.elevation.meters + target.heightAboveTerrainMeters;
  }

  // Always include at least one interior check for distinct endpoints, even
  // when they are closer than the requested maximum spacing.
  const effectiveSpacing = Math.min(options.sampleSpacingMeters, distance / 2);
  let samplePositions: GeographicPosition[];
  try {
    samplePositions = generateIntermediateSamplePoints(
      observer.position,
      target.position,
      effectiveSpacing,
    );
  } catch {
    return indeterminate("invalid-configuration", distance);
  }
  if (samplePositions.length === 0) {
    return indeterminate("insufficient-terrain-samples", distance);
  }

  const tolerance = options.verticalToleranceMeters ?? DEFAULT_VERTICAL_TOLERANCE_METERS;
  let firstBlockingTerrain: TerrainElevationSample | null = null;
  let firstBlockingDistance: number | null = null;
  for (let index = 0; index < samplePositions.length; index += 1) {
    const samplePosition = samplePositions[index];
    const lookup = lookupTerrain(terrain, samplePosition, distance);
    if ("result" in lookup) return lookup.result;
    const sampleReference = lookup.sample.elevation.verticalReference;
    if (!sampleReference) return indeterminate("missing-vertical-reference", distance);
    if (!sameVerticalReference(observerReference, sampleReference)) {
      return indeterminate("incompatible-vertical-reference", distance);
    }

    const fraction = (index + 1) / (samplePositions.length + 1);
    const lineHeight = observerAbsoluteHeight + fraction * (targetAbsoluteHeight - observerAbsoluteHeight);
    if (
      firstBlockingTerrain === null &&
      lookup.sample.elevation.meters > lineHeight + tolerance
    ) {
      firstBlockingTerrain = lookup.sample;
      firstBlockingDistance = distance * fraction;
    }
  }

  if (firstBlockingTerrain && firstBlockingDistance !== null) {
    return {
      state: "occluded",
      distanceMeters: distance,
      blockingTerrain: firstBlockingTerrain,
      blockingDistanceMeters: firstBlockingDistance,
    };
  }
  return { state: "visible", distanceMeters: distance };
}
