import { useEffect, useRef, type ReactNode } from 'react';
import {
  Map as MapLibreMap,
  setWorkerUrl,
  type ErrorEvent,
  type GeoJSONSource,
} from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  INITIAL_MAP_VIEW,
  MAP_STYLE,
  PEAK_MOUNTAIN_ICON,
} from '../map/mapConfig';
import type { PeakFeatureCollection } from '../domain/peaks';
import type { GeographicPosition } from '../domain/visibility/types';

setWorkerUrl(maplibreWorkerUrl);

export type MapZoomActions = {
  zoomIn: () => void;
  zoomOut: () => void;
};

export type MapOrientationActions = {
  setBearing: (bearing: number) => void;
  resetNorth: () => void;
};

type MapViewportProps = {
  children: ReactNode;
  peakFeatures: PeakFeatureCollection;
  onObserverPositionChange: (position: GeographicPosition) => void;
  onMapZoomActionsChange: (actions: MapZoomActions | null) => void;
  onMapOrientationActionsChange: (actions: MapOrientationActions | null) => void;
  onMapBearingChange: (bearing: number | null) => void;
};

export function MapViewport({
  children,
  peakFeatures,
  onObserverPositionChange,
  onMapZoomActionsChange,
  onMapOrientationActionsChange,
  onMapBearingChange,
}: MapViewportProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const peakFeaturesRef = useRef(peakFeatures);
  peakFeaturesRef.current = peakFeatures;

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const map = new MapLibreMap({
      container,
      style: MAP_STYLE,
      ...INITIAL_MAP_VIEW,
      attributionControl: { compact: false },
      dragRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;
    let isActive = true;
    let peakImagesStarted = false;
    const peakImages: HTMLImageElement[] = [];
    const canvas = map.getCanvas();
    const activePointers = new Set<number>();
    let longPressTimer: number | null = null;
    let longPressPointerId: number | null = null;
    let longPressStart: { x: number; y: number } | null = null;

    const cancelLongPress = () => {
      if (longPressTimer !== null) window.clearTimeout(longPressTimer);
      longPressTimer = null;
      longPressPointerId = null;
      longPressStart = null;
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!canvas.contains(event.target as Node)) {
        cancelLongPress();
        return;
      }
      if (event.pointerType === 'mouse' && event.button !== 0) return;

      activePointers.add(event.pointerId);
      cancelLongPress();
      if (activePointers.size !== 1) return;

      const pointerId = event.pointerId;
      const start = { x: event.clientX, y: event.clientY };
      longPressPointerId = pointerId;
      longPressStart = start;
      longPressTimer = window.setTimeout(() => {
        if (!isActive || longPressPointerId !== pointerId || !activePointers.has(pointerId)) return;
        const bounds = canvas.getBoundingClientRect();
        const location = map.unproject([start.x - bounds.left, start.y - bounds.top]);
        const longitude = ((location.lng + 180) % 360 + 360) % 360 - 180;
        onObserverPositionChange({
          latitudeDegrees: location.lat,
          longitudeDegrees: longitude,
        });
        cancelLongPress();
      }, 650);
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (longPressPointerId !== event.pointerId || !longPressStart) return;
      if (Math.hypot(event.clientX - longPressStart.x, event.clientY - longPressStart.y) > 10) {
        cancelLongPress();
      }
    };
    const handlePointerEnd = (event: PointerEvent) => {
      activePointers.delete(event.pointerId);
      if (longPressPointerId === event.pointerId) cancelLongPress();
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', handlePointerEnd, true);
    window.addEventListener('pointercancel', handlePointerEnd, true);

    const handleRotate = () => onMapBearingChange(map.getBearing());
    const handleLoad = () => {
      const source = map.getSource('peak-candidates') as GeoJSONSource | undefined;
      source?.setData(peakFeaturesRef.current);

      if (peakImagesStarted) return;
      peakImagesStarted = true;
      const url = '/images/peak-mountain.svg';
      if (map.hasImage(PEAK_MOUNTAIN_ICON)) return;
      const image = new Image();
      peakImages.push(image);
      image.onload = () => {
        if (!isActive || map.hasImage(PEAK_MOUNTAIN_ICON)) return;
        map.addImage(PEAK_MOUNTAIN_ICON, image);
      };
      image.onerror = () => console.warn(`Could not load peak map image: ${url}`);
      image.src = url;
    };
    const handleMapError = (event: ErrorEvent) => {
      console.warn('MapLibre resource error:', event.error.message);
    };
    map.on('movestart', cancelLongPress);
    map.on('rotate', handleRotate);
    map.on('load', handleLoad);
    map.on('error', handleMapError);
    onMapBearingChange(map.getBearing());

    onMapZoomActionsChange({
      zoomIn: () => mapRef.current?.zoomIn({ duration: 220 }),
      zoomOut: () => mapRef.current?.zoomOut({ duration: 220 }),
    });
    onMapOrientationActionsChange({
      setBearing: (bearing) => mapRef.current?.setBearing(bearing),
      resetNorth: () => {
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        mapRef.current?.resetNorth({ duration: reduceMotion ? 0 : 450 });
      },
    });

    return () => {
      isActive = false;
      cancelLongPress();
      activePointers.clear();
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', handlePointerEnd, true);
      window.removeEventListener('pointercancel', handlePointerEnd, true);
      for (const image of peakImages) {
        image.onload = null;
        image.onerror = null;
      }
      map.off('movestart', cancelLongPress);
      map.off('rotate', handleRotate);
      map.off('load', handleLoad);
      map.off('error', handleMapError);
      map.remove();
      mapRef.current = null;
      onMapZoomActionsChange(null);
      onMapOrientationActionsChange(null);
      onMapBearingChange(null);
    };
  }, [onMapBearingChange, onMapOrientationActionsChange, onMapZoomActionsChange, onObserverPositionChange]);

  useEffect(() => {
    const source = mapRef.current?.getSource('peak-candidates') as GeoJSONSource | undefined;
    source?.setData(peakFeatures);
  }, [peakFeatures]);

  return (
    <main className="map-viewport" aria-label="Pantalla principal del mapa">
      <div
        className="map-canvas"
        ref={mapContainerRef}
        role="application"
        aria-label="Mapa topográfico interactivo del ICGC"
      />
      {children}
    </main>
  );
}
