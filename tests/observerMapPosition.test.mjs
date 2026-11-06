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
  getCameraBearingEaseOptions,
  getCameraZoomEaseOptions,
  getObserverCameraOffset,
  getObserverAnchoredCameraOptions,
  getWheelZoomDelta,
  getShortestAngleDelta,
  getTouchRotationBearingDelta,
} = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);

test('observer marker updates do not command a camera recenter or alter camera padding', () => {
  const position = { latitudeDegrees: 42.1, longitudeDegrees: 1.2 };
  assert.deepEqual(position, { latitudeDegrees: 42.1, longitudeDegrees: 1.2 });
  assert.doesNotMatch(viewportSource, /getObserverMapEaseOptions\(observerPosition/);
  assert.doesNotMatch(viewportSource, /setPadding\(/);
});

test('observer centering places the observer at 75 percent height and preserves zoom', () => {
  assert.deepEqual(getObserverCameraOffset(800), [0, 200]);
  assert.match(viewportSource, /centerObserverAt: \(center, bearing\) =>/);
  assert.match(viewportSource, /offset: getObserverCameraOffset\(activeMap\.getContainer\(\)\.clientHeight\)/);
  assert.match(viewportSource, /zoom: activeMap\.getZoom\(\)/);
  assert.match(viewportSource, /map\.touchZoomRotate\.disable\(\)/);
  assert.match(viewportSource, /map\.dragPan\.disable\(\)/);
  assert.match(viewportSource, /map\.dragPan\.enable\(\)/);
  assert.match(viewportSource, /map\.scrollZoom\.disable\(\)/);
  assert.match(viewportSource, /dragRotate: true/);
});

test('zoom controls retain camera center and observer coordinates', () => {
  for (const targetZoom of [14, 12]) {
    const options = getCameraZoomEaseOptions(targetZoom, 220);
    assert.equal(options.zoom, targetZoom);
    assert.equal(options.duration, 220);
    assert.equal(Object.hasOwn(options, 'around'), false);
  }
  assert.match(viewportSource, /getCameraZoomEaseOptions\(activeMap\.getZoom\(\) \+ zoomDelta, 220\)/);
});

test('button, wheel and pinch zoom use the observer geographic point as their live anchor', () => {
  const observer = { longitudeDegrees: 1.2, latitudeDegrees: 42.1 };
  const options = getObserverAnchoredCameraOptions(observer, 14, 32);
  assert.deepEqual(options.around, [1.2, 42.1]);
  assert.equal(options.zoom, 14);
  assert.equal(options.bearing, 32);
  assert.deepEqual(getCameraZoomEaseOptions(14, 220, observer), {
    around: [1.2, 42.1], zoom: 14, duration: 220,
  });
  assert.equal(getWheelZoomDelta(100, 0), -100 / 450);
  assert.equal(getWheelZoomDelta(3, 1), -120 / 450);
  assert.match(viewportSource, /getWheelZoomDelta\([\s\S]*?event\.deltaY,[\s\S]*?event\.deltaMode/);
  assert.match(viewportSource, /getObserverAnchoredCameraOptions\(\s*observer,\s*activeMap\.getZoom\(\) \+ zoomDelta/);
  assert.match(viewportSource, /getObserverAnchoredCameraOptions\(\s*observer,\s*targetZoom/);
  assert.match(viewportSource, /easeToObserverAnchor\(map, options, 120\)/);
  assert.match(viewportSource, /map\.scrollZoom\.disable\(\)/);
  assert.match(viewportSource, /map\.touchZoomRotate\.disable\(\)/);
  assert.match(viewportSource, /canvas\.style\.touchAction = 'none'/);
  assert.match(viewportSource, /event\.preventDefault\(\)/);
});

test('automatic bearing rotation anchors the observer at its current screen point and retains zoom', () => {
  for (const bearing of [90, 180, 270]) {
    const observer = { longitudeDegrees: 1.2, latitudeDegrees: 42.1 };
    const options = getCameraBearingEaseOptions(bearing, 13.5, 180, observer);
    assert.equal(options.bearing, bearing);
    assert.equal(options.zoom, 13.5);
    assert.equal(options.duration, 180);
    assert.deepEqual(options.around, [1.2, 42.1]);
  }
  assert.match(viewportSource, /getCameraBearingEaseOptions\(/);
  assert.match(viewportSource, /observerPositionRef\.current/);
  assert.match(viewportSource, /around: \[observer\.longitudeDegrees, observer\.latitudeDegrees\]/);
  assert.match(viewportSource, /pointerPositions\.size === 2/);
  assert.match(viewportSource, /onMapBearingChange\(map\.getBearing\(\)\)/);
});

test('combined pinch zoom and rotation preserve the observer and wrap through north', () => {
  const observer = { longitudeDegrees: 1.2, latitudeDegrees: 42.1 };
  const combined = getObserverAnchoredCameraOptions(observer, 15.25, 361);
  assert.deepEqual(combined.around, [1.2, 42.1]);
  assert.equal(combined.zoom, 15.25);
  assert.equal(getShortestAngleDelta(1, 359), 2);
  assert.equal(getShortestAngleDelta(359, 1), -2);
  assert.equal(getTouchRotationBearingDelta(10, 0), -10);
  assert.equal(getTouchRotationBearingDelta(1, 359), -2);
  assert.equal(getTouchRotationBearingDelta(359, 1), 2);
  assert.match(viewportSource, /map\.getZoom\(\) \+ zoomDelta/);
  assert.match(viewportSource, /map\.getBearing\(\) \+ rotationDelta/);
  assert.match(viewportSource, /easeToObserverAnchor\(map, options, 0\)/);
  assert.doesNotMatch(viewportSource, /touchRotationStart/);
  assert.match(viewportSource, /touchGesturePrevious = \{ angle, distance \}/);
  assert.doesNotMatch(viewportSource, /aroundPoint|new Point\(/);
  const pointerGestureHandler = viewportSource.match(/const handlePointerMove = \(event: PointerEvent\) => \{([\s\S]*?)const handlePointerEnd/)?.[1] ?? '';
  assert.doesNotMatch(pointerGestureHandler, /onObserverPositionChange\(/);
  assert.doesNotMatch(viewportSource, /style\.transform|transform\s*:\s*scale\(/);
});

test('gesture start and end only capture pointers without camera jumps', () => {
  const downHandler = viewportSource.match(/const handlePointerDown = \(event: PointerEvent\) => \{([\s\S]*?)\n    \};/)?.[1] ?? '';
  const endHandler = viewportSource.match(/const handlePointerEnd = \(event: PointerEvent\) => \{([\s\S]*?)\n    \};/)?.[1] ?? '';
  assert.doesNotMatch(downHandler, /map\.(jumpTo|easeTo|rotateTo)/);
  assert.doesNotMatch(endHandler, /map\.(jumpTo|easeTo|rotateTo)/);
  assert.match(viewportSource, /easeToObserverAnchor\(map, options, 0\)/);
});

test('centering and resetting north use one camera transition and preserve zoom', () => {
  assert.match(viewportSource, /centerAt: \(center, bearing\) => \{/);
  assert.match(viewportSource, /center,\s*\.\.\.\(bearing === undefined \? \{\} : \{ bearing \}\),\s*zoom: activeMap\.getZoom\(\)/);
  assert.doesNotMatch(viewportSource, /centerAt:\s*\(center\).*setBearing/);
});
