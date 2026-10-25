import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

function compile(source, replacements = {}) {
  let javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const [specifier, replacement] of Object.entries(replacements)) {
    javascript = javascript.replaceAll(`from "${specifier}"`, `from ${JSON.stringify(replacement)}`);
    javascript = javascript.replaceAll(`from '${specifier}'`, `from ${JSON.stringify(replacement)}`);
  }
  return `data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`;
}

const configSource = await readFile(new URL('../src/map/mapConfig.ts', import.meta.url), 'utf8');
const configUrl = compile(configSource);
const helperSource = await readFile(new URL('../src/map/peakMarkerLayer.ts', import.meta.url), 'utf8');
const helperUrl = compile(helperSource, { './mapConfig': configUrl });
const { PEAK_CANDIDATE_MARKER_LAYER, PEAK_MOUNTAIN_ICON } = await import(configUrl);
const { ensurePeakMarkerLayer } = await import(helperUrl);

test('marker image is registered as SDF before its layer, and both are restored after style reload', () => {
  const images = new Set();
  const layers = new Set(['peak-candidate-labels']);
  const calls = [];
  const map = {
    hasImage: (name) => images.has(name),
    addImage(name, image, options) {
      calls.push(['image', name, options.sdf]);
      images.add(name);
    },
    getLayer: (name) => layers.has(name),
    addLayer(layer, beforeId) {
      assert.ok(images.has(layer.layout['icon-image']), 'the layer image must already be registered');
      calls.push(['layer', layer.id, beforeId]);
      layers.add(layer.id);
    },
  };
  const image = {};

  ensurePeakMarkerLayer(map, image);
  assert.deepEqual(calls, [
    ['image', PEAK_MOUNTAIN_ICON, true],
    ['layer', PEAK_CANDIDATE_MARKER_LAYER.id, 'peak-candidate-labels'],
  ]);

  images.clear();
  layers.delete(PEAK_CANDIDATE_MARKER_LAYER.id);
  calls.length = 0;
  ensurePeakMarkerLayer(map, image);
  assert.deepEqual(calls, [
    ['image', PEAK_MOUNTAIN_ICON, true],
    ['layer', PEAK_CANDIDATE_MARKER_LAYER.id, 'peak-candidate-labels'],
  ]);
});
