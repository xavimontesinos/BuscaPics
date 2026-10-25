import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { calculatePeakVisibilities, type PeakVisibilityResult } from './domain/visibility/peakVisibility';
import { isLatestRequest } from './domain/visibility/latestRequest';
import { visibilityDebug } from './domain/visibility/visibilityDebug';
import { getDeviceCompassHeading, resolveObservationBearing, type ObservationOrientationMode } from './domain/orientation';

type VisibilityRadiusKm = 10 | 25 | 50 | 100;

function App() {
  const [selectedPeakSet, setSelectedPeakSet] = useState<PeakSet>('100-cims');
  const [peakCatalog, setPeakCatalog] = useState<Peak[]>([]);
  const [catalogError, setCatalogError] = useState(false);
  const [mapZoomActions, setMapZoomActions] = useState<MapZoomActions | null>(null);
  const [mapOrientationActions, setMapOrientationActions] =
    useState<MapOrientationActions | null>(null);
  const [mapBearing, setMapBearing] = useState(0);
  const [orientationMode, setOrientationMode] = useState<ObservationOrientationMode>('automatic');
  const [compassBearing, setCompassBearing] = useState<number | null>(null);
  const [observerPosition, setObserverPosition] = useState<GeographicPosition | null>(null);
  const [observerElevation, setObserverElevation] = useState<TerrainElevationLookup | null>(null);
  const elevationRequestId = useRef(0);
  const calculationRequestId = useRef(0);
  const orientationGeneration = useRef(0);
  const lastBearingCommitTime = useRef(0);
  const pendingBearingCommit = useRef<number | null>(null);
  const bearingCommitTimer = useRef<number | null>(null);
  const [visibilityRadiusKm, setVisibilityRadiusKm] = useState<VisibilityRadiusKm>(50);
  const [settledObservationBearing, setSettledObservationBearing] = useState(0);
  const [settledOrientationGeneration, setSettledOrientationGeneration] = useState(0);
  const [visibilityByPeak, setVisibilityByPeak] = useState<Map<string, PeakVisibilityResult>>(new Map());
  const [selectedPeakId, setSelectedPeakId] = useState<string | null>(null);
  const handleObserverPositionChange = useCallback((position: GeographicPosition) => {
    elevationRequestId.current += 1;
    const requestId = elevationRequestId.current;
    visibilityDebug('observer-selected', { requestId, position });
    setObserverPosition(position);
    setObserverElevation({ state: 'missing' });
    void getIgcObserverGroundElevation(position).then((result) => {
      visibilityDebug('observer-elevation', {
        requestId,
        state: result.state,
        elevation: result.state === 'available' ? result.sample.elevation : undefined,
      });
      if (isLatestRequest(requestId, elevationRequestId.current)) setObserverElevation(result);
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
  const handleManualBearingChange = useCallback((bearing: number) => {
    setOrientationMode('manual');
    mapOrientationActions?.setBearing(bearing, 0);
  }, [mapOrientationActions]);
  const handleResumeAutomaticOrientation = useCallback(async () => {
    const orientationApi = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    if (typeof orientationApi?.requestPermission === 'function') {
      try { await orientationApi.requestPermission(); } catch { /* Keep the manual heading if permission is unavailable. */ }
    }
    setOrientationMode('automatic');
  }, []);
  useEffect(() => {
    let pendingHeading: number | null = null;
    let headingUpdateTimer: number | null = null;
    let lastPublishedAt = 0;
    const publishPendingHeading = () => {
      if (pendingHeading === null) return;
      setCompassBearing(pendingHeading);
      lastPublishedAt = Date.now();
      headingUpdateTimer = null;
    };
    const handleDeviceOrientation = (event: Event) => {
      const heading = getDeviceCompassHeading(
        event as DeviceOrientationEvent & { webkitCompassHeading?: number },
        window.screen.orientation?.angle ?? 0,
      );
      if (heading === null) return;
      pendingHeading = heading;
      const delay = 100 - (Date.now() - lastPublishedAt);
      if (delay <= 0) {
        if (headingUpdateTimer !== null) window.clearTimeout(headingUpdateTimer);
        publishPendingHeading();
      } else if (headingUpdateTimer === null) {
        headingUpdateTimer = window.setTimeout(publishPendingHeading, delay);
      }
    };
    window.addEventListener('deviceorientation', handleDeviceOrientation);
    window.addEventListener('deviceorientationabsolute', handleDeviceOrientation);
    return () => {
      window.removeEventListener('deviceorientation', handleDeviceOrientation);
      window.removeEventListener('deviceorientationabsolute', handleDeviceOrientation);
      if (headingUpdateTimer !== null) window.clearTimeout(headingUpdateTimer);
    };
  }, []);
  const observationBearing = resolveObservationBearing(orientationMode, mapBearing, compassBearing);
  useEffect(() => {
    if (orientationMode === 'automatic' && compassBearing !== null) {
      mapOrientationActions?.setBearing(compassBearing, 200);
    }
  }, [orientationMode, compassBearing, mapOrientationActions]);
  useLayoutEffect(() => {
    orientationGeneration.current += 1;
  }, [observationBearing]);
  useEffect(() => {
    pendingBearingCommit.current = observationBearing;
    const delay = 180 - (Date.now() - lastBearingCommitTime.current);
    const publishBearing = () => {
      const pending = pendingBearingCommit.current;
      if (pending !== null) setSettledObservationBearing(pending);
      setSettledOrientationGeneration(orientationGeneration.current);
      lastBearingCommitTime.current = Date.now();
      bearingCommitTimer.current = null;
    };
    if (delay <= 0) {
      if (bearingCommitTimer.current !== null) window.clearTimeout(bearingCommitTimer.current);
      publishBearing();
    } else if (bearingCommitTimer.current === null) {
      bearingCommitTimer.current = window.setTimeout(publishBearing, delay);
    }
  }, [observationBearing]);
  useEffect(() => () => {
    if (bearingCommitTimer.current !== null) window.clearTimeout(bearingCommitTimer.current);
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
    const counts = { visible: 0, occluded: 0, indeterminate: 0, outsideRadius: 0, outsideFov: 0 };
    for (const status of visibilityByPeak.values()) counts[status.state] += 1;
    const example = peakFeatures.features.find((feature) => feature.properties.peakId === selectedPeakId) ??
      peakFeatures.features[0];
    visibilityDebug('geojson-ready', {
      featureCount: peakFeatures.features.length,
      visibilityCounts: counts,
      example: example?.properties,
    });
  }, [peakFeatures, selectedPeakId, visibilityByPeak]);

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
    const requestId = ++calculationRequestId.current;
    if (!observerPosition || !observerElevation) {
      setVisibilityByPeak(new Map());
      return;
    }
    let current = true;
    const isCurrent = () => current && isLatestRequest(requestId, calculationRequestId.current);
    if (settledObservationBearing !== observationBearing) {
      setVisibilityByPeak(new Map());
      return () => { current = false; };
    }
    setVisibilityByPeak(new Map());
    const currentOrientationGeneration = orientationGeneration.current;
    const isRequestCurrent = () => isCurrent() && currentOrientationGeneration === orientationGeneration.current;
    visibilityDebug('calculation-start', {
      requestId,
      peakCount: peakCatalog.length,
      observerPosition,
      radiusKm: visibilityRadiusKm,
      directionBearingDegrees: settledObservationBearing,
    });
    void calculatePeakVisibilities(observerPosition, observerElevation, peakCatalog, {
      maxDistanceMeters: visibilityRadiusKm * 1000,
      directionBearingDegrees: settledObservationBearing,
      onProgress: (results) => {
        if (isRequestCurrent()) setVisibilityByPeak(new Map(results));
      },
    }).then((results) => {
      if (!isRequestCurrent()) return;
      const counts = { visible: 0, occluded: 0, indeterminate: 0, outsideRadius: 0, outsideFov: 0 };
      const examples: Record<string, string[]> = { visible: [], occluded: [], indeterminate: [], outsideRadius: [], outsideFov: [] };
      for (const [peakId, status] of results) {
        counts[status.state] += 1;
        if (examples[status.state].length < 2) examples[status.state].push(peakId);
      }
      visibilityDebug('calculation-complete', { requestId, counts, examples });
      setVisibilityByPeak(results);
    }).catch((error) => {
      if (isRequestCurrent()) console.warn('Visibility calculation could not be completed:', error);
    });
    return () => { current = false; };
  }, [observerPosition, observerElevation, peakCatalog, visibilityRadiusKm, settledObservationBearing, settledOrientationGeneration]);

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
        onSetBearing={handleManualBearingChange}
        onResetNorth={handleResumeAutomaticOrientation}
        orientationMode={orientationMode}
        compassAvailable={compassBearing !== null}
      />
      <PeakFilter value={selectedPeakSet} onChange={setSelectedPeakSet} />
      <label className="visibility-radius" htmlFor="visibility-radius-select">
        Radi de visibilitat
        <select
          id="visibility-radius-select"
          value={visibilityRadiusKm}
          onChange={(event) => setVisibilityRadiusKm(Number(event.target.value) as VisibilityRadiusKm)}
        >
          {[10, 25, 50, 100].map((radius) => <option key={radius} value={radius}>{radius} km</option>)}
        </select>
      </label>
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
