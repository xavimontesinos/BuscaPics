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
import { ensurePeakMarkerLayer } from '../map/peakMarkerLayer';
import {
  getObserverBearingEaseOptions,
  getObserverMapEaseOptions,
  getObserverMapPadding,
  getObserverZoomEaseOptions,
  OBSERVER_ANCHORED_GESTURES,
} from '../map/observerMapPosition';
import type { PeakFeatureCollection } from '../domain/peaks';
import type { GeographicPosition } from '../domain/visibility/types';
import { visibilityDebug } from '../domain/visibility/visibilityDebug';

setWorkerUrl(maplibreWorkerUrl);

export type MapZoomActions = {
  zoomIn: () => void;
  zoomOut: () => void;
};

export type MapOrientationActions = {
  setBearing: (bearing: number, durationMilliseconds?: number) => void;
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
  const observerPositionRef = useRef(observerPosition);
  const peakFeaturesRef = useRef(peakFeatures);
  const selectedPeakIdRef = useRef(selectedPeakId);
  const lastVisibilityDiagnosticRef = useRef('');
  peakFeaturesRef.current = peakFeatures;
  selectedPeakIdRef.current = selectedPeakId;
  observerPositionRef.current = observerPosition;

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const map = new MapLibreMap({
      container,
      style: MAP_STYLE,
      ...INITIAL_MAP_VIEW,
      attributionControl: { compact: false },
      dragRotate: false,
      ...OBSERVER_ANCHORED_GESTURES,
    });
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;
    let isActive = true;
    let peakIconPromise: Promise<HTMLImageElement> | null = null;
    let styleLoadSequence = 0;
    let markerInteractionsRegistered = false;
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
    const syncObserverPadding = () => {
      const padding = getObserverMapPadding(map.getContainer().clientHeight, Boolean(observerPositionRef.current));
      const current = map.getPadding();
      if (current.top !== padding.top || current.right !== padding.right ||
        current.bottom !== padding.bottom || current.left !== padding.left) {
        map.setPadding(padding);
      }
    };
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
    const loadPeakIcon = () => {
      if (peakIconPromise) return peakIconPromise;
      const url = `${import.meta.env.BASE_URL}images/peak-mountain.svg`;
      const image = new Image();
      peakIconPromise = new Promise((resolve, reject) => {
        image.onload = () => resolve(image);
        image.onerror = () => {
          peakIconPromise = null;
          reject(new Error(`Could not load peak map image: ${url}`));
        };
      });
      image.src = url;
      return peakIconPromise;
    };
    const handleStyleLoad = () => {
      const sequence = ++styleLoadSequence;
      void loadPeakIcon().then((image) => {
        if (!isActive || sequence !== styleLoadSequence) return;
        ensurePeakMarkerLayer(map, image);
        visibilityDebug('map-icon-ready', {
          name: PEAK_MOUNTAIN_ICON,
          sdf: map.getImage(PEAK_MOUNTAIN_ICON).sdf,
          markerLayerAddedAfterImage: Boolean(map.getLayer('peak-candidate-markers')),
        });
        if (!markerInteractionsRegistered) {
          map.on('click', 'peak-candidate-markers', handlePeakClick);
          map.on('mousemove', 'peak-candidate-markers', handlePeakPointerMove);
          markerInteractionsRegistered = true;
        }
        const source = map.getSource('peak-candidates') as GeoJSONSource | undefined;
        source?.setData(peakFeaturesRef.current);
        applySelectedPeakState();
      }).catch((error: unknown) => {
        if (isActive && sequence === styleLoadSequence) {
          console.warn('Could not initialize peak map marker:', error);
          visibilityDebug('map-icon-initialization-failed', { name: PEAK_MOUNTAIN_ICON, error });
        }
      });
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
    map.on('resize', syncObserverPadding);
    map.on('click', 'peak-candidate-labels', handlePeakClick);
    map.on('mousemove', 'peak-candidate-labels', handlePeakPointerMove);
    map.on('style.load', handleStyleLoad);
    map.on('error', handleMapError);
    onMapBearingChange(map.getBearing());

    const zoomAroundObserver = (zoomDelta: number) => {
      const activeMap = mapRef.current;
      if (!activeMap) return;
      const observer = observerPositionRef.current;
      if (observer) {
        activeMap.easeTo(getObserverZoomEaseOptions(observer, activeMap.getZoom() + zoomDelta, 220));
      } else if (zoomDelta > 0) {
        activeMap.zoomIn({ duration: 220 });
      } else {
        activeMap.zoomOut({ duration: 220 });
      }
    };
    onMapZoomActionsChange({
      zoomIn: () => zoomAroundObserver(1),
      zoomOut: () => zoomAroundObserver(-1),
    });
    const setBearingAroundObserver = (bearing: number, durationMilliseconds = 0) => {
      const activeMap = mapRef.current;
      if (!activeMap) return;
      const observer = observerPositionRef.current;
      if (observer) {
        activeMap.easeTo(getObserverBearingEaseOptions(
          observer,
          bearing,
          activeMap.getZoom(),
          durationMilliseconds,
        ));
      } else {
        activeMap.easeTo({ bearing, zoom: activeMap.getZoom(), duration: durationMilliseconds });
      }
    };
    onMapOrientationActionsChange({
      setBearing: setBearingAroundObserver,
      centerAt: (center) => mapRef.current?.easeTo({ center, duration: 400 }),
      resetNorth: () => {
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        setBearingAroundObserver(0, reduceMotion ? 0 : 450);
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
      map.off('movestart', cancelLongPress);
      map.off('rotate', handleRotate);
      map.off('resize', syncObserverPadding);
      if (markerInteractionsRegistered) {
        map.off('click', 'peak-candidate-markers', handlePeakClick);
        map.off('mousemove', 'peak-candidate-markers', handlePeakPointerMove);
      }
      map.off('click', 'peak-candidate-labels', handlePeakClick);
      map.off('mousemove', 'peak-candidate-labels', handlePeakPointerMove);
      map.off('style.load', handleStyleLoad);
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
    const counts = { visible: 0, partiallyVisible: 0, occluded: 0, indeterminate: 0, outsideRadius: 0, outsideFov: 0 };
    for (const feature of peakFeatures.features) counts[feature.properties.visibility] += 1;
    const sample = peakFeatures.features.find((feature) => feature.properties.peakId === selectedPeakId) ??
      peakFeatures.features.find((feature) => feature.properties.visibility !== 'indeterminate') ??
      peakFeatures.features[0];
    const signature = `${JSON.stringify(counts)}:${sample?.properties.peakId}:${sample?.properties.visibility}`;
    if (sample && signature !== lastVisibilityDiagnosticRef.current) {
      lastVisibilityDiagnosticRef.current = signature;
      const markerLayerAvailable = Boolean(map.getLayer('peak-candidate-markers'));
      visibilityDebug('map-source-setData', {
        source: 'peak-candidates',
        featureCount: peakFeatures.features.length,
        counts,
        sample: sample.properties,
        iconRegistered: map.hasImage(PEAK_MOUNTAIN_ICON),
        iconSdf: map.hasImage(PEAK_MOUNTAIN_ICON) ? map.getImage(PEAK_MOUNTAIN_ICON).sdf : null,
        layerIcon: markerLayerAvailable ? map.getLayoutProperty('peak-candidate-markers', 'icon-image') : null,
        iconColorExpression: markerLayerAvailable ? map.getPaintProperty('peak-candidate-markers', 'icon-color') : null,
      });
      map.once('idle', () => {
        const renderedLayers = map.getLayer('peak-candidate-markers')
          ? ['peak-candidate-markers', 'peak-candidate-labels']
          : ['peak-candidate-labels'];
        const rendered = map.queryRenderedFeatures(undefined, {
          layers: renderedLayers,
        });
        visibilityDebug('map-rendered-features', {
          samplePeakId: sample.properties.peakId,
          renderedSample: rendered.find((feature) => feature.properties?.peakId === sample.properties.peakId)?.properties ?? null,
          renderedFeatureCount: rendered.length,
        });
      });
    }
  }, [peakFeatures, selectedPeakId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setPadding(getObserverMapPadding(map.getContainer().clientHeight, Boolean(observerPosition)));
    if (observerPosition) map.easeTo(getObserverMapEaseOptions(observerPosition, map.getZoom()));
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

