import type { Map as MapLibreMap, StyleImageSource } from 'maplibre-gl';
import { PEAK_CANDIDATE_MARKER_LAYER, PEAK_MOUNTAIN_ICON } from './mapConfig';

type PeakMarkerMap = Pick<MapLibreMap, 'hasImage' | 'addImage' | 'getLayer' | 'addLayer'>;

/** Registers the image before adding its referencing layer; idempotent across style loads. */
export function ensurePeakMarkerLayer(map: PeakMarkerMap, image: StyleImageSource): void {
  if (!map.hasImage(PEAK_MOUNTAIN_ICON)) {
    map.addImage(PEAK_MOUNTAIN_ICON, image, { sdf: true });
  }
  if (!map.getLayer(PEAK_CANDIDATE_MARKER_LAYER.id)) {
    map.addLayer(PEAK_CANDIDATE_MARKER_LAYER, 'peak-candidate-labels');
  }
}
