import type { GeographicPosition } from "./types";

/** Mean spherical Earth radius in metres, used for geometry approximations. */
export const MEAN_EARTH_RADIUS_METERS = 6_371_008.8;

const DEGREES_TO_RADIANS = Math.PI / 180;
const RADIANS_TO_DEGREES = 180 / Math.PI;
const COINCIDENT_ANGLE_RADIANS = 1e-12;
const AMBIGUOUS_ANGLE_EPSILON_RADIANS = 1e-10;

/** Validates WGS 84 decimal-degree coordinate ranges. */
export function validateGeographicPosition(position: GeographicPosition): void {
  if (
    !Number.isFinite(position.latitudeDegrees) ||
    position.latitudeDegrees < -90 ||
    position.latitudeDegrees > 90
  ) {
    throw new RangeError("Latitude must be a finite value between -90 and 90 degrees");
  }
  if (
    !Number.isFinite(position.longitudeDegrees) ||
    position.longitudeDegrees < -180 ||
    position.longitudeDegrees > 180
  ) {
    throw new RangeError("Longitude must be a finite value between -180 and 180 degrees");
  }
}

function toRadians(position: GeographicPosition): [number, number] {
  validateGeographicPosition(position);
  return [
    position.latitudeDegrees * DEGREES_TO_RADIANS,
    position.longitudeDegrees * DEGREES_TO_RADIANS,
  ];
}

function centralAngleRadians(from: GeographicPosition, to: GeographicPosition): number {
  const first = toUnitVector(from);
  const second = toUnitVector(to);
  const crossX = first[1] * second[2] - first[2] * second[1];
  const crossY = first[2] * second[0] - first[0] * second[2];
  const crossZ = first[0] * second[1] - first[1] * second[0];
  const crossMagnitude = Math.hypot(crossX, crossY, crossZ);
  const dotProduct = first[0] * second[0] + first[1] * second[1] + first[2] * second[2];
  return Math.atan2(crossMagnitude, Math.min(1, Math.max(-1, dotProduct)));
}

/** Great-circle surface distance in metres on a spherical Earth approximation. */
export function distanceMeters(from: GeographicPosition, to: GeographicPosition): number {
  return MEAN_EARTH_RADIUS_METERS * centralAngleRadians(from, to);
}

/** Calculates a geodesic destination at a distance and clockwise bearing from a position. */
export function destinationPosition(
  from: GeographicPosition,
  bearingDegrees: number,
  distanceMetersFromOrigin: number,
): GeographicPosition {
  validateGeographicPosition(from);
  if (!Number.isFinite(bearingDegrees) || !Number.isFinite(distanceMetersFromOrigin) || distanceMetersFromOrigin < 0) {
    throw new RangeError("Bearing must be finite and distance must be a finite non-negative number");
  }
  const [latitude, longitude] = toRadians(from);
  const bearing = bearingDegrees * DEGREES_TO_RADIANS;
  const angularDistance = distanceMetersFromOrigin / MEAN_EARTH_RADIUS_METERS;
  const destinationLatitude = Math.asin(
    Math.sin(latitude) * Math.cos(angularDistance) +
    Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const destinationLongitude = longitude + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
    Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(destinationLatitude),
  );
  return {
    latitudeDegrees: destinationLatitude * RADIANS_TO_DEGREES,
    longitudeDegrees: normalizeLongitude(destinationLongitude * RADIANS_TO_DEGREES),
  };
}

/**
 * Initial great-circle azimuth clockwise from true north, in degrees [0, 360).
 * Returns null when the positions coincide or are antipodal, where a unique
 * initial direction is undefined.
 */
export function initialAzimuthDegrees(
  from: GeographicPosition,
  to: GeographicPosition,
): number | null {
  const angle = centralAngleRadians(from, to);
  if (
    angle <= COINCIDENT_ANGLE_RADIANS ||
    Math.PI - angle <= AMBIGUOUS_ANGLE_EPSILON_RADIANS
  ) {
    return null;
  }

  const [latitude1, longitude1] = toRadians(from);
  const [latitude2, longitude2] = toRadians(to);
  const longitudeDelta = longitude2 - longitude1;
  const y = Math.sin(longitudeDelta) * Math.cos(latitude2);
  const x =
    Math.cos(latitude1) * Math.sin(latitude2) -
    Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(longitudeDelta);
  return (Math.atan2(y, x) * RADIANS_TO_DEGREES + 360) % 360;
}

function toUnitVector(position: GeographicPosition): [number, number, number] {
  const [latitude, longitude] = toRadians(position);
  return [
    Math.cos(latitude) * Math.cos(longitude),
    Math.cos(latitude) * Math.sin(longitude),
    Math.sin(latitude),
  ];
}

function fromUnitVector(vector: [number, number, number]): GeographicPosition {
  const [x, y, z] = vector;
  return {
    latitudeDegrees: Math.atan2(z, Math.hypot(x, y)) * RADIANS_TO_DEGREES,
    longitudeDegrees: normalizeLongitude(Math.atan2(y, x) * RADIANS_TO_DEGREES),
  };
}

function normalizeLongitude(longitudeDegrees: number): number {
  const normalized = ((longitudeDegrees + 180) % 360 + 360) % 360 - 180;
  return normalized === -180 && longitudeDegrees > 0 ? 180 : normalized;
}

/**
 * Returns interior points along the shortest great-circle arc. Endpoints are
 * excluded because callers can sample the observer and target separately.
 * The requested spacing is a maximum; equal intervals are used to keep the
 * final interval within that limit. Coincident positions return no samples.
 * Exact antipodes are rejected because they have no unique shortest route.
 */
export function generateIntermediateSamplePoints(
  from: GeographicPosition,
  to: GeographicPosition,
  maximumSpacingMeters: number,
): GeographicPosition[] {
  if (!Number.isFinite(maximumSpacingMeters) || maximumSpacingMeters <= 0) {
    throw new RangeError("Maximum sample spacing must be a finite positive number of metres");
  }

  const angle = centralAngleRadians(from, to);
  if (angle <= COINCIDENT_ANGLE_RADIANS) return [];
  if (Math.PI - angle <= AMBIGUOUS_ANGLE_EPSILON_RADIANS) {
    throw new RangeError("Cannot sample an ambiguous great-circle route between antipodal positions");
  }

  const arcLength = angle * MEAN_EARTH_RADIUS_METERS;
  const intervalCount = Math.ceil(arcLength / maximumSpacingMeters);
  if (!Number.isSafeInteger(intervalCount)) {
    throw new RangeError("Requested sample spacing produces too many intervals");
  }
  if (intervalCount <= 1) return [];

  const start = toUnitVector(from);
  const end = toUnitVector(to);
  const sinAngle = Math.sin(angle);
  const samples: GeographicPosition[] = [];

  for (let index = 1; index < intervalCount; index += 1) {
    const fraction = index / intervalCount;
    const startWeight = Math.sin((1 - fraction) * angle) / sinAngle;
    const endWeight = Math.sin(fraction * angle) / sinAngle;
    samples.push(
      fromUnitVector([
        startWeight * start[0] + endWeight * end[0],
        startWeight * start[1] + endWeight * end[1],
        startWeight * start[2] + endWeight * end[2],
      ]),
    );
  }

  return samples;
}
