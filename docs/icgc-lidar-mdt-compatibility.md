# Prova de compatibilitat del MDT LiDAR ICGC de 5 m

## Producte i metadades oficials

Producte: **Model d’elevacions del terreny de Catalunya 5 m - 2021-2023**, identificador `model-elevacions-terreny-lidar-catalunya-5m-2021-2023`. La fitxa IDEC indica dades d’origen entre el 24-04-2021 i el 20-11-2023; el registre es va actualitzar el 06-10-2026. La fitxa tècnica és la versió `v1r0`, publicada el 02-09-2026.

- **Contingut:** MDT de terreny derivat de LiDAR, sense edificis ni vegetació; malla regular de 5 m.
- **Llicència:** Creative Commons Reconeixement 4.0 Internacional (CC BY 4.0). Atribució: “Institut Cartogràfic i Geològic de Catalunya (ICGC)”.
- **CRS horitzontal:** ETRS89 / UTM 31N, EPSG:25831; ordre Easting (X), Northing (Y), metres.
- **Referència vertical:** altituds ortomètriques respecte del geoide **EGM08D595**, en metres. El camp IDEC anomenat “Vertical datum” és buit, però l’identificador del sistema de referència del mateix registre i la fitxa tècnica del producte especifiquen EGM08D595 explícitament. La configuració de la prova usa aquesta denominació; no s’hi aplica conversió vertical.
- **Format i valors:** COG GeoTIFF de 32 bits float; nodata `-9999`.
- **Cobertura del COG:** tot Catalunya. Capçalera llegida: 53.800 × 52.400 píxels, 5 m/píxel; extensió X 259.000–528.000 i Y 4.487.000–4.749.000 en EPSG:25831. Transformació observada: origen superior esquerre (259.000, 4.749.000), pas X +5 m i pas de fila Y −5 m.
- **Mida del COG remot:** 4.369.565.862 bytes. El servidor anuncia `Accept-Ranges: bytes`.

### Fonts oficials

- [Registre IDEC del MDT LiDAR 5 m 2021-2023](https://catalegs.ide.cat/geonetwork/hub-litoral/api/records/model-elevacions-terreny-lidar-catalunya-5m-2021-2023): títol, dates, resolució, cobertura, CC BY 4.0, COG i referència EGM08D595.
- [Especificacions tècniques del model d’elevacions territorial, v1r0](https://datacloud.ide.cat/especificacions/model-elevacions-terreny-territorial-v1r0-20260902.pdf): EPSG:25831 i eixos X/Y, EGM08D595, Float32 i nodata −9999.
- [Condicions de reutilització de l’ICGC](https://www.icgc.cat/ca/LICGC/Informacio-publica/Transparencia/Reutilitzacio-de-la-informacio): llicència CC BY 4.0 i requisit de citar la font.
- [Fitxa de productes d’elevacions de l’ICGC](https://www.icgc.cat/ca/Geoinformacio-i-mapes/Dades-i-productes/Elevacions/Elevacions-territorial/Models-delevacions): distingeix MDT i MDS i descriu la cobertura i els productes LiDAR.
- [Centre del Parc Natural del Cadí-Moixeró a Bagà](https://parcsnaturals.gencat.cat/ca/detalls/Article/01.-Centre-del-Parc): punt de referència publicat (42.25355, 1.85821).
- [Fitxa de zona de bany de l’embassament de la Baells, ACA](https://info.aca.gencat.cat/ca/aca/informacio/platgescat/perfils-platges/08299A.pdf): punt de control ambiental en coordenades UTM (405842, 4669144), utilitzat per localitzar una tesela pròxima amb nodata.

## Retall extern de prova

El COG oficial es va llegir el 23-10-2026 per HTTP Range. Es va extreure una finestra 64 × 64 centrada en el píxel que conté el punt publicat del Centre del Parc. El fitxer temporal és `/tmp/buscapics-icgc-baga-cadi-mdt5-64x64.tif` (17.384 bytes) i no forma part del repositori ni del bundle.

- Finestra d’origen del COG: columnes `[29.331, 29.395)` i files `[14.056, 14.120)`.
- Extensió del retall: X 405.655–405.975 i Y 4.678.400–4.678.720, EPSG:25831; 320 × 320 m a 5 m/píxel.
- Transformació observada al retall: origen superior esquerre (405.655, 4.678.720), pas X +5 m i pas de fila Y −5 m.
- Operació: finestra de lectura sense re-mostreig ni canvi dels valors Float32 o les altituds. Es va escriure un TIFF local d’una sola banda, sense compressió, amb la georeferenciació ajustada a l’origen del retall i `GDAL_NODATA=-9999`. Per tant, el retall no conserva el tiling ni la compressió COG d’origen; la lectura remota del COG original es valida separadament a continuació.
- El retall no conté píxels nodata. També es va escanejar la tesela d’origen 512 × 512 llegida per a Bagà i no s’hi va trobar cap −9999; la codificació nodata està confirmada per la fitxa i les metadades del fitxer, però la interpretació d’un píxel nodata real continua pendent d’un altre sector.

## Validació efectuada

1. `GeoTiffRasterBlockReader` va obrir el retall Float32 i va validar dimensions, EPSG:25831, transformació afí, resolució i nodata.
2. `PreparedRasterElevationProvider` va retornar elevació al punt del centre i a prop dels dos extrems del retall, i `outside-coverage` per un punt situat fora. Al punt publicat del Centre del Parc va retornar aproximadament 799,8795 m per interpolació bilineal dels quatre píxels veïns.
3. Es van comparar amb Pillow/libtiff els valors de tres píxels del TIFF local: centre `799,739990234375`, prop de l’angle superior esquerre `817,1829833984375` i prop de l’angle inferior dret `775,5419921875`. Pillow també va confirmar dimensions, Float32, EPSG:25831, geotransformació i `-9999`.
4. La prova activable `BUSCAPICS_ICGC_MDT_CLIP=/tmp/buscapics-icgc-baga-cadi-mdt5-64x64.tif node --test tests/geoTiffRasterBlockReader.test.mjs` exerceix el retall real amb el lector i el proveïdor. La prova no s’executa a la suite normal si no s’indica la variable d’entorn.
5. També es va obrir el COG remot original amb `GeoTiffRasterBlockReader` i es va consultar el punt de Bagà. La prova activable és:

   ```sh
   BUSCAPICS_ICGC_MDT_URL='https://datacloud.icgc.cat/datacloud/model-elevacions-terreny/tif_unzip/model-elevacions-terreny-lidar-catalunya-5m-2021-2023.tif' node --test --test-name-pattern='official ICGC COG' tests/geoTiffRasterBlockReader.test.mjs
   ```

   El registre HTTP va mostrar 12 respostes `206 Partial Content`: 11 rangs de capçalera/IFD/metadades (33.420 bytes) i un rang de tesela (646.055 bytes, interval `bytes=1932423739-1933069793`). Total rebut: **679.475 bytes de 4.369.565.862**; no es va descarregar el COG sencer. Els rangs petits de metadades poden repetir bytes solapats, per això la suma representa bytes de resposta, no bytes únics del fitxer.

## Contrast independent amb Pillow/libtiff

No hi havia GDAL, Rasterio ni pyproj instal·lats. S’ha utilitzat Pillow 10.2 amb libtiff, independent de `geotiff.js` i del lector de BuscaPics. Per llegir el COG original sense descarregar-lo s’ha obert amb un flux Python de només lectura que respon a `seek/read` mitjançant HTTP Range; s’ha desactivat el límit preventiu de mida de Pillow només per llegir metadades, sense descodificar la imatge. Pillow va llegir tres rangs de 65.536 bytes (196.608 bytes en total) i va confirmar:

- 53.800 × 52.400, mode float, 32 bits, una banda, compressió TIFF 8 (Deflate), tiles de 512 × 512.
- EPSG:25831 al `GeoKeyDirectory`, raster type `PixelIsArea`, unitat lineal 9001 (metre).
- `ModelPixelScale=(5,5,0)`, `ModelTiepoint=(0,0,0,259000,4749000,0)` i `GDAL_NODATA=-9999`.

Pillow va obrir també els dos TIFF locals. Les dimensions, escala, tiepoint, GeoKeys i nodata coincideixen exactament amb les metadades que va llegir `GeoTiffRasterBlockReader`: diferència **0** per a tots aquests camps. Amb PixelIsArea, el centre del píxel (columna `c`, fila `r`) es calcula com `X=originX+(c+0.5)×5`, `Y=originY-(r+0.5)×5`. Per exemple, al retall de Bagà el centre del píxel (32,32) és (405817.5, 4678557.5); els extrems de cobertura són (405655, 4678720) i (405975, 4678400). La transformació afí independent i la del lector concorden exactament.

Els controls de píxel de Bagà es van llegir amb Pillow i comparar amb `PreparedRasterElevationProvider` després de preparar el bloc. El límit d’acceptació de cada valor va ser 0,001 m; això compara dos lectors del mateix Float32 i **no** representa la precisió altimètrica del producte.

| Punt de control | Coordenada projectada o índex | Pillow/libtiff (m) | BuscaPics (m) | Diferència (m) |
|---|---|---:|---:|---:|
| Centre, píxel (32,32) | (405817.5, 4678557.5) | 799.739990234375 | 799.7399902343822 | +0.0000000000072 |
| Prop de vora superior esquerra, píxel (1,1) | (405662.5, 4678712.5) | 817.1829833984375 | 817.1829833984364 | −0.0000000000011 |
| Prop de vora inferior dreta, píxel (62,62) | (405967.5, 4678407.5) | 775.5419921875 | 775.5419921874559 | −0.0000000000441 |
| Cantonada exterior superior esquerra | (405655, 4678720) | 819.4299926757812 | 819.4299926757812 | 0 |
| Cantonada exterior inferior dreta | (405975, 4678400) | 774.9509887695312 | 774.9509887695312 | 0 |
| Límit entre columnes 31/32, fila 32 | (405815, 4678557.5) | 799.4094848632812 | 799.4094848627066 | −0.0000000005747 |

Al punt publicat del Centre del Parc (42.25355, 1.85821), Proj4js dóna (405815.371256, 4678559.288195) en EPSG:25831. Pillow va donar 800.6729736328125, 800.6079711914062, 799.0789794921875 i 799.739990234375 m als quatre píxels veïns; la seva bilineal és 799.8795356137363 m. El proveïdor va retornar el mateix resultat dins de 0,001 m.

Aquestes comprovacions validen l’interpretació local de l’afí, els centres i vores de píxel i la consistència de lectura. No són punts topogràfics independents ni demostren la precisió geodèsica global de Proj4js o del MDT.

## Nodata real

Es va consultar el bloc (57,31), 512 × 512, que inclou el punt de control ambiental de l’ACA a la Baells (405842, 4669144). Al bloc es van trobar cel·les `-9999`; una d’elles és a la columna 29.425, fila 16.163 del COG, amb centre de píxel (406127.5, 4668182.5). És aproximadament a 1,0 km del punt de control. Es va extreure al retall temporal `/tmp/buscapics-icgc-baells-nodata-64x64.tif`, 64 × 64, finestra d’origen `[29393,29457) × [16131,16195)`, origen afí (405965, 4668345). Conté 426 cel·les nodata.

Pillow/libtiff va confirmar `-9999` a (32,32) i valors vàlids 604.0189819335938, 603.52001953125 i 603.9539794921875 als altres tres veïns de la quadrícula bilineal. La prova real del lector i proveïdor comprova que la consulta al centre nodata retorna `missing`, que una consulta vàlida veïna retorna 604.0189819335938 m, i que la interpolació a (31.5,31.5), que necessita els quatre veïns inclòs el nodata, també retorna `missing`.

Prova reproduïble local:

```sh
BUSCAPICS_ICGC_MDT_CLIP=/tmp/buscapics-icgc-baga-cadi-mdt5-64x64.tif \
BUSCAPICS_ICGC_NODATA_CLIP=/tmp/buscapics-icgc-baells-nodata-64x64.tif \
node --test --test-name-pattern='ICGC' tests/geoTiffRasterBlockReader.test.mjs
```

## Abast i limitacions

- La lectura remota prova el bloc natiu de 512 × 512 del COG original; el retall local de 64 × 64 es va generar a partir d’una finestra d’aquesta tesela i prova el flux local del lector/proveïdor.
- Pillow verifica independentment les etiquetes i els valors del retall creat i les etiquetes del COG remot. No s’ha validat la georeferenciació amb un punt geodèsic de control independent ni l’elevació amb un punt de cota de referència independent. La ubicació del Centre del Parc i el punt de l’ACA són punts publicats, no controls topogràfics del MDT.
- No s’ha calculat visibilitat, no s’ha connectat el MDT al motor de línia de visió ni al mapa, i no s’ha declarat garantida la precisió de visibilitat.
- La prova nodata real cobreix un clúster d’aigua d’un únic bloc. Caldran controls addicionals en terreny i altres llocs nodata per valorar el comportament del producte a escala regional.

## Prova opcional de línia de visió sobre el retall real

El retall de Bagà permet provar la integració del motor amb dades reals sense prendre altituds del catàleg. La prova està separada de la suite ordinària i s’executa explícitament:

```sh
node --test tests/manual/icgcRealVisibility.optional.mjs
```

Es fan consultes al terreny als dos extrems i al punt intermedi d’un tram de 10 m al voltant del píxel (32,32). L’observador i l’objectiu tenen alçades explícites de 50 m sobre el terreny; les cotes del terreny provenen del retall amb referència EGM08D595. El tram real resulta despejat per aquesta configuració sintètica d’alçades. Una segona execució eleva artificialment 100 m el punt intermedi i comprova una obstrucció controlada; no és una afirmació que el MDT real obstrueixi aquesta vista.

Aquesta prova confirma el flux de mostreig curt amb el retall i el tractament de l’obstrucció sintètica. No valida punts de control geodèsics independents, no mesura la precisió altimètrica ni estableix visibilitats reals d’objectius del catàleg. Necessita el fitxer extern `/tmp/buscapics-icgc-baga-cadi-mdt5-64x64.tif`.
