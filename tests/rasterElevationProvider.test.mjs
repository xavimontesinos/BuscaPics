import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const proj4 = require('proj4');

async function compileTypeScript(path, imports = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  let javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const [specifier, replacement] of Object.entries(imports)) {
    javascript = javascript.replaceAll(`from "${specifier}"`, `from ${JSON.stringify(replacement)}`);
  }
  return `data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`;
}

const horizontalUrl = await compileTypeScript('../src/domain/visibility/horizontalCoordinates.ts');
const georeferencingUrl = await compileTypeScript('../src/domain/visibility/rasterGeoreferencing.ts');
const metadataUrl = await compileTypeScript('../src/domain/visibility/terrainDataset.ts');
const transformerSource = await readFile(
  new URL('../src/domain/visibility/Proj4HorizontalCoordinateTransformer.ts', import.meta.url), 'utf8',
);
const transformerJavascript = ts.transpileModule(transformerSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText
  .replace('from "proj4"', 'from "__proj4_test_injected__"')
  .replace('from "./horizontalCoordinates"', `from ${JSON.stringify(horizontalUrl)}`)
  .replace(
    'import proj4 from "__proj4_test_injected__";',
    'const proj4 = globalThis.__rasterProviderTestProj4;',
  );
globalThis.__rasterProviderTestProj4 = proj4;
const transformerUrl = `data:text/javascript;base64,${Buffer.from(transformerJavascript).toString('base64')}`;
const providerUrl = await compileTypeScript('../src/domain/visibility/rasterElevationProvider.ts', {
  './horizontalCoordinates': horizontalUrl,
  './rasterGeoreferencing': georeferencingUrl,
  './terrainDataset': metadataUrl,
});
const [providerModule, transformerModule, coordinateContract] = await Promise.all([
  import(providerUrl), import(transformerUrl), import(horizontalUrl),
]);
delete globalThis.__rasterProviderTestProj4;

const { InMemoryRasterBlockReader, PreparedRasterElevationProvider } = providerModule;
const { Proj4HorizontalCoordinateTransformer } = transformerModule;
const { UnsupportedHorizontalTransformError } = coordinateContract;

const geographicCrs = {
  kind: 'geographic', code: 'TEST:GEOGRAPHIC', axisOrder: 'longitude-latitude', angularUnit: 'degree',
};
const rasterCrs = { kind: 'projected', code: 'TEST:RASTER', axisOrder: 'x-y', linearUnit: 'metre' };
const affine = { originX: 0, pixelX: 10, rowX: 0, originY: 40, pixelY: 0, rowY: -10 };

function syntheticTransformer() {
  return {
    geographicToProjected: ({ longitudeDegrees, latitudeDegrees }) => ({
      x: longitudeDegrees, y: latitudeDegrees,
    }),
    projectedToGeographic: ({ x, y }) => ({ longitudeDegrees: x, latitudeDegrees: y }),
  };
}

function metadata(overrides = {}) {
  return {
    id: 'synthetic-raster-test',
    producer: 'BuscaPics tests',
    source: 'Invented raster fixture; not geographic data',
    version: 'test-1',
    dataDate: '2026-01-01',
    license: { status: 'confirmed', identifier: 'Test-only', attribution: 'Synthetic fixture' },
    nominalResolutionMeters: 10,
    effectiveResolutionMeters: 10,
    extent: { minX: 0, minY: 0, maxX: 40, maxY: 40 },
    horizontalCrs: { code: rasterCrs.code },
    verticalReference: {
      status: 'confirmed',
      reference: { kind: 'orthometric', datum: 'Synthetic vertical reference' },
      units: 'metres',
    },
    format: 'synthetic-array',
    width: 4,
    height: 4,
    geotransform: affine,
    noData: { kind: 'value', value: -9999 },
    blockSize: { width: 2, height: 2 },
    ...overrides,
  };
}

function valuesWithPlane() {
  return Float64Array.from({ length: 16 }, (_, index) => {
    const column = index % 4;
    const row = Math.floor(index / 4);
    return 100 + 10 * column + 2 * row;
  });
}

function createProvider({ values = valuesWithPlane(), dataMetadata = metadata(), maxCachedBlocks = 64 } = {}) {
  const reader = new InMemoryRasterBlockReader(
    dataMetadata.width, dataMetadata.height,
    dataMetadata.blockSize.width, dataMetadata.blockSize.height,
    values,
  );
  return new PreparedRasterElevationProvider(
    dataMetadata, reader, syntheticTransformer(), geographicCrs, rasterCrs, maxCachedBlocks,
  );
}

function positionAtPixel(column, row) {
  const cornerColumn = column + 0.5;
  const cornerRow = row + 0.5;
  return {
    longitudeDegrees: affine.originX + cornerColumn * affine.pixelX,
    latitudeDegrees: affine.originY + cornerRow * affine.rowY,
  };
}

test('a cell center returns its stored value after asynchronous block preparation', async () => {
  const provider = createProvider();
  const position = positionAtPixel(1, 2);
  assert.deepEqual(provider.getElevationAt(position), { state: 'missing' });

  await provider.prepareForPositions([position]);
  const lookup = provider.getElevationAt(position);
  assert.equal(lookup.state, 'available');
  assert.equal(lookup.sample.elevation.meters, 114);
  assert.deepEqual(lookup.sample.elevation.verticalReference, {
    kind: 'orthometric', datum: 'Synthetic vertical reference',
  });
  assert.deepEqual(provider.getCacheStats(), { cachedBlocks: 1, blockReadRequests: 1 });
  await provider.prepareForPositions([position]);
  assert.deepEqual(provider.getCacheStats(), { cachedBlocks: 1, blockReadRequests: 1 }, 'a cached MDT block is not read again');
});

test('bilinear interpolation returns the known value on a synthetic plane', async () => {
  const provider = createProvider();
  const position = positionAtPixel(0.25, 0.5);
  await provider.prepareForPositions([position]);
  const lookup = provider.getElevationAt(position);
  assert.equal(lookup.state, 'available');
  assert.equal(lookup.sample.elevation.meters, 103.5);
});

test('nodata in any of the four interpolation neighbours returns missing', async (t) => {
  for (const [column, row] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    await t.test(`nodata at column ${column}, row ${row}`, async () => {
      const values = valuesWithPlane();
      values[row * 4 + column] = -9999;
      const provider = createProvider({ values });
      const position = positionAtPixel(0.25, 0.5);
      await provider.prepareForPositions([position]);
      assert.deepEqual(provider.getElevationAt(position), { state: 'missing' });
    });
  }
});

test('outer raster edges clamp to the edge cells and points outside remain outside', async () => {
  const provider = createProvider();
  const topLeftEdge = { longitudeDegrees: 0, latitudeDegrees: 40 };
  const rightBottomEdge = { longitudeDegrees: 40, latitudeDegrees: 0 };
  const outside = { longitudeDegrees: -0.001, latitudeDegrees: 20 };
  await provider.prepareForPositions([topLeftEdge, rightBottomEdge, outside]);

  assert.equal(provider.getElevationAt(topLeftEdge).state, 'available');
  assert.equal(provider.getElevationAt(topLeftEdge).sample.elevation.meters, 100);
  assert.equal(provider.getElevationAt(rightBottomEdge).state, 'available');
  assert.equal(provider.getElevationAt(rightBottomEdge).sample.elevation.meters, 136);
  assert.deepEqual(provider.getElevationAt(outside), { state: 'outside-coverage' });
});

test('interpolation across adjacent blocks reads all tiles and remains continuous', async () => {
  const provider = createProvider({ maxCachedBlocks: 4 });
  const seamPosition = positionAtPixel(1.5, 1.5);
  await provider.prepareForPositions([seamPosition]);
  const lookup = provider.getElevationAt(seamPosition);
  assert.equal(lookup.state, 'available');
  assert.equal(lookup.sample.elevation.meters, 118);
});

test('a vertical reference mismatch is explicit and does not return an elevation', async () => {
  const provider = createProvider();
  const position = positionAtPixel(0, 0);
  await provider.prepareForPositions([position]);
  assert.deepEqual(provider.getElevationAt(position, {
    kind: 'orthometric', datum: 'Another synthetic vertical reference',
  }), { state: 'incompatible-vertical-reference' });
});

test('horizontal transformation is delegated to the registered Proj4 adapter', async () => {
  const geographic = {
    kind: 'geographic', code: 'EPSG:4326', axisOrder: 'longitude-latitude', angularUnit: 'degree',
  };
  const projected = {
    kind: 'projected', code: 'TEST:EQC', axisOrder: 'x-y', linearUnit: 'metre',
  };
  const proj4Transformer = new Proj4HorizontalCoordinateTransformer([
    { code: 'EPSG:4326', definition: '+proj=longlat +datum=WGS84 +no_defs +type=crs' },
    {
      code: 'TEST:EQC',
      definition: '+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs +type=crs',
    },
  ]);
  const transform = { originX: -5, pixelX: 10, rowX: 0, originY: -5, pixelY: 0, rowY: 10 };
  const dataMetadata = metadata({
    horizontalCrs: { code: projected.code },
    extent: { minX: -5, minY: -5, maxX: 15, maxY: 15 },
    width: 2,
    height: 2,
    geotransform: transform,
    blockSize: { width: 2, height: 2 },
  });
  const reader = new InMemoryRasterBlockReader(2, 2, 2, 2, [42, 42, 42, 42]);
  const provider = new PreparedRasterElevationProvider(
    dataMetadata, reader, proj4Transformer, geographic, projected,
  );
  const position = { longitudeDegrees: 0, latitudeDegrees: 0 };
  await provider.prepareForPositions([position]);
  assert.equal(provider.getElevationAt(position).sample.elevation.meters, 42);
});

test('unregistered horizontal CRS is rejected instead of producing an elevation', async () => {
  const provider = new PreparedRasterElevationProvider(
    metadata(), new InMemoryRasterBlockReader(4, 4, 2, 2, valuesWithPlane()),
    new Proj4HorizontalCoordinateTransformer([]),
    { ...geographicCrs, code: 'TEST:UNREGISTERED' }, rasterCrs,
  );
  await assert.rejects(
    provider.prepareForPositions([positionAtPixel(0, 0)]),
    UnsupportedHorizontalTransformError,
  );
});

test('partial edge blocks are cached and queried without shifted or duplicated cells', async () => {
  const edgeMetadata = metadata({
    width: 3,
    height: 3,
    extent: { minX: 0, minY: 10, maxX: 30, maxY: 40 },
    blockSize: { width: 2, height: 2 },
  });
  const sourceValues = Float64Array.from({ length: 9 }, (_, index) => index + 1);
  const reads = [];
  const reader = {
    async readBlock(blockColumn, blockRow) {
      reads.push([blockColumn, blockRow]);
      const width = Math.min(2, 3 - blockColumn * 2);
      const height = Math.min(2, 3 - blockRow * 2);
      const values = new Float64Array(width * height);
      for (let row = 0; row < height; row += 1) {
        for (let column = 0; column < width; column += 1) {
          values[row * width + column] = sourceValues[(blockRow * 2 + row) * 3 + blockColumn * 2 + column];
        }
      }
      return { blockColumn, blockRow, width, height, values };
    },
  };
  const edgeAffine = { originX: 0, pixelX: 10, rowX: 0, originY: 40, pixelY: 0, rowY: -10 };
  edgeMetadata.geotransform = edgeAffine;
  const edgeProvider = new PreparedRasterElevationProvider(
    edgeMetadata, reader, syntheticTransformer(), geographicCrs, rasterCrs, 4,
  );
  const bottomRightCenter = { longitudeDegrees: 25, latitudeDegrees: 15 };

  assert.equal(edgeProvider.getElevationAt(bottomRightCenter).state, 'missing');
  await edgeProvider.prepareForPositions([bottomRightCenter]);
  assert.deepEqual(reads, [[1, 1]]);
  assert.equal(edgeProvider.getElevationAt(bottomRightCenter).sample.elevation.meters, 9);
  await edgeProvider.prepareForPositions([bottomRightCenter]);
  assert.deepEqual(reads, [[1, 1]], 'prepared edge block should be served from cache');
  assert.deepEqual(edgeProvider.getElevationAt({ longitudeDegrees: 31, latitudeDegrees: 15 }), {
    state: 'outside-coverage',
  });
});

test('an absent edge block and nodata remain missing after preparation', async () => {
  const values = valuesWithPlane();
  values[15] = -9999;
  const missingBlockReader = {
    async readBlock(blockColumn, blockRow) {
      if (blockColumn === 1 && blockRow === 1) return null;
      return new InMemoryRasterBlockReader(4, 4, 2, 2, values).readBlock(blockColumn, blockRow);
    },
  };
  const provider = new PreparedRasterElevationProvider(
    metadata(), missingBlockReader, syntheticTransformer(), geographicCrs, rasterCrs,
  );
  const nodataEdge = positionAtPixel(3, 3);
  await provider.prepareForPositions([nodataEdge]);
  assert.deepEqual(provider.getElevationAt(nodataEdge), { state: 'missing' });

  const absent = new PreparedRasterElevationProvider(
    metadata(), { readBlock: async () => null }, syntheticTransformer(), geographicCrs, rasterCrs,
  );
  await absent.prepareForPositions([positionAtPixel(0, 0)]);
  assert.deepEqual(absent.getElevationAt(positionAtPixel(0, 0)), { state: 'missing' });
});

test('adjacent partial blocks cover each raster cell exactly once', async () => {
  const dimensions = { width: 3, height: 3 };
  const blockSize = { width: 2, height: 2 };
  const sourceValues = Float64Array.from({ length: 9 }, (_, index) => index + 1);
  const reads = [];
  const reader = {
    async readBlock(blockColumn, blockRow) {
      reads.push(`${blockColumn},${blockRow}`);
      const left = blockColumn * blockSize.width;
      const top = blockRow * blockSize.height;
      const width = Math.min(blockSize.width, dimensions.width - left);
      const height = Math.min(blockSize.height, dimensions.height - top);
      const values = [];
      for (let row = 0; row < height; row += 1) {
        for (let column = 0; column < width; column += 1) {
          values.push(sourceValues[(top + row) * dimensions.width + left + column]);
        }
      }
      return { blockColumn, blockRow, width, height, values };
    },
  };
  const dataset = metadata({
    width: dimensions.width,
    height: dimensions.height,
    extent: { minX: 0, minY: 10, maxX: 30, maxY: 40 },
    blockSize,
    geotransform: { originX: 0, pixelX: 10, rowX: 0, originY: 40, pixelY: 0, rowY: -10 },
  });
  const provider = new PreparedRasterElevationProvider(
    dataset, reader, syntheticTransformer(), geographicCrs, rasterCrs, 4,
  );
  const positions = [];
  for (let row = 0; row < dimensions.height; row += 1) {
    for (let column = 0; column < dimensions.width; column += 1) {
      positions.push({ longitudeDegrees: 5 + 10 * column, latitudeDegrees: 35 - 10 * row });
    }
  }
  await provider.prepareForPositions(positions);
  const elevations = positions.map((position) => provider.getElevationAt(position).sample.elevation.meters);
  assert.deepEqual(elevations, Array.from(sourceValues));
  assert.deepEqual(reads.sort(), ['0,0', '0,1', '1,0', '1,1']);
});
