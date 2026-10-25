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

const geometrySource = await readFile(new URL('../src/domain/visibility/geometry.ts', import.meta.url), 'utf8');
const geometryUrl = moduleUrl(geometrySource);
const fieldOfViewSource = await readFile(new URL('../src/domain/visibility/fieldOfView.ts', import.meta.url), 'utf8');
const fieldOfViewUrl = moduleUrl(fieldOfViewSource, { './geometry': geometryUrl });
const { isBearingWithinVisibilityField, isPositionWithinVisibilityField, signedBearingDifference } = await import(fieldOfViewUrl);

test('the 90 degree sector includes both exact ±45 degree boundaries', () => {
  assert.equal(isBearingWithinVisibilityField(45, 0), true);
  assert.equal(isBearingWithinVisibilityField(315, 0), true);
  assert.equal(isBearingWithinVisibilityField(45.001, 0), false);
  assert.equal(isBearingWithinVisibilityField(314.999, 0), false);
});

test('bearing differences normalize across north in both directions', () => {
  assert.equal(signedBearingDifference(1, 359), 2);
  assert.equal(signedBearingDifference(359, 1), -2);
  assert.equal(isBearingWithinVisibilityField(1, 359), true);
  assert.equal(isBearingWithinVisibilityField(359, 1), true);
  assert.equal(isBearingWithinVisibilityField(270, -90), true);
});

test('geographic initial azimuth uses north as zero and clockwise as positive', () => {
  const observer = { latitudeDegrees: 42, longitudeDegrees: 1 };
  assert.equal(isPositionWithinVisibilityField(observer, { latitudeDegrees: 42.01, longitudeDegrees: 1 }, 0), true);
  assert.equal(isPositionWithinVisibilityField(observer, { latitudeDegrees: 42, longitudeDegrees: 1.01 }, 0), false);
  assert.equal(isPositionWithinVisibilityField(observer, { latitudeDegrees: 42, longitudeDegrees: 1.01 }, 90), true);
});

test('the visibility sector follows map bearings through quarter turns', () => {
  for (const bearing of [90, 180, 270]) {
    assert.equal(isBearingWithinVisibilityField(bearing, bearing), true);
    assert.equal(isBearingWithinVisibilityField((bearing + 90) % 360, bearing), false);
  }
});
