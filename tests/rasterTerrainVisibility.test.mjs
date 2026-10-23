import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

async function moduleUrl(path, imports = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  let javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const [specifier, replacement] of Object.entries(imports)) {
    javascript = javascript.replaceAll(`from "${specifier}"`, `from ${JSON.stringify(replacement)}`);
  }
  return `data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`;
}

const geometryUrl = await moduleUrl('../src/domain/visibility/geometry.ts');
const lineOfSightUrl = await moduleUrl('../src/domain/visibility/lineOfSight.ts', {
  './geometry': geometryUrl,
});
const adapterUrl = await moduleUrl('../src/domain/visibility/rasterTerrainElevationProvider.ts');
const [{ calculateLineOfSight }, { RasterTerrainElevationProvider }] = await Promise.all([
  import(lineOfSightUrl), import(adapterUrl),
]);

const reference = { kind: 'orthometric', datum: 'Synthetic test vertical datum' };
const observerPosition = { latitudeDegrees: 0, longitudeDegrees: 0 };
const targetPosition = { latitudeDegrees: 0, longitudeDegrees: 0.03 };
const observer = {
  position: observerPosition,
  terrainElevation: { meters: 100, verticalReference: reference },
  eyeHeightAboveGroundMeters: 2,
};
const target = { id: 'synthetic-target', position: targetPosition, heightAboveTerrainMeters: 20 };
const options = { sampleSpacingMeters: 1_000, verticalToleranceMeters: 0 };

function runWithRaster(getElevationAt, overrides = {}) {
  const calls = [];
  const raster = {
    getElevationAt(position, expectedReference) {
      calls.push({ position, expectedReference });
      return getElevationAt(position, expectedReference);
    },
  };
  const provider = new RasterTerrainElevationProvider(raster, reference);
  return {
    calls,
    result: calculateLineOfSight(observer, target, provider, options),
    ...overrides,
  };
}

function flatRaster(position) {
  return {
    state: 'available',
    sample: { position, elevation: { meters: 100, verticalReference: reference } },
  };
}

test('prepared raster adapter supports a clear line and samples the target plus interior route', () => {
  const { result, calls } = runWithRaster((position) => flatRaster(position));
  assert.equal(result.state, 'visible');
  assert.ok(calls.length > 2);
  assert.equal(calls[0].position, targetPosition);
  assert.ok(calls.some(({ position }) => position.longitudeDegrees > 0 && position.longitudeDegrees < 0.03));
  assert.ok(calls.every(({ expectedReference }) => expectedReference === reference));
  // Observer terrain is an input elevation; the engine checks the target ground and every interior sample.
});

test('an intermediate ridge in raster samples occludes the target', () => {
  const { result } = runWithRaster((position) => ({
    state: 'available',
    sample: {
      position,
      elevation: {
        meters: position.longitudeDegrees > 0.012 && position.longitudeDegrees < 0.018 ? 130 : 100,
        verticalReference: reference,
      },
    },
  }));
  assert.equal(result.state, 'occluded');
  assert.equal(result.blockingTerrain.elevation.meters, 130);
});

test('nodata and out-of-coverage raster states remain indeterminate', () => {
  const missing = runWithRaster(() => ({ state: 'missing' }));
  assert.deepEqual(missing.result, { state: 'indeterminate', reason: 'missing-terrain-data', distanceMeters: missing.result.distanceMeters });

  const outside = runWithRaster(() => ({ state: 'outside-coverage' }));
  assert.equal(outside.result.state, 'indeterminate');
  assert.equal(outside.result.reason, 'outside-terrain-coverage');

  const incompatible = runWithRaster(() => ({ state: 'incompatible-vertical-reference' }));
  assert.equal(incompatible.result.state, 'indeterminate');
  assert.equal(incompatible.result.reason, 'incompatible-vertical-reference');
});

test('observer eye height and target height above terrain affect the sight line', () => {
  const terrain = (position) => ({
    state: 'available',
    sample: { position, elevation: { meters: 100, verticalReference: reference } },
  });
  const lowTarget = new RasterTerrainElevationProvider({ getElevationAt: terrain }, reference);
  const blocked = calculateLineOfSight(
    { ...observer, eyeHeightAboveGroundMeters: 0 },
    { ...target, heightAboveTerrainMeters: 0 },
    { getElevationAt: (position) => ({ ...terrain(position), sample: {
      ...terrain(position).sample,
      elevation: { meters: 101, verticalReference: reference },
    } }) },
    options,
  );
  assert.equal(lowTarget.getElevationAt(targetPosition).state, 'available');
  assert.equal(blocked.state, 'occluded');

  const raised = calculateLineOfSight(observer, { ...target, heightAboveTerrainMeters: 20 }, lowTarget, options);
  assert.equal(raised.state, 'visible');
});

test('an absolute summit elevation without a confirmed vertical reference is indeterminate', () => {
  const targetWithUnknownReference = {
    id: target.id,
    position: target.position,
    absoluteElevation: { meters: 120, verticalReference: null },
  };
  const raster = { getElevationAt: (position) => flatRaster(position) };
  const result = calculateLineOfSight(observer, targetWithUnknownReference, raster, options);
  assert.equal(result.state, 'indeterminate');
  assert.equal(result.reason, 'missing-vertical-reference');
});

test('an absolute summit elevation with the confirmed matching reference can be evaluated', () => {
  const targetWithConfirmedReference = {
    id: target.id,
    position: target.position,
    absoluteElevation: { meters: 120, verticalReference: reference },
  };
  const raster = { getElevationAt: (position) => flatRaster(position) };
  const result = calculateLineOfSight(observer, targetWithConfirmedReference, raster, options);
  assert.equal(result.state, 'visible');
});

test('provider exceptions become indeterminate rather than visible', () => {
  const { result } = runWithRaster(() => { throw new Error('synthetic reader failure'); });
  assert.equal(result.state, 'indeterminate');
  assert.equal(result.reason, 'terrain-provider-error');
});

test('an incompatible configured reference is passed through the raster provider and rejected', () => {
  const otherReference = { kind: 'orthometric', datum: 'Different synthetic datum' };
  const raster = {
    getElevationAt(position, expectedReference) {
      if (expectedReference.datum !== reference.datum) return { state: 'incompatible-vertical-reference' };
      return flatRaster(position);
    },
  };
  const adapter = new RasterTerrainElevationProvider(raster, otherReference);
  const result = calculateLineOfSight(observer, target, adapter, options);
  assert.equal(result.state, 'indeterminate');
  assert.equal(result.reason, 'incompatible-vertical-reference');
});
