import { useEffect, useRef, type ReactNode } from 'react';
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { INITIAL_MAP_VIEW, MAP_STYLE } from '../map/mapConfig';

setWorkerUrl(maplibreWorkerUrl);

export type MapZoomActions = {
  zoomIn: () => void;
  zoomOut: () => void;
};

type MapViewportProps = {
  children: ReactNode;
  onMapZoomActionsChange: (actions: MapZoomActions | null) => void;
};

export function MapViewport({ children, onMapZoomActionsChange }: MapViewportProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

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

    onMapZoomActionsChange({
      zoomIn: () => mapRef.current?.zoomIn({ duration: 220 }),
      zoomOut: () => mapRef.current?.zoomOut({ duration: 220 }),
    });

    return () => {
      map.remove();
      mapRef.current = null;
      onMapZoomActionsChange(null);
    };
  }, [onMapZoomActionsChange]);

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
