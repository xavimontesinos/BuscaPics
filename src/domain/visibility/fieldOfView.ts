import { initialAzimuthDegrees } from "./geometry";
import type { GeographicPosition } from "./types";

export const VISIBILITY_FIELD_OF_VIEW_DEGREES = 90;
const HALF_FIELD_OF_VIEW_DEGREES = VISIBILITY_FIELD_OF_VIEW_DEGREES / 2;

/** Returns the shortest signed clockwise bearing difference in [-180, 180). */
export function signedBearingDifference(targetBearing: number, centerBearing: number): number {
  return ((targetBearing - centerBearing + 540) % 360) - 180;
}

/** Includes the exact ±45° boundaries of the fixed 90° horizontal sector. */
export function isBearingWithinVisibilityField(targetBearing: number, centerBearing: number): boolean {
  if (!Number.isFinite(targetBearing) || !Number.isFinite(centerBearing)) return false;
  return Math.abs(signedBearingDifference(targetBearing, centerBearing)) <= HALF_FIELD_OF_VIEW_DEGREES;
}

/** Initial azimuth is clockwise from true north, matching MapLibre's bearing convention. */
export function isPositionWithinVisibilityField(
  observer: GeographicPosition,
  target: GeographicPosition,
  centerBearing: number,
): boolean | null {
  const targetBearing = initialAzimuthDegrees(observer, target);
  return targetBearing === null ? null : isBearingWithinVisibilityField(targetBearing, centerBearing);
}
