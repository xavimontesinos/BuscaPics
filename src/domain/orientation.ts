export type ObservationOrientationMode = "automatic" | "manual";

export type CompassPermissionResult = "granted" | "denied" | "unsupported" | "error";

export function normalizeBearingDegrees(bearing: number): number {
  return ((bearing % 360) + 360) % 360;
}

/** Circular low-pass filter that takes the short path across north. */
export function smoothBearingDegrees(previous: number | null, next: number, factor = 0.35): number {
  const normalizedNext = normalizeBearingDegrees(next);
  if (previous === null || !Number.isFinite(previous)) return normalizedNext;
  const delta = ((normalizedNext - normalizeBearingDegrees(previous) + 540) % 360) - 180;
  if (Math.abs(delta) < 0.7) return normalizeBearingDegrees(previous);
  return normalizeBearingDegrees(previous + delta * Math.min(1, Math.max(0, factor)));
}

/** Requests iOS permission only when the caller invokes this from a user gesture. */
export function beginDeviceOrientationPermissionRequest(
  api: { requestPermission?: (absolute?: boolean) => Promise<"granted" | "denied"> } | null | undefined,
): Promise<CompassPermissionResult> {
  if (!api) return Promise.resolve("unsupported");
  if (typeof api.requestPermission !== "function") return Promise.resolve("granted");
  try {
    // Absolute orientation requires magnetometer access in browsers that gate it.
    // This function is deliberately synchronous: invoke it in the click stack before awaiting.
    return api.requestPermission(true);
  } catch {
    // Rejection may mean missing HTTPS/transient user activation, not a user denial.
    return Promise.resolve("error");
  }
}

/** Registers one listener for each supported event name and returns an idempotent cleanup. */
export function subscribeToDeviceCompass(
  target: Pick<Window, "addEventListener" | "removeEventListener">,
  onHeading: (heading: number) => void,
  screenAngleDegrees = 0,
): () => void {
  const listener = (event: Event) => {
    const heading = getDeviceCompassHeading(
      event as DeviceOrientationEvent & { webkitCompassHeading?: number },
      screenAngleDegrees,
    );
    if (heading !== null) onHeading(heading);
  };
  target.addEventListener("deviceorientation", listener);
  target.addEventListener("deviceorientationabsolute", listener);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    target.removeEventListener("deviceorientation", listener);
    target.removeEventListener("deviceorientationabsolute", listener);
  };
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
