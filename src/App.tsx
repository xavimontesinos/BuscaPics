import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapControls } from './components/MapControls';
import {
  MapViewport,
  type MapOrientationActions,
  type MapZoomActions,
} from './components/MapViewport';
import { PeakFilter, type PeakSet } from './components/PeakFilter';
import { toPeakFeatureCollection, type Peak } from './domain/peaks';
import type { GeographicPosition } from './domain/visibility/types';

function App() {
  const [selectedPeakSet, setSelectedPeakSet] = useState<PeakSet>('100-cims');
  const [peakCatalog, setPeakCatalog] = useState<Peak[]>([]);
  const [catalogError, setCatalogError] = useState(false);
  const [mapZoomActions, setMapZoomActions] = useState<MapZoomActions | null>(null);
  const [mapOrientationActions, setMapOrientationActions] =
    useState<MapOrientationActions | null>(null);
  const [mapBearing, setMapBearing] = useState(0);
  const [observerPosition, setObserverPosition] = useState<GeographicPosition | null>(null);
  const handleObserverPositionChange = useCallback((position: GeographicPosition) => {
    setObserverPosition(position);
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
    () => toPeakFeatureCollection(peakCatalog, { id: selectedPeakSet }),
    [peakCatalog, selectedPeakSet],
  );

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
    </MapViewport>
  );
}

export default App;
