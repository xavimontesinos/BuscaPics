import type { ObservationOrientationMode } from './orientation';

export type ObserverOrigin = 'gps' | 'manual' | null;

export type MapOrientationMode = ObservationOrientationMode;

export interface GpsObserverAction {
  updateObserver: boolean;
  centerCamera: boolean;
  resetNorth: boolean;
}

/** Keeps GPS fixes from replacing a manually selected observer. */
export function getGpsObserverAction(
  observerOrigin: ObserverOrigin,
  isInitialFix: boolean,
  isRecovery: boolean,
): GpsObserverAction {
  if (observerOrigin === 'manual') {
    return { updateObserver: false, centerCamera: false, resetNorth: false };
  }

  if (observerOrigin === 'gps') {
    return { updateObserver: true, centerCamera: isRecovery, resetNorth: false };
  }

  if (isInitialFix) {
    return { updateObserver: true, centerCamera: true, resetNorth: true };
  }

  return { updateObserver: false, centerCamera: false, resetNorth: false };
}

export function getContextButtonKind(mode: MapOrientationMode): 'compass' | 'target' {
  return mode === 'manual' ? 'target' : 'compass';
}
