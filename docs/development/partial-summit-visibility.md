# Aproximación local de visibilidad parcial

El cálculo recreativo evalúa el punto de cima del catálogo y cuatro puntos
adicionales separados 20 m hacia el norte, este, sur y oeste. Las posiciones
auxiliares se generan geodésicamente desde la coordenada del catálogo; sus
elevaciones se consultan en el MDT del ICGC, con la referencia vertical
declarada por ese conjunto de datos. No se asigna una elevación estimada si la
consulta devuelve nodata o falla.

El punto original continúa usando `elevationMeters` como altura provisional,
según el comportamiento existente. Para los cuatro puntos auxiliares se evalúa
la línea hasta la superficie del terreno (`0 m` sobre el terreno local). La
altura ocular se mantiene separada de la elevación del observador y es de 5 m
sobre el terreno.

El resultado es `partiallyVisible` si el punto original está `occluded` y al
menos uno de los puntos auxiliares está `visible`. Solo se mantiene `occluded`
cuando los cuatro puntos auxiliares también se evalúan como ocultos. Si no hay
un punto auxiliar visible y alguno no puede evaluarse, el resultado es
`indeterminate`.

Estos cuatro puntos forman una muestra local pequeña, no un contorno de la cima
ni un modelo de la montaña. No se puede interpretar `partiallyVisible` como una
estimación del porcentaje visible ni como una reconstrucción de la zona de
cumbre. La geometría real de cada cumbre no está incluida en el catálogo.
