import type { Peak } from "../peaks";
import type { SummitTarget } from "./types";

/** Recreational target built from the current catalog; its datum remains unknown. */
export function toCatalogSummitTarget(peak: Peak): SummitTarget | null {
  if (!Number.isFinite(peak.elevationMeters)) return null;
  return {
    id: peak.id,
    position: { latitudeDegrees: peak.latitude, longitudeDegrees: peak.longitude },
    absoluteElevation: { meters: peak.elevationMeters, verticalReference: null },
  };
}
