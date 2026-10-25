import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/map/observerMapPosition.ts', import.meta.url), 'utf8');
const viewportSource = await readFile(new URL('../src/components/MapViewport.tsx', import.meta.url), 'utf8');
let javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const {
  getObserverBearingEaseOptions,
  getObserverMapEaseOptions,
  getObserverMapPadding,
  getObserverZoomEaseOptions,
  OBSERVER_ANCHORED_GESTURES,
} = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);

test('observer is shifted to 75 percent of the viewport while preserving coordinates and zoom', () => {
  const position = { latitudeDegrees: 42.1, longitudeDegrees: 1.2 };
  const options = getObserverMapEaseOptions(position, 13.5);
  assert.deepEqual(options, { center: [1.2, 42.1], zoom: 13.5, duration: 400 });
  const padding = getObserverMapPadding(800, true);
  assert.deepEqual(padding, { top: 400, right: 0, bottom: 0, left: 0 });
  assert.equal((800 + padding.top) / 2 / 800, 0.75);
  assert.deepEqual(position, { latitudeDegrees: 42.1, longitudeDegrees: 1.2 });
});

test('wheel and pinch handlers use MapLibre effective center as their zoom anchor', () => {
  assert.deepEqual(OBSERVER_ANCHORED_GESTURES, {
    scrollZoom: { around: 'center' },
    touchZoomRotate: { around: 'center' },
  });
  assert.deepEqual(getObserverMapPadding(600, false), { top: 0, right: 0, bottom: 0, left: 0 });
  assert.match(viewportSource, /\.\.\.OBSERVER_ANCHORED_GESTURES/);
  assert.match(viewportSource, /map\.touchZoomRotate\.disableRotation\(\)/);
});

test('zoom controls target the requested zoom around the unchanged observer coordinate', () => {
  const position = { latitudeDegrees: 42.1, longitudeDegrees: 1.2 };
  for (const targetZoom of [14, 12]) {
    const options = getObserverZoomEaseOptions(position, targetZoom, 220);
    assert.deepEqual(options.around, [1.2, 42.1]);
    assert.equal(options.zoom, targetZoom);
    assert.equal(options.duration, 220);
    assert.equal(Object.hasOwn(options, 'bearing'), false);
  }
  assert.match(viewportSource, /getObserverZoomEaseOptions\(observer, activeMap\.getZoom\(\) \+ zoomDelta, 220\)/);
});

test('bearing camera updates keep the same observer anchor and zoom for quarter turns', () => {
  const position = { latitudeDegrees: 42.1, longitudeDegrees: 1.2 };
  const expectedAnchor = [1.2, 42.1];
  for (const bearing of [90, 180, 270]) {
    const options = getObserverBearingEaseOptions(position, bearing, 13.5, 180);
    assert.deepEqual(options.around, expectedAnchor);
    assert.equal(options.bearing, bearing);
    assert.equal(options.zoom, 13.5);
    assert.equal(options.duration, 180);
    assert.equal(Object.hasOwn(options, 'center'), false);
  }
  assert.deepEqual(position, { latitudeDegrees: 42.1, longitudeDegrees: 1.2 });
});
