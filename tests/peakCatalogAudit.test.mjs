import assert from 'node:assert/strict';
import { test } from 'node:test';
import proj4 from 'proj4';
import { comparePeakRecord, createAuditReport } from '../scripts/audit-peak-catalog.mjs';
import { createIgcReviewQueue, fetchIgcPeakFeatures, ICGC_PEAK_LAYER_URL, probeIgcPicaGeometry, renderPicaGeometryProbeMarkdown } from '../scripts/fetch-icgc-peak-review.mjs';

const geographic = '+proj=longlat +datum=WGS84 +no_defs +type=crs';
const utm31 = '+proj=utm +zone=31 +ellps=GRS80 +units=m +no_defs +type=crs';
const officialCoordinate = { x: 400000, y: 4600000 };
const [longitude, latitude] = proj4(utm31, geographic, [officialCoordinate.x, officialCoordinate.y]);

function peak(overrides = {}) {
  return { id: 'stable-peak-id', name: 'Synthetic summit', sourceName: 'Synthetic summit', latitude, longitude,
    elevationMeters: 100, elevationSource: 'gpx-ele', isEssential: true,
    verticalReference: { kind: 'orthometric', datum: 'EGM08D595' }, ...overrides };
}

function evidence(overrides = {}) {
  return { officialId: 'AUTH-42', officialName: 'Synthetic summit', identityMethod: 'Reviewed stable ID mapping',
    officialSummit: { coordinate: officialCoordinate, crs: 'EPSG:25831', elevationMeters: 100,
      pointType: 'highest natural summit point' },
    verticalReference: 'Orthometric EGM08D595', method: 'Synthetic controlled method', consultedAt: '2026-01-01',
    sources: [{ title: 'Authority', url: 'https://example.invalid/source' }],
    thresholds: { horizontalMeters: 1, verticalMeters: 0.1 }, ...overrides };
}

test('confirms a stable-ID record when position, altitude and vertical reference match', () => {
  const result = comparePeakRecord(peak(), evidence());
  assert.equal(result.status, 'confirmado');
  assert.ok(result.differences.coordinateMeters < 0.001);
  assert.equal(result.differences.elevationMeters, 0);
});

test('classifies coordinate and altitude differences without overwriting originals', () => {
  const original = peak({ latitude: latitude + 0.001, elevationMeters: 90 });
  const result = comparePeakRecord(original, evidence());
  assert.equal(result.status, 'discrepante');
  assert.equal(result.original.latitude, original.latitude);
  assert.ok(result.differences.coordinateMeters > 1);
  assert.equal(result.differences.elevationMeters, -10);
});

test('does not fuzzy-match an unlinked record and reports it as unverifiable', () => {
  assert.equal(comparePeakRecord(peak(), null).status, 'no_verificable');
});

test('does not claim altitude agreement when catalog datum is absent', () => {
  const result = comparePeakRecord(peak({ verticalReference: undefined }), evidence());
  assert.equal(result.differences.elevationStatus, 'no_verificable');
  assert.equal(result.differences.unreferencedNumericElevationDeltaMeters, 0);
  assert.equal(result.differences.elevationMeters, undefined);
  assert.equal(result.status, 'no_verificable');
});

test('limits default audit scope to essentials while retaining explicit stable-ID links', () => {
  const catalog = { metadata: {}, peaks: [peak(), peak({ id: 'other', isEssential: false })] };
  const result = createAuditReport(catalog, { records: { 'stable-peak-id': evidence() } });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].catalogId, 'stable-peak-id');
});

test('queries the official feature layer and preserves its service response metadata', async () => {
  let requested;
  const query = await fetchIgcPeakFeatures(async (url, options) => {
    requested = { url: new URL(url), options };
    return { ok: true, json: async () => ({ features: [], fields: [], spatialReference: { wkid: 25831 } }) };
  });
  assert.equal(requested.url.origin + requested.url.pathname, `${ICGC_PEAK_LAYER_URL}/query`);
  assert.equal(requested.url.searchParams.get('where'), '1=1');
  assert.equal(requested.url.searchParams.get('outSR'), '25831');
  assert.equal(query.body.spatialReference.wkid, 25831);
  assert.ok(query.queriedAt);
});

test('keeps a unique official-code link in manual point review and never supplies altitude', () => {
  const syntheticCatalog = { peaks: [peak({ id: 'stable-peak-id', name: 'Synthetic summit' })] };
  const linkedEvidence = { records: { 'stable-peak-id': { officialId: 'AUTH-42' } } };
  const result = createIgcReviewQueue(syntheticCatalog, linkedEvidence, {
    requestedUrl: `${ICGC_PEAK_LAYER_URL}/query?f=json`, queriedAt: '2026-01-02T00:00:00.000Z',
    body: { fields: [{ name: 'FID' }, { name: 'Nom' }, { name: 'Codi_cim' }], spatialReference: { wkid: 25831 },
      features: [{ attributes: { FID: 7, Nom: 'Synthetic summit', Codi_cim: 'AUTH-42' }, geometry: { x: 400000, y: 4600000 } }] },
  });
  assert.equal(result.features[0].status, 'explicit_code_link_manual_point_review');
  assert.equal(result.features[0].catalogId, 'stable-peak-id');
  assert.equal(result.features[0].elevationMeters, null);
  assert.equal(result.features[0].pointType, 'not supplied by this service');
  assert.deepEqual(result.features[0].rawAttributes, { FID: 7, Nom: 'Synthetic summit', Codi_cim: 'AUTH-42' });
});

test('does not link ambiguous name candidates or incomplete/duplicate service records', () => {
  const syntheticCatalog = { peaks: [peak({ id: 'one', name: 'Same summit' }), peak({ id: 'two', name: 'Same summit' })] };
  const result = createIgcReviewQueue(syntheticCatalog, { records: {} }, {
    requestedUrl: 'https://example.invalid/query', queriedAt: '2026-01-02T00:00:00.000Z',
    body: { features: [
      { attributes: { FID: 1, Nom: 'Same summit', Codi_cim: 1 }, geometry: { x: 1, y: 2 } },
      { attributes: { FID: 2, Nom: 'Same summit', Codi_cim: 1 }, geometry: { x: 1, y: 2 } },
      { attributes: { FID: 3, Nom: 'Same summit' }, geometry: null },
    ] },
  });
  assert.equal(result.features[0].status, 'duplicate_official_code');
  assert.equal(result.features[0].catalogId, null);
  assert.deepEqual(result.features[0].nameCandidateCatalogIds, ['one', 'two']);
  assert.equal(result.features[2].status, 'incomplete_service_record');
  assert.equal(result.features[2].manualReviewRequired, true);
});

test('retains explicit code linkage when the service omits geometry, but requires manual review', () => {
  const result = createIgcReviewQueue({ peaks: [peak({ id: 'stable-peak-id' })] },
    { records: { 'stable-peak-id': { officialId: 'AUTH-42' } } },
    { requestedUrl: 'https://example.invalid/query', queriedAt: '2026-01-02T00:00:00.000Z',
      body: { features: [{ attributes: { FID: 7, Nom: 'Synthetic summit', Codi_cim: 'AUTH-42' } }] } });
  assert.equal(result.features[0].status, 'explicit_code_link_geometry_missing');
  assert.equal(result.features[0].catalogId, 'stable-peak-id');
  assert.equal(result.features[0].manualReviewRequired, true);
  assert.equal(result.features[0].rawGeometry, null);
});

test('reports official service HTTP and malformed-response errors clearly', async () => {
  await assert.rejects(fetchIgcPeakFeatures(async () => ({ ok: false, status: 503 })), /HTTP 503/);
  await assert.rejects(fetchIgcPeakFeatures(async () => ({ ok: true, json: async () => ({ features: null }) })), /features array/);
});

test('probes JSON by code, JSON by FID, and GeoJSON while comparing only declared EPSG:25831 points', async () => {
  const requests = [];
  const reference = {
    officialSummit: { coordinate: { x: 10, y: 20 } },
    benchmark: { coordinate: { x: 13, y: 24 } },
  };
  const probe = await probeIgcPicaGeometry(async (url) => {
    const parsed = new URL(url);
    requests.push(parsed);
    if (parsed.pathname.endsWith('/MapServer/0')) {
      return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({
        name: '100_CIMS', type: 'Feature Layer', geometryType: 'esriGeometryPoint',
        spatialReference: { wkid: 25831 }, extent: { spatialReference: { wkid: 25831 } },
        fields: [{ name: 'Codi_cim' }], supportedQueryFormats: 'JSON,geoJSON',
      }) };
    }
    if (parsed.pathname.endsWith('/wms/service')) {
      if (parsed.searchParams.get('REQUEST') === 'GetCapabilities') {
        return { status: 200, headers: { get: () => 'text/xml' }, text: async () => '<WMS_Capabilities><GetFeatureInfo><Format>application/vnd.ogc.gml</Format></GetFeatureInfo></WMS_Capabilities>' };
      }
      return { status: 200, headers: { get: () => 'application/vnd.ogc.gml' }, text: async () =>
        '<FeatureCollection><featureMember><shape srsName="urn:ogc:def:crs:EPSG::25831"><Point><pos>10 20</pos></Point></shape></featureMember></FeatureCollection>' };
    }
    const format = parsed.searchParams.get('f');
    const body = format === 'geojson'
      ? { crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::25831' } }, features: [{
        type: 'Feature', properties: { FID: 62, Codi_cim: 271064006 }, geometry: { type: 'Point', coordinates: [10, 20] },
      }] }
      : { spatialReference: { wkid: 25831 }, features: [{
        attributes: { FID: 62, Codi_cim: 271064006 }, geometry: { x: parsed.searchParams.has('objectIds') ? 13 : 10, y: parsed.searchParams.has('objectIds') ? 24 : 20, spatialReference: { wkid: 25831 } },
      }] };
    return { ok: true, status: 200, headers: { get: () => format === 'geojson' ? 'application/geo+json' : 'application/json' }, json: async () => body };
  }, () => '2026-10-24T00:00:00.000Z', reference);

  assert.equal(requests.length, 9);
  assert.ok(requests.some((request) => request.searchParams.get('where') === 'Codi_cim=271064006'));
  assert.ok(requests.some((request) => request.searchParams.get('objectIds') === '62'));
  assert.ok(requests.some((request) => request.searchParams.get('f') === 'geojson'));
  assert.equal(probe.layerMetadata.spatialReference.wkid, 25831);
  assert.equal(probe.probes[0].comparison.nearestReference, 'official_highest_point');
  assert.equal(probe.probes[1].comparison.nearestReference, 'geodetic_nail');
  assert.equal(probe.probes[2].responseCrs, 'EPSG:25831');
  assert.equal(probe.probes[2].rawGeometry.type, 'Point');
  assert.equal(probe.alternateGeoserveisMetadata.spatialReference.wkid, 25831);
  assert.equal(probe.officialWmsIdentify.infoFormat, 'application/vnd.ogc.gml');
  assert.deepEqual(probe.officialWmsIdentify.parsedPoint, { x: 10, y: 20 });
  assert.equal(probe.officialWmsIdentify.responseCrs, 'EPSG:25831');
  assert.equal(probe.officialWmsIdentify.officialCodeMatchedAtSummitQueryPoint, false);
  const markdown = renderPicaGeometryProbeMarkdown(probe);
  assert.match(markdown, /no geometry/i);
  assert.match(markdown, /geodetic nail/i);
});

test('withholds coordinate interpretation for missing CRS, ambiguous features and malformed geometry', async () => {
  let queryIndex = 0;
  const probe = await probeIgcPicaGeometry(async () => {
    queryIndex += 1;
    if (queryIndex <= 2) return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ spatialReference: { wkid: 25831 } }) };
    if (queryIndex === 8) return { status: 200, headers: { get: () => 'text/xml' }, text: async () => '<WMS_Capabilities><GetFeatureInfo><Format>text/html</Format></GetFeatureInfo></WMS_Capabilities>' };
    if (queryIndex === 9) return { status: 200, headers: { get: () => 'text/plain' }, text: async () => 'WMS reply' };
    const index = queryIndex - 3;
    const pica = { attributes: { FID: 62, Codi_cim: 271064006 }, geometry: { x: 10, y: 20 } };
    const features = index === 1 ? [pica, pica] : index === 2 ? [{ attributes: { FID: 62, Codi_cim: 271064006 }, geometry: { x: 10 } }] : [pica];
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ features }) };
  }, () => '2026-10-24T00:00:00.000Z', { officialSummit: { coordinate: { x: 10, y: 20 } }, benchmark: { coordinate: { x: 13, y: 24 } } });

  assert.equal(probe.probes[0].parsedPoint.x, 10);
  assert.equal(probe.probes[0].responseCrs, null);
  assert.equal(probe.probes[0].comparison, null);
  assert.equal(probe.probes[0].coordinateInterpretation, 'withheld: response does not declare a CRS');
  assert.equal(probe.probes[1].matchingPicaFeatureCount, 2);
  assert.equal(probe.probes[1].rawFeature, null);
  assert.equal(probe.probes[2].parsedPoint, null);
});

test('records WMS point identification by official code without treating it as returned geometry', async () => {
  let wmsCall = 0;
  const reference = { officialSummit: { coordinate: { x: 10, y: 20 } }, benchmark: { coordinate: { x: 13, y: 24 } } };
  const probe = await probeIgcPicaGeometry(async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/MapServer/0')) return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ name: '100_CIMS', extent: { spatialReference: { wkid: 25831 } } }) };
    if (parsed.pathname.endsWith('/wms/service')) {
      wmsCall += 1;
      return { status: 200, headers: { get: () => 'text/xml' }, text: async () => wmsCall === 1
        ? '<WMS_Capabilities><GetFeatureInfo><Format>text/xml</Format></GetFeatureInfo></WMS_Capabilities>'
        : '<FeatureInfoResponse><FIELDS FID="62" Nom="Pica d\'Estats" Codi="271064006"/></FeatureInfoResponse>' };
    }
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ features: [] }) };
  }, () => '2026-10-24T00:00:00.000Z', reference);
  assert.equal(probe.officialWmsIdentify.officialCodeMatchedAtSummitQueryPoint, true);
  assert.equal(probe.officialWmsIdentify.featureInfoAttributes.Nom, "Pica d'Estats");
  assert.equal(probe.officialWmsIdentify.rawGeometry, null);
  assert.equal(probe.conclusion, 'wms_identifies_pica_at_official_summit_query_coordinate_but_no_feature_geometry_was_returned');
});
