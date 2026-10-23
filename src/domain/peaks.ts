/** A summit imported from the local development GPX catalog. */
export interface Peak {
  id: string;
  name: string;
  sourceName: string;
  latitude: number;
  longitude: number;
  elevationMeters: number;
  elevationSource: "gpx-ele" | "name-suffix";
  isEssential: boolean;
}

export type PeakFilterId = "100-cims" | "100-cims-essentials";

export interface PeakFilter {
  id: PeakFilterId;
}

export interface PeakFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id: string;
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: { peakId: string; name: string; elevationM: number; elevationLabel: string };
  }>;
}

/** Selects either the complete imported catalog or its explicitly matched essentials. */
export function filterPeaks(peaks: readonly Peak[], filter: PeakFilter): Peak[] {
  return filter.id === "100-cims-essentials" ? peaks.filter((peak) => peak.isEssential) : [...peaks];
}

/** GeoJSON positions use longitude first, then latitude. */
export function toGeoJsonCoordinates(peak: Peak): [number, number] {
  return [peak.longitude, peak.latitude];
}

export function toPeakFeatureCollection(
  peaks: readonly Peak[],
  filter: PeakFilter,
): PeakFeatureCollection {
  return {
    type: "FeatureCollection",
    features: filterPeaks(peaks, filter).map((peak) => ({
      type: "Feature",
      id: peak.id,
      geometry: { type: "Point", coordinates: toGeoJsonCoordinates(peak) },
      properties: {
        peakId: peak.id,
        name: peak.name,
        elevationM: peak.elevationMeters,
        elevationLabel: `${new Intl.NumberFormat("ca-ES", { maximumFractionDigits: 0 }).format(Math.round(peak.elevationMeters))} m`,
      },
    })),
  };
}
