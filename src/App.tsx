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
import { getIgcObserverGroundElevation, getIgcTerrainCacheStats, ICGC_MDT_CACHE_REVISION } from './domain/visibility/icgcObserverElevation';
import {
  calculatePeakGeometricVisibilities,
  createPeakVisibilityCacheKey,
  getUncachedEligiblePeaks,
  selectPeaksForVisibility,
  type PeakVisibilityResult,
} from './domain/visibility/peakVisibility';
import { isLatestRequest } from './domain/visibility/latestRequest';
import { visibilityDebug } from './domain/visibility/visibilityDebug';
import {
  beginDeviceOrientationPermissionRequest,
  resolveObservationBearing,
  smoothBearingDegrees,
  subscribeToDeviceCompass,
  type ObservationOrientationMode,
} from './domain/orientation';
import { isGpsFixAccurate, readGpsFix, shouldPublishGpsFix, type GpsFix } from './domain/gps';
import { getGpsObserverAction, type ObserverOrigin } from './domain/observerCameraState';

type VisibilityRadiusKm = 10 | 25 | 50 | 100;

interface VisibilitySession {
  key: string;
  catalog: readonly Peak[];
  geometricResults: Map<string, PeakVisibilityResult>;
  inFlight: Set<string>;
}

function getVisibilityView(
  session: VisibilitySession,
  observerPosition: GeographicPosition,
  peaks: readonly Peak[],
  radiusKm: VisibilityRadiusKm,
  bearing: number,
): Map<string, PeakVisibilityResult> {
  const selection = selectPeaksForVisibility(observerPosition, peaks, radiusKm * 1000, bearing);
  const view = new Map(selection.immediateResults);
  for (const { peak } of selection.eligible) {
    view.set(peak.id, session.geometricResults.get(peak.id) ?? {
      state: 'indeterminate',
      reason: 'missing-terrain-data',
    });
  }
  return view;
}

function App() {
  const [selectedPeakSet, setSelectedPeakSet] = useState<PeakSet>('100-cims');
  const [peakCatalog, setPeakCatalog] = useState<Peak[]>([]);
  const [catalogError, setCatalogError] = useState(false);
  const [mapZoomActions, setMapZoomActions] = useState<MapZoomActions | null>(null);
  const [mapOrientationActions, setMapOrientationActions] =
    useState<MapOrientationActions | null>(null);
  const [mapBearing, setMapBearing] = useState(0);
  const [orientationMode, setOrientationMode] = useState<ObservationOrientationMode>('north');
  const [compassBearing, setCompassBearing] = useState<number | null>(null);
  const [observerPosition, setObserverPosition] = useState<GeographicPosition | null>(null);
  const [gpsPosition, setGpsPosition] = useState<GeographicPosition | null>(null);
  const [gpsAvailable, setGpsAvailable] = useState(false);
  const [observerElevation, setObserverElevation] = useState<TerrainElevationLookup | null>(null);
  const elevationRequestId = useRef(0);
  const gpsWatchId = useRef<number | null>(null);
  const gpsTracking = useRef(false);
  const gpsLastFix = useRef<GpsFix | null>(null);
  const hasGpsInitializedObserver = useRef(false);
  const observerOriginRef = useRef<ObserverOrigin>(null);
  const orientationModeRef = useRef(orientationMode);
  orientationModeRef.current = orientationMode;
  const gpsWasUnavailable = useRef(false);
  const pendingGpsCameraReset = useRef<{ position: GeographicPosition; resetNorth: boolean } | null>(null);
  const mapOrientationActionsRef = useRef<MapOrientationActions | null>(null);
  const [compassListening, setCompassListening] = useState(false);
  const smoothedCompassBearing = useRef<number | null>(null);
  const compassPermissionGranted = useRef(false);
  const compassPermissionDenied = useRef(false);
  const compassPermissionPending = useRef(false);
  const orientationGeneration = useRef(0);
  const lastBearingCommitTime = useRef(0);
  const pendingBearingCommit = useRef<number | null>(null);
  const bearingCommitTimer = useRef<number | null>(null);
  const [visibilityRadiusKm, setVisibilityRadiusKm] = useState<VisibilityRadiusKm>(50);
  const [settledObservationBearing, setSettledObservationBearing] = useState(0);
  const [settledOrientationGeneration, setSettledOrientationGeneration] = useState(0);
  const [visibilitySession, setVisibilitySession] = useState<VisibilitySession | null>(null);
  const visibilitySessionRef = useRef<VisibilitySession | null>(null);
  const [visibilityRevision, setVisibilityRevision] = useState(0);
  const [selectedPeakId, setSelectedPeakId] = useState<string | null>(null);
  const visibilityContextKey = observerPosition && observerElevation
    ? createPeakVisibilityCacheKey(observerPosition, observerElevation, ICGC_MDT_CACHE_REVISION)
    : null;
  useEffect(() => {
    if (!visibilityContextKey || !observerPosition || !observerElevation) {
      visibilitySessionRef.current = null;
      setVisibilitySession(null);
      return;
    }
    const current = visibilitySessionRef.current;
    if (current?.key === visibilityContextKey && current.catalog === peakCatalog) return;
    const session: VisibilitySession = {
      key: visibilityContextKey,
      catalog: peakCatalog,
      geometricResults: new Map(),
      inFlight: new Set(),
    };
    visibilitySessionRef.current = session;
    setVisibilitySession(session);
    setVisibilityRevision((revision) => revision + 1);
  }, [visibilityContextKey, observerPosition, observerElevation, peakCatalog]);

  const updateObserverPosition = useCallback((position: GeographicPosition, origin: Exclude<ObserverOrigin, null>) => {
    elevationRequestId.current += 1;
    const requestId = elevationRequestId.current;
    observerOriginRef.current = origin;
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
  const stopGps = useCallback(() => {
    gpsTracking.current = false;
    if (gpsWatchId.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(gpsWatchId.current);
      gpsWatchId.current = null;
    }
  }, []);
  const handleManualObserverPositionChange = useCallback((position: GeographicPosition) => {
    updateObserverPosition(position, 'manual');
    setOrientationMode('north');
    setCompassListening(false);
    mapOrientationActionsRef.current?.centerObserverAt([position.longitudeDegrees, position.latitudeDegrees], 0);
  }, [updateObserverPosition]);
  const startGpsTracking = useCallback(() => {
    if (gpsTracking.current) return;
    if (!navigator.geolocation) {
      return;
    }

    gpsTracking.current = true;
    let watchId: number;
    try {
      watchId = navigator.geolocation.watchPosition((position) => {
        if (!gpsTracking.current) return;
        const fix = readGpsFix(position);
        if (!fix) {
          setGpsAvailable(false);
          gpsWasUnavailable.current = true;
          return;
        }
        if (!isGpsFixAccurate(fix)) {
          setGpsAvailable(false);
          gpsWasUnavailable.current = true;
          return;
        }
        setGpsAvailable(true);
        const isRecovery = gpsWasUnavailable.current;
        gpsWasUnavailable.current = false;
        setGpsPosition(fix.position);
        const isInitialFix = !hasGpsInitializedObserver.current;
        hasGpsInitializedObserver.current = true;
        if (shouldPublishGpsFix(gpsLastFix.current, fix) || isRecovery) {
          gpsLastFix.current = fix;
          const observerAction = getGpsObserverAction(observerOriginRef.current, isInitialFix, isRecovery);
          if (observerAction.updateObserver) updateObserverPosition(fix.position, 'gps');
          if (observerAction.centerCamera) {
            pendingGpsCameraReset.current = { position: fix.position, resetNorth: observerAction.resetNorth };
            const actions = mapOrientationActionsRef.current;
            if (actions) {
              pendingGpsCameraReset.current = null;
              actions.centerObserverAt(
                [fix.position.longitudeDegrees, fix.position.latitudeDegrees],
                observerAction.resetNorth ? 0 : undefined,
              );
              if (observerAction.resetNorth) {
                setCompassListening(false);
                setOrientationMode('north');
              }
            }
          }
        }
      }, () => {
        setGpsAvailable(false);
        gpsWasUnavailable.current = true;
      }, { enableHighAccuracy: true, maximumAge: 3_000, timeout: 20_000 });
    } catch {
      stopGps();
      return;
    }
    if (gpsTracking.current) gpsWatchId.current = watchId;
    else navigator.geolocation.clearWatch(watchId);
  }, [stopGps, updateObserverPosition]);
  useEffect(() => {
    startGpsTracking();
    return () => stopGps();
  }, [startGpsTracking, stopGps]);
  useEffect(() => () => {
    gpsTracking.current = false;
    if (gpsWatchId.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(gpsWatchId.current);
  }, []);
  const handlePeakSelect = useCallback((peakId: string) => {
    setSelectedPeakId(peakId);
  }, []);
  const handleMapZoomActionsChange = useCallback((actions: MapZoomActions | null) => {
    setMapZoomActions(actions);
  }, []);
  const handleMapOrientationActionsChange = useCallback(
    (actions: MapOrientationActions | null) => {
      mapOrientationActionsRef.current = actions;
      setMapOrientationActions(actions);
      const pendingReset = pendingGpsCameraReset.current;
      if (actions && pendingReset) {
        pendingGpsCameraReset.current = null;
        actions.centerObserverAt(
          [pendingReset.position.longitudeDegrees, pendingReset.position.latitudeDegrees],
          pendingReset.resetNorth ? 0 : undefined,
        );
        if (pendingReset.resetNorth) {
          setCompassListening(false);
          setOrientationMode('north');
        }
      }
    },
    [],
  );
  const handleManualCameraInteraction = useCallback(() => {
    if (orientationModeRef.current !== 'manual') {
      setOrientationMode('manual');
      setCompassListening(false);
    }
  }, []);
  const handleMapBearingChange = useCallback((bearing: number | null) => {
    if (bearing !== null) setMapBearing(bearing);
  }, []);
  const handleContextAction = useCallback(() => {
    if (orientationMode === 'manual') {
      if (!gpsAvailable || !gpsPosition) return;
      updateObserverPosition(gpsPosition, 'gps');
      mapOrientationActions?.centerObserverAt([gpsPosition.longitudeDegrees, gpsPosition.latitudeDegrees], 0);
      setCompassListening(false);
      setOrientationMode('north');
      return;
    }
    if (orientationMode === 'compass') {
      setCompassListening(false);
      setOrientationMode('north');
      mapOrientationActions?.setBearing(0, 250);
      return;
    }
    if (!window.isSecureContext) {
      return;
    }
    if (compassPermissionPending.current) return;
    if (compassPermissionDenied.current) {
      return;
    }
    const orientationApi = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: (absolute?: boolean) => Promise<'granted' | 'denied'>;
    } | undefined;
    if (compassPermissionGranted.current) {
      setCompassListening(true);
      setOrientationMode('compass');
      return;
    }

    // Call requestPermission(true) synchronously in this click handler, before state work or await.
    const permissionRequest = beginDeviceOrientationPermissionRequest(orientationApi);
    compassPermissionPending.current = true;
    void permissionRequest.then((permission) => {
      compassPermissionPending.current = false;
      if (permission === 'denied') {
        compassPermissionDenied.current = true;
        return;
      }
      if (permission === 'unsupported') {
        return;
      }
      if (permission === 'error') {
        return;
      }
      compassPermissionGranted.current = true;
      smoothedCompassBearing.current = null;
      setCompassBearing(null);
      setCompassListening(true);
      setOrientationMode('compass');
    }).catch(() => {
      compassPermissionPending.current = false;
    });
  }, [gpsAvailable, gpsPosition, mapOrientationActions, orientationMode, updateObserverPosition]);
  useEffect(() => {
    if (!compassListening) return undefined;
    let pendingHeading: number | null = null;
    let headingUpdateTimer: number | null = null;
    let lastPublishedAt = 0;
    let receivedHeading = false;
    const noSensorTimer = window.setTimeout(() => {
      if (!receivedHeading) {
        setCompassListening(false);
        setOrientationMode('north');
        mapOrientationActionsRef.current?.setBearing(0, 200);
      }
    }, 8_000);
    const publishPendingHeading = () => {
      if (pendingHeading === null) return;
      setCompassBearing(pendingHeading);
      lastPublishedAt = Date.now();
      headingUpdateTimer = null;
    };
    const unsubscribe = subscribeToDeviceCompass(window, (heading) => {
      receivedHeading = true;
      window.clearTimeout(noSensorTimer);
      pendingHeading = smoothBearingDegrees(smoothedCompassBearing.current, heading);
      smoothedCompassBearing.current = pendingHeading;
      const delay = 100 - (Date.now() - lastPublishedAt);
      if (delay <= 0) {
        if (headingUpdateTimer !== null) window.clearTimeout(headingUpdateTimer);
        publishPendingHeading();
      } else if (headingUpdateTimer === null) {
        headingUpdateTimer = window.setTimeout(publishPendingHeading, delay);
      }
    }, window.screen.orientation?.angle ?? 0);
    return () => {
      window.clearTimeout(noSensorTimer);
      unsubscribe();
      if (headingUpdateTimer !== null) window.clearTimeout(headingUpdateTimer);
    };
  }, [compassListening]);
  const observationBearing = resolveObservationBearing(mapBearing);
  const visibilityByPeak = useMemo(() => {
    if (!observerPosition || !visibilitySession || visibilitySession.key !== visibilityContextKey) return new Map<string, PeakVisibilityResult>();
    return getVisibilityView(visibilitySession, observerPosition, peakCatalog, visibilityRadiusKm, observationBearing);
  }, [visibilitySession, visibilityContextKey, observerPosition, peakCatalog, visibilityRadiusKm, observationBearing, visibilityRevision]);
  useEffect(() => {
    if (orientationMode === 'compass' && compassBearing !== null) {
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
    const counts = { visible: 0, partiallyVisible: 0, occluded: 0, indeterminate: 0, outsideRadius: 0, outsideFov: 0 };
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
    if (!observerPosition || !observerElevation || !visibilitySession ||
      visibilitySessionRef.current !== visibilitySession || visibilitySession.key !== visibilityContextKey ||
      settledObservationBearing !== observationBearing) return;

    const selection = selectPeaksForVisibility(
      observerPosition,
      peakCatalog,
      visibilityRadiusKm * 1000,
      settledObservationBearing,
    );
    const uncached = getUncachedEligiblePeaks(
      selection,
      visibilitySession.geometricResults,
      visibilitySession.inFlight,
    );
    const reusedGeometryCount = selection.eligible.length - uncached.length;
    const inFlightCount = selection.eligible.filter(({ peak }) => visibilitySession.inFlight.has(peak.id)).length;
    const metrics = {
      bearingDegrees: settledObservationBearing,
      radiusKm: visibilityRadiusKm,
      inSectorCount: selection.eligible.length,
      reusedGeometryCount,
      alreadyInFlightCount: inFlightCount,
      newlyCalculatedPeakCount: uncached.length,
      previousBehaviorPeakCalculations: selection.eligible.length,
      estimatedPreviousRoutePreparations: selection.eligible.length * 5,
    };
    visibilityDebug('heading-visibility-start', metrics);
    if (uncached.length === 0) {
      visibilityDebug('heading-visibility-performance', {
        ...metrics,
        routePreparations: 0,
        mdtBlockReadRequests: 0,
        mdtCachedBlocks: null,
      });
      return;
    }

    for (const { peak } of uncached) visibilitySession.inFlight.add(peak.id);
    const beforeTerrain = getIgcTerrainCacheStats().catch(() => null);
    let routePreparations = 0;
    void calculatePeakGeometricVisibilities(observerPosition, observerElevation, uncached, {
      onRoutePreparation: () => { routePreparations += 1; },
      onProgress: (updates) => {
        if (updates.size === 0) return;
        if (visibilitySessionRef.current !== visibilitySession) return;
        for (const [peakId, result] of updates) {
          visibilitySession.geometricResults.set(peakId, result);
          visibilitySession.inFlight.delete(peakId);
        }
        setVisibilityRevision((revision) => revision + 1);
      },
    }).then(async () => {
      if (visibilitySessionRef.current !== visibilitySession) return;
      for (const { peak } of uncached) visibilitySession.inFlight.delete(peak.id);
      setVisibilityRevision((revision) => revision + 1);
      const [before, after] = await Promise.all([beforeTerrain, getIgcTerrainCacheStats().catch(() => null)]);
      visibilityDebug('heading-visibility-performance', {
        ...metrics,
        routePreparations,
        mdtBlockReadRequests: before && after ? after.blockReadRequests - before.blockReadRequests : null,
        mdtCachedBlocks: after?.cachedBlocks ?? null,
        note: 'MDT block reads are provider cache misses, not HTTP Range request counts.',
      });
    }).catch((error) => {
      if (visibilitySessionRef.current !== visibilitySession) return;
      for (const { peak } of uncached) visibilitySession.inFlight.delete(peak.id);
      console.warn('Visibility calculation could not be completed:', error);
      setVisibilityRevision((revision) => revision + 1);
    });
  }, [observerPosition, observerElevation, visibilitySession, visibilityContextKey, peakCatalog, visibilityRadiusKm, settledObservationBearing, observationBearing, settledOrientationGeneration]);

  useEffect(() => {
    let isCurrent = true;

    async function loadPeakCatalog() {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}data/100-cims-catalog.json`);
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
      onObserverPositionChange={handleManualObserverPositionChange}
      onMapZoomActionsChange={handleMapZoomActionsChange}
      onMapOrientationActionsChange={handleMapOrientationActionsChange}
      onMapBearingChange={handleMapBearingChange}
      onManualCameraInteraction={handleManualCameraInteraction}
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
        orientationMode={orientationMode}
        compassAvailable={compassBearing !== null}
        gpsAvailable={gpsAvailable}
        onContextAction={handleContextAction}
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
