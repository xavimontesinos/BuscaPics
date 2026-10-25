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
const geometryUrl = stub('export function distanceMeters(from, to) { return Math.hypot(from.latitudeDegrees - to.latitudeDegrees, from.longitudeDegrees - to.longitudeDegrees) * 100000; } export function initialAzimuthDegrees(from, to) { if (from.latitudeDegrees === to.latitudeDegrees && from.longitudeDegrees === to.longitudeDegrees) return null; return (Math.atan2(to.longitudeDegrees - from.longitudeDegrees, to.latitudeDegrees - from.latitudeDegrees) * 180 / Math.PI + 360) % 360; } export function destinationPosition(from, bearing, distance) { const radians = bearing * Math.PI / 180; return { latitudeDegrees: from.latitudeDegrees + Math.cos(radians) * distance / 100000, longitudeDegrees: from.longitudeDegrees + Math.sin(radians) * distance / 100000 }; } export function generateIntermediateSamplePoints(from, to, spacing) { globalThis.__sampleSpacings?.push(spacing); return [{ latitudeDegrees: (from.latitudeDegrees + to.latitudeDegrees) / 2, longitudeDegrees: (from.longitudeDegrees + to.longitudeDegrees) / 2 }]; }');
const fieldOfViewUrl = stub('export function isBearingWithinVisibilityField(target, center) { return Math.abs(((target - center + 540) % 360) - 180) <= 45; }');
const sightUrl = stub('export function calculateLineOfSight(observer, target) { if (!observer.terrainElevation.verticalReference) throw new Error("expected observer datum"); globalThis.__observerEyeHeight = observer.eyeHeightAboveGroundMeters; globalThis.__observerGroundElevation = observer.terrainElevation.meters; const configured = globalThis.__losScenario?.[target.id]; if (configured === "throw") throw new Error("synthetic LOS failure"); return configured ?? { state: "visible", distanceMeters: 1, peakId: target.id }; }');
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
const {
  calculatePeakVisibilities,
  calculatePeakGeometricVisibilities,
  createPeakVisibilityCacheKey,
  getUncachedEligiblePeaks,
  selectPeaksForVisibility,
} = await import(url);

function peakAtBearing(id, bearingDegrees) {
  const radians = bearingDegrees * Math.PI / 180;
  return {
    id,
    latitude: 42 + Math.cos(radians) * 0.01,
    longitude: 1 + Math.sin(radians) * 0.01,
    elevationMeters: 1200,
  };
}

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

test('prepares one MDT path at a time for each sampled area point and stays within the route cache bound', async () => {
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

  assert.equal(preparedPositions.length, 10);
  assert.ok(preparedPositions.every((positions) => positions.length === 3));
  const summitCenter = { latitudeDegrees: 42, longitudeDegrees: 1.1 };
  for (const positions of preparedPositions.slice(1, 5)) {
    const targetPosition = positions[1];
    const offsetMeters = Math.hypot(
      targetPosition.latitudeDegrees - summitCenter.latitudeDegrees,
      targetPosition.longitudeDegrees - summitCenter.longitudeDegrees,
    ) * 100_000;
    assert.ok(Math.abs(offsetMeters - 20) < 1e-6);
  }
  assert.deepEqual(results.get('peak-a'), { state: 'visible', distanceMeters: 1, peakId: 'peak-a' });
  assert.deepEqual(results.get('peak-b'), { state: 'visible', distanceMeters: 1, peakId: 'peak-b' });
  assert.equal(globalThis.__observerEyeHeight, 5);
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
  assert.equal(preparedLongitudes.length, 10);
  assert.ok(preparedLongitudes.slice(0, 5).every((longitude) => Math.abs(longitude - 1.01) < 0.001));
  assert.ok(preparedLongitudes.slice(5).every((longitude) => Math.abs(longitude - 1.02) < 0.001));
  assert.equal(progress[0].get('outside').state, 'outsideRadius');
  assert.equal(progress[0].get('outside-fov').state, 'outsideFov');
  assert.equal(progress[0].has('nearest'), false);
  assert.equal(progress.length, 3);
  assert.equal(progress[1].get('nearest').state, 'visible');
  assert.equal(progress[1].has('farther'), false);
  assert.equal(progress.at(-1).get('nearest').state, 'visible');
});

test('a visible summit point remains visible when all auxiliary points are occluded', async () => {
  globalThis.__prepareIgcTerrain = async () => ({});
  globalThis.__losScenario = {
    'visible-summit': { state: 'visible', distanceMeters: 1_000 },
    'visible-summit:summit-area-0': { state: 'occluded', distanceMeters: 1_000 },
    'visible-summit:summit-area-90': { state: 'occluded', distanceMeters: 1_000 },
    'visible-summit:summit-area-180': { state: 'occluded', distanceMeters: 1_000 },
    'visible-summit:summit-area-270': { state: 'occluded', distanceMeters: 1_000 },
  };
  const observer = { latitudeDegrees: 42, longitudeDegrees: 1 };
  const elevation = { state: 'available', sample: { position: observer, elevation: { meters: 100, verticalReference: { kind: 'orthometric', datum: 'synthetic' } } } };
  const peaks = [{ id: 'visible-summit', latitude: 42, longitude: 1.01, elevationMeters: 1200 }];

  const results = await calculatePeakVisibilities(observer, elevation, peaks, { directionBearingDegrees: 90 });

  assert.equal(results.get('visible-summit').state, 'visible');
});

test('prepares midpoint terrain samples when a summit-area route is shorter than 200 metres', async () => {
  globalThis.__sampleSpacings = [];
  globalThis.__prepareIgcTerrain = async () => ({});
  globalThis.__losScenario = {};
  const observer = { latitudeDegrees: 42, longitudeDegrees: 1 };
  const elevation = { state: 'available', sample: { position: observer, elevation: { meters: 100, verticalReference: { kind: 'orthometric', datum: 'synthetic' } } } };
  const peaks = [{ id: 'nearby-summit', latitude: 42, longitude: 1.001, elevationMeters: 1200 }];

  await calculatePeakVisibilities(observer, elevation, peaks, { directionBearingDegrees: 90 });

  assert.equal(globalThis.__sampleSpacings.length, 5);
  assert.ok(globalThis.__sampleSpacings.every((spacing) => spacing < 100));
});

test('an occluded summit with a visible auxiliary point is partially visible', async () => {
  globalThis.__prepareIgcTerrain = async () => ({});
  globalThis.__losScenario = {
    'partial-summit': { state: 'occluded', distanceMeters: 1_000 },
    'partial-summit:summit-area-0': { state: 'occluded', distanceMeters: 1_000 },
    'partial-summit:summit-area-90': { state: 'visible', distanceMeters: 1_000 },
    'partial-summit:summit-area-180': { state: 'occluded', distanceMeters: 1_000 },
    'partial-summit:summit-area-270': { state: 'occluded', distanceMeters: 1_000 },
  };
  const observer = { latitudeDegrees: 42, longitudeDegrees: 1 };
  const elevation = { state: 'available', sample: { position: observer, elevation: { meters: 100, verticalReference: { kind: 'orthometric', datum: 'synthetic' } } } };
  const peaks = [{ id: 'partial-summit', latitude: 42, longitude: 1.01, elevationMeters: 1200 }];

  const results = await calculatePeakVisibilities(observer, elevation, peaks, { directionBearingDegrees: 90 });

  assert.deepEqual(results.get('partial-summit'), {
    state: 'partiallyVisible',
    distanceMeters: 1_000,
    visibleAreaPoints: 1,
    analyzedAreaPoints: 4,
  });
});

test('a summit and all auxiliary points are occluded only with complete terrain results', async () => {
  globalThis.__prepareIgcTerrain = async () => ({});
  const scenario = { state: 'occluded', distanceMeters: 1_000 };
  globalThis.__losScenario = Object.fromEntries([
    'occluded-summit',
    ...[0, 90, 180, 270].map((bearing) => `occluded-summit:summit-area-${bearing}`),
  ].map((id) => [id, scenario]));
  const observer = { latitudeDegrees: 42, longitudeDegrees: 1 };
  const elevation = { state: 'available', sample: { position: observer, elevation: { meters: 100, verticalReference: { kind: 'orthometric', datum: 'synthetic' } } } };
  const peaks = [{ id: 'occluded-summit', latitude: 42, longitude: 1.01, elevationMeters: 1200 }];

  const results = await calculatePeakVisibilities(observer, elevation, peaks, { directionBearingDegrees: 90 });

  assert.equal(results.get('occluded-summit').state, 'occluded');
});

test('incomplete auxiliary point data prevents a whole-area occluded result', async () => {
  globalThis.__prepareIgcTerrain = async () => ({});
  globalThis.__losScenario = {
    'uncertain-summit': { state: 'occluded', distanceMeters: 1_000 },
    'uncertain-summit:summit-area-0': { state: 'occluded', distanceMeters: 1_000 },
    'uncertain-summit:summit-area-90': { state: 'occluded', distanceMeters: 1_000 },
    'uncertain-summit:summit-area-180': { state: 'indeterminate', reason: 'missing-terrain-data' },
    'uncertain-summit:summit-area-270': { state: 'occluded', distanceMeters: 1_000 },
  };
  const observer = { latitudeDegrees: 42, longitudeDegrees: 1 };
  const elevation = { state: 'available', sample: { position: observer, elevation: { meters: 100, verticalReference: { kind: 'orthometric', datum: 'synthetic' } } } };
  const peaks = [{ id: 'uncertain-summit', latitude: 42, longitude: 1.01, elevationMeters: 1200 }];

  const results = await calculatePeakVisibilities(observer, elevation, peaks, { directionBearingDegrees: 90 });

  assert.deepEqual(results.get('uncertain-summit'), {
    state: 'indeterminate',
    reason: 'missing-terrain-data',
    distanceMeters: 1_000,
  });
});

test('bearing changes reuse geometric results and calculate only newly entered peaks', async () => {
  let routePreparations = 0;
  globalThis.__prepareIgcTerrain = async () => { routePreparations += 1; return {}; };
  globalThis.__losScenario = {};
  const observer = { latitudeDegrees: 42, longitudeDegrees: 1 };
  const elevation = {
    state: 'available',
    sample: { position: observer, elevation: { meters: 100, verticalReference: { kind: 'orthometric', datum: 'synthetic' } } },
  };
  const peaks = [peakAtBearing('60-degrees', 60), peakAtBearing('90-degrees', 90), peakAtBearing('120-degrees', 120), peakAtBearing('150-degrees', 150)];
  const cache = new Map();
  const inFlight = new Set();

  const firstSector = selectPeaksForVisibility(observer, peaks, 50_000, 90);
  const firstResults = await calculatePeakGeometricVisibilities(observer, elevation, firstSector.eligible);
  for (const [id, result] of firstResults) cache.set(id, result);
  assert.equal(firstSector.eligible.length, 3);
  assert.equal(routePreparations, 15);

  const secondSector = selectPeaksForVisibility(observer, peaks, 50_000, 120);
  const reusedCount = secondSector.eligible.filter(({ peak }) => cache.has(peak.id)).length;
  const newPeaks = getUncachedEligiblePeaks(secondSector, cache, inFlight);
  const secondResults = await calculatePeakGeometricVisibilities(observer, elevation, newPeaks);
  for (const [id, result] of secondResults) cache.set(id, result);

  assert.equal(reusedCount, 2);
  assert.deepEqual(newPeaks.map(({ peak }) => peak.id), ['150-degrees']);
  assert.equal(routePreparations - 15, 5, 'only the new summit prepares its five terrain paths');
  assert.equal(secondSector.eligible.length * 5, 15, 'old behavior would repeat all 15 path preparations');
  assert.equal(cache.size, 4);
});

test('sector selection updates outside states without preparing terrain', () => {
  globalThis.__prepareIgcTerrain = () => { throw new Error('selection must not query MDT'); };
  const observer = { latitudeDegrees: 42, longitudeDegrees: 1 };
  const selection = selectPeaksForVisibility(observer, [
    peakAtBearing('inside', 90),
    peakAtBearing('outside-sector', 170),
    { ...peakAtBearing('outside-radius', 90), longitude: 2 },
  ], 10_000, 90);
  assert.deepEqual(selection.eligible.map(({ peak }) => peak.id), ['inside']);
  assert.equal(selection.immediateResults.get('outside-sector').state, 'outsideFov');
  assert.equal(selection.immediateResults.get('outside-radius').state, 'outsideRadius');
});

test('visibility cache identity invalidates on observer, observer elevation or MDT revision, not direction', () => {
  const observer = { latitudeDegrees: 42, longitudeDegrees: 1 };
  const elevation = { state: 'available', sample: { elevation: { meters: 100, verticalReference: { kind: 'orthometric', datum: 'EGM08D595' } } } };
  const key = createPeakVisibilityCacheKey(observer, elevation, 'icgc-mdt-2021-2023');
  assert.notEqual(key, createPeakVisibilityCacheKey({ ...observer, latitudeDegrees: 42.01 }, elevation, 'icgc-mdt-2021-2023'));
  assert.notEqual(key, createPeakVisibilityCacheKey(observer, { ...elevation, sample: { elevation: { meters: 101, verticalReference: elevation.sample.elevation.verticalReference } } }, 'icgc-mdt-2021-2023'));
  assert.notEqual(key, createPeakVisibilityCacheKey(observer, elevation, 'updated-mdt'));
  assert.equal(key, createPeakVisibilityCacheKey(observer, elevation, 'icgc-mdt-2021-2023'), 'bearing and radius are intentionally absent from the cache key');
});
