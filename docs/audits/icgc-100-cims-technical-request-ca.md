# Esborrany de consulta tècnica a l’ICGC

**Estat:** esborrany intern; no enviat.

**Assumpte:** Geometries, significat i referències de la capa 100 Cims

Benvolgut equip de l’ICGC,

Estem integrant la capa oficial **100 Cims** en una eina cartogràfica i voldríem confirmar la naturalesa i la disponibilitat de les seves geometries i cotes.

Hem consultat la capa REST `icc_100cims_v_r/MapServer/0`. Per a Pica d’Estats, les consultes per codi `271064006` i FID `62`, incloses les respostes JSON i GeoJSON amb `returnGeometry=true`, retornen els atributs però una geometria nul·la. La identificació WMS a la ubicació de la cima retorna el nom i els identificadors, però no les coordenades.

Com a exemple, la fitxa oficial de mesurament de Pica d’Estats publica per al punt més alt les coordenades **EPSG:25831, E 368710,43 / N 4725075,33** i una cota de **3143,45 m**. La mateixa fitxa diferencia el clau geodèsic **271064005** (E 368712,00 / N 4725071,85; 3143,09 m) i indica una diferència de nivell de +0,37 m fins al punt més alt. En canvi, el nostre catàleg conté provisionalment 42.667142, 1.397888 i 3074,6 m, extrets d’un GPX sense procedència ni datum vertical confirmats. La posició transformada d’aquest registre queda aproximadament a 21,43 m de la coordenada publicada per al punt més alt. **No considerem verificat el registre del catàleg ni podem determinar només amb aquesta comparació quin punt representa.**

Ens podríeu aclarir els punts següents?

1. Hi ha una exportació oficial descarregable de les geometries de 100 Cims (preferiblement GeoJSON, GeoPackage o Shapefile) que inclogui un identificador estable, el nom i els atributs? Si existeix, agrairíem l’enllaç i la documentació d’ús.
2. Què representa exactament la geometria associada a cada `Codi_cim`: el punt topogràfic més alt, un clau geodèsic, un punt representatiu o un altre element? Quan hi ha més d’un punt, com s’hi relacionen els identificadors?
3. En el cas de Pica d’Estats (`Codi_cim` `271064006`, FID `62`), quina geometria o punt identifica el registre? Correspon al punt més alt o al clau? Si la capa no publica aquesta geometria, quina font oficial recomaneu per obtenir la posició del punt més alt?
4. Quin és el CRS complet de les geometries, incloent-hi l’ordre dels eixos i la precisió? Quina és la data o versió de captura i quina font o metodologia s’ha emprat per crear-les?
5. Hi ha cotes oficials associades a cada cima? Per a cada cota, podríeu indicar el punt mesurat, el mètode i la referència vertical explícita (per exemple, altura el·lipsoïdal o ortomètrica i datum/geoid emprat)? En els casos amb clau i punt més alt diferenciats, hi ha mesura o desnivell documentat entre ells?
6. Quina és la via estable i documentada per consultar o descarregar aquestes dades? Si el servei REST hauria de retornar geometria, podríeu indicar els paràmetres admesos i aclarir per què les consultes amb `returnGeometry=true` retornen geometria nul·la? També ens serien útils un exemple de petició i resposta i les regles de paginació, si escau.
7. Quines condicions de llicència i atribució hem de respectar en reutilitzar l’exportació o les cotes?

L’objectiu és conservar la traçabilitat i no donar per bones coordenades o altituds sense conèixer el punt representat i el seu sistema de referència. Gràcies per qualsevol documentació o indicació que ens pugueu facilitar.

Cordialment,

Equip de BuscaPics

## Referències consultades

- Servei REST de la capa: [MapServer 100 Cims](https://maps.icgc.cat/vector02/rest/services/icc_100cims_v_r/MapServer/0)
- Exemple de consulta GeoJSON per Pica d’Estats: [consulta amb geometria sol·licitada en EPSG:25831](https://maps.icgc.cat/vector02/rest/services/icc_100cims_v_r/MapServer/0/query?where=Codi_cim%3D271064006&outFields=*&returnGeometry=true&outSR=25831&f=geojson)
- Documentació del servei: [WMS 100 Cims de l’ICGC](https://www.icgc.cat/en/Geoinformation-and-Maps/Online-services-Geoservices/WMS-Points-Interest/WMS-100-peaks)
- Fitxa oficial: [Mesurament de Pica d’Estats (PDF)](https://icgc-web-pro.s3.eu-central-1.amazonaws.com/produccio/s3fs-public/271064006_66559.pdf)
- Registre del sondeig i les peticions provades: [sondeig de geometria de Pica d’Estats](icgc-pica-geometry-probe.md)
