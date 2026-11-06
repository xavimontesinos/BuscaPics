import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const viewport = await readFile(new URL('../src/components/MapViewport.tsx', import.meta.url), 'utf8');
const controls = await readFile(new URL('../src/components/MapControls.tsx', import.meta.url), 'utf8');
const icons = await readFile(new URL('../src/components/icons.tsx', import.meta.url), 'utf8');

test('GPS tracking starts with the app and keeps GPS, observer, and camera independent', () => {
  assert.match(app, /useEffect\(\(\) => \{\s*startGpsTracking\(\);\s*return \(\) => stopGps\(\);/);
  assert.match(app, /setGpsPosition\(fix\.position\)/);
  assert.match(app, /const isInitialFix = !hasGpsInitializedObserver\.current/);
  assert.match(app, /getGpsObserverAction\(observerOriginRef\.current, isInitialFix, isRecovery\)/);
  assert.match(app, /updateObserverPosition\(fix\.position, 'gps'\)/);
  assert.match(app, /pendingGpsCameraReset\.current = \{ position: fix\.position, resetNorth: observerAction\.resetNorth \}/);
  assert.match(app, /gpsWasUnavailable\.current = true/);
});

test('manual observer selection preserves GPS tracking and centers only the camera on that observer', () => {
  const manualHandler = app.match(/const handleManualObserverPositionChange = useCallback\(\(position: GeographicPosition\) => \{([\s\S]*?)\}, \[updateObserverPosition\]\);/)?.[1];
  assert.ok(manualHandler);
  assert.match(manualHandler, /updateObserverPosition\(position, 'manual'\)/);
  assert.match(manualHandler, /setOrientationMode\('north'\)/);
  assert.match(manualHandler, /updateObserverPosition\(position, 'manual'\)/);
  assert.match(manualHandler, /mapOrientationActionsRef\.current\?\.centerObserverAt/);
  assert.match(manualHandler, /centerObserverAt\(\[position\.longitudeDegrees, position\.latitudeDegrees\], 0\)/);
  assert.doesNotMatch(manualHandler, /stopGps|setGpsPosition/);
  assert.doesNotMatch(viewport, /map\.easeTo\(\{ center: \[longitude, location\.lat\]/);
});

test('manual camera gestures disable compass following without changing observer coordinates', () => {
  assert.match(viewport, /map\.on\('dragstart', handleUserMoveStart\)/);
  assert.match(viewport, /map\.on\('rotatestart', handleUserMoveStart\)/);
  assert.match(viewport, /if \(event\.originalEvent\) onManualCameraInteraction\(\)/);
  assert.match(viewport, /pointerPositions\.size === 2/);
  assert.match(viewport, /event\.preventDefault\(\)/);
  assert.match(viewport, /canvas\.style\.touchAction = 'none'/);
  assert.match(viewport, /dragRotate: true/);
  assert.match(app, /setCompassListening\(false\)/);
});

test('contextual control shows Material compass/target icons and has no standalone GPS control', () => {
  assert.match(controls, /<Icon name="myLocation" \/>/);
  assert.match(controls, /<Icon name="explore" \/>/);
  assert.match(controls, /getContextButtonKind\(orientationMode\)/);
  assert.match(controls, /disabled=\{buttonKind === 'target' && !gpsAvailable\}/);
  assert.doesNotMatch(controls, /gps-button|sensor-status|onGpsToggle|onCenterGps/);
  assert.match(app, /mapOrientationActions\?\.centerObserverAt\(\[gpsPosition\.longitudeDegrees, gpsPosition\.latitudeDegrees\], 0\)/);
  assert.match(app, /if \(orientationMode === 'manual'\)/);
  assert.match(app, /updateObserverPosition\(gpsPosition, 'gps'\)/);
  assert.match(app, /if \(orientationMode === 'compass'\)[\s\S]*?setOrientationMode\('north'\)/);
  assert.match(app, /setOrientationMode\('compass'\)/);
  assert.match(app, /const observationBearing = resolveObservationBearing\(mapBearing\)/);
  assert.match(app, /getVisibilityView\(visibilitySession, observerPosition, peakCatalog, visibilityRadiusKm, observationBearing\)/);
  assert.match(icons, /className="compass-north-label"[\s\S]*>N<\/text>/);
  assert.match(icons, /className="compass-north"/);
  assert.match(icons, /className="target-center"/);
});
