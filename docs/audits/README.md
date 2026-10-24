# Peak catalog audit workflow

Run `node scripts/audit-peak-catalog.mjs` to audit the 150 essential peaks, or add `--all` to include the complete catalog. The command reads the production catalog without changing it and writes a separate Markdown and JSON report under this directory.

Run `node scripts/fetch-icgc-peak-review.mjs` with network access to query the official ICGC 100-cims point layer and write `icgc-100-cims-service-review.json`. This is a separate raw review queue, not new accepted audit evidence. The layer schema declares point geometry in EPSG:25831 and exposes `FID`, `Nom`, `Codi_cim`, but the actual query response observed on 2026-10-24 returned the attributes without geometry. The service has no elevation, vertical datum, or summit/benchmark distinction. Explicit code links are carried into manual point review; normalized-name matches are suggestions only. The checked-in review JSON is updated only when an actual service response has been fetched.

Run `node scripts/fetch-icgc-peak-review.mjs --probe-pica-geometry` to repeat individual REST queries by official code and FID in JSON and GeoJSON, inspect layer metadata, and query the official WMS with a GetFeatureInfo request centered on the ficha’s summit coordinate. It writes raw responses and a human-readable report to `icgc-pica-geometry-probe.json` and `.md`. A WMS identify match is only a map hit at the query pixel; it is not vector geometry and cannot establish whether the feature point is the summit or geodetic nail.

Official evidence is manually transcribed into `data/audits/icgc-100-cims-evidence.json`. Link it by the stable `Peak.id` and include the official summit code, source URL, consultation date, CRS, summit-vs-benchmark point type, vertical reference, and method. Never match records automatically by name similarity. For ambiguous identities, leave the record unlinked (`no_verificable`) until a person reviews the official map or measurement sheet.

For Catalonia, prioritize the ICGC 100 emblematic summit list and the linked measurement sheet. The sheet may distinguish the summit from its geodetic nail. For the remaining FEEC essentials, identify a suitable authority and vertical reference individually; do not use the ICGC Catalonia DEM outside its coverage. MDT samples are terrain estimates and must not be recorded as confirmed surveyed summit elevations.

The auditor transforms catalog GPX longitude/latitude as WGS84 to EPSG:25831 with the already-installed `proj4` package before computing horizontal differences. Horizontal and vertical thresholds in each evidence record are review flags, not assertions of source accuracy. A catalog altitude without a declared datum is explicitly marked unreferenced, and a numeric delta is only an indication.

The tests in `tests/peakCatalogAudit.test.mjs` use controlled synthetic records. They verify the audit logic only; they do not validate source facts or additional real-world peaks.
