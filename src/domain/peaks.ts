/** Domain model for a geographic summit candidate. It has no UI or map dependencies. */
export interface Peak {
  /** BuscaPics-owned identifier; independent from any source identifier. */
  id: string;
  name: string;
  /** Only include alternatives explicitly present in a documented source. */
  alternateNames: string[];
  coordinates: {
    /** Original horizontal coordinates, in metres. */
    source: {
      easting: number;
      northing: number;
      crs: "EPSG:25831";
    };
    /** Reprojected by the ICGC service, in GeoJSON axis order by named fields. */
    wgs84: {
      longitude: number;
      latitude: number;
      crs: "EPSG:4326";
    };
  };
  elevation: {
    valueM: number;
    verticalReference: string;
  };
  source: {
    recordId: string;
    layer: string;
    dataset: string;
    datasetVersion: string;
    recordType: string;
    datasetUrl: string;
    license: string;
    attribution: string;
    /** The source does not guarantee that its object ID persists between releases. */
    sourceIdStability: "not-guaranteed";
  };
  validation: {
    sourceRecord: "verified-in-source" | "pending";
    coordinates: "reprojected-by-source-service" | "pending";
    summitPosition: "pending" | "verified";
  };
}

export type PeakFilterId =
  | "over-3000m"
  | "feec-100-cims"
  | "over-2500m"
  | "over-2000m";

export interface PeakFilter {
  id: PeakFilterId;
  minimumElevationM?: number;
}

export interface PeakFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id: string;
    geometry: {
      type: "Point";
      coordinates: [number, number];
    };
    properties: {
      peakId: string;
      name: string;
      elevationM: number;
    };
  }>;
}

const MINIMUM_ELEVATIONS: Partial<Record<PeakFilterId, number>> = {
  "over-3000m": 3000,
  "over-2500m": 2500,
  "over-2000m": 2000,
};

/** Returns candidates strictly above the selected altitude threshold.
 * FEEC membership remains empty until its data and reuse permission are verified.
 */
export function filterPeaks(peaks: readonly Peak[], filter: PeakFilter): Peak[] {
  if (filter.id === "feec-100-cims") return [];

  const minimumElevationM = MINIMUM_ELEVATIONS[filter.id];
  if (minimumElevationM === undefined) return [];

  return peaks.filter((peak) => peak.elevation.valueM > minimumElevationM);
}

/** GeoJSON positions use longitude first, then latitude. */
export function toGeoJsonCoordinates(peak: Peak): [number, number] {
  return [peak.coordinates.wgs84.longitude, peak.coordinates.wgs84.latitude];
}

/** Applies the domain filter and returns only the properties needed by the map. */
export function toPeakFeatureCollection(
  peaks: readonly Peak[],
  filter: PeakFilter,
): PeakFeatureCollection {
  return {
    type: "FeatureCollection",
    features: filterPeaks(peaks, filter).map((peak) => ({
      type: "Feature",
      id: peak.id,
      geometry: {
        type: "Point",
        coordinates: toGeoJsonCoordinates(peak),
      },
      properties: {
        peakId: peak.id,
        name: peak.name,
        elevationM: peak.elevation.valueM,
      },
    })),
  };
}
