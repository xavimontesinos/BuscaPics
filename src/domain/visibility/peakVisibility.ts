import type { Peak } from "../peaks";
import { toCatalogSummitTarget } from "./peakVisibilityTarget";
import type { SummitTarget } from "./types";
import { calculateLineOfSight } from "./lineOfSight";
import { destinationPosition, distanceMeters, generateIntermediateSamplePoints, initialAzimuthDegrees } from "./geometry";
import { isBearingWithinVisibilityField } from "./fieldOfView";
import { prepareIgcTerrain } from "./icgcObserverElevation";
import { RasterTerrainElevationProvider } from "./rasterTerrainElevationProvider";
import { visibilityDebug } from "./visibilityDebug";
import type { GeographicPosition, TerrainElevationLookup, VisibilityStatus } from "./types";

export type PeakVisibilityResult = VisibilityStatus
  | { state: "partiallyVisible"; distanceMeters: number; visibleAreaPoints: number; analyzedAreaPoints: number }
  | { state: "outsideRadius"; distanceMeters: number }
  | { state: "outsideFov"; distanceMeters: number; bearingDegrees: number };

export interface PeakVisibilityOptions {
  maxDistanceMeters?: number;
  directionBearingDegrees?: number;
  onProgress?: (results: ReadonlyMap<string, PeakVisibilityResult>) => void;
}

export interface EligiblePeak {
  peak: Peak;
  distanceMeters: number;
}

export interface PeakVisibilitySelection {
  immediateResults: Map<string, PeakVisibilityResult>;
  eligible: EligiblePeak[];
}

/** Returns selected peaks that have neither a reusable result nor a calculation in flight. */
export function getUncachedEligiblePeaks(
  selection: PeakVisibilitySelection,
  geometricResults: ReadonlyMap<string, PeakVisibilityResult>,
  inFlight: ReadonlySet<string>,
): EligiblePeak[] {
  return selection.eligible.filter(({ peak }) => !geometricResults.has(peak.id) && !inFlight.has(peak.id));
}

export const EYE_HEIGHT_METERS = 5;
const SAMPLE_SPACING_METERS = 100;
export const SUMMIT_AREA_SAMPLE_OFFSET_METERS = 20;
const SUMMIT_AREA_SAMPLE_BEARINGS = [0, 90, 180, 270] as const;

/** Cache identity intentionally excludes bearing and radius; it includes every vertical/terrain input. */
export function createPeakVisibilityCacheKey(
  observerPosition: GeographicPosition,
  observerElevation: TerrainElevationLookup,
  terrainRevision: string,
): string {
  return JSON.stringify([observerPosition, observerElevation, EYE_HEIGHT_METERS, terrainRevision]);
}

/** Classifies the original summit point together with its sampled local summit area. */
export function classifySummitAreaVisibility(
  summitPoint: VisibilityStatus,
  additionalPoints: readonly VisibilityStatus[],
): PeakVisibilityResult {
  if (summitPoint.state !== "occluded") return summitPoint;
  const visibleAreaPoints = additionalPoints.filter((result) => result.state === "visible").length;
  if (visibleAreaPoints > 0) {
    return {
      state: "partiallyVisible",
      distanceMeters: summitPoint.distanceMeters,
      visibleAreaPoints,
      analyzedAreaPoints: additionalPoints.length,
    };
  }
  if (additionalPoints.length > 0 && additionalPoints.every((result) => result.state === "occluded")) {
    return summitPoint;
  }
  const unknown = additionalPoints.find(
    (result): result is Extract<VisibilityStatus, { state: "indeterminate" }> => result.state === "indeterminate",
  );
  return {
    state: "indeterminate",
    reason: unknown?.reason ?? "insufficient-terrain-samples",
    distanceMeters: summitPoint.distanceMeters,
  };
}


/** Applies only the cheap radius and field-of-view filters; it never reads terrain. */
export function selectPeaksForVisibility(
  observerPosition: GeographicPosition,
  peaks: readonly Peak[],
  maxDistanceMeters = 50_000,
  directionBearingDegrees = 0,
): PeakVisibilitySelection {
  if (!Number.isFinite(maxDistanceMeters) || maxDistanceMeters <= 0) {
    throw new RangeError("Maximum visibility distance must be a finite positive number of metres");
  }
  const immediateResults = new Map<string, PeakVisibilityResult>();
  const eligible: EligiblePeak[] = [];
  for (const peak of peaks) {
    if (!Number.isFinite(peak.latitude) || peak.latitude < -90 || peak.latitude > 90 ||
      !Number.isFinite(peak.longitude) || peak.longitude < -180 || peak.longitude > 180) {
      immediateResults.set(peak.id, { state: "indeterminate", reason: "invalid-coordinate" });
      continue;
    }
    const position = { latitudeDegrees: peak.latitude, longitudeDegrees: peak.longitude };
    const distance = distanceMeters(observerPosition, position);
    if (distance > maxDistanceMeters) {
      immediateResults.set(peak.id, { state: "outsideRadius", distanceMeters: distance });
      continue;
    }
    const bearingDegrees = initialAzimuthDegrees(observerPosition, position);
    if (bearingDegrees === null) {
      immediateResults.set(peak.id, { state: "indeterminate", reason: "invalid-coordinate" });
      continue;
    }
    if (!isBearingWithinVisibilityField(bearingDegrees, directionBearingDegrees)) {
      immediateResults.set(peak.id, { state: "outsideFov", distanceMeters: distance, bearingDegrees });
      continue;
    }
    if (!toCatalogSummitTarget(peak)) {
      immediateResults.set(peak.id, { state: "indeterminate", reason: "missing-vertical-reference" });
      continue;
    }
    try {
      eligible.push({ peak, distanceMeters: distance });
    } catch {
      immediateResults.set(peak.id, { state: "indeterminate", reason: "invalid-coordinate" });
    }
  }
  eligible.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return { immediateResults, eligible };
}

/** Calculates geometry only, independent of the current radius and field-of-view sector. */
export async function calculatePeakGeometricVisibilities(
  observerPosition: GeographicPosition,
  observerElevation: TerrainElevationLookup,
  peaks: readonly EligiblePeak[],
  options: Pick<PeakVisibilityOptions, "onProgress"> & {
    onRoutePreparation?: () => void;
  } = {},
): Promise<Map<string, PeakVisibilityResult>> {
  const results = new Map<string, PeakVisibilityResult>();
  const publish = () => options.onProgress?.(new Map(results));
  publish();
  if (peaks.length === 0) return results;
  if (observerElevation.state !== "available") {
    const reason = observerElevation.state === "outside-coverage" ? "outside-terrain-coverage"
      : observerElevation.state === "incompatible-vertical-reference" ? "incompatible-vertical-reference"
      : "missing-terrain-data";
    for (const { peak } of peaks) {
      results.set(peak.id, { state: "indeterminate", reason });
      publish();
    }
    return results;
  }
  const reference = observerElevation.sample.elevation.verticalReference;
  if (!reference) {
    for (const { peak } of peaks) {
      results.set(peak.id, { state: "indeterminate", reason: "missing-vertical-reference" });
      publish();
    }
    return results;
  }
  const observer = {
    position: observerPosition,
    terrainElevation: observerElevation.sample.elevation,
    eyeHeightAboveGroundMeters: EYE_HEIGHT_METERS,
  };
  const routeFailures: string[] = [];
  let preparedRouteCount = 0;
  let failedRouteCount = 0;
  for (const { peak } of peaks) {
    const target = toCatalogSummitTarget(peak);
    if (!target) {
      results.set(peak.id, { state: "indeterminate", reason: "missing-vertical-reference" });
      publish();
      continue;
    }
    const summitAreaTargets: SummitTarget[] = [
      {
        id: target.id,
        position: target.position,
        // Recreational approximation: catalog elevation is compared directly
        // with MDT EGM08D595; its original datum is not converted here.
        absoluteElevation: { meters: peak.elevationMeters, verticalReference: reference },
      },
      ...SUMMIT_AREA_SAMPLE_BEARINGS.map((bearingDegrees) => ({
        id: `${peak.id}:summit-area-${bearingDegrees}`,
        position: destinationPosition(target.position, bearingDegrees, SUMMIT_AREA_SAMPLE_OFFSET_METERS),
        // Additional points represent the local terrain surface, sampled from the MDT.
        heightAboveTerrainMeters: 0,
      })),
    ];
    let summitPointResult: VisibilityStatus = { state: "indeterminate", reason: "missing-terrain-data" };
    const additionalPointResults: VisibilityStatus[] = [];
    for (const [index, areaTarget] of summitAreaTargets.entries()) {
      let areaResult: VisibilityStatus;
      try {
        // Prepare one path at a time to stay inside the raster block-cache bound.
        // The shared provider retains overlapping blocks for the nearby area paths.
        const routeDistance = distanceMeters(observerPosition, areaTarget.position);
        const routeSampleSpacing = routeDistance === 0
          ? SAMPLE_SPACING_METERS
          : Math.min(SAMPLE_SPACING_METERS, routeDistance / 2);
        const samples = [areaTarget.position, ...(routeDistance === 0
          ? []
          : generateIntermediateSamplePoints(observerPosition, areaTarget.position, routeSampleSpacing))];
        options.onRoutePreparation?.();
        const raster = await prepareIgcTerrain([observerPosition, ...samples]);
        preparedRouteCount += 1;
        const terrain = new RasterTerrainElevationProvider(raster, reference);
        areaResult = calculateLineOfSight(observer, areaTarget, terrain, {
          sampleSpacingMeters: SAMPLE_SPACING_METERS,
        });
      } catch (error) {
        failedRouteCount += 1;
        if (routeFailures.length < 3) {
          routeFailures.push(`${areaTarget.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
        areaResult = { state: "indeterminate", reason: "terrain-provider-error" };
      }
      if (index === 0) summitPointResult = areaResult;
      else additionalPointResults.push(areaResult);
    }
    results.set(peak.id, classifySummitAreaVisibility(summitPointResult, additionalPointResults));
    publish();
  }
  visibilityDebug('terrain-routes-complete', {
    attempted: peaks.length * (SUMMIT_AREA_SAMPLE_BEARINGS.length + 1),
    prepared: preparedRouteCount,
    failed: failedRouteCount,
    failureExamples: routeFailures,
  });
  return results;
}

/** Compatibility helper that applies the cheap filters before geometric calculation. */
export async function calculatePeakVisibilities(
  observerPosition: GeographicPosition,
  observerElevation: TerrainElevationLookup,
  peaks: readonly Peak[],
  options: PeakVisibilityOptions = {},
): Promise<Map<string, PeakVisibilityResult>> {
  const selection = selectPeaksForVisibility(
    observerPosition,
    peaks,
    options.maxDistanceMeters ?? 50_000,
    options.directionBearingDegrees ?? 0,
  );
  const results = new Map(selection.immediateResults);
  const publish = () => options.onProgress?.(new Map(results));
  publish();
  const geometry = await calculatePeakGeometricVisibilities(observerPosition, observerElevation, selection.eligible, {
    onProgress: (updates) => {
      if (updates.size === 0) return;
      for (const [id, status] of updates) results.set(id, status);
      publish();
    },
  });
  for (const [id, status] of geometry) results.set(id, status);
  return results;
}
