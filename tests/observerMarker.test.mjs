import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const viewport = await readFile(new URL('../src/components/MapViewport.tsx', import.meta.url), 'utf8');
const icon = await readFile(new URL('../public/images/observer-position.svg', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');

test('observer marker uses its geographic coordinates and stays screen-aligned', () => {
  assert.match(viewport, /rotationAlignment: 'viewport'/);
  assert.match(viewport, /pitchAlignment: 'viewport'/);
  assert.match(viewport, /\.setLngLat\(\[observerPosition\.longitudeDegrees, observerPosition\.latitudeDegrees\]\)/);
  assert.doesNotMatch(viewport, /observerMarkerRef\.current\?\.setRotation|marker\.setRotation/);
});

test('observer navigation arrow points up and has a distinct fixed marker style', () => {
  assert.match(icon, /viewBox="0 0 36 36"/);
  assert.match(icon, /M18 2 32 32 18 25 4 32Z/);
  assert.match(viewport, /images\/observer-position\.svg/);
  assert.match(viewport, /markerElement\.alt = 'Observador'/);
  assert.match(styles, /\.observer-position-marker\s*\{/);
  assert.match(styles, /pointer-events:\s*none/);
});
