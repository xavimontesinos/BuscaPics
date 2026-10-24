import type { Peak } from "../peaks";
import { toSummitTarget } from "../peaks";
import { calculateLineOfSight } from "./lineOfSight";
import { generateIntermediateSamplePoints } from "./geometry";
import { prepareIgcTerrain } from "./icgcObserverElevation";
import { RasterTerrainElevationProvider } from "./rasterTerrainElevationProvider";
import type { GeographicPosition, TerrainElevationLookup, VisibilityStatus } from "./types";

const EYE_HEIGHT_METERS = 1.7;
const SAMPLE_SPACING_METERS = 100;

/** Calculates only targets with compatible absolute elevations; unknown inputs stay indeterminate. */
export async function calculatePeakVisibilities(
  observerPosition: GeographicPosition,
  observerElevation: TerrainElevationLookup,
  peaks: readonly Peak[],
): Promise<Map<string, VisibilityStatus>> {
  const results = new Map<string, VisibilityStatus>();
  const eligible: Array<{ peak: Peak; target: NonNullable<ReturnType<typeof toSummitTarget>>; samples: GeographicPosition[] }> = [];
  for (const peak of peaks) {
    if (!Number.isFinite(peak.latitude) || peak.latitude < -90 || peak.latitude > 90 ||
      !Number.isFinite(peak.longitude) || peak.longitude < -180 || peak.longitude > 180) {
      results.set(peak.id, { state: "indeterminate", reason: "invalid-coordinate" });
      continue;
    }
    const target = toSummitTarget(peak);
    if (!target) {
      results.set(peak.id, { state: "indeterminate", reason: "missing-vertical-reference" });
      continue;
    }
    try {
      eligible.push({
        peak,
        target,
        samples: [target.position, ...generateIntermediateSamplePoints(observerPosition, target.position, SAMPLE_SPACING_METERS)],
      });
    } catch {
      results.set(peak.id, { state: "indeterminate", reason: "invalid-coordinate" });
    }
  }
  if (eligible.length === 0) return results;
  if (observerElevation.state !== "available") {
    for (const { peak } of eligible) results.set(peak.id, { state: "indeterminate", reason: "missing-terrain-data" });
    return results;
  }
  try {
    const positions = [observerPosition, ...eligible.flatMap(({ samples }) => samples)];
    const raster = await prepareIgcTerrain(positions);
    const reference = observerElevation.sample.elevation.verticalReference;
    if (!reference) {
      for (const { peak } of eligible) results.set(peak.id, { state: "indeterminate", reason: "missing-vertical-reference" });
      return results;
    }
    const terrain = new RasterTerrainElevationProvider(raster, reference);
    const observer = {
      position: observerPosition,
      terrainElevation: observerElevation.sample.elevation,
      eyeHeightAboveGroundMeters: EYE_HEIGHT_METERS,
    };
    for (const { peak, target } of eligible) {
      results.set(peak.id, calculateLineOfSight(observer, target, terrain, {
        sampleSpacingMeters: SAMPLE_SPACING_METERS,
      }));
    }
  } catch {
    for (const { peak } of eligible) results.set(peak.id, { state: "indeterminate", reason: "terrain-provider-error" });
  }
  return results;
}
