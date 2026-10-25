import type { GeographicPosition } from "../domain/visibility/types";

export const OBSERVER_ANCHORED_GESTURES = {
  scrollZoom: { around: "center" as const },
  touchZoomRotate: { around: "center" as const },
};

export function getObserverZoomEaseOptions(
  position: GeographicPosition,
  targetZoom: number,
  durationMilliseconds: number,
) {
  return {
    around: [position.longitudeDegrees, position.latitudeDegrees] as [number, number],
    zoom: targetZoom,
    duration: durationMilliseconds,
  };
}

/** Moves MapLibre's effective center point to the observer's screen position at 75% height. */
export function getObserverMapPadding(containerHeightPixels: number, hasObserver: boolean) {
  return {
    top: hasObserver ? Math.max(0, containerHeightPixels) * 0.5 : 0,
    right: 0,
    bottom: 0,
    left: 0,
  };
}

/** Centers the observer in the padded viewport while preserving its geographic coordinates and zoom. */
export function getObserverMapEaseOptions(
  position: GeographicPosition,
  currentZoom: number,
) {
  return {
    center: [position.longitudeDegrees, position.latitudeDegrees] as [number, number],
    zoom: currentZoom,
    duration: 400,
  };
}

/** Rotates MapLibre around the observer's geographic point while retaining zoom. */
export function getObserverBearingEaseOptions(
  position: GeographicPosition,
  bearingDegrees: number,
  currentZoom: number,
  durationMilliseconds: number,
) {
  return {
    around: [position.longitudeDegrees, position.latitudeDegrees] as [number, number],
    bearing: bearingDegrees,
    zoom: currentZoom,
    duration: durationMilliseconds,
  };
}
