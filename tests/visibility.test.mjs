import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/domain/visibility/geometry.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const geometry = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
const { distanceMeters, generateIntermediateSamplePoints, initialAzimuthDegrees } = geometry;
const lineOfSightSource = await readFile(new URL('../src/domain/visibility/lineOfSight.ts', import.meta.url), 'utf8');
const lineOfSightJavascript = ts.transpileModule(lineOfSightSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText.replaceAll('"./geometry"', JSON.stringify(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`));
const lineOfSightModule = await import(`data:text/javascript;base64,${Buffer.from(lineOfSightJavascript).toString('base64')}`);
const { calculateLineOfSight } = lineOfSightModule;

const origin = { latitudeDegrees: 0, longitudeDegrees: 0 };
const verticalReference = { kind: 'orthometric', datum: 'Synthetic test datum' };
const observer = {
  position: origin,
  terrainElevation: { meters: 100, verticalReference },
  eyeHeightAboveGroundMeters: 2,
};
const target = {
  id: 'synthetic-target',
  position: { latitudeDegrees: 0, longitudeDegrees: 0.03 },
  heightAboveTerrainMeters: 10,
};
const lineOfSightOptions = { sampleSpacingMeters: 1_000, verticalToleranceMeters: 1 };

function availableTerrain(elevationAt, reference = verticalReference) {
  const totalDistance = distanceMeters(observer.position, target.position);
  return {
    getElevationAt(position) {
      const fraction = distanceMeters(observer.position, position) / totalDistance;
      return {
        state: 'available',
        sample: {
          position,
          elevation: { meters: elevationAt(fraction, position), verticalReference: reference },
        },
      };
    },
  };
}

function resultFor(elevationAt, overrides = {}) {
  return calculateLineOfSight(
    { ...observer, ...overrides.observer },
    { ...target, ...overrides.target },
    overrides.terrain ?? availableTerrain(elevationAt, overrides.reference),
    { ...lineOfSightOptions, ...overrides.options },
  );
}

test('distance uses spherical great-circle metres', () => {
  const oneDegreeAtEquator = distanceMeters(origin, { latitudeDegrees: 0, longitudeDegrees: 1 });
  assert.ok(Math.abs(oneDegreeAtEquator - 111_195.08) < 1);
  assert.equal(distanceMeters(origin, origin), 0);
});

test('initial azimuth is clockwise from true north', () => {
  assert.equal(initialAzimuthDegrees(origin, { latitudeDegrees: 1, longitudeDegrees: 0 }), 0);
  assert.equal(initialAzimuthDegrees(origin, { latitudeDegrees: 0, longitudeDegrees: 1 }), 90);
  assert.equal(initialAzimuthDegrees(origin, { latitudeDegrees: -1, longitudeDegrees: 0 }), 180);
  assert.equal(initialAzimuthDegrees(origin, { latitudeDegrees: 0, longitudeDegrees: -1 }), 270);
  assert.equal(initialAzimuthDegrees(origin, origin), null);
});

test('antimeridian crossing follows the short arc', () => {
  const from = { latitudeDegrees: 0, longitudeDegrees: 179.9 };
  const to = { latitudeDegrees: 0, longitudeDegrees: -179.9 };
  assert.ok(Math.abs(distanceMeters(from, to) - 22_239.02) < 2);
  assert.equal(initialAzimuthDegrees(from, to), 90);
  const samples = generateIntermediateSamplePoints(from, to, 10_000);
  assert.equal(samples.length, 2);
  assert.ok(samples.every((sample) => Math.abs(sample.longitudeDegrees) > 179));
});

test('sampling returns interior points with intervals no longer than requested', () => {
  const from = origin;
  const to = { latitudeDegrees: 0, longitudeDegrees: 0.00225 };
  const spacing = 100;
  const samples = generateIntermediateSamplePoints(from, to, spacing);
  assert.equal(samples.length, 2);
  const route = [from, ...samples, to];
  for (let index = 1; index < route.length; index += 1) {
    assert.ok(distanceMeters(route[index - 1], route[index]) <= spacing + 1e-7);
  }
  assert.deepEqual(generateIntermediateSamplePoints(from, to, distanceMeters(from, to)), []);
  assert.deepEqual(generateIntermediateSamplePoints(from, from, 10), []);
});

test('sampling remains on a great circle near the pole', () => {
  const from = { latitudeDegrees: 89.9, longitudeDegrees: 0 };
  const to = { latitudeDegrees: 89.9, longitudeDegrees: 180 };
  const samples = generateIntermediateSamplePoints(from, to, 4_000);
  assert.ok(samples.length > 0);
  assert.ok(samples.some((sample) => sample.latitudeDegrees > 89.99));
  assert.ok(samples.every((sample) => sample.latitudeDegrees >= -90 && sample.latitudeDegrees <= 90));
});

test('different longitudes at the same pole represent the same position', () => {
  const northPoleAtZeroLongitude = { latitudeDegrees: 90, longitudeDegrees: 0 };
  const northPoleAtOtherLongitude = { latitudeDegrees: 90, longitudeDegrees: 123 };
  assert.ok(distanceMeters(northPoleAtZeroLongitude, northPoleAtOtherLongitude) < 1e-6);
  assert.equal(initialAzimuthDegrees(northPoleAtZeroLongitude, northPoleAtOtherLongitude), null);
});

test('invalid coordinates and sample spacing are rejected', () => {
  assert.throws(() => distanceMeters({ latitudeDegrees: 91, longitudeDegrees: 0 }, origin), RangeError);
  assert.throws(() => initialAzimuthDegrees(origin, { latitudeDegrees: 0, longitudeDegrees: 181 }), RangeError);
  assert.throws(() => generateIntermediateSamplePoints(origin, origin, 0), RangeError);
  assert.throws(() => generateIntermediateSamplePoints(origin, origin, Number.NaN), RangeError);
});

test('azimuth and sample route are undefined for antipodal positions', () => {
  const antipode = { latitudeDegrees: 0, longitudeDegrees: 180 };
  assert.equal(initialAzimuthDegrees(origin, antipode), null);
  assert.throws(() => generateIntermediateSamplePoints(origin, antipode, 1_000), RangeError);
});

test('flat synthetic terrain leaves an elevated target visible', () => {
  const result = resultFor(() => 100);
  assert.equal(result.state, 'visible');
  assert.ok(result.distanceMeters > 0);
});

test('an intermediate ridge blocks the target and reports its approximate location', () => {
  const result = resultFor((fraction) => (fraction > 0.2 && fraction < 0.3 ? 120 : 100));
  assert.equal(result.state, 'occluded');
  assert.ok(result.distanceMeters > 0);
  assert.ok(result.blockingDistanceMeters > 0 && result.blockingDistanceMeters < result.distanceMeters);
  assert.equal(result.blockingTerrain.elevation.meters, 120);
});

test('terrain below the interpolated line remains visible', () => {
  const result = resultFor(() => 99);
  assert.equal(result.state, 'visible');
});

test('terrain exactly on the line within tolerance is not called an obstruction', () => {
  const result = resultFor((fraction) => 102 + fraction * 8);
  assert.equal(result.state, 'visible');
});

test('a missing terrain lookup returns indeterminate instead of assuming clear terrain', () => {
  const terrain = {
    getElevationAt(position) {
      if (position.longitudeDegrees === target.position.longitudeDegrees) {
        return { state: 'available', sample: { position, elevation: { meters: 100, verticalReference } } };
      }
      return { state: 'missing' };
    },
  };
  const result = resultFor(() => 100, { terrain });
  assert.equal(result.state, 'indeterminate');
  assert.equal(result.reason, 'missing-terrain-data');
});

test('a later missing sample remains indeterminate even when an earlier ridge blocks', () => {
  const terrain = {
    getElevationAt(position) {
      if (position.longitudeDegrees === target.position.longitudeDegrees) {
        return { state: 'available', sample: { position, elevation: { meters: 100, verticalReference } } };
      }
      const fraction = distanceMeters(observer.position, position) /
        distanceMeters(observer.position, target.position);
      if (fraction > 0.2 && fraction < 0.3) {
        return { state: 'available', sample: { position, elevation: { meters: 120, verticalReference } } };
      }
      if (fraction > 0.6) return { state: 'missing' };
      return { state: 'available', sample: { position, elevation: { meters: 100, verticalReference } } };
    },
  };
  const result = resultFor(() => 100, { terrain });
  assert.equal(result.state, 'indeterminate');
  assert.equal(result.reason, 'missing-terrain-data');
});

test('outside-coverage, unknown references, and incompatible references are indeterminate', () => {
  const outsideCoverage = resultFor(() => 100, {
    terrain: { getElevationAt: () => ({ state: 'outside-coverage' }) },
  });
  assert.deepEqual(outsideCoverage, {
    state: 'indeterminate',
    reason: 'outside-terrain-coverage',
    distanceMeters: distanceMeters(observer.position, target.position),
  });

  const unknownObserverReference = resultFor(() => 100, {
    observer: { terrainElevation: { meters: 100, verticalReference: null } },
  });
  assert.equal(unknownObserverReference.state, 'indeterminate');
  assert.equal(unknownObserverReference.reason, 'missing-vertical-reference');

  const unknownTerrainReference = resultFor(() => 100, {
    reference: null,
  });
  assert.equal(unknownTerrainReference.state, 'indeterminate');
  assert.equal(unknownTerrainReference.reason, 'missing-vertical-reference');

  const incompatibleReference = resultFor(() => 100, {
    reference: { kind: 'orthometric', datum: 'Different synthetic datum' },
  });
  assert.equal(incompatibleReference.state, 'indeterminate');
  assert.equal(incompatibleReference.reason, 'incompatible-vertical-reference');
});

test('invalid elevations, heights, and sample options are indeterminate', () => {
  const invalidObserverElevation = resultFor(() => 100, {
    observer: { terrainElevation: { meters: Number.NaN, verticalReference } },
  });
  assert.equal(invalidObserverElevation.state, 'indeterminate');
  assert.equal(invalidObserverElevation.reason, 'invalid-elevation');

  const invalidTerrainElevation = resultFor(() => Number.NaN);
  assert.equal(invalidTerrainElevation.state, 'indeterminate');
  assert.equal(invalidTerrainElevation.reason, 'invalid-elevation');

  const invalidObserverHeight = resultFor(() => 100, {
    observer: { eyeHeightAboveGroundMeters: -1 },
  });
  assert.equal(invalidObserverHeight.state, 'indeterminate');
  assert.equal(invalidObserverHeight.reason, 'invalid-observer-height');

  const invalidTargetHeight = resultFor(() => 100, {
    target: { heightAboveTerrainMeters: Number.NaN },
  });
  assert.equal(invalidTargetHeight.state, 'indeterminate');
  assert.equal(invalidTargetHeight.reason, 'invalid-target-height');

  const invalidOptions = resultFor(() => 100, { options: { verticalToleranceMeters: -1 } });
  assert.equal(invalidOptions.state, 'indeterminate');
  assert.equal(invalidOptions.reason, 'invalid-configuration');
});

test('coincident endpoints are indeterminate without querying terrain', () => {
  let lookupCount = 0;
  const result = calculateLineOfSight(
    observer,
    { ...target, position: origin },
    { getElevationAt: () => { lookupCount += 1; return { state: 'missing' }; } },
    lineOfSightOptions,
  );
  assert.equal(result.state, 'indeterminate');
  assert.equal(result.reason, 'coincident-endpoints');
  assert.equal(result.distanceMeters, 0);
  assert.equal(lookupCount, 0);
});

test('no intermediate terrain samples produce indeterminate, not visible', () => {
  const veryCloseTarget = { ...target, position: { latitudeDegrees: 0, longitudeDegrees: 1e-14 } };
  const result = calculateLineOfSight(
    observer,
    veryCloseTarget,
    availableTerrain(() => 100),
    { sampleSpacingMeters: 1 },
  );
  assert.equal(result.state, 'indeterminate');
  assert.equal(result.reason, 'insufficient-terrain-samples');
});
