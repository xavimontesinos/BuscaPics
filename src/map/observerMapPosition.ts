export function getObserverCameraOffset(viewportHeight: number) {
  return [0, viewportHeight * 0.25] as [number, number];
}

export function getCameraZoomEaseOptions(
  targetZoom: number,
  durationMilliseconds: number,
  observer?: { longitudeDegrees: number; latitudeDegrees: number },
) {
  return {
    ...(observer ? { around: [observer.longitudeDegrees, observer.latitudeDegrees] as [number, number] } : {}),
    zoom: targetZoom,
    duration: durationMilliseconds,
  };
}

/** MapLibre resolves `around` to its current screen point when each camera transition starts. */
export function getObserverAnchoredCameraOptions(
  observer: { longitudeDegrees: number; latitudeDegrees: number },
  zoom: number,
  bearing: number,
) {
  return {
    around: [observer.longitudeDegrees, observer.latitudeDegrees] as [number, number],
    zoom,
    bearing,
  };
}

export function getWheelZoomDelta(
  deltaY: number,
  deltaMode: number,
  lineHeight = 40,
  viewportHeight = 800,
) {
  const normalizedDelta = deltaMode === 1
    ? deltaY * lineHeight
    : deltaMode === 2
      ? deltaY * viewportHeight
      : deltaY;
  return -normalizedDelta / 450;
}

export function getShortestAngleDelta(currentDegrees: number, previousDegrees: number) {
  return ((currentDegrees - previousDegrees + 540) % 360) - 180;
}

export function getTouchRotationBearingDelta(currentDegrees: number, previousDegrees: number) {
  return -getShortestAngleDelta(currentDegrees, previousDegrees);
}

/** Changes orientation while keeping the observer at its current viewport pixel. */
export function getCameraBearingEaseOptions(
  bearingDegrees: number,
  currentZoom: number,
  durationMilliseconds: number,
  observer?: { longitudeDegrees: number; latitudeDegrees: number },
) {
  if (observer) {
    return {
      ...getObserverAnchoredCameraOptions(
        observer,
        currentZoom,
        bearingDegrees,
      ),
      duration: durationMilliseconds,
    };
  }
  return {
    bearing: bearingDegrees,
    zoom: currentZoom,
    duration: durationMilliseconds,
  };
}
