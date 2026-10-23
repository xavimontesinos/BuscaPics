import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const geotiff = await import('geotiff');
const proj4 = require('proj4');

async function compile(path, imports = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  let javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const [specifier, replacement] of Object.entries(imports)) {
    javascript = javascript.replaceAll(`from "${specifier}"`, `from ${JSON.stringify(replacement)}`);
  }
  return `data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`;
}

const horizontalUrl = await compile('../src/domain/visibility/horizontalCoordinates.ts');
const georeferencingUrl = await compile('../src/domain/visibility/rasterGeoreferencing.ts');
const metadataUrl = await compile('../src/domain/visibility/terrainDataset.ts');
const transformerSource = await readFile(
  new URL('../src/domain/visibility/Proj4HorizontalCoordinateTransformer.ts', import.meta.url), 'utf8',
);
const transformerJavascript = ts.transpileModule(transformerSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText
  .replace('from "proj4"', 'from "__proj4_test_injected__"')
  .replace('from "./horizontalCoordinates"', `from ${JSON.stringify(horizontalUrl)}`)
  .replace('import proj4 from "__proj4_test_injected__";', 'const proj4 = globalThis.__geoTiffTestProj4;');
globalThis.__geoTiffTestProj4 = proj4;
const transformerUrl = `data:text/javascript;base64,${Buffer.from(transformerJavascript).toString('base64')}`;

let readerJavascript = ts.transpileModule(
  await readFile(new URL('../src/domain/visibility/geoTiffRasterBlockReader.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } },
).outputText
  .replace(
    'import { fromArrayBuffer, fromBlob, fromUrl } from "geotiff";',
    'const { fromArrayBuffer, fromBlob, fromUrl } = globalThis.__geoTiffTestLibrary;',
  );
const readerImports = {
  './horizontalCoordinates': horizontalUrl,
  './rasterGeoreferencing': georeferencingUrl,
  './terrainDataset': metadataUrl,
};
for (const [specifier, replacement] of Object.entries(readerImports)) {
  readerJavascript = readerJavascript.replaceAll(`from "${specifier}"`, `from ${JSON.stringify(replacement)}`);
}
const readerUrl = `data:text/javascript;base64,${Buffer.from(readerJavascript).toString('base64')}`;

const providerUrl = await compile('../src/domain/visibility/rasterElevationProvider.ts', {
  './horizontalCoordinates': horizontalUrl,
  './rasterGeoreferencing': georeferencingUrl,
  './terrainDataset': metadataUrl,
});

globalThis.__geoTiffTestLibrary = geotiff;
const [readerModule, providerModule, transformerModule, coordinateContract] = await Promise.all([
  import(readerUrl), import(providerUrl), import(transformerUrl), import(horizontalUrl),
]);
delete globalThis.__geoTiffTestProj4;
delete globalThis.__geoTiffTestLibrary;

const { GeoTiffRasterBlockReader } = readerModule;
const { PreparedRasterElevationProvider } = providerModule;
const { Proj4HorizontalCoordinateTransformer } = transformerModule;
const { UnsupportedHorizontalTransformError, transformProjectedToGeographic } = coordinateContract;

const horizontalCrs = { code: 'EPSG:25831' };
const projectedCrs = { kind: 'projected', code: 'EPSG:25831', axisOrder: 'x-y', linearUnit: 'metre' };
const geographicCrs = {
  kind: 'geographic', code: 'TEST:IDENTITY', axisOrder: 'longitude-latitude', angularUnit: 'degree',
};
const wgs84Crs = {
  kind: 'geographic', code: 'EPSG:4326', axisOrder: 'longitude-latitude', angularUnit: 'degree',
};
const geotiffProjection = [
  { code: 'EPSG:4326', definition: '+proj=longlat +datum=WGS84 +no_defs +type=crs' },
  { code: 'EPSG:25831', definition: '+proj=utm +zone=31 +ellps=GRS80 +units=m +no_defs +type=crs' },
];
const geotiffRasterCrs = { kind: 'projected', code: 'EPSG:25831', axisOrder: 'x-y', linearUnit: 'metre' };
const tiledFixturePath = new URL('./fixtures/synthetic-tiled-elevation.tif', import.meta.url);
const tiledFixtureBytes = await readFile(tiledFixturePath);
const tiledFixtureBuffer = tiledFixtureBytes.buffer.slice(
  tiledFixtureBytes.byteOffset, tiledFixtureBytes.byteOffset + tiledFixtureBytes.byteLength,
);

function expectedTiledValue(column, row) {
  if (column === 33 && row === 25) return 65535;
  return 1000 + Math.floor(column / 16) * 100 + Math.floor(row / 16) * 1000 + row * 3 + column;
}

function rasterPointToGeographic(transformer, column, row) {
  return transformProjectedToGeographic(transformer, {
    x: 500000 + (column + 0.5) * 10,
    y: 4700000 - (row + 0.5) * 10,
  }, geotiffRasterCrs, wgs84Crs);
}

function product(overrides = {}) {
  return {
    id: 'synthetic-geotiff-fixture',
    producer: 'BuscaPics tests',
    source: 'Invented test raster; no real geographic data',
    version: 'fixture-1',
    dataDate: '2026-01-01',
    license: { status: 'confirmed', identifier: 'Test-only', attribution: 'Synthetic fixture' },
    nominalResolutionMeters: 10,
    effectiveResolutionMeters: 10,
    horizontalCrs,
    verticalReference: {
      status: 'confirmed',
      reference: { kind: 'orthometric', datum: 'Synthetic fixture vertical reference' },
      units: 'metres',
    },
    ...overrides,
  };
}

function geotiffMetadata({ width, height, rasterType = 1, includeCrs = true, includeTransform = true,
  includeNoData = true, noData = '-9999', compression = 1, orientation, bits = 16, sampleFormat = 1, modelType = 1,
  modelTransformation, verticalCrs } = {}) {
  const metadata = {
    width,
    height,
    BitsPerSample: [bits],
    SampleFormat: [sampleFormat],
    SamplesPerPixel: [1],
    PhotometricInterpretation: [1],
    Compression: [compression],
    GTModelTypeGeoKey: modelType,
  };
  if (rasterType !== undefined) metadata.GTRasterTypeGeoKey = rasterType;
  if (includeTransform) {
    if (modelTransformation) metadata.ModelTransformation = modelTransformation;
    else {
      metadata.ModelPixelScale = [10, 10, 0];
      metadata.ModelTiepoint = [0, 0, 0, 100, 200, 0];
    }
  }
  if (includeCrs) metadata.ProjectedCSTypeGeoKey = 25831;
  if (verticalCrs !== undefined) {
    // The writer maps recognized GeoKeys from the directory; the numeric key is inserted below.
    metadata.GeoKeyDirectory = [1, 1, 0, 4, 1024, 0, 1, 1, 1025, 0, 1, rasterType,
      3072, 0, 1, includeCrs ? 25831 : 32767, 4096, 0, 1, verticalCrs];
  }
  if (includeNoData) metadata.GDAL_NODATA = String(noData);
  if (orientation !== undefined) metadata.Orientation = orientation;
  return metadata;
}

/** geotiff.js creates a valid single-strip TIFF fixture. */
async function makeFixture(values, metadata, { width, height } = {}) {
  void width;
  void height;
  const buffer = geotiff.writeArrayBuffer(values, metadata);
  const image = await (await geotiff.fromArrayBuffer(buffer)).getImage();
  const dataOffset = image.getFileDirectory().getValue('StripOffsets')[0];
  const data = new DataView(buffer);
  for (let index = 0; index < values.length; index += 1) {
    const offset = dataOffset + index * values.BYTES_PER_ELEMENT;
    if (values instanceof Int16Array) data.setInt16(offset, values[index], false);
    else if (values instanceof Uint16Array) data.setUint16(offset, values[index], false);
    else if (values instanceof Int32Array) data.setInt32(offset, values[index], false);
    else if (values instanceof Float32Array) data.setFloat32(offset, values[index], false);
    else if (values instanceof Float64Array) data.setFloat64(offset, values[index], false);
    else if (!(values instanceof Uint8Array)) throw new Error(`Unsupported test array ${values.constructor.name}`);
  }
  return buffer;
}

async function openFixture(values, writerMetadata, openOverrides = {}) {
  const width = writerMetadata.width;
  const height = writerMetadata.height;
  const buffer = await makeFixture(values, writerMetadata, { width, height });
  return GeoTiffRasterBlockReader.open(buffer, {
    product: product(openOverrides.product), imageIndex: 0, sampleIndex: 0, ...openOverrides,
  });
}

function syntheticTransformer() {
  return {
    geographicToProjected: ({ longitudeDegrees, latitudeDegrees }) => ({
      x: 100 + longitudeDegrees, y: 200 + latitudeDegrees,
    }),
    projectedToGeographic: ({ x, y }) => ({ longitudeDegrees: x - 100, latitudeDegrees: y - 200 }),
  };
}

test('opens a synthetic GeoTIFF and reads its complete raster block', async () => {
  const values = new Uint16Array([101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112]);
  const opened = await openFixture(values, geotiffMetadata({ width: 4, height: 3 }));
  assert.equal(opened.metadata.width, 4);
  assert.equal(opened.metadata.height, 3);
  assert.equal(opened.metadata.horizontalCrs.code, 'EPSG:25831');
  assert.equal(opened.metadata.noData.value, -9999);
  assert.deepEqual(opened.metadata.geotransform, {
    originX: 100, pixelX: 10, rowX: 0, originY: 200, pixelY: 0, rowY: -10,
  });
  assert.equal(opened.reader.blockWidth, 4);
  assert.equal(opened.reader.blockHeight, 3);

  const full = await opened.reader.readBlock(0, 0);
  assert.deepEqual([full.blockColumn, full.blockRow, full.width, full.height], [0, 0, 4, 3]);
  assert.deepEqual(Array.from(full.values), [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112]);
  assert.equal(await opened.reader.readBlock(1, 0), null);
});

test('PixelIsPoint tiepoint is converted from the sample center to the affine corner origin', async () => {
  const opened = await openFixture(new Uint16Array([7, 8, 9, 10]),
    geotiffMetadata({ width: 2, height: 2, rasterType: 2 }));
  assert.deepEqual(opened.metadata.geotransform, {
    originX: 95, pixelX: 10, rowX: 0, originY: 205, pixelY: 0, rowY: -10,
  });
});

test('integrates with the existing synchronous raster provider and keeps nodata missing', async () => {
  const opened = await openFixture(new Uint16Array([20, 22, 65535, 26]),
    geotiffMetadata({ width: 2, height: 2, noData: 65535 }));
  const provider = new PreparedRasterElevationProvider(
    opened.metadata, opened.reader, syntheticTransformer(), geographicCrs, projectedCrs,
  );
  const validPosition = { longitudeDegrees: 5, latitudeDegrees: -5 };
  const nodataPosition = { longitudeDegrees: 5, latitudeDegrees: -15 };
  await provider.prepareForPositions([validPosition, nodataPosition]);
  assert.equal(provider.getElevationAt(validPosition).sample.elevation.meters, 20);
  assert.deepEqual(provider.getElevationAt(nodataPosition), { state: 'missing' });
});

test('requires an explicit projected CRS, affine georeferencing, nodata and pixel raster type', async (t) => {
  const cases = [
    ['missing CRS GeoKey', geotiffMetadata({ width: 2, height: 2, includeCrs: false }), {}, /projected horizontal CRS model/],
    ['geographic model type', geotiffMetadata({ width: 2, height: 2, modelType: 2 }), {}, /projected horizontal CRS model/],
    ['missing transform', geotiffMetadata({ width: 2, height: 2, includeTransform: false }), {}, /unambiguous/],
    ['missing nodata', geotiffMetadata({ width: 2, height: 2, includeNoData: false }), {}, /NODATA/],
    ['CRS mismatch', geotiffMetadata({ width: 2, height: 2 }), { product: product({ horizontalCrs: { code: 'EPSG:32631' } }) }, /does not match/],
    ['unconfirmed vertical reference', geotiffMetadata({ width: 2, height: 2 }), {
      product: product({ verticalReference: { status: 'pending', note: 'Synthetic pending datum' } }),
    }, /confirmed vertical reference/],
    ['unconfirmed license', geotiffMetadata({ width: 2, height: 2 }), {
      product: product({ license: { status: 'pending', note: 'Synthetic pending license' } }),
    }, /confirmed license/],
  ];
  for (const [name, fileMetadata, overrides, expected] of cases) {
    await t.test(name, async () => {
      await assert.rejects(
        openFixture(new Uint16Array([1, 2, 3, 4]), fileMetadata, overrides), expected,
      );
    });
  }
});

test('rejects unsupported sample encodings, compression, image/sample selection and vertical CRS conflicts', async (t) => {
  const cases = [
    ['lossy/unsupported compression', geotiffMetadata({ width: 2, height: 2, compression: 7 }), {}, /lossy/],
    ['unsupported 64-bit integer sample', geotiffMetadata({ width: 2, height: 2, bits: 64, sampleFormat: 1 }), {}, /sample encoding/],
    ['unsupported TIFF orientation', geotiffMetadata({ width: 2, height: 2, orientation: 2 }), {}, /orientation/],
    ['unmapped vertical GeoKey', geotiffMetadata({ width: 2, height: 2, verticalCrs: 5703 }), {}, /explicitly configured/],
    ['vertical GeoKey mismatch', geotiffMetadata({ width: 2, height: 2, verticalCrs: 5703 }), {
      product: product({ verticalCrsCode: 'EPSG:5773' }),
    }, /does not match/],
  ];
  for (const [name, fileMetadata, overrides, expected] of cases) {
    await t.test(name, async () => {
      await assert.rejects(
        openFixture(new Uint16Array([1, 2, 3, 4]), fileMetadata, overrides), expected,
      );
    });
  }

  const fixture = await makeFixture(new Uint16Array([1, 2, 3, 4]),
    geotiffMetadata({ width: 2, height: 2 }), { width: 2, height: 2 });
  await assert.rejects(GeoTiffRasterBlockReader.open(fixture, {
    product: product(), imageIndex: 2, sampleIndex: 0,
  }), /image index/);
  await assert.rejects(GeoTiffRasterBlockReader.open(fixture, {
    product: product(), imageIndex: 0, sampleIndex: 2,
  }), /sample index/);
});

test('passes the requested block window to the GeoTIFF decoder', async () => {
  const buffer = await makeFixture(Uint16Array.from({ length: 8 * 8 }, (_, index) => index),
    geotiffMetadata({ width: 8, height: 8 }), { width: 8, height: 8 });
  const original = geotiff.GeoTIFFImage.prototype.readRasters;
  const windows = [];
  geotiff.GeoTIFFImage.prototype.readRasters = function (options) {
    windows.push(options.window);
    return original.call(this, options);
  };
  try {
    const opened = await GeoTiffRasterBlockReader.open(buffer, {
      product: product(), imageIndex: 0, sampleIndex: 0,
    });
    const block = await opened.reader.readBlock(0, 0);
    assert.equal(block.width, 8);
    assert.equal(block.height, 8);
    assert.deepEqual(windows, [[0, 0, 8, 8]]);
  } finally {
    geotiff.GeoTIFFImage.prototype.readRasters = original;
  }
});


test('reads valid tiled fixture windows, partial edge tiles, CRS metadata and nodata', async () => {
  const opened = await GeoTiffRasterBlockReader.open(tiledFixtureBuffer, {
    product: product(), imageIndex: 0, sampleIndex: 0,
  });
  assert.equal(opened.metadata.width, 67);
  assert.equal(opened.metadata.height, 51);
  assert.equal(opened.reader.blockWidth, 16);
  assert.equal(opened.reader.blockHeight, 16);
  assert.equal(opened.metadata.horizontalCrs.code, 'EPSG:25831');
  assert.deepEqual(opened.metadata.geotransform, {
    originX: 500000, pixelX: 10, rowX: 0, originY: 4700000, pixelY: 0, rowY: -10,
  });
  assert.deepEqual(opened.metadata.noData, { kind: 'value', value: 65535 });

  const interior = await opened.reader.readBlock(1, 1);
  assert.deepEqual([interior.width, interior.height], [16, 16]);
  assert.equal(interior.values[3 * 16 + 4], expectedTiledValue(20, 19));

  const left = await opened.reader.readBlock(0, 1);
  const right = await opened.reader.readBlock(1, 1);
  assert.equal(left.values[5 * 16 + 15], expectedTiledValue(15, 21));
  assert.equal(right.values[5 * 16], expectedTiledValue(16, 21));
  assert.equal(right.values[5 * 16] - left.values[5 * 16 + 15], 101);

  const rightEdge = await opened.reader.readBlock(4, 0);
  assert.deepEqual([rightEdge.width, rightEdge.height], [3, 16]);
  assert.equal(rightEdge.values[15 * 3 + 2], expectedTiledValue(66, 15));
  const bottomEdge = await opened.reader.readBlock(0, 3);
  assert.deepEqual([bottomEdge.width, bottomEdge.height], [16, 3]);
  assert.equal(bottomEdge.values[2 * 16 + 7], expectedTiledValue(7, 50));
  const bottomRight = await opened.reader.readBlock(4, 3);
  assert.deepEqual([bottomRight.width, bottomRight.height], [3, 3]);
  assert.equal(bottomRight.values[2 * 3 + 2], expectedTiledValue(66, 50));
  const nodataTile = await opened.reader.readBlock(2, 1);
  assert.equal(nodataTile.values[(25 - 16) * 16 + (33 - 32)], 65535);
  assert.equal(await opened.reader.readBlock(5, 0), null);
});

test('HTTP Range fetches a small pixel query and accounts for incidental tile bytes in metadata ranges', async (t) => {
  const file = Buffer.from(tiledFixtureBytes);
  const localTiff = await geotiff.fromArrayBuffer(tiledFixtureBuffer);
  const localImage = await localTiff.getImage();
  const tileOffsets = await localImage.getFileDirectory().loadValue('TileOffsets');
  const tileByteCounts = await localImage.getFileDirectory().loadValue('TileByteCounts');
  const tileColumns = Math.ceil(localImage.getWidth() / localImage.getTileWidth());
  const expectedTileIds = [2 * tileColumns + 2];
  const expectedRanges = expectedTileIds.map((tileId) => ({
    start: Number(tileOffsets[tileId]),
    end: Number(tileOffsets[tileId]) + Number(tileByteCounts[tileId]) - 1,
    bytes: Number(tileByteCounts[tileId]),
  }));
  const expectedRangeKeys = new Set(expectedRanges.map(({ start, end }) => `${start}-${end}`));
  const allTileRanges = Array.from({ length: tileOffsets.length }, (_, tileId) => ({
    start: Number(tileOffsets[tileId]),
    end: Number(tileOffsets[tileId]) + Number(tileByteCounts[tileId]) - 1,
  }));
  const requests = [];
  let bytesTransferred = 0;
  const server = createServer((request, response) => {
    const range = request.headers.range;
    if (typeof range !== 'string') {
      requests.push({ range: null, status: 200, bytes: file.byteLength, kind: 'full-file' });
      bytesTransferred += file.byteLength;
      response.writeHead(200, { 'Content-Length': file.byteLength });
      response.end(file);
      return;
    }
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match) {
      response.writeHead(416).end();
      return;
    }
    const start = Number(match[1]);
    const end = Math.min(match[2] ? Number(match[2]) : file.byteLength - 1, file.byteLength - 1);
    if (start > end) {
      response.writeHead(416).end();
      return;
    }
    const bytes = end - start + 1;
    const contentRange = `bytes ${start}-${end}/${file.byteLength}`;
    const key = `${start}-${end}`;
    const tileDataBytes = allTileRanges.reduce((sum, tile) =>
      sum + Math.max(0, Math.min(end, tile.end) - Math.max(start, tile.start) + 1), 0);
    const kind = expectedRangeKeys.has(key) ? 'requested-tile' :
      tileDataBytes > 0 ? 'metadata-with-unrequested-tile-data' : 'metadata';
    requests.push({ range, status: 206, contentRange, bytes, tileDataBytes, kind });
    bytesTransferred += bytes;
    response.writeHead(206, {
      'Accept-Ranges': 'bytes',
      'Content-Range': contentRange,
      'Content-Length': bytes,
    });
    response.end(file.subarray(start, end + 1));
  });
  t.after(async () => {
    if (!server.listening) return;
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  const opened = await GeoTiffRasterBlockReader.open(
    `http://127.0.0.1:${address.port}/synthetic-tiled-elevation.tif`,
    { product: product(), imageIndex: 0, sampleIndex: 0 },
  );
  const transformer = new Proj4HorizontalCoordinateTransformer(geotiffProjection);
  const provider = new PreparedRasterElevationProvider(
    opened.metadata, opened.reader, transformer, wgs84Crs, geotiffRasterCrs,
  );
  const smallWindowPosition = rasterPointToGeographic(transformer, 40, 32);
  await provider.prepareForPositions([smallWindowPosition]);
  assert.ok(Math.abs(provider.getElevationAt(smallWindowPosition).sample.elevation.meters -
    expectedTiledValue(40, 32)) < 1e-5);

  assert.ok(requests.length > 0);
  assert.ok(requests.every(({ status }) => status === 206));
  assert.ok(requests.every(({ range, contentRange }) => range !== null && contentRange.startsWith('bytes ')));
  const tileRequests = requests.filter(({ kind }) => kind === 'requested-tile');
  const metadataRequests = requests.filter(({ kind }) => kind !== 'requested-tile');
  assert.deepEqual(tileRequests.map(({ range }) => range.slice('bytes='.length)),
    expectedRanges.map(({ start, end }) => `${start}-${end}`));
  assert.equal(tileRequests.reduce((sum, { bytes }) => sum + bytes, 0), expectedRanges.reduce((sum, { bytes }) => sum + bytes, 0));
  assert.ok(metadataRequests.length > 0);
  assert.equal(requests.filter(({ kind }) => kind === 'full-file').length, 0);
  assert.equal(tileRequests.length, 1, 'the point query should fetch exactly its containing tile');
  assert.ok(tileRequests.length < tileOffsets.length);
  assert.ok(bytesTransferred < file.byteLength);
  const incidentalTileBytes = requests.reduce((sum, { tileDataBytes = 0 }) => sum + tileDataBytes, 0) -
    tileRequests.reduce((sum, { bytes }) => sum + bytes, 0);
  assert.ok(incidentalTileBytes > 0, 'the initial TIFF header range also overlaps unrelated early tiles');
  const metadataBytes = bytesTransferred - requests.reduce((sum, { tileDataBytes = 0 }) => sum + tileDataBytes, 0);
  const fetchedTileBytes = requests.reduce((sum, { tileDataBytes = 0 }) => sum + tileDataBytes, 0);
  t.diagnostic(`HTTP ranges=${JSON.stringify(requests)}; metadataBytes=${metadataBytes}; tileDataBytes=${fetchedTileBytes}; incidentalUnrequestedTileBytes=${incidentalTileBytes}; total=${bytesTransferred}/${file.byteLength}`);
});

const icgcRealClipPath = process.env.BUSCAPICS_ICGC_MDT_CLIP;
if (icgcRealClipPath) {
  test('opens the external ICGC LiDAR MDT clip and queries center, edge and outside coverage', async (t) => {
    const clipBytes = await readFile(icgcRealClipPath);
    const clipBuffer = clipBytes.buffer.slice(
      clipBytes.byteOffset, clipBytes.byteOffset + clipBytes.byteLength,
    );
    const opened = await GeoTiffRasterBlockReader.open(clipBuffer, {
      product: {
        id: 'model-elevacions-terreny-lidar-catalunya-5m-2021-2023',
        producer: 'Institut Cartogràfic i Geològic de Catalunya',
        source: 'Official ICGC COG, clipped locally from the Bagà area',
        version: '2021-2023',
        dataDate: '2023-11-20',
        license: {
          status: 'confirmed',
          identifier: 'CC BY 4.0',
          attribution: 'Institut Cartogràfic i Geològic de Catalunya (ICGC)',
        },
        nominalResolutionMeters: 5,
        effectiveResolutionMeters: 5,
        horizontalCrs: { code: 'EPSG:25831' },
        verticalReference: {
          status: 'confirmed',
          reference: { kind: 'orthometric', datum: 'EGM08D595' },
          units: 'metres',
        },
      },
      imageIndex: 0,
      sampleIndex: 0,
    });

    assert.deepEqual([opened.metadata.width, opened.metadata.height], [64, 64]);
    assert.equal(opened.metadata.horizontalCrs.code, 'EPSG:25831');
    assert.equal(opened.metadata.nominalResolutionMeters, 5);
    assert.deepEqual(opened.metadata.noData, { kind: 'value', value: -9999 });
    assert.deepEqual(opened.metadata.geotransform, {
      originX: 405655, pixelX: 5, rowX: 0, originY: 4678720, pixelY: 0, rowY: -5,
    });

    const block = await opened.reader.readBlock(0, 0);
    assert.deepEqual([block.width, block.height], [64, 64]);
    assert.ok(Math.abs(block.values[32 * 64 + 32] - 799.739990234375) < 0.001);

    const transformer = new Proj4HorizontalCoordinateTransformer(geotiffProjection);
    const provider = new PreparedRasterElevationProvider(
      opened.metadata, opened.reader, transformer, wgs84Crs, geotiffRasterCrs,
    );
    const positionAt = (column, row) => transformProjectedToGeographic(transformer, {
      x: 405655 + (column + 0.5) * 5,
      y: 4678720 - (row + 0.5) * 5,
    }, geotiffRasterCrs, wgs84Crs);
    const center = positionAt(32, 32);
    const nearUpperLeftEdge = positionAt(1, 1);
    const nearLowerRightEdge = positionAt(62, 62);
    const upperLeftBoundary = transformProjectedToGeographic(transformer, {
      x: 405655, y: 4678720,
    }, geotiffRasterCrs, wgs84Crs);
    const lowerRightBoundary = transformProjectedToGeographic(transformer, {
      x: 405975, y: 4678400,
    }, geotiffRasterCrs, wgs84Crs);
    const pixelBoundary = transformProjectedToGeographic(transformer, {
      x: 405815, y: 4678557.5,
    }, geotiffRasterCrs, wgs84Crs);
    const outside = transformProjectedToGeographic(transformer, {
      x: 405654, y: 4678560,
    }, geotiffRasterCrs, wgs84Crs);
    await provider.prepareForPositions([
      center, nearUpperLeftEdge, nearLowerRightEdge, upperLeftBoundary,
      lowerRightBoundary, pixelBoundary, outside,
    ]);

    const controls = [
      ['pixel center (32,32)', center, 799.739990234375],
      ['near upper-left edge (1,1)', nearUpperLeftEdge, 817.1829833984375],
      ['near lower-right edge (62,62)', nearLowerRightEdge, 775.5419921875],
      ['upper-left raster boundary', upperLeftBoundary, 819.4299926757812],
      ['lower-right raster boundary', lowerRightBoundary, 774.9509887695312],
      ['vertical pixel boundary', pixelBoundary, 799.4094848632812],
    ];
    const comparisons = controls.map(([name, position, expected]) => {
      const lookup = provider.getElevationAt(position);
      assert.equal(lookup.state, 'available', `${name} should be covered`);
      const observed = lookup.sample.elevation.meters;
      const difference = observed - expected;
      assert.ok(Math.abs(difference) <= 0.001, `${name} difference ${difference} m exceeds 1 mm`);
      return { name, expected, observed, difference };
    });
    assert.deepEqual(provider.getElevationAt(outside), { state: 'outside-coverage' });
    t.diagnostic(`Independent Pillow/libtiff pixel comparisons=${JSON.stringify(comparisons)}`);
  });
}

const icgcNoDataClipPath = process.env.BUSCAPICS_ICGC_NODATA_CLIP;
if (icgcNoDataClipPath) {
  test('recognizes an actual ICGC -9999 cell and refuses bilinear interpolation through it', async () => {
    const clipBytes = await readFile(icgcNoDataClipPath);
    const clipBuffer = clipBytes.buffer.slice(
      clipBytes.byteOffset, clipBytes.byteOffset + clipBytes.byteLength,
    );
    const opened = await GeoTiffRasterBlockReader.open(clipBuffer, {
      product: {
        id: 'model-elevacions-terreny-lidar-catalunya-5m-2021-2023',
        producer: 'Institut Cartogràfic i Geològic de Catalunya',
        source: 'Official ICGC COG, clipped locally from the Baells area',
        version: '2021-2023',
        dataDate: '2023-11-20',
        license: {
          status: 'confirmed',
          identifier: 'CC BY 4.0',
          attribution: 'Institut Cartogràfic i Geològic de Catalunya (ICGC)',
        },
        nominalResolutionMeters: 5,
        effectiveResolutionMeters: 5,
        horizontalCrs: { code: 'EPSG:25831' },
        verticalReference: {
          status: 'confirmed',
          reference: { kind: 'orthometric', datum: 'EGM08D595' },
          units: 'metres',
        },
      },
      imageIndex: 0,
      sampleIndex: 0,
    });
    assert.deepEqual([opened.metadata.width, opened.metadata.height], [64, 64]);
    assert.equal(opened.metadata.horizontalCrs.code, 'EPSG:25831');
    assert.deepEqual(opened.metadata.noData, { kind: 'value', value: -9999 });
    assert.deepEqual(opened.metadata.geotransform, {
      originX: 405965, pixelX: 5, rowX: 0, originY: 4668345, pixelY: 0, rowY: -5,
    });
    const block = await opened.reader.readBlock(0, 0);
    assert.deepEqual([block.width, block.height], [64, 64]);
    assert.equal(block.values[32 * 64 + 32], -9999);
    assert.equal(block.values[31 * 64 + 31], 604.0189819335938);

    const transformer = new Proj4HorizontalCoordinateTransformer(geotiffProjection);
    const provider = new PreparedRasterElevationProvider(
      opened.metadata, opened.reader, transformer, wgs84Crs, geotiffRasterCrs,
    );
    const positionAt = (column, row) => transformProjectedToGeographic(transformer, {
      x: 405965 + (column + 0.5) * 5,
      y: 4668345 - (row + 0.5) * 5,
    }, geotiffRasterCrs, wgs84Crs);
    const validCell = positionAt(31, 31);
    const noDataCell = positionAt(32, 32);
    const fourCellInterpolation = positionAt(31.5, 31.5);
    await provider.prepareForPositions([validCell, noDataCell, fourCellInterpolation]);

    assert.equal(provider.getElevationAt(validCell).state, 'available');
    assert.ok(Math.abs(provider.getElevationAt(validCell).sample.elevation.meters -
      604.0189819335938) < 0.001);
    assert.deepEqual(provider.getElevationAt(noDataCell), { state: 'missing' });
    assert.deepEqual(provider.getElevationAt(fourCellInterpolation), { state: 'missing' });
  });
}

const icgcRemoteUrl = process.env.BUSCAPICS_ICGC_MDT_URL;
if (icgcRemoteUrl) {
  test('reads the Bagà block from the official ICGC COG using HTTP Range', async (t) => {
    const requests = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const bytes = (await response.clone().arrayBuffer()).byteLength;
      requests.push({
        range: args[1]?.headers?.Range ?? args[1]?.headers?.range ?? null,
        status: response.status,
        contentRange: response.headers.get('content-range'),
        bytes,
      });
      return response;
    };

    try {
      const opened = await GeoTiffRasterBlockReader.open(icgcRemoteUrl, {
        product: {
          id: 'model-elevacions-terreny-lidar-catalunya-5m-2021-2023',
          producer: 'Institut Cartogràfic i Geològic de Catalunya',
          source: icgcRemoteUrl,
          version: '2021-2023',
          dataDate: '2023-11-20',
          license: {
            status: 'confirmed',
            identifier: 'CC BY 4.0',
            attribution: 'Institut Cartogràfic i Geològic de Catalunya (ICGC)',
          },
          nominalResolutionMeters: 5,
          effectiveResolutionMeters: 5,
          horizontalCrs: { code: 'EPSG:25831' },
          verticalReference: {
            status: 'confirmed',
            reference: { kind: 'orthometric', datum: 'EGM08D595' },
            units: 'metres',
          },
        },
        imageIndex: 0,
        sampleIndex: 0,
      });

      assert.deepEqual([opened.metadata.width, opened.metadata.height], [53800, 52400]);
      assert.equal(opened.metadata.horizontalCrs.code, 'EPSG:25831');
      assert.equal(opened.metadata.nominalResolutionMeters, 5);
      assert.deepEqual(opened.metadata.geotransform, {
        originX: 259000, pixelX: 5, rowX: 0, originY: 4749000, pixelY: 0, rowY: -5,
      });
      assert.equal(opened.reader.blockWidth, 512);
      assert.equal(opened.reader.blockHeight, 512);
      assert.deepEqual(opened.metadata.noData, { kind: 'value', value: -9999 });

      const transformer = new Proj4HorizontalCoordinateTransformer(geotiffProjection);
      const provider = new PreparedRasterElevationProvider(
        opened.metadata, opened.reader, transformer, wgs84Crs, geotiffRasterCrs,
      );
      const parkCenter = { longitudeDegrees: 1.85821, latitudeDegrees: 42.25355 };
      await provider.prepareForPositions([parkCenter]);
      assert.ok(Math.abs(provider.getElevationAt(parkCenter).sample.elevation.meters -
        799.8795356137363) < 0.001);

      assert.ok(requests.length > 0);
      assert.ok(requests.every(({ status, range, contentRange }) =>
        status === 206 && range !== null && contentRange?.startsWith('bytes ')));
      const transferredBytes = requests.reduce((sum, request) => sum + request.bytes, 0);
      assert.ok(transferredBytes < 10 * 1024 * 1024, 'the query must transfer far less than the full 4.37 GB COG');
      t.diagnostic(`Official ICGC COG Range requests=${JSON.stringify(requests)}; transferred=${transferredBytes}/4369565862 bytes`);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
}
