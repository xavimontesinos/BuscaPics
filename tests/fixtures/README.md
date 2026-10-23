# Synthetic tiled GeoTIFF fixture

`synthetic-tiled-elevation.tif` is generated exclusively for tests through the libtiff 4.5 C API. It contains no real geographic elevations or coordinates. The fixture is 67 × 51 unsigned 16-bit samples in 16 × 16 uncompressed tiles, with EPSG:25831 GeoKeys, a 10 m affine grid, and nodata value 65535. The partial right and bottom tiles include padding as required by tiled TIFF storage.

Each valid pixel `(column, row)` uses the deterministic value `1000 + floor(column / 16) * 100 + floor(row / 16) * 1000 + row * 3 + column`, except pixel `(33, 25)`, which is nodata. The TIFF was independently reopened with Pillow/libtiff 10.2 and geotiff.js 3.0.5. Image size, tile layout, GeoKeys, nodata, georeferencing, and sampled values were checked before adding it here.
