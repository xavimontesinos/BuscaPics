# Proxy de desenvolupament del MDT de l’ICGC

El servidor de desenvolupament de Vite publica el COG a la ruta local `/__icgc_mdt__` i la reenvia al GeoTIFF oficial. El lector del navegador usa aquesta ruta només en mode desenvolupament; les peticions al proxy conserven `Range` i la resposta `206` amb `Content-Range`, `Content-Length` i `Content-Type`. El proxy transmet el cos de la resposta parcial i no descarrega el fitxer complet per iniciativa pròpia.

Per comprovar-ho amb Vite en marxa (`npm run dev`), demana només els primers 16 bytes:

```sh
curl -i -H 'Range: bytes=0-15' http://localhost:5173/__icgc_mdt__
```

La resposta esperada és `206 Partial Content`, amb `Content-Range: bytes 0-15/4369565862`, `Content-Length: 16` i `Content-Type: image/tiff`. També es pot executar la prova focalitzada, que usa un servidor upstream local simulat i no depèn de la xarxa de l’ICGC:

```sh
node --test tests/icgcMdtProxy.test.mjs
```

El proxy només s’inclou al servidor de desenvolupament de Vite. No canvia el CRS EPSG:25831, el datum vertical EGM08D595 ni la lògica de lectura o visibilitat.
