import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
import { buildCatalog, normalizePeakName, parseGpxWaypoints } from '../scripts/import-feec-gpx.mjs';
const source = await readFile(new URL('../src/domain/peaks.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const domain = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
const catalog = JSON.parse(await readFile(new URL('../public/data/100-cims-catalog.json', import.meta.url), 'utf8'));
const fullXml = await readFile(new URL('../public/data/100_cims_complet.gpx', import.meta.url), 'utf8');
const essentialXml = await readFile(new URL('../public/data/100_cims_essencials.gpx', import.meta.url), 'utf8');

test('imports every complete-list waypoint exactly once and records are valid', () => {
  const imported = parseGpxWaypoints(fullXml, 'complete.gpx');
  assert.equal(catalog.peaks.length, imported.length);
  assert.equal(new Set(imported.map((peak) => normalizePeakName(peak.name))).size, 525);
  assert.equal(catalog.peaks.length - new Set(imported.map((peak) => normalizePeakName(peak.name))).size, 3);
  assert.equal(new Set(catalog.peaks.map((peak) => peak.id)).size, catalog.peaks.length);
  assert.equal(buildCatalog(imported, []).duplicateCompleteNames.length, 3);
  for (const peak of catalog.peaks) {
    assert.ok(peak.id && peak.name && peak.sourceName);
    assert.ok(Number.isFinite(peak.latitude) && peak.latitude >= -90 && peak.latitude <= 90);
    assert.ok(Number.isFinite(peak.longitude) && peak.longitude >= -180 && peak.longitude <= 180);
    assert.ok(Number.isFinite(peak.elevationMeters) && peak.elevationMeters >= 0);
    assert.ok(['gpx-ele', 'name-suffix'].includes(peak.elevationSource));
    assert.equal(peak.name, peak.sourceName.replace(/\s*\(\s*[0-9][0-9.\s]*\s*m\s*\)\s*$/i, '').trim());
  }
});

test('detects duplicate normalized names without silently merging them', () => {
  const point = { sourceName: 'Same Peak (100 m)', name: 'Same Peak', latitude: 42, longitude: 1, elevationMeters: 100, elevationSource: 'gpx-ele' };
  const result = buildCatalog([{ ...point, sourceIndex: 1 }, { ...point, sourceName: 'same peak (100 m)', sourceIndex: 2 }], []);
  assert.equal(result.peaks.length, 2);
  assert.notEqual(result.peaks[0].id, result.peaks[1].id);
  assert.equal(result.duplicateCompleteNames.length, 1);
  const essential = { ...point, sourceName: 'Same Peak (100 m)', sourceIndex: 1, latitude: 42, longitude: 1 };
  const nearby = { ...point, sourceIndex: 1, latitude: 42, longitude: 1 };
  const distant = { ...point, sourceIndex: 2, sourceName: 'Same peak (200 m)', latitude: 42, longitude: 1.01 };
  const coordinateMatch = buildCatalog([nearby, distant], [essential]);
  assert.equal(coordinateMatch.ambiguous.length, 0);
  assert.equal(coordinateMatch.peaks.filter((peak) => peak.isEssential).length, 1);
});

test('normalizes recognized altitude suffixes and keeps legitimate name numbers', () => {
  for (const [sourceName, expectedName, expectedAltitude] of [
    ['Pic de l’Orri (2437 m)', 'Pic de l’Orri', 2437],
    ['Pic de l’Orri (2.437 m)', 'Pic de l’Orri', 2437],
    ['Pic de l’Orri ( 2.437   M )', 'Pic de l’Orri', 2437],
    ['Pic 3000', 'Pic 3000', null],
  ]) {
    const xml = `<gpx><wpt lat="42" lon="1"><ele>2437</ele><name>${sourceName}</name></wpt></gpx>`;
    const [peak] = parseGpxWaypoints(xml, 'test.gpx');
    assert.equal(peak.name, expectedName);
    assert.equal(peak.nameElevationMeters, expectedAltitude);
  }
});

test('uses a suffix when elevation is absent and reports conflicts with ele', () => {
  const fallback = parseGpxWaypoints('<gpx><wpt lat="42" lon="1"><name>Pic A (2.437 m)</name></wpt></gpx>', 'test.gpx')[0];
  assert.equal(fallback.elevationMeters, 2437);
  assert.equal(fallback.elevationSource, 'name-suffix');
  const conflict = parseGpxWaypoints('<gpx><wpt lat="42" lon="1"><ele>2400</ele><name>Pic A (2437 m)</name></wpt></gpx>', 'test.gpx')[0];
  assert.equal(conflict.elevationDiscrepancy, true);
  assert.equal(conflict.elevationMeters, 2400);
  assert.equal(conflict.nameElevationMeters, 2437);
});

test('all essential waypoints match one catalog peak; selection returns exact sets', () => {
  const complete = parseGpxWaypoints(fullXml, 'complete.gpx');
  const essentials = parseGpxWaypoints(essentialXml, 'essentials.gpx');
  const matched = buildCatalog(complete, essentials);
  assert.equal(matched.unmatched.length, 0);
  assert.equal(matched.ambiguous.length, 0);
  assert.equal(matched.essentialMatches.size, essentials.length);
  const all = domain.filterPeaks(catalog.peaks, { id: '100-cims' });
  const essentialSet = domain.filterPeaks(catalog.peaks, { id: '100-cims-essentials' });
  assert.deepEqual(all, catalog.peaks);
  assert.deepEqual(essentialSet, catalog.peaks.filter((peak) => peak.isEssential));
  assert.equal(essentialSet.length, essentials.length);
  assert.equal(domain.toPeakFeatureCollection(catalog.peaks, { id: '100-cims' }).features.length, catalog.peaks.length);
  assert.equal(domain.toPeakFeatureCollection(catalog.peaks, { id: '100-cims-essentials' }).features.length, essentials.length);
});

test('coordinate fallback leaves multiple nearby candidates ambiguous', () => {
  const essential = { sourceName: 'Other name', name: 'Other name', latitude: 42, longitude: 1, elevationMeters: 100, elevationSource: 'gpx-ele' };
  const candidate = (name, index, longitude) => ({ ...essential, sourceName: name, name, sourceIndex: index, longitude });
  const result = buildCatalog([candidate('Peak A', 1, 1), candidate('Peak B', 2, 1.0001)], [essential]);
  assert.equal(result.ambiguous.length, 1);
  assert.equal(result.unmatched.length, 0);
  assert.equal(result.peaks.filter((peak) => peak.isEssential).length, 0);
});

test('catalog clearly marks generated provenance and reuse limitations', () => {
  assert.match(catalog.metadata.status, /not verified/);
  assert.match(catalog.metadata.reuseConditions, /not approved for public redistribution/);
});
