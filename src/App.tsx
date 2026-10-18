import { useCallback, useState } from 'react';
import { MapControls } from './components/MapControls';
import { MapViewport, type MapZoomActions } from './components/MapViewport';
import { PeakFilter, type PeakSet } from './components/PeakFilter';

function App() {
  const [selectedPeakSet, setSelectedPeakSet] = useState<PeakSet>('3000');
  const [mapZoomActions, setMapZoomActions] = useState<MapZoomActions | null>(null);
  const handleMapZoomActionsChange = useCallback((actions: MapZoomActions | null) => {
    setMapZoomActions(actions);
  }, []);

  return (
    <MapViewport onMapZoomActionsChange={handleMapZoomActionsChange}>
      <MapControls
        onZoomIn={mapZoomActions?.zoomIn}
        onZoomOut={mapZoomActions?.zoomOut}
      />
      <PeakFilter value={selectedPeakSet} onChange={setSelectedPeakSet} />
    </MapViewport>
  );
}

export default App;
