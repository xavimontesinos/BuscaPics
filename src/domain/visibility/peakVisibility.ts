import type { Peak } from "../peaks";
import { toCatalogSummitTarget } from "./peakVisibilityTarget";
import type { SummitTarget } from "./types";
import { calculateLineOfSight } from "./lineOfSight";
import { distanceMeters, generateIntermediateSamplePoints } from "./geometry";
import { initialAzimuthDegrees } from "./geometry";
import { isBearingWithinVisibilityField } from "./fieldOfView";
import { prepareIgcTerrain } from "./icgcObserverElevation";
import { RasterTerrainElevationProvider } from "./rasterTerrainElevationProvider";
import { visibilityDebug } from "./visibilityDebug";
import type { GeographicPosition, TerrainElevationLookup, VisibilityStatus } from "./types";

export type PeakVisibilityResult = VisibilityStatus
  | { state: "outsideRadius"; distanceMeters: number }
  | { state: "outsideFov"; distanceMeters: number; bearingDegrees: number };

export interface PeakVisibilityOptions {
  maxDistanceMeters?: number;
  directionBearingDegrees?: number;
  onProgress?: (results: ReadonlyMap<string, PeakVisibilityResult>) => void;
}

const EYE_HEIGHT_METERS = 1.8;
const SAMPLE_SPACING_METERS = 100;


/** Calculates recreational visibility using catalog elevations as provisional target heights. */
export async function calculatePeakVisibilities(
  observerPosition: GeographicPosition,
  observerElevation: TerrainElevationLookup,
  peaks: readonly Peak[],
  options: PeakVisibilityOptions = {},
): Promise<Map<string, PeakVisibilityResult>> {
  const maxDistanceMeters = options.maxDistanceMeters ?? 50_000;
  const directionBearingDegrees = options.directionBearingDegrees ?? 0;
  if (!Number.isFinite(maxDistanceMeters) || maxDistanceMeters <= 0) {
    throw new RangeError("Maximum visibility distance must be a finite positive number of metres");
  }
  const results = new Map<string, PeakVisibilityResult>();
  const eligible: Array<{ peak: Peak; target: NonNullable<ReturnType<typeof toCatalogSummitTarget>>; distanceMeters: number }> = [];
  for (const peak of peaks) {
    if (!Number.isFinite(peak.latitude) || peak.latitude < -90 || peak.latitude > 90 ||
      !Number.isFinite(peak.longitude) || peak.longitude < -180 || peak.longitude > 180) {
      results.set(peak.id, { state: "indeterminate", reason: "invalid-coordinate" });
      continue;
    }
    const position = { latitudeDegrees: peak.latitude, longitudeDegrees: peak.longitude };
    const distance = distanceMeters(observerPosition, position);
    if (distance > maxDistanceMeters) {
      results.set(peak.id, { state: "outsideRadius", distanceMeters: distance });
      continue;
    }
    const bearingDegrees = initialAzimuthDegrees(observerPosition, position);
    if (bearingDegrees === null) {
      results.set(peak.id, { state: "indeterminate", reason: "invalid-coordinate" });
      continue;
    }
    if (!isBearingWithinVisibilityField(bearingDegrees, directionBearingDegrees)) {
      results.set(peak.id, { state: "outsideFov", distanceMeters: distance, bearingDegrees });
      continue;
    }
    const target = toCatalogSummitTarget(peak);
    if (!target) {
      results.set(peak.id, { state: "indeterminate", reason: "missing-vertical-reference" });
      continue;
    }
    try {
      eligible.push({ peak, target, distanceMeters: distance });
    } catch {
      results.set(peak.id, { state: "indeterminate", reason: "invalid-coordinate" });
    }
  }
  const publish = () => options.onProgress?.(new Map(results));
  publish();
  eligible.sort((a, b) => a.distanceMeters - b.distanceMeters);
  if (eligible.length === 0) return results;
  if (observerElevation.state !== "available") {
    const reason = observerElevation.state === "outside-coverage" ? "outside-terrain-coverage"
      : observerElevation.state === "incompatible-vertical-reference" ? "incompatible-vertical-reference"
      : "missing-terrain-data";
    for (const { peak } of eligible) {
      results.set(peak.id, { state: "indeterminate", reason });
      publish();
    }
    return results;
  }
  const reference = observerElevation.sample.elevation.verticalReference;
  if (!reference) {
    for (const { peak } of eligible) {
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
  for (const { peak, target } of eligible) {
    try {
      // Prepare each route independently so the raster's bounded block cache
      // is not exceeded by the union of every catalog route.
      const samples = [target.position, ...generateIntermediateSamplePoints(observerPosition, target.position, SAMPLE_SPACING_METERS)];
      const raster = await prepareIgcTerrain([observerPosition, ...samples]);
      preparedRouteCount += 1;
      const terrain = new RasterTerrainElevationProvider(raster, reference);
      // Recreational approximation: compare the unreferenced catalog number
      // directly with the ICGC raster reference; this does not convert its datum.
      const evaluatedTarget: SummitTarget = {
        id: target.id,
        position: target.position,
        absoluteElevation: { meters: peak.elevationMeters, verticalReference: reference },
      };
      results.set(peak.id, calculateLineOfSight(observer, evaluatedTarget, terrain, {
        sampleSpacingMeters: SAMPLE_SPACING_METERS,
      }));
    } catch (error) {
      if (routeFailures.length < 3) {
        routeFailures.push(`${peak.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
      results.set(peak.id, { state: "indeterminate", reason: "terrain-provider-error" });
    }
    publish();
  }
  visibilityDebug('terrain-routes-complete', {
    attempted: eligible.length,
    prepared: preparedRouteCount,
    failed: eligible.length - preparedRouteCount,
    failureExamples: routeFailures,
  });
  return results;
}
