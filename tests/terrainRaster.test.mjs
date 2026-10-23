import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

async function loadTypeScriptModule(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
}

const metadataModule = await loadTypeScriptModule('../src/domain/visibility/terrainDataset.ts');
const rasterModule = await loadTypeScriptModule('../src/domain/visibility/rasterGeoreferencing.ts');
const { validateTerrainDatasetMetadata } = metadataModule;
const { RasterGeoreferencing } = rasterModule;

// Entirely invented test grid: 3 columns by 2 rows, 10 CRS units per pixel,
// with rows increasing toward decreasing Y.
const geotransform = {
  originX: 100,
  pixelX: 10,
  rowX: 0,
  originY: 200,
  pixelY: 0,
  rowY: -10,
};
const raster = new RasterGeoreferencing(geotransform, { width: 3, height: 2 });

const completeMetadata = {
  id: 'synthetic-test-grid',
  producer: 'BuscaPics tests',
  source: 'Invented fixture; not geographic data',
  version: 'test-1',
  dataDate: '2026-01-01',
  license: { status: 'confirmed', identifier: 'Test-only', attribution: 'Synthetic fixture' },
  nominalResolutionMeters: 10,
  effectiveResolutionMeters: 10,
  extent: { minX: 100, minY: 180, maxX: 130, maxY: 200 },
  horizontalCrs: { code: 'TEST:LOCAL' },
  verticalReference: {
    status: 'confirmed',
    reference: { kind: 'orthometric', datum: 'Synthetic test vertical datum' },
    units: 'metres',
  },
  format: 'synthetic-array',
  width: 3,
  height: 2,
  geotransform,
  noData: { kind: 'value', value: -9999 },
  blockSize: { width: 2, height: 2 },
};

test('pixel centers and corners convert in both directions', () => {
  const firstCenter = raster.pixelToWorld({ column: 0, row: 0 });
  assert.deepEqual(firstCenter, { x: 105, y: 195 });
  assert.deepEqual(raster.worldToPixel(firstCenter), {
    state: 'inside', pixel: { column: 0, row: 0 },
  });

  const lastCenter = raster.pixelToWorld({ column: 2, row: 1 });
  assert.deepEqual(lastCenter, { x: 125, y: 185 });
  assert.deepEqual(raster.worldToPixel(lastCenter), {
    state: 'inside', pixel: { column: 2, row: 1 },
  });

  // The upper-left outer corner has center-index coordinates (-0.5, -0.5).
  assert.deepEqual(raster.worldToPixel({ x: 100, y: 200 }), {
    state: 'inside', pixel: { column: -0.5, row: -0.5 },
  });
});

test('positive pixel width and downward raster row orientation are respected', () => {
  assert.deepEqual(raster.pixelToWorld({ column: 1, row: 0 }), { x: 115, y: 195 });
  assert.deepEqual(raster.pixelToWorld({ column: 1, row: 1 }), { x: 115, y: 185 });
});

test('outer edges and corners are covered, while points beyond them are outside', () => {
  for (const corner of [
    { x: 100, y: 200 }, { x: 130, y: 200 },
    { x: 100, y: 180 }, { x: 130, y: 180 },
  ]) {
    assert.equal(raster.worldToPixel(corner).state, 'inside');
  }
  assert.deepEqual(raster.worldToPixel({ x: 130.0001, y: 190 }), { state: 'outside-coverage' });
  assert.deepEqual(raster.worldToPixel({ x: 115, y: 179.9999 }), { state: 'outside-coverage' });
});

test('rotated affine grids round-trip pixel coordinates', () => {
  const rotated = new RasterGeoreferencing({
    originX: 10, pixelX: 4, rowX: 2,
    originY: 20, pixelY: 1, rowY: -3,
  }, { width: 5, height: 4 });
  for (const pixel of [{ column: 0, row: 0 }, { column: 2.25, row: 1.5 }, { column: 4, row: 3 }]) {
    const roundTrip = rotated.worldToPixel(rotated.pixelToWorld(pixel));
    assert.equal(roundTrip.state, 'inside');
    assert.ok(Math.abs(roundTrip.pixel.column - pixel.column) < 1e-10);
    assert.ok(Math.abs(roundTrip.pixel.row - pixel.row) < 1e-10);
  }
});

test('invalid dimensions, transform and coordinates are rejected', () => {
  assert.throws(() => new RasterGeoreferencing(geotransform, { width: 0, height: 2 }), RangeError);
  assert.throws(() => new RasterGeoreferencing({ ...geotransform, rowY: 0 }, { width: 3, height: 2 }), RangeError);
  assert.throws(() => new RasterGeoreferencing({ ...geotransform, pixelX: Number.NaN }, { width: 3, height: 2 }), RangeError);
  assert.throws(() => raster.worldToPixel({ x: Number.NaN, y: 190 }), RangeError);
  assert.throws(() => raster.pixelToWorld({ column: 1, row: Number.POSITIVE_INFINITY }), RangeError);
});

test('metadata can describe unverified license and vertical reference but is not production-valid', () => {
  const pending = {
    ...completeMetadata,
    license: { status: 'pending', note: 'Awaiting rights confirmation' },
    verticalReference: { status: 'pending', note: 'Awaiting technical specification' },
  };
  const result = validateTerrainDatasetMetadata(pending);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('Dataset license is not confirmed'));
  assert.ok(result.errors.includes('Vertical reference is not confirmed'));
});

test('complete synthetic metadata passes and invalid metadata fails', () => {
  assert.deepEqual(validateTerrainDatasetMetadata(completeMetadata), { valid: true, errors: [] });
  const result = validateTerrainDatasetMetadata({
    ...completeMetadata,
    dataDate: '2026-02-30',
    nominalResolutionMeters: 0,
    horizontalCrs: { code: '' },
    width: -1,
    geotransform: { ...geotransform, rowY: 0 },
    noData: { kind: 'value', value: Number.NaN },
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.length >= 6);
});

test('horizontal CRS metadata and vertical reference remain separate', () => {
  assert.deepEqual(completeMetadata.horizontalCrs, { code: 'TEST:LOCAL' });
  assert.deepEqual(completeMetadata.verticalReference, {
    status: 'confirmed',
    reference: { kind: 'orthometric', datum: 'Synthetic test vertical datum' },
    units: 'metres',
  });
  assert.equal('verticalDatum' in completeMetadata.horizontalCrs, false);
});
