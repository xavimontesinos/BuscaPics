import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import proj4 from 'proj4';

const geographicDefinition = '+proj=longlat +datum=WGS84 +no_defs +type=crs';
const utm31Definition = '+proj=utm +zone=31 +ellps=GRS80 +units=m +no_defs +type=crs';

/** Compare one explicitly linked record; names are evidence, never a matching key. */
export function comparePeakRecord(peak, evidence) {
  if (!evidence) {
    return { catalogId: peak.id, status: 'no_verificable', reason: 'No explicit official evidence is linked to this stable catalog ID.', original: originalValues(peak), official: null, differences: null };
  }

  const original = originalValues(peak);
  const official = structuredClone(evidence);
  const differences = {};
  const issues = [];
  if (!evidence.officialId || !evidence.officialName || !evidence.identityMethod) {
    issues.push('Official identity evidence is incomplete.');
  }
  const identityConfirmed = Boolean(evidence.officialId && evidence.officialName && evidence.identityMethod);

  if (isGeographicPosition(peak) && isProjectedPosition(evidence.officialSummit?.coordinate) && evidence.officialSummit.crs === 'EPSG:25831') {
    const catalogProjected = proj4(geographicDefinition, utm31Definition, [peak.longitude, peak.latitude]);
    differences.coordinateMeters = Math.hypot(
      catalogProjected[0] - evidence.officialSummit.coordinate.x,
      catalogProjected[1] - evidence.officialSummit.coordinate.y,
    );
    differences.coordinateStatus = differences.coordinateMeters <= evidence.thresholds?.horizontalMeters
      ? 'confirmado' : 'discrepante';
    if (differences.coordinateStatus === 'discrepante') issues.push(`Catalog position is ${differences.coordinateMeters.toFixed(2)} m from the official summit point.`);
  } else {
    differences.coordinateStatus = 'no_verificable';
    issues.push('Coordinate comparison requires valid catalog coordinates and official summit coordinates in EPSG:25831.');
  }

  if (Number.isFinite(peak.elevationMeters) && Number.isFinite(evidence.officialSummit?.elevationMeters) && evidence.verticalReference) {
    const numericDelta = peak.elevationMeters - evidence.officialSummit.elevationMeters;
    const compatibleCatalogReference = peak.verticalReference?.kind === 'orthometric' &&
      peak.verticalReference.datum === 'EGM08D595';
    differences.elevationStatus = compatibleCatalogReference
      ? Math.abs(numericDelta) <= (evidence.thresholds?.verticalMeters ?? 0) ? 'confirmado' : 'discrepante'
      : 'no_verificable';
    if (compatibleCatalogReference) differences.elevationMeters = numericDelta;
    else {
      differences.unreferencedNumericElevationDeltaMeters = numericDelta;
      issues.push('Catalog elevation has no confirmed EGM08D595 vertical reference; its numeric difference is indicative only and cannot validate altitude.');
    }
    if (differences.elevationStatus === 'discrepante') issues.push(`Catalog elevation differs by ${numericDelta.toFixed(2)} m.`);
  } else {
    differences.elevationStatus = 'no_verificable';
    issues.push('Elevation or official vertical reference is missing.');
  }

  differences.identityStatus = identityConfirmed ? 'confirmado' : 'no_verificable';
  differences.verticalCompatibility = evidence.verticalReference?.includes('EGM08D595') ? 'compatible_con_MDT_ICGC_EGM08D595' : 'no_verificable';
  const components = [differences.identityStatus, differences.coordinateStatus, differences.elevationStatus];
  const status = components.includes('discrepante') ? 'discrepante'
    : components.every((component) => component === 'confirmado') && differences.verticalCompatibility.startsWith('compatible')
      ? 'confirmado' : 'no_verificable';

  return {
    catalogId: peak.id,
    status,
    reason: issues.length ? issues.join(' ') : 'Identity, position, elevation and vertical reference meet the configured audit checks.',
    original,
    official,
    differences,
  };
}

export function createAuditReport(catalog, evidenceDocument, { includeAll = false } = {}) {
  const peaks = includeAll ? catalog.peaks : catalog.peaks.filter((peak) => peak.isEssential);
  const records = peaks.map((peak) => comparePeakRecord(peak, evidenceDocument.records[peak.id]));
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    catalogSource: catalog.metadata,
    scope: includeAll ? 'all catalog records' : 'essential peaks only',
    comparisonRules: {
      catalogCoordinatesInterpretedAs: 'WGS84 longitude/latitude per GPX coordinate convention; original GPX provenance remains unconfirmed.',
      officialCoordinatesComparedIn: 'EPSG:25831 using proj4.',
      altitudeComparison: 'Only classified as comparable when the catalog explicitly declares orthometric EGM08D595; otherwise only a clearly marked numeric delta is emitted.',
      matching: 'Evidence is linked by stable catalog ID; no automatic name-similarity matching.',
    },
    counts: Object.fromEntries(['confirmado', 'discrepante', 'no_verificable'].map((status) => [status, records.filter((record) => record.status === status).length])),
    records,
  };
}

export function renderMarkdownReport(report) {
  const lines = [
    '# Peak catalog audit', '',
    `Generated: ${report.generatedAt}`, `Scope: ${report.scope}`, '',
    '| Status | Count |', '| --- | ---: |',
    ...Object.entries(report.counts).map(([status, count]) => `| ${status} | ${count} |`), '',
    'Records are linked only by stable BuscaPics catalog ID to manually curated official evidence. Unmatched records are not name-matched automatically.', '',
    'Catalog longitude/latitude is interpreted as WGS84 per the GPX coordinate convention; the source GPX provenance is still unconfirmed. Altitude differences are classified only when the catalog datum is explicitly compatible with EGM08D595.', '',
  ];
  for (const record of report.records) {
    lines.push(`## ${record.catalogId}`, '', `**Status:** ${record.status}`, '', record.reason, '');
    if (record.original) lines.push(`- Catalog: ${record.original.name}; ${record.original.latitude}, ${record.original.longitude}; ${record.original.elevationMeters} m (${record.original.elevationSource}).`);
    if (record.official) {
      lines.push(`- Official: ${record.official.officialName} (${record.official.officialId}); summit ${record.official.officialSummit.elevationMeters} m; ${record.official.officialSummit.pointType}.`);
      lines.push(`- CRS: ${record.official.officialSummit.crs}; vertical reference: ${record.official.verticalReference}`);
      lines.push(`- Component states: identity ${record.differences.identityStatus}; coordinates ${record.differences.coordinateStatus}; elevation ${record.differences.elevationStatus}; vertical compatibility ${record.differences.verticalCompatibility}.`);
      lines.push(`- Coordinate difference: ${record.differences.coordinateMeters?.toFixed(2) ?? 'not calculated'} m; comparable elevation difference: ${record.differences.elevationMeters === undefined ? 'not calculated' : `${record.differences.elevationMeters.toFixed(2)} m`}.`);
      if (record.official.benchmark) lines.push(`- Benchmark ${record.official.benchmark.officialId}: ${record.official.benchmark.coordinate.x}, ${record.official.benchmark.coordinate.y} ${record.official.benchmark.crs}; ${record.official.benchmark.elevationMeters} m (${record.official.benchmark.pointType}).`);
      if (record.differences.unreferencedNumericElevationDeltaMeters !== undefined) lines.push(`- Unreferenced numeric elevation delta (not a valid datum comparison): ${record.differences.unreferencedNumericElevationDeltaMeters.toFixed(2)} m.`);
      lines.push(`- Method: ${record.official.method}`);
      lines.push(`- Consulted: ${record.official.consultedAt}`);
      for (const source of record.official.sources) lines.push(`- Source: [${source.title}](${source.url})`);
      if (record.official.reviewNote) lines.push(`- Review: ${record.official.reviewNote}`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function originalValues(peak) {
  return { name: peak.name, sourceName: peak.sourceName, latitude: peak.latitude, longitude: peak.longitude,
    elevationMeters: peak.elevationMeters, elevationSource: peak.elevationSource, verticalReference: peak.verticalReference ?? null };
}

function isGeographicPosition(peak) {
  return Number.isFinite(peak.latitude) && peak.latitude >= -90 && peak.latitude <= 90 &&
    Number.isFinite(peak.longitude) && peak.longitude >= -180 && peak.longitude <= 180;
}

function isProjectedPosition(position) {
  return position && Number.isFinite(position.x) && Number.isFinite(position.y);
}

async function run() {
  const includeAll = process.argv.includes('--all');
  const catalog = JSON.parse(await readFile(new URL('../public/data/100-cims-catalog.json', import.meta.url), 'utf8'));
  const evidence = JSON.parse(await readFile(new URL('../data/audits/icgc-100-cims-evidence.json', import.meta.url), 'utf8'));
  const report = createAuditReport(catalog, evidence, { includeAll });
  await writeFile(new URL('../docs/audits/peak-catalog-audit.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(new URL('../docs/audits/peak-catalog-audit.md', import.meta.url), renderMarkdownReport(report));
  console.log(`Wrote audit for ${report.records.length} records: ${JSON.stringify(report.counts)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await run();
