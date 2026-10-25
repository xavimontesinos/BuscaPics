import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/map/mapConfig.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText.replaceAll('import.meta.env.BASE_URL', JSON.stringify('/'));
const { MAP_STYLE, PEAK_CANDIDATE_MARKER_LAYER } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
const viewportSource = await readFile(new URL('../src/components/MapViewport.tsx', import.meta.url), 'utf8');
const layer = (id) => MAP_STYLE.layers.find((candidate) => candidate.id === id);

test('state colors are applied to the visible SDF marker and selected label emphasis remains', () => {
  const tileSource = MAP_STYLE.sources['icgc-topographic'];
  assert.equal(tileSource.tileSize, 256);
  assert.equal(tileSource.tiles[0], 'https://geoserveis.icgc.cat/servei/catalunya/mapa-base/wmts/topografic-mut/MON3857NW/{z}/{x}/{y}.png');

  const markers = layer('peak-visibility-markers');
  assert.deepEqual(markers.paint['circle-color'], [
    'match', ['get', 'visibility'], 'visible', '#16834a', 'partiallyVisible', '#d48b13', 'occluded', '#b53b36', 'outsideRadius', '#c1c7c3', 'outsideFov', '#aebbc2', '#788078',
  ]);

  const mountainMarkers = PEAK_CANDIDATE_MARKER_LAYER;
  assert.deepEqual(mountainMarkers.paint['icon-color'], markers.paint['circle-color']);
  assert.deepEqual(mountainMarkers.paint['icon-opacity'], [
    'case', ['boolean', ['feature-state', 'selected'], false], 1,
    ['match', ['get', 'visibility'], 'outsideRadius', 0.35, 'outsideFov', 0.25, 'indeterminate', 0.55, 0.85],
  ]);
  assert.match(viewportSource, /map\.on\('style\.load', handleStyleLoad\)/);
  assert.match(viewportSource, /ensurePeakMarkerLayer\(map, image\)/);

  const labels = layer('peak-candidate-labels');
  const textColor = labels.paint['text-color'];
  assert.equal(textColor[0], 'case');
  assert.deepEqual(textColor[1], ['boolean', ['feature-state', 'selected'], false]);
  assert.equal(textColor[2], '#9a3f26');
  assert.deepEqual(textColor[3], [
    'match', ['get', 'visibility'], 'visible', '#126b3d', 'partiallyVisible', '#9b6500', 'occluded', '#a4312d', 'outsideRadius', '#929994', 'outsideFov', '#74858d', '#555d57',
  ]);
  assert.deepEqual(labels.paint['text-halo-width'][1], ['boolean', ['feature-state', 'selected'], false]);
  assert.equal(Object.hasOwn(labels.paint, 'icon-opacity'), false);
  assert.equal(MAP_STYLE.layers.some((candidate) => candidate.id === 'peak-candidate-markers'), false);
});
