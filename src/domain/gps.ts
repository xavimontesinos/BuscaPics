import type { GeographicPosition } from "./visibility/types";

export const GPS_MAX_ACCURACY_METERS = 100;
const MIN_GPS_MOVE_METERS = 10;
const MIN_GPS_UPDATE_INTERVAL_MS = 5_000;
const MIN_GPS_MOVE_AFTER_INTERVAL_METERS = 3;

export interface GpsFix {
  position: GeographicPosition;
  accuracyMeters: number;
  timestamp: number;
}

export type GpsErrorKind = "permission-denied" | "position-unavailable" | "timeout" | "unknown";

/** Converts browser geolocation data without turning invalid or low-precision data into a position. */
export function readGpsFix(sample: {
  coords: { latitude: number; longitude: number; accuracy: number };
  timestamp: number;
}): GpsFix | null {
  const { latitude, longitude, accuracy } = sample.coords;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
    !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
    !Number.isFinite(accuracy) || accuracy < 0 || !Number.isFinite(sample.timestamp)) return null;
  return {
    position: { latitudeDegrees: latitude, longitudeDegrees: longitude },
    accuracyMeters: accuracy,
    timestamp: sample.timestamp,
  };
}

export function isGpsFixAccurate(fix: GpsFix): boolean {
  return fix.accuracyMeters <= GPS_MAX_ACCURACY_METERS;
}

/** Suppresses GPS jitter and very frequent updates while still following meaningful movement. */
export function shouldPublishGpsFix(previous: GpsFix | null, next: GpsFix): boolean {
  if (!previous) return true;
  const distance = distanceMeters(previous.position, next.position);
  if (distance >= MIN_GPS_MOVE_METERS) return true;
  return next.timestamp - previous.timestamp >= MIN_GPS_UPDATE_INTERVAL_MS &&
    distance >= MIN_GPS_MOVE_AFTER_INTERVAL_METERS;
}

export function classifyGpsError(error: { code?: number }): GpsErrorKind {
  if (error.code === 1) return "permission-denied";
  if (error.code === 2) return "position-unavailable";
  if (error.code === 3) return "timeout";
  return "unknown";
}

function distanceMeters(from: GeographicPosition, to: GeographicPosition): number {
  const radians = Math.PI / 180;
  const latitudeDelta = (to.latitudeDegrees - from.latitudeDegrees) * radians;
  const longitudeDelta = (to.longitudeDegrees - from.longitudeDegrees) * radians;
  const fromLatitude = from.latitudeDegrees * radians;
  const toLatitude = to.latitudeDegrees * radians;
  const haversine = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}
