# ICGC Pica d’Estats geometry probe

Consulted: 2026-10-24T09:10:15.151Z
Official code: 271064006 (FID 62)

Layer: 100_CIMS; esriGeometryPoint; CRS from extent: EPSG:25831.
Fields: FID, Nom, Codi_cim. Query formats: JSON, geoJSON, PBF.

## REST queries

| Request | HTTP | Matching features | Geometry returned | CRS in response |
| --- | ---: | ---: | --- | --- |
| [query-by-codi-cim-json](https://maps.icgc.cat/vector02/rest/services/icc_100cims_v_r/MapServer/0/query?where=Codi_cim%3D271064006&outFields=*&returnGeometry=true&outSR=25831&f=json) | 200 | 1 | no | none |
| [query-by-fid-json](https://maps.icgc.cat/vector02/rest/services/icc_100cims_v_r/MapServer/0/query?objectIds=62&outFields=*&returnGeometry=true&outSR=25831&f=json) | 200 | 1 | no | none |
| [query-by-codi-cim-geojson](https://maps.icgc.cat/vector02/rest/services/icc_100cims_v_r/MapServer/0/query?where=Codi_cim%3D271064006&outFields=*&returnGeometry=true&outSR=25831&f=geojson) | 200 | 1 | no | EPSG:25831 |
| [geoserveis-query-by-codi-cim-json](https://geoserveis.icgc.cat/vector02/rest/services/icc_100cims_v_r/MapServer/0/query?where=Codi_cim%3D271064006&outFields=*&returnGeometry=true&outSR=25831&f=json) | 200 | 1 | no | none |
| [geoserveis-query-by-codi-cim-geojson](https://geoserveis.icgc.cat/vector02/rest/services/icc_100cims_v_r/MapServer/0/query?where=Codi_cim%3D271064006&outFields=*&returnGeometry=true&outSR=25831&f=geojson) | 200 | 1 | no | EPSG:25831 |

All REST variants returned the Pica attributes but no geometry. The GeoJSON response declared EPSG:25831 while its `geometry` was null; JSON responses also omitted geometry and response CRS. No coordinates were interpreted from those responses.

## Official WMS identify

Capabilities: [request](https://geoserveis.icgc.cat/icc_100cims/wms/service?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities); formats advertised for GetFeatureInfo: application/vnd.esri.wms_raw_xml, application/vnd.esri.wms_featureinfo_xml, application/vnd.ogc.wms_xml, text/xml, text/html, text/plain.
Request: [GetFeatureInfo text/xml](https://geoserveis.icgc.cat/icc_100cims/wms/service?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=0&QUERY_LAYERS=0&STYLES=&CRS=EPSG%3A25831&BBOX=368685.43%2C4725050.33%2C368735.43%2C4725100.33&WIDTH=101&HEIGHT=101&I=50&J=50&INFO_FORMAT=text%2Fxml&FEATURE_COUNT=5).
At the official highest-point coordinate (368710.43, 4725075.33, EPSG:25831), GetFeatureInfo returned Pica d'Estats, code 271064006 (FID 62). It returned no geometry or point coordinates.

## Summit and benchmark in the official measurement sheet

Highest natural summit: (368710.43, 4725075.33) EPSG:25831; 3143.45 m.
Geodetic nail 271064005: (368712, 4725071.85) EPSG:25831; 3143.09 m.
The official fiche reports +0.37 m geometric levelling from the nail to the highest point. Since the service returned no coordinates, its point cannot be classified as summit or nail, and no service-geometry distance comparison is possible.

**Conclusion:** no vector geometry was recovered. The WMS result confirms a feature with the correct official code is identified at the fiche summit query point, but it does not expose the feature coordinate. This is not enough to accept or update a catalog coordinate.

**Next official step:** request a downloadable/exportable geometry for layer `100_CIMS` from ICGC, including confirmation whether `Codi_cim=271064006` represents the highest point or the geodetic nail. Retain the ficha’s two explicit points as the Pica reference.

Sources: [ICGC REST layer metadata](https://maps.icgc.cat/vector02/rest/services/icc_100cims_v_r/MapServer/0), [ICGC WMS 100 peaks](https://www.icgc.cat/en/Geoinformation-and-Maps/Online-services-Geoservices/WMS-Points-Interest/WMS-100-peaks), [Pica measurement sheet](https://icgc-web-pro.s3.eu-central-1.amazonaws.com/produccio/s3fs-public/271064006_66559.pdf).

