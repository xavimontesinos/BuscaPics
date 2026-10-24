import { useEffect, useRef, type ReactNode } from 'react';
import {
  Map as MapLibreMap,
  Marker,
  setWorkerUrl,
  type ErrorEvent,
  type GeoJSONSource,
  type MapLayerMouseEvent,
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
  centerAt: (center: [number, number]) => void;
};

type MapViewportProps = {
  children: ReactNode;
  peakFeatures: PeakFeatureCollection;
  observerPosition: GeographicPosition | null;
  selectedPeakId: string | null;
  onPeakSelect: (peakId: string) => void;
  onObserverPositionChange: (position: GeographicPosition) => void;
  onMapZoomActionsChange: (actions: MapZoomActions | null) => void;
  onMapOrientationActionsChange: (actions: MapOrientationActions | null) => void;
  onMapBearingChange: (bearing: number | null) => void;
};

export function MapViewport({
  children,
  peakFeatures,
  observerPosition,
  selectedPeakId,
  onPeakSelect,
  onObserverPositionChange,
  onMapZoomActionsChange,
  onMapOrientationActionsChange,
  onMapBearingChange,
}: MapViewportProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const observerMarkerRef = useRef<Marker | null>(null);
  const peakFeaturesRef = useRef(peakFeatures);
  const selectedPeakIdRef = useRef(selectedPeakId);
  peakFeaturesRef.current = peakFeatures;
  selectedPeakIdRef.current = selectedPeakId;

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
    let suppressNextClick = false;

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
        map.easeTo({ center: [longitude, location.lat], duration: 400 });
        suppressNextClick = true;
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
    const handlePeakClick = (event: MapLayerMouseEvent) => {
      if (suppressNextClick) {
        suppressNextClick = false;
        return;
      }
      const feature = event.features?.[0];
      const peakId = feature?.properties?.peakId;
      if (typeof peakId !== 'string' || feature?.geometry.type !== 'Point') return;
      onPeakSelect(peakId);
    };
    const handlePeakPointerMove = (event: MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = event.features?.length ? 'pointer' : '';
    };
    const handleLoad = () => {
      const source = map.getSource('peak-candidates') as GeoJSONSource | undefined;
      source?.setData(peakFeaturesRef.current);
      applySelectedPeakState();

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
    const applySelectedPeakState = () => {
      for (const feature of peakFeaturesRef.current.features) {
        map.setFeatureState({ source: 'peak-candidates', id: feature.id }, {
          selected: feature.id === selectedPeakIdRef.current,
        });
      }
    };
    const handleMapError = (event: ErrorEvent) => {
      console.warn('MapLibre resource error:', event.error.message);
    };
    const handleCanvasClick = () => {
      if (suppressNextClick) suppressNextClick = false;
    };
    canvas.addEventListener('click', handleCanvasClick, true);
    map.on('movestart', cancelLongPress);
    map.on('rotate', handleRotate);
    map.on('click', 'peak-candidate-markers', handlePeakClick);
    map.on('click', 'peak-candidate-labels', handlePeakClick);
    map.on('mousemove', 'peak-candidate-markers', handlePeakPointerMove);
    map.on('mousemove', 'peak-candidate-labels', handlePeakPointerMove);
    map.on('load', handleLoad);
    map.on('error', handleMapError);
    onMapBearingChange(map.getBearing());

    onMapZoomActionsChange({
      zoomIn: () => mapRef.current?.zoomIn({ duration: 220 }),
      zoomOut: () => mapRef.current?.zoomOut({ duration: 220 }),
    });
    onMapOrientationActionsChange({
      setBearing: (bearing) => mapRef.current?.setBearing(bearing),
      centerAt: (center) => mapRef.current?.easeTo({ center, duration: 400 }),
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
      canvas.removeEventListener('click', handleCanvasClick, true);
      for (const image of peakImages) {
        image.onload = null;
        image.onerror = null;
      }
      map.off('movestart', cancelLongPress);
      map.off('rotate', handleRotate);
      map.off('click', 'peak-candidate-markers', handlePeakClick);
      map.off('click', 'peak-candidate-labels', handlePeakClick);
      map.off('mousemove', 'peak-candidate-markers', handlePeakPointerMove);
      map.off('mousemove', 'peak-candidate-labels', handlePeakPointerMove);
      map.off('load', handleLoad);
      map.off('error', handleMapError);
      map.remove();
      mapRef.current = null;
      observerMarkerRef.current = null;
      onMapZoomActionsChange(null);
      onMapOrientationActionsChange(null);
      onMapBearingChange(null);
    };
  }, [onMapBearingChange, onMapOrientationActionsChange, onMapZoomActionsChange, onObserverPositionChange, onPeakSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource('peak-candidates') as GeoJSONSource | undefined;
    source?.setData(peakFeatures);
    for (const feature of peakFeatures.features) {
      map.setFeatureState({ source: 'peak-candidates', id: feature.id }, {
        selected: feature.id === selectedPeakId,
      });
    }
  }, [peakFeatures, selectedPeakId]);

  useEffect(() => {
    if (!observerPosition) return;
    mapRef.current?.easeTo({
      center: [observerPosition.longitudeDegrees, observerPosition.latitudeDegrees],
      duration: 400,
    });
  }, [observerPosition]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !observerPosition) return;

    const marker = new Marker({ color: '#d1495b' })
      .setLngLat([observerPosition.longitudeDegrees, observerPosition.latitudeDegrees])
      .addTo(map);
    observerMarkerRef.current = marker;
    return () => {
      marker.remove();
      if (observerMarkerRef.current === marker) observerMarkerRef.current = null;
    };
  }, [observerPosition]);

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

