import { useState } from 'react';
import { MapControls } from './components/MapControls';
import { MapViewport } from './components/MapViewport';
import { PeakFilter, type PeakSet } from './components/PeakFilter';

function App() {
  const [selectedPeakSet, setSelectedPeakSet] = useState<PeakSet>('3000');

  return (
    <MapViewport>
      <MapControls />
      <PeakFilter value={selectedPeakSet} onChange={setSelectedPeakSet} />
    </MapViewport>
  );
}

export default App;
