# Probar GPS y brújula en un móvil

## Requisitos

- Abre BuscaPics desde un origen seguro: HTTPS o `localhost` en el propio dispositivo. Una dirección LAN como `http://192.168.x.x` normalmente no habilita geolocalización ni los sensores.
- Permite la ubicación y la orientación en los ajustes del navegador y del sistema operativo.
- La precisión del GPS debe ser de 100 m o mejor para actualizar el observador. Las lecturas menos precisas se muestran como señal débil y no mueven el mapa.

## Prueba manual

1. Abre la aplicación en Safari de iOS o Chrome de Android y pulsa **GPS**. Acepta el permiso cuando el navegador lo solicite.
2. Comprueba los estados «Esperando permiso», «Buscando posición» y «Posición GPS disponible». Camina unos metros y verifica que el observador y el centrado del mapa se actualizan sin reaccionar a pequeñas oscilaciones.
3. Pulsa **Detener GPS y elegir posición manual** y mantén pulsado otro punto del mapa. La posición manual debe dejar de ser reemplazada por el GPS.
4. Pulsa el control de orientación para reanudar el modo automático y acepta el permiso de brújula si el navegador lo solicita. Gira el móvil lentamente hacia norte, este, sur y oeste; la parte superior del mapa debe seguir el rumbo.
5. Arrastra el control de orientación. Debe pasar a modo manual y dejar de seguir al sensor. Pulsa el control para volver explícitamente al modo automático.
6. Prueba también denegar permisos, desactivar la ubicación y repetir en interiores. La aplicación debe mostrar el estado de error o señal débil y mantener disponible la selección manual.

## Limitaciones

La API de geolocalización puede entregar ubicación combinada de GPS, Wi-Fi o red celular; el navegador no garantiza que sea una lectura GNSS pura. La brújula solo se usa cuando el dispositivo entrega un rumbo absoluto o la extensión `webkitCompassHeading`; los eventos relativos no se interpretan como norte. Algunos navegadores no exponen sensores, y los permisos pueden requerir HTTPS, interacción explícita y habilitación del sistema. Esta guía es un procedimiento de prueba; la integración aún debe validarse en dispositivos físicos.
