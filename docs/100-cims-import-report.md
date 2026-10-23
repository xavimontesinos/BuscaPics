# Informe de importación de los GPX 100 Cims

> Datos de desarrollo generados; no verificados como datos oficiales de la FEEC. Procedencia subyacente y condiciones de reutilización pendientes de confirmar. No redistribuir públicamente el catálogo hasta resolverlo.

Los dos GPX originales se conservan sin cambios. Ambos declaran `creator="ChatGPT"` y no aportan licencia ni atribución verificable. Coordenadas y altitudes se copian de los archivos y no se consideran verificadas.

## Recuento y emparejamiento

- Waypoints del GPX completo: 528. Nombres normalizados únicos: 525. Registros del catálogo: 528.
- Discrepancia documentada: hay 3 registros por encima del número de nombres normalizados únicos. Se conservan los 528 waypoints, porque tres nombres normalizados aparecen dos veces con altitudes distintas; no se fusionan automáticamente.
- Waypoints esenciales: 150; esenciales emparejados: 150; sin emparejar: 0; ambiguos: 0.
- El emparejamiento usa nombre normalizado exacto (minúsculas y eliminación de diacríticos); las coordenadas solo desempatan si hay una única candidata a 100 m o menos, o se usan como alternativa si el nombre no coincide. No se fusionan candidatos ambiguos.
- Duplicados de nombre normalizado en el GPX completo: 3.
  - “la cogulla”: “La Cogulla (1024 m)” / “La Cogulla (743 m)”.
  - “pic dels pedrons”: “Pic dels Pedrons (2216 m)” / “Pic dels Pedrons (2672 m)”.
  - “la guardia serra de busa”: “la Guàrdia (Serra de Busa) (1417 m)” / “la Guàrdia (Serra de Busa) (1088 m)”.

## Discrepancias de altitud

Se extrae el sufijo final de altitud como entero (incluidos separadores de miles) y se usa `<ele>` cuando es válido. Solo se informa discrepancia si la altitud redondeada de `<ele>` no coincide con el sufijo.

- 100_cims_complet.gpx: “Tossal d'Espígol (346 m)”; nombre 346 m, <ele> 346.5 m.
- 100_cims_complet.gpx: “La Morella (572 m)”; nombre 572 m, <ele> 572.5 m.
- 100_cims_complet.gpx: “Picorandan (904 m)”; nombre 904 m, <ele> 904.5 m.
- 100_cims_complet.gpx: “Grony de Miralles (830 m)”; nombre 830 m, <ele> 830.5 m.
- 100_cims_complet.gpx: “Sant Mamet (1382 m)”; nombre 1382 m, <ele> 1382.5 m.
- 100_cims_complet.gpx: “Vulturó (2622 m)”; nombre 2622 m, <ele> 2622.5 m.
- 100_cims_complet.gpx: “Pala Alta (904 m)”; nombre 904 m, <ele> 904.5 m.
- 100_cims_complet.gpx: “Roca Corbatera (1122 m)”; nombre 1122 m, <ele> 1122.5 m.
- 100_cims_complet.gpx: “Puigmal (2886 m)”; nombre 2886 m, <ele> 2886.5 m.
- 100_cims_complet.gpx: “Turó de l'Enclusa (844 m)”; nombre 844 m, <ele> 844.5 m.
- 100_cims_complet.gpx: “Puig de Grialó (630 m)”; nombre 630 m, <ele> 630.5 m.
- 100_cims_complet.gpx: “La Mola - Sant Llorens del Munt (1072 m)”; nombre 1072 m, <ele> 1072.5 m.
- 100_cims_complet.gpx: “Turó del Samon (1244 m)”; nombre 1244 m, <ele> 1244.5 m.
- 100_cims_complet.gpx: “Tuc de Llançà (2558 m)”; nombre 2558 m, <ele> 2558.5 m.
- 100_cims_complet.gpx: “pujol  de (470 m)”; nombre 470 m, <ele> 470.5 m.
- 100_cims_complet.gpx: “Puig de Gallinas (2558 m)”; nombre 2558 m, <ele> 2558.5 m.
- 100_cims_complet.gpx: “Puig d'Olorda (406 m)”; nombre 406 m, <ele> 406.5 m.
- 100_cims_complet.gpx: “Pui Tabaca (1626 m)”; nombre 1626 m, <ele> 1626.5 m.
- 100_cims_complet.gpx: “Mont-Roig (2746 m)”; nombre 2746 m, <ele> 2746.5 m.
- 100_cims_complet.gpx: “Lo Tésol (Tesó de Son) (2656 m)”; nombre 2656 m, <ele> 2656.5 m.
- 100_cims_complet.gpx: “Costa Pubilla o Pla de Pujalts (2002 m)”; nombre 2002 m, <ele> 2002.5 m.
- 100_cims_complet.gpx: “Tuc des Armèros (2462 m)”; nombre 2462 m, <ele> 2462.5 m.
- 100_cims_complet.gpx: “Tossa d'Espinau (1040 m)”; nombre 1040 m, <ele> 1040.5 m.
- 100_cims_complet.gpx: “Roc Roi (1984 m)”; nombre 1984 m, <ele> 1984.5 m.
- 100_cims_complet.gpx: “Punta d'Ossos (996 m)”; nombre 996 m, <ele> 996.5 m.
- 100_cims_complet.gpx: “Puig del Pam (2456 m)”; nombre 2456 m, <ele> 2456.5 m.
- 100_cims_complet.gpx: “Puig de les Cols (370 m)”; nombre 370 m, <ele> 370.5 m.
- 100_cims_complet.gpx: “Puig Clarà (286 m)”; nombre 286 m, <ele> 286.5 m.
- 100_cims_complet.gpx: “Pic de Mariola (2590 m)”; nombre 2590 m, <ele> 2590.5 m.
- 100_cims_complet.gpx: “Pic de Gerri (2770 m)”; nombre 2770 m, <ele> 2770.5 m.
- 100_cims_complet.gpx: “Pic de Baborte (2888 m)”; nombre 2888 m, <ele> 2888.5 m.
- 100_cims_complet.gpx: “Castell de Milany (1482 m)”; nombre 1482 m, <ele> 1482.5 m.
- 100_cims_essencials.gpx: “La Morella (572 m)”; nombre 572 m, <ele> 572.5 m.
- 100_cims_essencials.gpx: “Sant Mamet (1382 m)”; nombre 1382 m, <ele> 1382.5 m.
- 100_cims_essencials.gpx: “Vulturó (2622 m)”; nombre 2622 m, <ele> 2622.5 m.
- 100_cims_essencials.gpx: “Pala Alta (904 m)”; nombre 904 m, <ele> 904.5 m.
- 100_cims_essencials.gpx: “Roca Corbatera (1122 m)”; nombre 1122 m, <ele> 1122.5 m.
- 100_cims_essencials.gpx: “Puigmal (2886 m)”; nombre 2886 m, <ele> 2886.5 m.
- 100_cims_essencials.gpx: “La Mola - Sant Llorens del Munt (1072 m)”; nombre 1072 m, <ele> 1072.5 m.
- 100_cims_essencials.gpx: “Tuc de Llançà (2558 m)”; nombre 2558 m, <ele> 2558.5 m.
- 100_cims_essencials.gpx: “Lo Tésol (Tesó de Son) (2656 m)”; nombre 2656 m, <ele> 2656.5 m.
- 100_cims_essencials.gpx: “Costa Pubilla o Pla de Pujalts (2002 m)”; nombre 2002 m, <ele> 2002.5 m.
- 100_cims_essencials.gpx: “Castell de Milany (1482 m)”; nombre 1482 m, <ele> 1482.5 m.

## Esenciales no emparejados o ambiguos

- No hay esenciales sin coincidencia.
- No hay coincidencias ambiguas.

## Nombres no normalizados con seguridad

- Todos los waypoints importados tienen nombre no vacío. Los nombres que no terminen con un sufijo inequívoco de altitud se conservan íntegros; su altitud procede de `<ele>` cuando está disponible.

