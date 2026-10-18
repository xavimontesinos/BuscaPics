import { useCallback, useState } from 'react';
import { MapControls } from './components/MapControls';
import {
  MapViewport,
  type MapOrientationActions,
  type MapZoomActions,
} from './components/MapViewport';
import { PeakFilter, type PeakSet } from './components/PeakFilter';

function App() {
  const [selectedPeakSet, setSelectedPeakSet] = useState<PeakSet>('3000');
  const [mapZoomActions, setMapZoomActions] = useState<MapZoomActions | null>(null);
  const [mapOrientationActions, setMapOrientationActions] =
    useState<MapOrientationActions | null>(null);
  const [mapBearing, setMapBearing] = useState(0);
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

  return (
    <MapViewport
      onMapZoomActionsChange={handleMapZoomActionsChange}
      onMapOrientationActionsChange={handleMapOrientationActionsChange}
      onMapBearingChange={handleMapBearingChange}
    >
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
