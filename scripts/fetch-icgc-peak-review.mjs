import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const ICGC_PEAK_LAYER_URL = 'https://maps.icgc.cat/vector02/rest/services/icc_100cims_v_r/MapServer/0';
const ICGC_GEOSERVEIS_LAYER_URL = 'https://geoserveis.icgc.cat/vector02/rest/services/icc_100cims_v_r/MapServer/0';
const ICGC_100_CIMS_WMS_URL = 'https://geoserveis.icgc.cat/icc_100cims/wms/service';
const REQUESTED_FIELDS = ['FID', 'Nom', 'Codi_cim'];
const PICA_CODE = '271064006';
const PICA_FID = '62';

/** Fetch the official point layer as raw review evidence; this is not audit acceptance. */
export async function fetchIgcPeakFeatures(fetchImpl = fetch) {
  const url = new URL(`${ICGC_PEAK_LAYER_URL}/query`);
  url.search = new URLSearchParams({
    where: '1=1', outFields: REQUESTED_FIELDS.join(','), returnGeometry: 'true', outSR: '25831', f: 'json',
  }).toString();
  const response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`ICGC feature query failed with HTTP ${response.status}`);
  const body = await response.json();
  if (!body || !Array.isArray(body.features)) {
    throw new Error(body?.error?.message ?? 'ICGC feature query did not return a features array');
  }
  return { requestedUrl: url.href, queriedAt: new Date().toISOString(), body };
}

/** Probe documented JSON/GeoJSON feature queries and retain raw responses for Pica review. */
export async function probeIgcPicaGeometry(fetchImpl = fetch, now = () => new Date().toISOString(), officialReference = null) {
  const metadataUrl = new URL(ICGC_PEAK_LAYER_URL);
  metadataUrl.searchParams.set('f', 'pjson');
  const metadataResponse = await fetchImpl(metadataUrl, { headers: { Accept: 'application/json' } });
  if (!metadataResponse.ok) throw new Error(`ICGC layer metadata failed with HTTP ${metadataResponse.status}`);
  const layerMetadata = await metadataResponse.json();
  const legacyMetadataUrl = new URL(ICGC_GEOSERVEIS_LAYER_URL);
  legacyMetadataUrl.searchParams.set('f', 'pjson');
  const legacyMetadataResponse = await fetchImpl(legacyMetadataUrl, { headers: { Accept: 'application/json' } });
  const legacyLayerMetadata = legacyMetadataResponse.ok ? await legacyMetadataResponse.json() : null;

  const probes = [
    { name: 'query-by-codi-cim-json', params: { where: `Codi_cim=${PICA_CODE}`, outFields: '*', returnGeometry: 'true', outSR: '25831', f: 'json' } },
    { name: 'query-by-fid-json', params: { objectIds: PICA_FID, outFields: '*', returnGeometry: 'true', outSR: '25831', f: 'json' } },
    { name: 'query-by-codi-cim-geojson', params: { where: `Codi_cim=${PICA_CODE}`, outFields: '*', returnGeometry: 'true', outSR: '25831', f: 'geojson' } },
    { name: 'geoserveis-query-by-codi-cim-json', baseUrl: ICGC_GEOSERVEIS_LAYER_URL, params: { where: `Codi_cim=${PICA_CODE}`, outFields: '*', returnGeometry: 'true', outSR: '25831', f: 'json' } },
    { name: 'geoserveis-query-by-codi-cim-geojson', baseUrl: ICGC_GEOSERVEIS_LAYER_URL, params: { where: `Codi_cim=${PICA_CODE}`, outFields: '*', returnGeometry: 'true', outSR: '25831', f: 'geojson' } },
  ];
  const results = [];
  for (const probe of probes) {
    const url = new URL(`${probe.baseUrl ?? ICGC_PEAK_LAYER_URL}/query`);
    for (const [key, value] of Object.entries(probe.params)) url.searchParams.set(key, value);
    const response = await fetchImpl(url, { headers: { Accept: probe.params.f === 'geojson' ? 'application/geo+json, application/json' : 'application/json' } });
    let body = null;
    let error = null;
    try {
      body = await response.json();
      if (!response.ok) error = body?.error?.message ?? `HTTP ${response.status}`;
      else if (body?.error) error = body.error.message ?? 'ICGC query returned an error object';
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    const features = Array.isArray(body?.features) ? body.features : [];
    const matching = features.filter((feature) => {
      const attrs = feature.attributes ?? feature.properties ?? {};
      return String(attrs.Codi_cim ?? '') === PICA_CODE || String(attrs.FID ?? attrs.OBJECTID ?? '') === PICA_FID;
    });
    const feature = matching.length === 1 ? matching[0] : null;
    const geometry = feature?.geometry ?? null;
    const coordinate = extractPoint(geometry);
    const responseCrs = extractCrs(geometry?.spatialReference) ?? extractCrs(body?.spatialReference) ?? extractGeoJsonCrs(body?.crs);
    const declaredCrs = responseCrs ?? null;
    const comparison = coordinate && declaredCrs === 'EPSG:25831' && officialReference
      ? comparePicaPoint(coordinate, officialReference) : null;
    results.push({
      name: probe.name,
      requestedUrl: url.href,
      httpStatus: response.status,
      responseContentType: response.headers?.get?.('content-type') ?? null,
      error,
      responseFeatureCount: features.length,
      matchingPicaFeatureCount: matching.length,
      rawFeature: feature,
      rawGeometry: geometry,
      parsedPoint: coordinate,
      responseCrs: declaredCrs,
      coordinateInterpretation: coordinate && !declaredCrs ? 'withheld: response does not declare a CRS' : null,
      comparison,
      rawResponse: body,
    });
  }
  const wmsCapabilitiesUrl = new URL(ICGC_100_CIMS_WMS_URL);
  wmsCapabilitiesUrl.search = new URLSearchParams({ SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetCapabilities' }).toString();
  const wmsCapabilitiesResponse = await fetchImpl(wmsCapabilitiesUrl, { headers: { Accept: 'application/xml, text/xml' } });
  const wmsCapabilitiesText = await wmsCapabilitiesResponse.text();
  const wmsInfoFormats = extractWmsInfoFormats(wmsCapabilitiesText);
  const wmsInfoFormat = chooseWmsInfoFormat(wmsInfoFormats);
  const wmsUrl = new URL(ICGC_100_CIMS_WMS_URL);
  const summitCoordinate = officialReference?.officialSummit?.coordinate;
  if (summitCoordinate && Number.isFinite(summitCoordinate.x) && Number.isFinite(summitCoordinate.y)) {
    const halfSize = 25;
    const wmsParams = {
      SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetFeatureInfo', LAYERS: '0', QUERY_LAYERS: '0',
      STYLES: '', CRS: 'EPSG:25831',
      BBOX: `${summitCoordinate.x - halfSize},${summitCoordinate.y - halfSize},${summitCoordinate.x + halfSize},${summitCoordinate.y + halfSize}`,
      WIDTH: '101', HEIGHT: '101', I: '50', J: '50', INFO_FORMAT: wmsInfoFormat ?? '', FEATURE_COUNT: '5',
    };
    for (const [key, value] of Object.entries(wmsParams)) wmsUrl.searchParams.set(key, value);
  }
  let wmsResult = null;
  if (summitCoordinate && wmsInfoFormat) {
    const response = await fetchImpl(wmsUrl, { headers: { Accept: 'application/json, text/html, application/xml' } });
    const rawText = await response.text();
    let parsed = null;
    try { parsed = JSON.parse(rawText); } catch { /* WMS may return HTML or an OGC exception document. */ }
    const rawResponse = parsed ?? rawText;
    const rawGeometry = parsed?.features?.[0]?.geometry ?? null;
    const gmlPoint = typeof rawResponse === 'string' ? extractGmlPoint(rawResponse) : null;
    const geometry = rawGeometry ?? gmlPoint;
    const coordinate = extractPoint(geometry);
    const featureInfoAttributes = typeof rawResponse === 'string' ? extractWmsFeatureInfoAttributes(rawResponse) : null;
    const responseCrs = extractCrs(geometry?.spatialReference) ?? extractGeoJsonCrs(parsed?.crs) ??
      (typeof rawResponse === 'string' ? extractXmlCrs(rawResponse) : null);
    wmsResult = {
      requestedUrl: wmsUrl.href,
      httpStatus: response.status,
      responseContentType: response.headers?.get?.('content-type') ?? null,
      infoFormat: wmsInfoFormat,
      rawResponse,
      featureInfoAttributes,
      officialCodeMatchedAtSummitQueryPoint: String(featureInfoAttributes?.Codi ?? featureInfoAttributes?.Codi_cim ?? '') === PICA_CODE,
      queryPoint: { ...summitCoordinate, crs: 'EPSG:25831', meaning: 'official highest summit coordinate from the ICGC measurement sheet' },
      rawGeometry: geometry,
      parsedPoint: coordinate,
      responseCrs,
      comparison: coordinate && responseCrs === 'EPSG:25831' && officialReference ? comparePicaPoint(coordinate, officialReference) : null,
      purpose: 'Official spatial identify at the measurement-sheet summit coordinate; GetFeatureInfo does not supply a feature geometry.',
    };
  }
  return {
    schemaVersion: 1,
    queriedAt: now(),
    target: { officialId: PICA_CODE, fid: PICA_FID, name: "Pica d'Estats" },
    metadataRequestUrl: metadataUrl.href,
    layerMetadata: {
      name: layerMetadata.name ?? null,
      type: layerMetadata.type ?? null,
      geometryType: layerMetadata.geometryType ?? null,
      spatialReference: layerMetadata.spatialReference ?? null,
      extent: layerMetadata.extent ?? null,
      fields: layerMetadata.fields ?? [],
      capabilities: layerMetadata.capabilities ?? null,
      supportedQueryFormats: layerMetadata.supportedQueryFormats ?? null,
      maxRecordCount: layerMetadata.maxRecordCount ?? null,
    },
    wmsCapabilities: {
      requestUrl: wmsCapabilitiesUrl.href,
      httpStatus: wmsCapabilitiesResponse.status,
      supportedGetFeatureInfoFormats: wmsInfoFormats,
      rawResponse: wmsCapabilitiesText,
    },
    alternateGeoserveisMetadata: legacyLayerMetadata ? {
      requestUrl: legacyMetadataUrl.href,
      name: legacyLayerMetadata.name ?? null,
      geometryType: legacyLayerMetadata.geometryType ?? null,
      spatialReference: legacyLayerMetadata.spatialReference ?? legacyLayerMetadata.extent?.spatialReference ?? null,
      fields: legacyLayerMetadata.fields ?? [],
      supportedQueryFormats: legacyLayerMetadata.supportedQueryFormats ?? null,
      capabilities: legacyLayerMetadata.capabilities ?? null,
    } : { requestUrl: legacyMetadataUrl.href, error: `HTTP ${legacyMetadataResponse.status}` },
    officialWmsIdentify: wmsResult,
    officialReference,
    probes: results,
    conclusion: results.some((result) => result.parsedPoint && result.responseCrs === 'EPSG:25831')
      ? 'geometry_received_with_declared_epsg_25831; spatial comparison is review evidence only'
      : wmsResult?.officialCodeMatchedAtSummitQueryPoint
        ? 'wms_identifies_pica_at_official_summit_query_coordinate_but_no_feature_geometry_was_returned'
        : wmsResult?.parsedPoint && wmsResult.responseCrs === 'EPSG:25831'
          ? 'wms_identify_point_received_with_declared_epsg_25831_but_not_a_vector_geometry'
        : 'no_usable_geometry_with_declared_epsg_25831',
    acceptance: 'This probe is not accepted catalog evidence; verify point semantics against the official measurement sheet before any coordinate update.',
  };
}

export function renderPicaGeometryProbeMarkdown(probe) {
  const lines = [
    '# ICGC Pica d’Estats geometry probe', '',
    `Consulted: ${probe.queriedAt}`, `Official code: ${probe.target.officialId} (FID ${probe.target.fid})`, '',
    `Layer: ${probe.layerMetadata.name}; ${probe.layerMetadata.geometryType}; CRS from extent: EPSG:${probe.layerMetadata.extent?.spatialReference?.wkid ?? 'not declared'}.`,
    `Fields: ${probe.layerMetadata.fields.map((field) => field.name).join(', ')}. Query formats: ${probe.layerMetadata.supportedQueryFormats}.`, '',
    '## REST queries', '',
    '| Request | HTTP | Matching features | Geometry returned | CRS in response |',
    '| --- | ---: | ---: | --- | --- |',
    ...probe.probes.map((result) => `| [${result.name}](${result.requestedUrl}) | ${result.httpStatus} | ${result.matchingPicaFeatureCount} | ${result.rawGeometry ? 'yes' : 'no'} | ${result.responseCrs ?? 'none'} |`), '',
    'All REST variants returned the Pica attributes but no geometry. The GeoJSON response declared EPSG:25831 while its `geometry` was null; JSON responses also omitted geometry and response CRS. No coordinates were interpreted from those responses.', '',
    '## Official WMS identify', '',
    `Capabilities: [request](${probe.wmsCapabilities.requestUrl}); formats advertised for GetFeatureInfo: ${probe.wmsCapabilities.supportedGetFeatureInfoFormats.join(', ')}.`,
    `Request: [GetFeatureInfo ${probe.officialWmsIdentify.infoFormat}](${probe.officialWmsIdentify.requestedUrl}).`,
    `At the official highest-point coordinate (${probe.officialWmsIdentify.queryPoint.x}, ${probe.officialWmsIdentify.queryPoint.y}, EPSG:25831), GetFeatureInfo returned ${probe.officialWmsIdentify.featureInfoAttributes?.Nom ?? 'no name'}, code ${probe.officialWmsIdentify.featureInfoAttributes?.Codi ?? 'unknown'} (FID ${probe.officialWmsIdentify.featureInfoAttributes?.FID ?? 'unknown'}). It returned no geometry or point coordinates.`, '',
    '## Summit and benchmark in the official measurement sheet', '',
    `Highest natural summit: (${probe.officialReference.officialSummit.coordinate.x}, ${probe.officialReference.officialSummit.coordinate.y}) EPSG:25831; ${probe.officialReference.officialSummit.elevationMeters} m.`,
    `Geodetic nail ${probe.officialReference.benchmark.officialId}: (${probe.officialReference.benchmark.coordinate.x}, ${probe.officialReference.benchmark.coordinate.y}) EPSG:25831; ${probe.officialReference.benchmark.elevationMeters} m.`,
    'The official fiche reports +0.37 m geometric levelling from the nail to the highest point. Since the service returned no coordinates, its point cannot be classified as summit or nail, and no service-geometry distance comparison is possible.', '',
    '**Conclusion:** no vector geometry was recovered. The WMS result confirms a feature with the correct official code is identified at the fiche summit query point, but it does not expose the feature coordinate. This is not enough to accept or update a catalog coordinate.', '',
    '**Next official step:** request a downloadable/exportable geometry for layer `100_CIMS` from ICGC, including confirmation whether `Codi_cim=271064006` represents the highest point or the geodetic nail. Retain the ficha’s two explicit points as the Pica reference.', '',
    'Sources: [ICGC REST layer metadata](https://maps.icgc.cat/vector02/rest/services/icc_100cims_v_r/MapServer/0), [ICGC WMS 100 peaks](https://www.icgc.cat/en/Geoinformation-and-Maps/Online-services-Geoservices/WMS-Points-Interest/WMS-100-peaks), [Pica measurement sheet](https://icgc-web-pro.s3.eu-central-1.amazonaws.com/produccio/s3fs-public/271064006_66559.pdf).', '',
  ];
  return `${lines.join('\n')}\n`;
}

function extractPoint(geometry) {
  if (Number.isFinite(geometry?.x) && Number.isFinite(geometry?.y)) return { x: geometry.x, y: geometry.y };
  if (geometry?.type === 'Point' && Array.isArray(geometry.coordinates) &&
    Number.isFinite(geometry.coordinates[0]) && Number.isFinite(geometry.coordinates[1])) {
    return { x: geometry.coordinates[0], y: geometry.coordinates[1] };
  }
  return null;
}

function extractCrs(reference) {
  const wkid = reference?.latestWkid ?? reference?.wkid;
  return Number.isFinite(wkid) ? `EPSG:${wkid}` : null;
}

function extractGeoJsonCrs(crs) {
  const name = crs?.properties?.name;
  const match = typeof name === 'string' ? name.match(/EPSG(?::|::|\/)(\d+)$/i) : null;
  return match ? `EPSG:${match[1]}` : null;
}

function extractXmlCrs(xml) {
  const value = xml.match(/\bsrsName\s*=\s*["']([^"']+)["']/i)?.[1];
  if (!value) return null;
  const match = value.match(/(?:EPSG(?::|::|\/)|epsg\.xml#)(\d+)$/i);
  return match ? `EPSG:${match[1]}` : null;
}

function extractGmlPoint(xml) {
  const pos = xml.match(/<(?:\w+:)?pos\b[^>]*>([^<]+)</i)?.[1]?.trim();
  if (pos) {
    const values = pos.split(/[\s,]+/).map(Number);
    if (values.length >= 2 && values.slice(0, 2).every(Number.isFinite)) return { x: values[0], y: values[1] };
  }
  const coordinates = xml.match(/<(?:\w+:)?coordinates\b[^>]*>([^<]+)</i)?.[1]?.trim();
  if (coordinates) {
    const values = coordinates.split(/[\s,]+/).map(Number);
    if (values.length >= 2 && values.slice(0, 2).every(Number.isFinite)) return { x: values[0], y: values[1] };
  }
  return null;
}

function extractWmsInfoFormats(capabilities) {
  const operation = capabilities.match(/<(?:\w+:)?GetFeatureInfo\b[^>]*>([\s\S]*?)<\/(?:\w+:)?GetFeatureInfo\s*>/i)?.[1] ?? '';
  return [...operation.matchAll(/<(?:\w+:)?Format\b[^>]*>([^<]+)<\/(?:\w+:)?Format\s*>/gi)]
    .map((match) => match[1].trim()).filter(Boolean);
}

function extractWmsFeatureInfoAttributes(xml) {
  const tag = xml.match(/<(?:\w+:)?FIELDS\b([^>]*)\/?\s*>/i)?.[1];
  if (!tag) return null;
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)].map((match) => [match[1], match[3]]));
}

function chooseWmsInfoFormat(formats) {
  const preferred = ['application/vnd.ogc.gml', 'application/vnd.ogc.gml/3.1.1', 'application/json', 'text/xml', 'text/html'];
  return preferred.find((candidate) => formats.includes(candidate)) ?? formats[0] ?? null;
}

function comparePicaPoint(point, reference) {
  const summit = reference.officialSummit?.coordinate;
  const benchmark = reference.benchmark?.coordinate;
  if (![summit, benchmark].every((item) => Number.isFinite(item?.x) && Number.isFinite(item?.y))) return null;
  const toSummitMeters = Math.hypot(point.x - summit.x, point.y - summit.y);
  const toBenchmarkMeters = Math.hypot(point.x - benchmark.x, point.y - benchmark.y);
  return {
    distanceToOfficialHighestPointMeters: toSummitMeters,
    distanceToGeodeticNailMeters: toBenchmarkMeters,
    nearestReference: toSummitMeters <= toBenchmarkMeters ? 'official_highest_point' : 'geodetic_nail',
    note: 'Proximity compares coordinates only; it does not establish the service feature point type.',
  };
}

/** Build an explicitly non-authoritative review queue from returned service features. */
export function createIgcReviewQueue(catalog, evidenceDocument, queryResult) {
  const explicitCatalogIdByOfficialId = new Map();
  for (const [catalogId, evidence] of Object.entries(evidenceDocument.records ?? {})) {
    if (evidence.officialId) explicitCatalogIdByOfficialId.set(String(evidence.officialId), catalogId);
  }

  const peaks = catalog.peaks.filter((peak) => peak.isEssential);
  const normalizedNameIndex = new Map();
  for (const peak of peaks) {
    const normalized = normalizeName(peak.name);
    normalizedNameIndex.set(normalized, [...(normalizedNameIndex.get(normalized) ?? []), peak.id]);
  }

  const features = queryResult.body.features;
  const idCounts = new Map();
  for (const feature of features) {
    const id = officialId(feature?.attributes?.Codi_cim);
    if (id) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  }

  return {
    schemaVersion: 1,
    source: {
      url: queryResult.requestedUrl,
      layerUrl: ICGC_PEAK_LAYER_URL,
      queriedAt: queryResult.queriedAt,
      queryFields: REQUESTED_FIELDS,
      returnedFields: queryResult.body.fields ?? [],
      spatialReference: queryResult.body.spatialReference ?? null,
      requestedSpatialReference: 'EPSG:25831',
      limitation: 'The service exposes name, code and point geometry only; it does not provide elevation, vertical datum, or a summit-versus-benchmark point type.',
    },
    features: features.map((feature) => {
      const attributes = feature?.attributes ?? {};
      const code = officialId(attributes.Codi_cim);
      const geometry = feature?.geometry ?? null;
      const validGeometry = Number.isFinite(geometry?.x) && Number.isFinite(geometry?.y);
      const catalogId = code && idCounts.get(code) === 1 ? explicitCatalogIdByOfficialId.get(code) ?? null : null;
      const nameCandidates = typeof attributes.Nom === 'string'
        ? normalizedNameIndex.get(normalizeName(attributes.Nom)) ?? [] : [];
      const status = !code ? 'incomplete_service_record'
        : idCounts.get(code) > 1 ? 'duplicate_official_code'
          : catalogId ? validGeometry ? 'explicit_code_link_manual_point_review' : 'explicit_code_link_geometry_missing'
            : !validGeometry ? 'incomplete_service_record'
              : nameCandidates.length > 0 ? 'name_candidate_manual_review_only' : 'unlinked_official_feature';
      return {
        status,
        manualReviewRequired: true,
        catalogId,
        nameCandidateCatalogIds: nameCandidates,
        officialId: code,
        rawAttributes: attributes,
        rawGeometry: geometry,
        rawFeature: feature,
        geometryCrs: feature?.geometry?.spatialReference ?? queryResult.body.spatialReference ?? null,
        elevationMeters: null,
        verticalReference: null,
        pointType: 'not supplied by this service',
        reviewReason: reviewReason(status, nameCandidates.length),
      };
    }),
  };
}

function officialId(value) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  return null;
}

function normalizeName(value) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('ca')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function reviewReason(status, candidateCount) {
  if (status === 'incomplete_service_record') return 'Official code or projected point geometry is missing or malformed.';
  if (status === 'duplicate_official_code') return 'More than one returned feature has this code; do not link automatically.';
  if (status === 'explicit_code_link_geometry_missing') return 'Stable official code links this row to the catalog record, but the service response omitted geometry; point location and point type remain unknown.';
  if (status === 'explicit_code_link_manual_point_review') return 'Official code has an explicit stable catalog-ID link; verify the layer point represents the summit, then use the official measurement sheet for height and datum.';
  if (status === 'name_candidate_manual_review_only') return `${candidateCount} catalog record(s) share the normalized name; names are suggestions only and do not establish identity.`;
  return 'No explicit official-code crosswalk or name candidate is available.';
}

async function run() {
  const [catalog, evidence] = await Promise.all([
    readFile(new URL('../public/data/100-cims-catalog.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../data/audits/icgc-100-cims-evidence.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  const queryResult = await fetchIgcPeakFeatures();
  const report = createIgcReviewQueue(catalog, evidence, queryResult);
  await writeFile(new URL('../docs/audits/icgc-100-cims-service-review.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote separate ICGC service review with ${report.features.length} features; no audit status or catalog data was changed.`);
}

async function runGeometryProbe() {
  const evidence = JSON.parse(await readFile(new URL('../data/audits/icgc-100-cims-evidence.json', import.meta.url), 'utf8'));
  const reference = evidence.records['cim-pica-d-estats-42.66714-1.39789'];
  const probe = await probeIgcPicaGeometry(fetch, () => new Date().toISOString(), reference);
  await writeFile(new URL('../docs/audits/icgc-pica-geometry-probe.json', import.meta.url), `${JSON.stringify(probe, null, 2)}\n`);
  await writeFile(new URL('../docs/audits/icgc-pica-geometry-probe.md', import.meta.url), renderPicaGeometryProbeMarkdown(probe));
  console.log(`Wrote Pica geometry probe: ${probe.conclusion}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const task = process.argv.includes('--probe-pica-geometry') ? runGeometryProbe : run;
  task().catch((error) => {
    console.error(`Could not fetch the ICGC review layer: ${error.message}`);
    process.exitCode = 1;
  });
}
