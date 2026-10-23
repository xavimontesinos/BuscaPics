import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const proj4 = require('proj4');
const geotiff = await import('geotiff');
const clipPath = '/tmp/buscapics-icgc-baga-cadi-mdt5-64x64.tif';

async function compile(path, replacements = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  let javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const [specifier, replacement] of Object.entries(replacements)) {
    javascript = javascript.replaceAll(`from "${specifier}"`, `from ${JSON.stringify(replacement)}`);
  }
  return `data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`;
}

const horizontalUrl = await compile('../../src/domain/visibility/horizontalCoordinates.ts');
const georeferencingUrl = await compile('../../src/domain/visibility/rasterGeoreferencing.ts');
const metadataUrl = await compile('../../src/domain/visibility/terrainDataset.ts');
const geometryUrl = await compile('../../src/domain/visibility/geometry.ts');
const transformerSource = await readFile(
  new URL('../../src/domain/visibility/Proj4HorizontalCoordinateTransformer.ts', import.meta.url), 'utf8',
);
const transformerJavascript = ts.transpileModule(transformerSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText
  .replace('from "proj4"', 'from "__icgcOptionalProj4__"')
  .replace('from "./horizontalCoordinates"', `from ${JSON.stringify(horizontalUrl)}`)
  .replace('import proj4 from "__icgcOptionalProj4__";', 'const proj4 = globalThis.__icgcOptionalProj4;');
const transformerUrl = `data:text/javascript;base64,${Buffer.from(transformerJavascript).toString('base64')}`;

const readerSource = await readFile(
  new URL('../../src/domain/visibility/geoTiffRasterBlockReader.ts', import.meta.url), 'utf8',
);
const readerJavascript = ts.transpileModule(readerSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText
  .replace(
    'import { fromArrayBuffer, fromBlob, fromUrl } from "geotiff";',
    'const { fromArrayBuffer, fromBlob, fromUrl } = globalThis.__icgcOptionalGeoTiff;',
  )
  .replace('from "./horizontalCoordinates"', `from ${JSON.stringify(horizontalUrl)}`)
  .replace('from "./rasterGeoreferencing"', `from ${JSON.stringify(georeferencingUrl)}`)
  .replace('from "./terrainDataset"', `from ${JSON.stringify(metadataUrl)}`)
  .replace('from "./rasterElevationProvider"', `from ${JSON.stringify(await compile('../../src/domain/visibility/rasterElevationProvider.ts', {
    './horizontalCoordinates': horizontalUrl,
    './rasterGeoreferencing': georeferencingUrl,
    './terrainDataset': metadataUrl,
  }))}`);
const readerUrl = `data:text/javascript;base64,${Buffer.from(readerJavascript).toString('base64')}`;
const rasterProviderUrl = await compile('../../src/domain/visibility/rasterElevationProvider.ts', {
  './horizontalCoordinates': horizontalUrl,
  './rasterGeoreferencing': georeferencingUrl,
  './terrainDataset': metadataUrl,
});
const adapterUrl = await compile('../../src/domain/visibility/rasterTerrainElevationProvider.ts');
const lineOfSightUrl = await compile('../../src/domain/visibility/lineOfSight.ts', {
  './geometry': geometryUrl,
});

globalThis.__icgcOptionalProj4 = proj4;
globalThis.__icgcOptionalGeoTiff = geotiff;
const [readerModule, rasterModule, transformerModule, adapterModule, lineOfSightModule, geometryModule] =
  await Promise.all([
    import(readerUrl), import(rasterProviderUrl), import(transformerUrl), import(adapterUrl),
    import(lineOfSightUrl), import(geometryUrl),
  ]);
delete globalThis.__icgcOptionalProj4;
delete globalThis.__icgcOptionalGeoTiff;

const { GeoTiffRasterBlockReader } = readerModule;
const { PreparedRasterElevationProvider } = rasterModule;
const { Proj4HorizontalCoordinateTransformer } = transformerModule;
const { RasterTerrainElevationProvider } = adapterModule;
const { calculateLineOfSight } = lineOfSightModule;
const { distanceMeters, generateIntermediateSamplePoints } = geometryModule;

test('optional ICGC crop supports a clear LOS and a separate synthetic obstruction', async (t) => {
  try {
    await access(clipPath);
  } catch {
    t.skip(`External ICGC crop is unavailable: ${clipPath}`);
    return;
  }

  const file = await readFile(clipPath);
  const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const product = {
    id: 'icgc-mdt-lidar-catalunya-5m-2021-2023',
    producer: 'Institut Cartogràfic i Geològic de Catalunya (ICGC)',
    source: 'https://datacloud.icgc.cat/datacloud/model-elevacions-terreny/tif_unzip/model-elevacions-terreny-lidar-catalunya-5m-2021-2023.tif',
    version: 'v1r0',
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
  };
  const opened = await GeoTiffRasterBlockReader.open(buffer, {
    product,
    imageIndex: 0,
    sampleIndex: 0,
  });
  assert.equal(opened.metadata.width, 64);
  assert.equal(opened.metadata.height, 64);

  const definitions = [
    { code: 'EPSG:4326', definition: '+proj=longlat +datum=WGS84 +no_defs +type=crs' },
    { code: 'EPSG:25831', definition: '+proj=utm +zone=31 +ellps=GRS80 +units=m +no_defs +type=crs' },
  ];
  const transformer = new Proj4HorizontalCoordinateTransformer(definitions);
  const geographicCrs = {
    kind: 'geographic', code: 'EPSG:4326', axisOrder: 'longitude-latitude', angularUnit: 'degree',
  };
  const rasterCrs = {
    kind: 'projected', code: 'EPSG:25831', axisOrder: 'x-y', linearUnit: 'metre',
  };
  const positionAt = (column) => transformer.projectedToGeographic(
    { x: 405655 + (column + 0.5) * 5, y: 4678720 - (32 + 0.5) * 5 },
    rasterCrs,
    geographicCrs,
  );
  const observerPosition = positionAt(31);
  const targetPosition = positionAt(33);
  const midpoint = generateIntermediateSamplePoints(
    observerPosition,
    targetPosition,
    distanceMeters(observerPosition, targetPosition) / 2,
  )[0];

  const rasterProvider = new PreparedRasterElevationProvider(
    opened.metadata,
    opened.reader,
    transformer,
    geographicCrs,
    rasterCrs,
  );
  const expectedVerticalReference = { kind: 'orthometric', datum: 'EGM08D595' };
  const terrain = new RasterTerrainElevationProvider(rasterProvider, expectedVerticalReference);
  await rasterProvider.prepareForPositions([observerPosition, targetPosition, midpoint]);

  const observerGround = terrain.getElevationAt(observerPosition);
  const targetGround = terrain.getElevationAt(targetPosition);
  const middleGround = terrain.getElevationAt(midpoint);
  for (const lookup of [observerGround, targetGround, middleGround]) {
    assert.equal(lookup.state, 'available');
  }

  const observer = {
    position: observerPosition,
    terrainElevation: observerGround.sample.elevation,
    eyeHeightAboveGroundMeters: 50,
  };
  const target = {
    id: 'synthetic-target-over-icgc-terrain',
    position: targetPosition,
    heightAboveTerrainMeters: 50,
  };
  const options = { sampleSpacingMeters: 1_000, verticalToleranceMeters: 0 };
  const queried = [];
  const recordingTerrain = {
    getElevationAt(position) {
      queried.push(position);
      return terrain.getElevationAt(position);
    },
  };

  const clearResult = calculateLineOfSight(observer, target, recordingTerrain, options);
  assert.equal(clearResult.state, 'visible');
  assert.ok(queried.some((position) => position === targetPosition));
  assert.ok(queried.some((position) => Math.abs(position.longitudeDegrees - midpoint.longitudeDegrees) < 1e-12 &&
    Math.abs(position.latitudeDegrees - midpoint.latitudeDegrees) < 1e-12));

  const syntheticRidgeTerrain = {
    getElevationAt(position) {
      const lookup = terrain.getElevationAt(position);
      if (lookup.state !== 'available' ||
        distanceMeters(position, midpoint) > 0.01) return lookup;
      return {
        state: 'available',
        sample: {
          ...lookup.sample,
          elevation: {
            ...lookup.sample.elevation,
            meters: lookup.sample.elevation.meters + 100,
          },
        },
      };
    },
  };
  const syntheticResult = calculateLineOfSight(observer, target, syntheticRidgeTerrain, options);
  assert.equal(syntheticResult.state, 'occluded');
  assert.equal(syntheticResult.blockingTerrain.elevation.meters, middleGround.sample.elevation.meters + 100);
});
