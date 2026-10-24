import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapControls } from './components/MapControls';
import {
  MapViewport,
  type MapOrientationActions,
  type MapZoomActions,
} from './components/MapViewport';
import { PeakFilter, type PeakSet } from './components/PeakFilter';
import { toPeakFeatureCollection, type Peak } from './domain/peaks';
import type { GeographicPosition } from './domain/visibility/types';
import type { TerrainElevationLookup } from './domain/visibility/types';
import { getIgcObserverGroundElevation } from './domain/visibility/icgcObserverElevation';
import { calculatePeakVisibilities } from './domain/visibility/peakVisibility';
import type { VisibilityStatus } from './domain/visibility/types';

function App() {
  const [selectedPeakSet, setSelectedPeakSet] = useState<PeakSet>('100-cims');
  const [peakCatalog, setPeakCatalog] = useState<Peak[]>([]);
  const [catalogError, setCatalogError] = useState(false);
  const [mapZoomActions, setMapZoomActions] = useState<MapZoomActions | null>(null);
  const [mapOrientationActions, setMapOrientationActions] =
    useState<MapOrientationActions | null>(null);
  const [mapBearing, setMapBearing] = useState(0);
  const [observerPosition, setObserverPosition] = useState<GeographicPosition | null>(null);
  const [observerElevation, setObserverElevation] = useState<TerrainElevationLookup | null>(null);
  const elevationRequestId = useRef(0);
  const [visibilityByPeak, setVisibilityByPeak] = useState<Map<string, VisibilityStatus>>(new Map());
  const [selectedPeakId, setSelectedPeakId] = useState<string | null>(null);
  const handleObserverPositionChange = useCallback((position: GeographicPosition) => {
    elevationRequestId.current += 1;
    const requestId = elevationRequestId.current;
    setObserverPosition(position);
    setObserverElevation({ state: 'missing' });
    void getIgcObserverGroundElevation(position).then((result) => {
      if (requestId === elevationRequestId.current) setObserverElevation(result);
    });
  }, []);
  const handlePeakSelect = useCallback((peakId: string) => {
    setSelectedPeakId(peakId);
  }, []);
  const handleMapZoomActionsChange = useCallback((actions: MapZoomActions | null) => {
    setMapZoomActions(actions);
  }, []);
  const handleMapOrientationActionsChange = useCallback(
    (actions: MapOrientationActions | null) => {
      setMapOrientationActions(actions);
    },
    [],
  );
  const handleMapBearingChange = useCallback((bearing: number | null) => {
    if (bearing !== null) setMapBearing(bearing);
  }, []);
  const peakFeatures = useMemo(
    () => toPeakFeatureCollection(
      peakCatalog,
      { id: selectedPeakSet },
      new Map([...visibilityByPeak].map(([id, status]) => [id, status.state])),
    ),
    [peakCatalog, selectedPeakSet, visibilityByPeak],
  );
  const selectedPeak = peakCatalog.find((peak) => peak.id === selectedPeakId) ?? null;

  useEffect(() => {
    if (selectedPeak) {
      mapOrientationActions?.centerAt([selectedPeak.longitude, selectedPeak.latitude]);
    }
  }, [selectedPeak, mapOrientationActions]);

  useEffect(() => {
    if (selectedPeakId && !peakFeatures.features.some((feature) => feature.properties.peakId === selectedPeakId)) {
      setSelectedPeakId(null);
    }
  }, [peakFeatures, selectedPeakId]);

  useEffect(() => {
    const requestId = elevationRequestId.current;
    if (!observerPosition || !observerElevation || observerElevation.state !== 'available') {
      setVisibilityByPeak(new Map());
      return;
    }
    void calculatePeakVisibilities(observerPosition, observerElevation, peakCatalog).then((results) => {
      if (requestId === elevationRequestId.current) setVisibilityByPeak(results);
    });
  }, [observerPosition, observerElevation, peakCatalog]);

  useEffect(() => {
    let isCurrent = true;

    async function loadPeakCatalog() {
      try {
        const response = await fetch('/data/100-cims-catalog.json');
        if (!response.ok) throw new Error(`Catalog request failed: ${response.status}`);
        const catalog = (await response.json()) as { peaks: Peak[] };
        if (!Array.isArray(catalog.peaks)) throw new Error('Catalog has no peaks array');
        if (isCurrent) setPeakCatalog(catalog.peaks);
      } catch (error) {
        console.warn('Could not load the 100 Cims development catalog:', error);
        if (isCurrent) setCatalogError(true);
      }
    }

    void loadPeakCatalog();
    return () => {
      isCurrent = false;
    };
  }, []);

  return (
    <MapViewport
      peakFeatures={peakFeatures}
      observerPosition={observerPosition}
      selectedPeakId={selectedPeakId}
      onPeakSelect={handlePeakSelect}
      onObserverPositionChange={handleObserverPositionChange}
      onMapZoomActionsChange={handleMapZoomActionsChange}
      onMapOrientationActionsChange={handleMapOrientationActionsChange}
      onMapBearingChange={handleMapBearingChange}
    >
      {catalogError && (
        <p className="peak-catalog-error" role="status">
          No se pudo cargar el catálogo de cimas. El mapa sigue disponible.
        </p>
      )}
      <MapControls
        onZoomIn={mapZoomActions?.zoomIn}
        onZoomOut={mapZoomActions?.zoomOut}
        bearing={mapBearing}
        onSetBearing={mapOrientationActions?.setBearing}
        onResetNorth={mapOrientationActions?.resetNorth}
      />
      <PeakFilter value={selectedPeakSet} onChange={setSelectedPeakSet} />
      {observerPosition && (
        <p className="observer-elevation" role="status" aria-live="polite">
          Terreny: {observerElevation?.state === 'available'
            ? `${new Intl.NumberFormat('ca-ES', { maximumFractionDigits: 0 }).format(Math.round(observerElevation.sample.elevation.meters))} m`
            : 'desconegut'}
        </p>
      )}
      {selectedPeak && (
        <aside className="selected-peak-card" aria-label="Cima seleccionada" aria-live="polite">
          <h2>{selectedPeak.name}</h2>
          <p>Altitud: {new Intl.NumberFormat('ca-ES', { maximumFractionDigits: 0 }).format(Math.round(selectedPeak.elevationMeters))} m</p>
          <p>Latitud: {selectedPeak.latitude.toFixed(6)}°</p>
          <p>Longitud: {selectedPeak.longitude.toFixed(6)}°</p>
        </aside>
      )}
    </MapViewport>
  );
}

export default App;
