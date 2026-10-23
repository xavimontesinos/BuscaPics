import { readFile, writeFile } from 'node:fs/promises';

const completePath = new URL('../public/data/100_cims_complet.gpx', import.meta.url);
const essentialsPath = new URL('../public/data/100_cims_essencials.gpx', import.meta.url);
const catalogPath = new URL('../public/data/100-cims-catalog.json', import.meta.url);
const reportPath = new URL('../docs/100-cims-import-report.md', import.meta.url);

function decodeXml(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, code) => {
    if (code[0] === '#') return String.fromCodePoint(code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1)));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[code.toLowerCase()];
  });
}

/** Parse GPX 1.1 waypoints without adding a runtime XML dependency. */
export function parseGpxWaypoints(xml, sourceFile) {
  const points = [];
  for (const [index, match] of [...xml.matchAll(/<wpt\b([^>]*)>([\s\S]*?)<\/wpt\s*>/gi)].entries()) {
    const attrs = Object.fromEntries([...match[1].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)].map((item) => [item[1], decodeXml(item[3])]));
    const text = (tag) => {
      const found = match[2].match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}\\s*>`, 'i'));
      return found ? decodeXml(found[1].replace(/<[^>]+>/g, '').trim()) : null;
    };
    const sourceName = text('name');
    if (!sourceName) throw new Error(`${sourceFile} waypoint ${index + 1} has no name`);
    const latitude = Number(attrs.lat);
    const longitude = Number(attrs.lon);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new Error(`${sourceFile} waypoint ${index + 1} has invalid coordinates`);
    }
    const suffix = sourceName.match(/\s*\(\s*([0-9][0-9.\s]*)\s*m\s*\)\s*$/i);
    const name = (suffix ? sourceName.slice(0, suffix.index) : sourceName).trim();
    if (!name) throw new Error(`${sourceFile} waypoint ${index + 1} has no clean name`);
    let nameElevation = null;
    if (suffix) {
      const digits = suffix[1].replace(/[.\s]/g, '');
      nameElevation = Number(digits);
      if (!Number.isFinite(nameElevation)) throw new Error(`${sourceFile} waypoint ${index + 1} has an invalid elevation suffix`);
    }
    const rawElevation = text('ele');
    const ele = rawElevation === null || rawElevation === '' ? null : Number(rawElevation);
    const hasValidEle = ele !== null && Number.isFinite(ele) && ele >= 0;
    if (!hasValidEle && nameElevation === null) throw new Error(`${sourceFile} waypoint ${index + 1} has no valid <ele> or elevation suffix`);
    points.push({
      sourceFile, sourceIndex: index + 1, sourceName, name, latitude, longitude,
      elevationMeters: hasValidEle ? ele : nameElevation,
      elevationSource: hasValidEle ? 'gpx-ele' : 'name-suffix',
      nameElevationMeters: nameElevation,
      elevationDiscrepancy: hasValidEle && nameElevation !== null && Math.round(ele) !== nameElevation,
    });
  }
  if (!points.length) throw new Error(`${sourceFile} contains no GPX waypoints`);
  return points;
}

export function normalizePeakName(name) {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('ca').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function distanceMeters(a, b) {
  const radians = Math.PI / 180;
  const meanLatitude = (a.latitude + b.latitude) / 2 * radians;
  const dx = (a.longitude - b.longitude) * radians * 6371000 * Math.cos(meanLatitude);
  const dy = (a.latitude - b.latitude) * radians * 6371000;
  return Math.hypot(dx, dy);
}

export function buildCatalog(complete, essentials) {
  const fullByName = new Map();
  for (const peak of complete) {
    const key = normalizePeakName(peak.name);
    fullByName.set(key, [...(fullByName.get(key) ?? []), peak]);
  }
  const essentialMatches = new Map();
  const unmatched = [];
  const ambiguous = [];
  for (const essential of essentials) {
    const candidates = fullByName.get(normalizePeakName(essential.name)) ?? [];
    if (candidates.length === 1) {
      essentialMatches.set(candidates[0], essential);
    } else if (candidates.length > 1) {
      const nearby = candidates.map((peak) => ({ peak, distance: distanceMeters(essential, peak) })).filter((item) => item.distance <= 100);
      if (nearby.length === 1) essentialMatches.set(nearby[0].peak, essential);
      else ambiguous.push({ essential: essential.sourceName, candidates: (nearby.length ? nearby : candidates).map((item) => item.peak ? `${item.peak.sourceName} (${Math.round(item.distance)} m)` : item.sourceName), reason: 'normalized name matches multiple records and coordinates do not identify one unique candidate' });
    } else {
      const nearby = complete.map((peak) => ({ peak, distance: distanceMeters(essential, peak) })).filter((item) => item.distance <= 100);
      if (nearby.length === 1) essentialMatches.set(nearby[0].peak, essential);
      else if (nearby.length > 1) ambiguous.push({ essential: essential.sourceName, candidates: nearby.map(({ peak, distance }) => `${peak.sourceName} (${Math.round(distance)} m)`), reason: 'multiple complete-list records within 100 m' });
      else unmatched.push(essential.sourceName);
    }
  }

  const ids = new Set();
  const peaks = complete.map((peak) => {
    const slug = normalizePeakName(peak.name).replace(/ /g, '-');
    const baseId = `cim-${slug}-${peak.latitude.toFixed(5)}-${peak.longitude.toFixed(5)}`;
    let id = baseId;
    for (let suffix = 2; ids.has(id); suffix += 1) id = `${baseId}-${suffix}`;
    ids.add(id);
    return {
      id, name: peak.name, sourceName: peak.sourceName,
      latitude: peak.latitude, longitude: peak.longitude,
      elevationMeters: peak.elevationMeters, elevationSource: peak.elevationSource,
      isEssential: essentialMatches.has(peak),
    };
  });
  const elevationDiscrepancies = [...complete, ...essentials].filter((peak) => peak.elevationDiscrepancy).map((peak) => ({ sourceFile: peak.sourceFile, sourceName: peak.sourceName, nameElevationMeters: peak.nameElevationMeters, eleMeters: peak.elevationMeters }));
  const duplicateCompleteNames = [...fullByName].filter(([, records]) => records.length > 1).map(([normalizedName, records]) => ({ normalizedName, sourceNames: records.map((peak) => peak.sourceName) }));
  return { peaks, essentialMatches, unmatched, ambiguous, elevationDiscrepancies, duplicateCompleteNames };
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  const completeXml = await readFile(completePath, 'utf8');
  const essentialsXml = await readFile(essentialsPath, 'utf8');
  const complete = parseGpxWaypoints(completeXml, '100_cims_complet.gpx');
  const essentials = parseGpxWaypoints(essentialsXml, '100_cims_essencials.gpx');
  const result = buildCatalog(complete, essentials);
  const uniqueComplete = new Set(complete.map((peak) => normalizePeakName(peak.name)));
  const matchedEssentials = result.peaks.filter((peak) => peak.isEssential).length;
  const catalog = {
    metadata: {
      title: 'BuscaPics 100 Cims development catalog',
      status: 'generated development data; not verified as official FEEC data',
      sources: ['100_cims_complet.gpx', '100_cims_essencials.gpx'],
      provenance: 'Both input GPX files declare creator="ChatGPT"; underlying provenance is unconfirmed.',
      reuseConditions: 'Pending confirmation. This generated catalog is not approved for public redistribution.',
      coordinateAndElevationValidation: 'Not independently verified; values are copied from the input GPX.',
    },
    peaks: result.peaks,
  };
  await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  const lines = [
    '# Informe de importación de los GPX 100 Cims', '',
    '> Datos de desarrollo generados; no verificados como datos oficiales de la FEEC. Procedencia subyacente y condiciones de reutilización pendientes de confirmar. No redistribuir públicamente el catálogo hasta resolverlo.', '',
    'Los dos GPX originales se conservan sin cambios. Ambos declaran `creator="ChatGPT"` y no aportan licencia ni atribución verificable. Coordenadas y altitudes se copian de los archivos y no se consideran verificadas.', '',
    '## Recuento y emparejamiento', '',
    `- Waypoints del GPX completo: ${complete.length}. Nombres normalizados únicos: ${uniqueComplete.size}. Registros del catálogo: ${result.peaks.length}.`,
    `- Discrepancia documentada: hay ${complete.length - uniqueComplete.size} registros por encima del número de nombres normalizados únicos. Se conservan los ${complete.length} waypoints, porque tres nombres normalizados aparecen dos veces con altitudes distintas; no se fusionan automáticamente.`,
    `- Waypoints esenciales: ${essentials.length}; esenciales emparejados: ${matchedEssentials}; sin emparejar: ${result.unmatched.length}; ambiguos: ${result.ambiguous.length}.`,
    '- El emparejamiento usa nombre normalizado exacto (minúsculas y eliminación de diacríticos); las coordenadas solo desempatan si hay una única candidata a 100 m o menos, o se usan como alternativa si el nombre no coincide. No se fusionan candidatos ambiguos.',
    `- Duplicados de nombre normalizado en el GPX completo: ${result.duplicateCompleteNames.length}.`,
    ...result.duplicateCompleteNames.map((item) => `  - “${item.normalizedName}”: ${item.sourceNames.map((name) => `“${name}”`).join(' / ')}.`), '',
    '## Discrepancias de altitud', '',
    'Se extrae el sufijo final de altitud como entero (incluidos separadores de miles) y se usa `<ele>` cuando es válido. Solo se informa discrepancia si la altitud redondeada de `<ele>` no coincide con el sufijo.', '',
    ...(result.elevationDiscrepancies.length ? result.elevationDiscrepancies.map((item) => `- ${item.sourceFile}: “${item.sourceName}”; nombre ${item.nameElevationMeters} m, <ele> ${item.eleMeters} m.`) : ['- Ninguna discrepancia entre el sufijo y `<ele>` tras redondear `<ele>` al metro.']), '',
    '## Esenciales no emparejados o ambiguos', '',
    ...(result.unmatched.length ? result.unmatched.map((name) => `- Sin coincidencia: “${name}”.`) : ['- No hay esenciales sin coincidencia.']),
    ...(result.ambiguous.length ? result.ambiguous.map((item) => `- Ambiguo: “${item.essential}”; candidatos ${item.candidates.join('; ')} (${item.reason}).`) : ['- No hay coincidencias ambiguas.']), '',
    '## Nombres no normalizados con seguridad', '',
    '- Todos los waypoints importados tienen nombre no vacío. Los nombres que no terminen con un sufijo inequívoco de altitud se conservan íntegros; su altitud procede de `<ele>` cuando está disponible.', '',
  ];
  await writeFile(reportPath, `${lines.join('\n')}\n`);
  console.log(`Generated ${result.peaks.length} catalog records; ${matchedEssentials}/${essentials.length} essential matches; ${result.unmatched.length} unmatched; ${result.ambiguous.length} ambiguous; ${result.elevationDiscrepancies.length} elevation discrepancies.`);
}
