export type ObservationOrientationMode = "automatic" | "manual";

export function normalizeBearingDegrees(bearing: number): number {
  return ((bearing % 360) + 360) % 360;
}

/** Compass APIs report clockwise-from-north; absolute alpha is its inverse around screen Z. */
export function getDeviceCompassHeading(
  event: { alpha: number | null; absolute?: boolean; webkitCompassHeading?: number },
  screenAngleDegrees = 0,
): number | null {
  if (Number.isFinite(event.webkitCompassHeading)) {
    return normalizeBearingDegrees(event.webkitCompassHeading as number);
  }
  if (!event.absolute || !Number.isFinite(event.alpha)) return null;
  return normalizeBearingDegrees(360 - (event.alpha as number) + screenAngleDegrees);
}

export function resolveObservationBearing(
  mode: ObservationOrientationMode,
  manualBearing: number,
  compassBearing: number | null,
): number {
  return mode === "automatic" && compassBearing !== null ? compassBearing : manualBearing;
}
