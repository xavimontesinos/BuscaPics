# BuscaPics — Contexto del proyecto

**Actualizado:** 30 de octubre de 2026  
**Repositorio observado:** `xavimontesinos/BuscaPics`, rama `master`, remoto `origin` en GitHub.  
**Estado del producto:** prototipo web en desarrollo. Este documento resume el contexto conocido; las fuentes enlazadas contienen el detalle técnico y las evidencias.

## 1. Qué es BuscaPics

BuscaPics es un visor recreativo de cartografía topográfica. Permite explorar un mapa, escoger una posición de observación y conocer qué cimas del catálogo aparecen visibles en una dirección determinada. La interfaz principal es el mapa.

El proyecto no debe presentarse como instrumento de navegación ni como medición topográfica. El catálogo de cimas conserva coordenadas y altitudes de origen GPX todavía no verificadas. Los resultados de visibilidad son orientativos y dependen de esa incertidumbre, de la resolución del MDT y de las aproximaciones descritas más abajo.

Los requisitos funcionales generales están en [docs/requisitos.md](requisitos.md). Ese documento es un borrador y puede contener ideas aún no implementadas o controles provisionales.

## 2. Tecnologías y organización

- TypeScript, React y Vite.
- MapLibre GL para el mapa y sus capas GeoJSON.
- `geotiff` para leer GeoTIFF/COG mediante peticiones HTTP parciales.
- Proj4 para transformar coordenadas geográficas a la cuadrícula proyectada del MDT.
- Pruebas con el ejecutor integrado `node --test`; no se necesita un framework adicional.

Las responsabilidades están separadas principalmente así:

- `src/App.tsx`: estado de aplicación, observador, orientación, filtros, sesión/caché de visibilidad y coordinación entre controles.
- `src/components/`: controles del mapa, filtro de cimas, control de orientación y viewport MapLibre.
- `src/domain/peaks.ts`: tipos y adaptación del catálogo a GeoJSON.
- `src/domain/orientation.ts` y `src/domain/gps.ts`: lógica independiente de sensores y reglas de publicación de posiciones.
- `src/domain/visibility/`: geometría, sector de visión, motor LOS, lector GeoTIFF, transformaciones, proveedor de terreno, elevación del observador y manejo de resultados obsoletos.
- `src/map/`: configuración del estilo y las capas, recursos del mapa y posicionamiento de cámara alrededor del observador.
- `workers/icgc-mdt-proxy/`: Worker de producción preparado para solucionar CORS del MDT.

Comandos habituales definidos en `package.json`:

```sh
npm run dev
npm test
npm run build
npm run preview
```

El código de producción debe permanecer en inglés. Las explicaciones y documentación del proyecto pueden escribirse en español o catalán según el documento.

## 3. Comportamiento actual de mapa y observación

- El mapa topográfico usa el servicio WMTS de l’ICGC configurado en `src/map/mapConfig.ts`.
- La selección manual del observador se realiza con pulsación prolongada sobre el mapa.
- El observador conserva sus coordenadas geográficas reales aunque la cámara se recentre, rote o cambie de zoom.
- La cámara mantiene al observador aproximadamente al 75 % de la altura visible. Los cambios de rumbo y zoom se realizan anclando la cámara al observador para evitar desplazamientos acumulativos.
- El rumbo usa grados desde el norte, en sentido horario, coherentes con MapLibre. La brújula se suaviza y el cruce 359°/0° se trata como giro corto.
- Hay modo automático con sensores cuando el dispositivo los permite, orientación manual y acción explícita para volver al modo automático. La petición de permiso se inicia a partir de la acción del usuario; Safari/iOS requiere HTTPS y puede exponer `webkitCompassHeading`.
- El GPS se activa explícitamente, filtra actualizaciones de poco movimiento y conserva la selección manual como alternativa. Se distinguen errores de permiso, señal, timeout y datos inválidos.
- Los filtros de catálogo disponibles son `100 CIMS` y `100 CIMS essencials`; hay ficha/selección de cima y resaltado propio.

La disponibilidad y el comportamiento efectivos de GPS y brújula dependen del navegador y el dispositivo. No hay constancia en este contexto de una validación física en un iPhone real.

## 4. Visibilidad recreativa

### Filtros y cálculo

- Campo de visión horizontal fijo de 90°, centrado en el rumbo de observación; se incluyen los límites de ±45°.
- Radios configurables de 10, 25, 50 y 100 km; 50 km es el valor predeterminado.
- Primero se filtra por distancia, luego por orientación; las cimas excluidas no necesitan preparar trayectos ni consultar el MDT.
- Las cimas elegibles se procesan de cerca a lejos y se publican progresivamente. Los fallos de una cima se aíslan. Al cambiar observador, rumbo o radio, los resultados obsoletos se cancelan o descartan.
- Los resultados geométricos por cima se conservan para reutilizarlos cuando solo rota el rumbo. Al cambiar el observador o la elevación que define la sesión, se invalidan los resultados incompatibles. Las rutas reutilizan la caché acotada de bloques del lector del MDT.
- La altura ocular es 5,00 m sobre el terreno. Se suma una sola vez a la elevación del MDT del observador y solo en el extremo inicial de la línea de visión. Si esa elevación no está disponible, el resultado es indeterminado.

### Estados y representación

Estados transmitidos a GeoJSON y expresiones de MapLibre:

- `visible`: el punto representativo de la cima se evalúa despejado.
- `partiallyVisible`: el punto representativo está obstruido, pero al menos uno de los puntos auxiliares se evalúa visible.
- `occluded`: el punto representativo y los puntos auxiliares analizados están obstruidos, con información suficiente.
- `indeterminate`: faltan datos, referencias compatibles o cálculos fiables.
- `outsideRadius` y `outsideFov`: la cima se excluyó de la evaluación por los filtros correspondientes; no equivale a oculta.

La aproximación de visibilidad parcial evalúa el punto del catálogo y cuatro posiciones geodésicas a 20 m al norte, este, sur y oeste. La cima no tiene necesariamente un contorno o polígono real en el catálogo. Los cuatro puntos no reconstruyen el relieve de la cumbre ni permiten calcular un porcentaje visible. En ellos se consulta elevación real del MDT; no se sustituyen nodata ni errores por valores inventados. El punto original usa provisionalmente la cota del catálogo como objetivo.

Detalles: [aproximación de visibilidad parcial](development/partial-summit-visibility.md).

## 5. MDT del ICGC y referencias

Fuente oficial usada por el motor:

`https://datacloud.icgc.cat/datacloud/model-elevacions-terreny/tif_unzip/model-elevacions-terreny-lidar-catalunya-5m-2021-2023.tif`

- Producto: modelo digital del terreno LiDAR de Catalunya, 5 m, 2021–2023.
- Formato: COG GeoTIFF consultado con HTTP Range; el cliente lee metadatos y bloques requeridos, no descarga el archivo entero.
- CRS horizontal: EPSG:25831.
- Referencia vertical declarada para el producto: EGM08D595, ortométrica.
- Unidades y nodata: metros; `-9999` es el valor nodata documentado.
- El adaptador transforma coordenadas WGS84 (EPSG:4326) a EPSG:25831. No se debe comparar cotas si las referencias verticales no son compatibles.
- El desarrollo local usa el proxy Vite `/__icgc_mdt__`, que preserva Range y respuestas 206.

Se validó el lector con bloques remotos reales y recortes temporales de Bagà y la Baells. La lectura remota consumió rangos parciales y no el COG completo. Hay pruebas independientes con Pillow/libtiff, nodata real y una prueba opcional de LOS donde el terreno procede del MDT pero las alturas de observador/objetivo y la obstrucción de control son sintéticas. Esto valida partes del flujo técnico, pero no constituye una validación geodésica de la visibilidad de cimas reales.

El informe completo incluye resolución, metadatos, lecturas, nodata, comandos de reproducción y límites: [compatibilidad MDT ICGC](icgc-lidar-mdt-compatibility.md). Para el proxy local: [proxy Vite del MDT](development/icgc-mdt-vite-proxy.md).

### CORS y producción

La web publicada en GitHub Pages no puede ejecutar el proxy de Vite. El ICGC devuelve respuestas 206 pero no permite por CORS el origen `https://xavimontesinos.github.io`; por ello el cliente no puede leer el cuerpo aunque la petición parcial exista.

Se preparó un Cloudflare Worker de recurso fijo, no un proxy abierto:

- Solo acepta `/mdt.tif`, `GET` y `OPTIONS`.
- CORS se concede únicamente a `https://xavimontesinos.github.io`.
- El destino upstream está fijado al TIFF oficial en el código; la petición no puede seleccionar otro host.
- Exige un único rango de bytes explícito, limitado a 16 MiB, y transmite la respuesta parcial sin almacenar o bufferizar el TIFF.
- Las compilaciones de Pages leen `VITE_ICGC_MDT_WORKER_URL`; el workflow espera la variable de Actions `ICGC_MDT_WORKER_URL` para producción. El desarrollo sigue usando el proxy de Vite.
- No se ha desplegado el Worker ni se ha publicado la aplicación desde el agente. Hace falta desplegar Worker, probar OPTIONS/Range, configurar la variable de GitHub y entonces ejecutar el flujo de Pages.

Instrucciones completas: [despliegue en GitHub Pages y proxy Cloudflare](development/github-pages.md). La documentación oficial actual del plan gratuito indica 100.000 solicitudes/día, 10 ms de CPU por petición, 128 MB de memoria y 50 subpeticiones por invocación; cada petición de rango cuenta como solicitud. Consultar los [límites vigentes de Workers](https://developers.cloudflare.com/workers/platform/limits/) antes de un uso intensivo.

## 6. Catálogo de cimas: incertidumbres importantes

- El catálogo que la aplicación carga es `public/data/100-cims-catalog.json` (528 registros). El material de importación provino de GPX cuyo atributo creator es `ChatGPT`; su procedencia original, datum vertical, precisión y licencia no están confirmados.
- El informe de importación contabiliza 528 cimas, 150 esenciales y algunos nombres repetidos con altitudes distintas. Los originales GPX no se alteraron en la importación. No se deben modificar nombres, coordenadas o altitudes sin autorización expresa y evidencia trazable.
- Los valores `elevationMeters`/`elevationM` del GPX no deben tratarse como alturas absolutas compatibles con EGM08D595 mientras no se confirme el datum. Por la misma razón, las cimas de catálogo no tienen visibilidad verificada topográficamente.
- Hay un flujo separado de auditoría del catálogo, con identificadores estables de BuscaPics, evidencias revisables y estados `confirmado`, `discrepante`, `no_verificable`. No se aceptan emparejamientos solo por similitud nominal y no se sustituye el catálogo de producción.
- Último informe revisado: de 150 esenciales, 0 confirmadas, 1 discrepante y 149 no verificables. El caso Pica d’Estats figura como discrepante: la posición del GPX está a unos 21,43 m del punto de cima oficial identificado; la diferencia de altitud es solo indicativa porque el GPX carece de referencia vertical confirmada.
- El servicio ICGC `100_CIMS` devolvió para Pica d’Estats el nombre/código (`Codi_cim=271064006`, `FID=62`) pero sus consultas de entidades devolvieron geometría nula. La ficha oficial de medición distingue el punto más alto y un clavo geodésico próximo; esos puntos no deben confundirse. La geometría del servicio sigue sin ser evidencia espacial recuperable en el sondeo documentado.
- La auditoría no cubre automáticamente Andorra o Catalunya Nord, ni presume que el ICGC tenga cobertura de todas las cimas.
- El catálogo no debe redistribuirse públicamente hasta aclarar licencia y procedencia GPX.

Documentos y artefactos separados:

- [Informe de importación](100-cims-import-report.md)
- [Auditoría del catálogo](audits/peak-catalog-audit.md) y [datos JSON de auditoría](audits/peak-catalog-audit.json)
- [Sondeo de geometría oficial de Pica d’Estats](audits/icgc-pica-geometry-probe.md)
- [Revisión del servicio oficial 100 Cims](audits/icgc-100-cims-service-review.json)
- [Borrador técnico en catalán para el ICGC](audits/icgc-100-cims-technical-request-ca.md)

## 7. Publicación

La preparación de GitHub Pages está en `.github/workflows/deploy-pages.yml`. La base de Vite se deriva del nombre de repositorio para publicar bajo `/BuscaPics/`; localmente queda en `/`. El workflow instala con `npm ci`, ejecuta pruebas y compila; el despliegue solo se produce en el evento configurado y requiere Pages con fuente **GitHub Actions** y el Worker URL.

No se deben hacer commits, push ni despliegue salvo autorización expresa del propietario. En el último contexto confirmado no se había desplegado el Worker ni publicado el sitio.

## 8. Qué está probado y qué falta

### Pruebas automatizadas

La suite cubre lógica sintética de geometría, azimut/FOV, LOS, nodata, referencias verticales, proveedor raster, publicación por etapas, descarte de peticiones obsoletas, integración GeoJSON/estilos, GPS, orientación y proxy. El Worker incorpora pruebas simuladas para CORS, paths/métodos, rangos, 206, 416 y errores upstream. Estas pruebas controladas prueban el código, no la disponibilidad en Cloudflare.

Comprobaciones habituales:

```sh
npm test
npm run build
node --test tests/manual/icgcRealVisibility.optional.mjs
```

El último comando es opcional y requiere el TIFF de prueba externo en `/tmp`; su escenario de obstáculo y alturas es sintético aunque las elevaciones de terreno leídas sean del MDT real.

### Pendientes conocidos

1. Desplegar y probar el Worker real con el origen GitHub Pages y un Range pequeño.
2. Configurar `ICGC_MDT_WORKER_URL` en Actions y publicar Pages manualmente cuando se autorice.
3. Verificar GPS y brújula en un iPhone/Safari real (HTTPS, permisos y sensores).
4. Verificar visualmente el mapa y el cálculo con el Worker productivo, datos reales y observaciones de campo; distinguirlo de los tests sintéticos.
5. Continuar la verificación oficial del catálogo, su CRS, datum, identidad de los puntos y licencia antes de considerar sus cotas fiables.
6. El requisito de uso sin conexión figura en los objetivos de producto, pero no debe considerarse satisfecho por el mero uso de un COG remoto o GitHub Pages.

## 9. Reglas de colaboración relevantes

- Antes de cambios importantes, explicar un plan y esperar aprobación del propietario.
- Implementar solo la tarea autorizada; conservar cambios existentes y evitar refactorizaciones ajenas.
- No inventar coordenadas, altitudes, licencias, datums ni resultados reales.
- Separar los datos oficiales de los sintéticos y documentar procedencia y limitaciones.
- No afirmar pruebas visuales o en dispositivos si no se ejecutaron realmente.
- No hacer commits ni publicar sin autorización.
