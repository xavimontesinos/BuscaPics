import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/domain/observerCameraState.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const state = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);

test('the first GPS fix becomes the GPS observer, centers the camera, and resets north', () => {
  assert.deepEqual(state.getGpsObserverAction(null, true, false), {
    updateObserver: true,
    centerCamera: true,
    resetNorth: true,
  });
});

test('GPS-origin observers follow accepted fixes, with recenter only after GPS recovery', () => {
  assert.deepEqual(state.getGpsObserverAction('gps', false, false), {
    updateObserver: true,
    centerCamera: false,
    resetNorth: false,
  });
  assert.deepEqual(state.getGpsObserverAction('gps', false, true), {
    updateObserver: true,
    centerCamera: true,
    resetNorth: false,
  });
});

test('manual observers survive later fixes and GPS recovery without camera or bearing changes', () => {
  for (const [initial, recovery] of [[false, false], [false, true], [true, false]]) {
    assert.deepEqual(state.getGpsObserverAction('manual', initial, recovery), {
      updateObserver: false,
      centerCamera: false,
      resetNorth: false,
    });
  }
});

test('the contextual control uses a compass in north and compass modes, and a target in manual mode', () => {
  assert.equal(state.getContextButtonKind('north'), 'compass');
  assert.equal(state.getContextButtonKind('compass'), 'compass');
  assert.equal(state.getContextButtonKind('manual'), 'target');
});
