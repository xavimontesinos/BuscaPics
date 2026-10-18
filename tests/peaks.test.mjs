import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/domain/peaks.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const domain = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
const { filterPeaks, toGeoJsonCoordinates, toPeakFeatureCollection } = domain;
const sample = JSON.parse(await readFile(new URL("../public/data/peaks-sample.json", import.meta.url), "utf8"));

function peak(id, elevationM) {
  return {
    id,
    name: id,
    alternateNames: [],
    coordinates: {
      source: { easting: 400000, northing: 4680000, crs: "EPSG:25831" },
      wgs84: { longitude: 1.8, latitude: 42.2, crs: "EPSG:4326" },
    },
    elevation: { valueM: elevationM, verticalReference: "test" },
    source: { recordId: `source-${id}` },
    validation: { sourceRecord: "verified-in-source", coordinates: "reprojected-by-source-service", summitPosition: "pending" },
  };
}

test("altitude filters use strict thresholds", () => {
  const peaks = [peak("below", 2499.9), peak("at", 2500), peak("above", 2500.1)];
  assert.deepEqual(filterPeaks(peaks, { id: "over-2500m" }).map(({ id }) => id), ["above"]);
});

test("each altitude option excludes values at its threshold", () => {
  for (const [filterId, threshold] of [["over-3000m", 3000], ["over-2500m", 2500], ["over-2000m", 2000]]) {
    assert.deepEqual(filterPeaks([peak("equal", threshold), peak("higher", threshold + 1)], { id: filterId }).map(({ id }) => id), ["higher"]);
  }
});

test("GeoJSON coordinates are longitude then latitude", () => {
  assert.deepEqual(toGeoJsonCoordinates(peak("coordinates", 2100)), [1.8, 42.2]);
});

test("internal identifiers are distinct from ICGC record identifiers", () => {
  for (const item of sample.peaks) assert.notEqual(item.id, item.source.recordId);
});

test("catalog marks summit position as pending", () => {
  assert.ok(sample.peaks.length > 0);
  assert.ok(sample.peaks.every((item) => item.validation.summitPosition === "pending"));
});

test("FEEC filter returns no results without verified authorized membership data", () => {
  assert.deepEqual(filterPeaks(sample.peaks, { id: "feec-100-cims" }), []);
});

test("sample preserves source and transformed coordinate provenance", () => {
  for (const item of sample.peaks) {
    assert.equal(item.coordinates.source.crs, "EPSG:25831");
    assert.equal(item.coordinates.wgs84.crs, "EPSG:4326");
    assert.equal(item.validation.coordinates, "reprojected-by-source-service");
    assert.equal(item.source.sourceIdStability, "not-guaranteed");
  }
});

test("selected altitude filter is applied before creating map features", () => {
  const collection = toPeakFeatureCollection(sample.peaks, { id: "over-2500m" });
  assert.deepEqual(collection.features.map(({ id }) => id), ["peak-0001", "peak-0003", "peak-0004"]);
});

test("map feature coordinates preserve the verified longitude and latitude", () => {
  const collection = toPeakFeatureCollection(sample.peaks, { id: "over-2500m" });
  const feature = collection.features.find(({ id }) => id === "peak-0001");
  assert.deepEqual(feature?.geometry.coordinates, [1.8926653703265297, 42.320588691949062]);
  assert.equal(feature?.properties.name, "la Tosa");
  assert.equal(feature?.properties.elevationM, 2536.40991);
});

test("empty FEEC and over-3000m selections produce empty map collections", () => {
  assert.deepEqual(toPeakFeatureCollection(sample.peaks, { id: "feec-100-cims" }).features, []);
  assert.deepEqual(toPeakFeatureCollection(sample.peaks, { id: "over-3000m" }).features, []);
});
