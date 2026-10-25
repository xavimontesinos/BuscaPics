import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

function moduleUrl(source, replacements = {}) {
  let javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const [specifier, replacement] of Object.entries(replacements)) {
    javascript = javascript.replaceAll(`from "${specifier}"`, `from ${JSON.stringify(replacement)}`);
  }
  return `data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`;
}

const stub = (source) => moduleUrl(source);
const targetUrl = stub('export function toCatalogSummitTarget(peak) { return { id: peak.id, position: { latitudeDegrees: peak.latitude, longitudeDegrees: peak.longitude }, absoluteElevation: { meters: peak.elevationMeters, verticalReference: null } }; }');
const geometryUrl = stub('export function distanceMeters(from, to) { return Math.hypot(from.latitudeDegrees - to.latitudeDegrees, from.longitudeDegrees - to.longitudeDegrees) * 100000; } export function initialAzimuthDegrees(from, to) { if (from.latitudeDegrees === to.latitudeDegrees && from.longitudeDegrees === to.longitudeDegrees) return null; return (Math.atan2(to.longitudeDegrees - from.longitudeDegrees, to.latitudeDegrees - from.latitudeDegrees) * 180 / Math.PI + 360) % 360; } export function generateIntermediateSamplePoints(from, to) { return [{ latitudeDegrees: (from.latitudeDegrees + to.latitudeDegrees) / 2, longitudeDegrees: (from.longitudeDegrees + to.longitudeDegrees) / 2 }]; }');
const fieldOfViewUrl = stub('export function isBearingWithinVisibilityField(target, center) { return Math.abs(((target - center + 540) % 360) - 180) <= 45; }');
const sightUrl = stub('export function calculateLineOfSight(observer, target) { if (!observer.terrainElevation.verticalReference) throw new Error("expected observer datum"); globalThis.__observerEyeHeight = observer.eyeHeightAboveGroundMeters; globalThis.__observerGroundElevation = observer.terrainElevation.meters; return { state: "visible", distanceMeters: 1, peakId: target.id }; }');
const icgcUrl = stub('export async function prepareIgcTerrain(positions) { return globalThis.__prepareIgcTerrain(positions); }');
const adapterUrl = stub('export class RasterTerrainElevationProvider {}');
const debugUrl = stub('export function visibilityDebug() {}');
const source = await readFile(new URL('../src/domain/visibility/peakVisibility.ts', import.meta.url), 'utf8');
const url = moduleUrl(source, {
  './peakVisibilityTarget': targetUrl,
  './lineOfSight': sightUrl,
  './geometry': geometryUrl,
  './fieldOfView': fieldOfViewUrl,
  './icgcObserverElevation': icgcUrl,
  './rasterTerrainElevationProvider': adapterUrl,
  './visibilityDebug': debugUrl,
});
const { calculatePeakVisibilities } = await import(url);

test('missing observer elevation leaves every candidate indeterminate without calculating a sight line', async () => {
  globalThis.__prepareIgcTerrain = () => { throw new Error('must not fetch terrain'); };
  const peaks = [{ id: 'synthetic', latitude: 42, longitude: 1, elevationMeters: 1200 }];
  const results = await calculatePeakVisibilities(
    { latitudeDegrees: 42, longitudeDegrees: 1.1 },
    { state: 'missing' },
    peaks,
    { directionBearingDegrees: 270 },
  );
  assert.deepEqual(results.get('synthetic'), { state: 'indeterminate', reason: 'missing-terrain-data' });
});

test('prepares the MDT separately for each peak so the union of routes cannot overflow its bounded cache', async () => {
  const preparedPositions = [];
  globalThis.__prepareIgcTerrain = async (positions) => {
    preparedPositions.push(positions);
    if (positions.length > 3) throw new RangeError('synthetic raster cache limit');
    return {};
  };
  const observer = { latitudeDegrees: 42, longitudeDegrees: 1 };
  const elevation = {
    state: 'available',
    sample: { position: observer, elevation: { meters: 100, verticalReference: { kind: 'orthometric', datum: 'synthetic' } } },
  };
  const peaks = [
    { id: 'peak-a', latitude: 42, longitude: 1.1, elevationMeters: 1200 },
    { id: 'peak-b', latitude: 42, longitude: 1.2, elevationMeters: 1300 },
  ];

  const results = await calculatePeakVisibilities(observer, elevation, peaks, { directionBearingDegrees: 90 });

  assert.equal(preparedPositions.length, 2);
  assert.ok(preparedPositions.every((positions) => positions.length === 3));
  assert.deepEqual(results.get('peak-a'), { state: 'visible', distanceMeters: 1, peakId: 'peak-a' });
  assert.deepEqual(results.get('peak-b'), { state: 'visible', distanceMeters: 1, peakId: 'peak-b' });
  assert.equal(globalThis.__observerEyeHeight, 1.8);
  assert.equal(globalThis.__observerGroundElevation, 100);
});

test('a raster preparation failure makes only that peak indeterminate', async () => {
  globalThis.__prepareIgcTerrain = async (positions) => {
    if (positions[1].longitudeDegrees === 1.1) throw new Error('synthetic unavailable tile');
    return {};
  };
  const observer = { latitudeDegrees: 42, longitudeDegrees: 1 };
  const elevation = {
    state: 'available',
    sample: { position: observer, elevation: { meters: 100, verticalReference: { kind: 'orthometric', datum: 'synthetic' } } },
  };
  const peaks = [
    { id: 'peak-a', latitude: 42, longitude: 1.1, elevationMeters: 1200 },
    { id: 'peak-b', latitude: 42, longitude: 1.2, elevationMeters: 1300 },
  ];

  const results = await calculatePeakVisibilities(observer, elevation, peaks, { directionBearingDegrees: 90 });

  assert.deepEqual(results.get('peak-a'), { state: 'indeterminate', reason: 'terrain-provider-error' });
  assert.deepEqual(results.get('peak-b'), { state: 'visible', distanceMeters: 1, peakId: 'peak-b' });
});

test('excludes peaks outside the radius before MDT reads and publishes them separately', async () => {
  const preparedLongitudes = [];
  globalThis.__prepareIgcTerrain = async (positions) => {
    preparedLongitudes.push(positions[1].longitudeDegrees);
    return {};
  };
  const observer = { latitudeDegrees: 42, longitudeDegrees: 1 };
  const elevation = {
    state: 'available',
    sample: { position: observer, elevation: { meters: 100, verticalReference: { kind: 'orthometric', datum: 'synthetic' } } },
  };
  const peaks = [
    { id: 'outside', latitude: 42, longitude: 1.05, elevationMeters: 1200 },
    { id: 'outside-fov', latitude: 41.99, longitude: 1, elevationMeters: 1250 },
    { id: 'farther', latitude: 42, longitude: 1.02, elevationMeters: 1300 },
    { id: 'nearest', latitude: 42, longitude: 1.01, elevationMeters: 1400 },
  ];
  const progress = [];

  const results = await calculatePeakVisibilities(observer, elevation, peaks, {
    maxDistanceMeters: 3_000,
    directionBearingDegrees: 90,
    onProgress: (snapshot) => progress.push(new Map(snapshot)),
  });

  assert.deepEqual(results.get('outside').state, 'outsideRadius');
  assert.ok(results.get('outside').distanceMeters > 3_000);
  assert.deepEqual(results.get('outside-fov').state, 'outsideFov');
  assert.deepEqual(preparedLongitudes, [1.01, 1.02]);
  assert.equal(progress[0].get('outside').state, 'outsideRadius');
  assert.equal(progress[0].get('outside-fov').state, 'outsideFov');
  assert.equal(progress[0].has('nearest'), false);
  assert.equal(progress.at(-1).get('nearest').state, 'visible');
});
