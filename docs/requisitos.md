# BuscaPics --- Documento de requisitos

**Versión:** 0.4\
**Estado:** Borrador para revisión\
**Tipo:** Requisitos funcionales y de interfaz\
**Nombre del producto:** BuscaPics

## 1. Objetivo

BuscaPics permitirá explorar un mapa topográfico, seleccionar un punto
de observación y consultar qué montañas son visibles desde ese punto y
en la dirección indicada. La aplicación empezará como un prototipo web
para ordenador y se adaptará posteriormente a iPhone.

La interfaz principal será un mapa. La aplicación no mostrará imágenes
de la cámara ni utilizará realidad aumentada en esta fase.

## 2. Pantalla principal: mapa

### DI-01. Mapa a pantalla completa

El mapa ocupará toda la pantalla de la vista principal. No habrá barras
inferiores, paneles laterales permanentes ni controles fuera del área del
mapa. Todos los controles de esta pantalla se presentarán superpuestos
sobre el mapa.

### DI-02. Distribución de los controles

- La pantalla incluye un único botón contextual de brújula o diana para
  orientación y recuperación de la posición GPS.
- Los controles de zoom serán botones flotantes agrupados en un lateral.
- El selector de cimas será un botón flotante. Al activarlo, abrirá un
  menú superpuesto con las cuatro opciones definidas en RF-14.
- Los controles superpuestos deberán permitir seguir interactuando con el
  mapa en las zonas que no ocupen.

### DI-03. Adaptación del diseño

La interfaz se adaptará a ventanas anchas y estrechas. La distribución y
el tamaño de los controles evitarán solapamientos entre ellos y con la
información necesaria del mapa. En pantallas móviles se respetarán los
márgenes de seguridad del sistema para evitar que los controles queden
bajo elementos del dispositivo o del navegador.

### DI-04. Controles provisionales

Los controles cuya funcionalidad aún no esté implementada se identificarán
claramente como provisionales o pendientes. No deberán aparentar que
realizan acciones reales ni cambiar falsamente el estado de la aplicación.
El control de modo cámara seguirá además las restricciones de RF-20.

### RF-01. Pantalla de inicio

Al abrir la aplicación, se mostrará directamente la vista del mapa.

### RF-02. Mapa topográfico

El mapa mostrará cartografía topográfica con curvas de nivel. La
disponibilidad, el origen, la resolución y la licencia de los datos
cartográficos deberán verificarse antes de seleccionar la fuente
definitiva.

### RF-03. GPS, observador y cámara

La aplicación inicia el seguimiento GPS al abrirse y lo mantiene activo
mientras esté en uso si el navegador ofrece geolocalización y el usuario
concede permiso. Se mantienen independientes la posición GPS (último fix
válido), el observador (origen del cálculo, con origen GPS o manual) y la
cámara (centro, zoom y orientación).

El primer fix válido establece el observador con origen GPS, centra la
cámara en él, horizontalmente centrado y al 75 % de la altura visible, y deja el mapa en norte arriba, salvo que el usuario ya haya
seleccionado un observador manual antes de recibir ese fix. Mientras el
origen sea GPS, las actualizaciones GPS aceptadas actualizan el observador;
no recentran la cámara en cada actualización. Si el origen es manual, los
fixes GPS solo actualizan la posición GPS. Al perder señal se conserva el
último fix y el observador actual. Al recuperarse, un observador de origen
GPS se actualiza y la cámara se centra en él al 75 % de la altura, conservando la orientación;
un observador manual y la cámara permanecen sin cambios.

### RF-04. Escala inicial

Al abrir la aplicación, el mapa intentará mostrarse a una escala
cartográfica equivalente a **1:5.000**.

La escala efectiva dependerá del tamaño y la densidad de píxeles de la
pantalla y de la cartografía disponible. La aplicación deberá mostrar
una referencia de escala en el mapa; no deberá presentar una escala
1:5.000 como exacta si no puede garantizarla.

### RF-05. Botón contextual de brújula y diana

Hay un único botón contextual. En modo norte muestra la brújula apuntando
al norte; pulsarla activa la orientación del teléfono. En modo brújula,
el mapa y la brújula siguen el rumbo del dispositivo; pulsarla vuelve a
norte. Al desplazar o rotar manualmente la cámara se conserva el bearing,
se desactiva el sensor y se muestra la diana. La diana requiere un fix GPS
válido; al pulsarla restablece el origen GPS del observador, centra la
cámara con el observador al 75 % de la altura, conserva el zoom y vuelve a norte. Sin fix, queda desactivada.

Colocar un observador manual centra la cámara en él, horizontalmente y al 75 % de la altura visible, conserva el zoom, restablece norte y
muestra la brújula fija al norte. Esa selección no cambia la posición GPS.

### RF-06. Control de zoom

La interfaz incluye botones flotantes para acercar y alejar, además de
rueda de ratón y gesto de pellizco. Los tres mantienen el observador en su
píxel actual de pantalla, tanto si está al 75 % de altura como si se desplazó
manualmente. El zoom no cambia las coordenadas del observador ni desactiva la
orientación automática por sí solo.

### RF-07. Desplazamiento, zoom y rotación del mapa

El usuario podrá desplazar la cámara con ratón o un dedo, acercar o alejar
con rueda o pellizco y girar con dos dedos en pantalla táctil (y mediante
la interacción de rotación disponible en escritorio). Desplazar y rotar
solo cambian la cámara, no el observador; desactivan la brújula y conservan
el bearing actual. Los botones, la rueda y el pellizco conservan el píxel
actual del observador mientras hacen zoom. Las rotaciones automáticas y manuales
mantienen fija en pantalla su posición actual, sin recentrarlo si se desplazó
manualmente. El zoom no desactiva la brújula. Ninguna operación de cámara modifica sus coordenadas geográficas. Los gestos no
impedirán seleccionar un observador con pulsación prolongada.

## 3. Selección del punto de observación y orientación

### RF-08. Selección mediante pulsación prolongada

Al mantener pulsado un punto del mapa, la aplicación establecerá ese
punto como **posición de observación** para calcular las montañas
visibles.

-   En un dispositivo táctil, se utilizará una pulsación prolongada.
-   En ordenador, se implementará una interacción equivalente adecuada
    para ratón.
-   La posición seleccionada se distinguirá visualmente de la posición
    GPS y centrará la cámara en ella al 75 % de la altura visible,
    conservando el zoom.
-   El marcador del observador será una flecha de navegación orientada hacia
    la parte superior de la pantalla. No girará con el bearing del mapa y se
    mantendrá separado del indicador de ubicación GPS.
-   La selección cambia el origen del observador a manual, restablece norte
    arriba y muestra la brújula fija al norte.
-   El seguimiento GPS continuará en segundo plano y no moverá el
    observador manual.
-   La aplicación actualizará los resultados de visibilidad para la
    nueva posición.

La posición de observación seleccionada manualmente podrá ser distinta
de la posición GPS real.

### RF-09. Orientación norte, brújula y manual

- **Norte:** norte geográfico arriba y sin seguimiento del teléfono.
- **Brújula:** el mapa sigue la orientación del teléfono después de obtener
  los permisos de la plataforma. El icono refleja el mismo rumbo.
- **Manual:** se activa al desplazar o rotar manualmente la cámara; conserva
  ese rumbo y no consulta un rumbo independiente del GPS.

El botón contextual alterna norte y brújula. Desde modo manual, la diana
recupera el último fix GPS válido y vuelve a norte. La lectura de
Safari/iOS, incluido `webkitCompassHeading`, mantiene el suavizado y el
tratamiento del cruce norte.

### RF-10. Montañas en la parte superior

El rumbo de observación es la dirección geográfica que apunta al borde
superior de la pantalla. En modo norte es 0°; en modo brújula usa el rumbo
del sensor; en modo manual usa el bearing actual de la cámara. El centro de
la cámara nunca sustituye a las coordenadas del observador.

La orientación deberá comprobarse con casos conocidos, por ejemplo:
rumbo norte, este, sur y oeste. El sentido de giro se validará durante
la implementación.

## 4. Visualización y selección de montañas

### RF-11. Mostrar todas las cimas que cumplen el filtro

El mapa mostrará todas las cimas del catálogo que cumplan el conjunto
seleccionado, independientemente de que sean visibles desde la posición
y la orientación actuales.

Cada cima mostrada tendrá una etiqueta con: - Nombre de la montaña. -
Altitud en metros.

Las etiquetas deberán situarse de forma coherente con la posición
geográfica de cada cima y evitar, en lo posible, solapamientos que
puedan llevar a identificar una cima incorrectamente.

### RF-12. Diferenciar visualmente las cimas visibles

La aplicación calculará cuáles de las cimas mostradas son realmente
visibles desde la posición de observación y en la orientación actual.

-   Las cimas visibles se resaltarán mediante un estilo visual
    claramente diferenciable, por ejemplo, mayor contraste, texto más
    marcado o un indicador visual.
-   Las cimas que cumplan el filtro pero no sean visibles mantendrán su
    etiqueta con un estilo normal y menos destacado.
-   Una cima se considerará visible solo si se encuentra dentro del
    campo de visión y el perfil del terreno no la oculta detrás de un
    relieve más cercano.
-   El diseño deberá distinguir los dos estados sin dificultar la
    lectura del mapa.

### RF-13. Actualización dinámica de la visibilidad

Al cambiar la posición de observación o la orientación, la aplicación
actualizará qué cimas aparecen resaltadas, manteniendo en el mapa las
etiquetas de todas las cimas que cumplan el filtro.

### RF-14. Control de selección de montañas

La interfaz incluirá un control estándar para seleccionar qué conjunto
de montañas se desea mostrar. Las opciones serán:

1. **100 CIMS:** todas las cimas del catálogo completo.
2. **100 CIMS essencials:** solo las cimas esenciales emparejadas con seguridad.

El acceso al selector será un botón flotante sobre el mapa que abrirá un
menú superpuesto con las dos opciones anteriores, según DI-02. El
catálogo de desarrollo actual no se considera una fuente oficial ni apta
para redistribución pública hasta confirmar su procedencia y licencia.

La aplicación deberá documentar la fuente y la versión del catálogo de
cimas utilizado. La procedencia y las condiciones de reutilización de
los GPX de desarrollo actuales están pendientes de confirmar; antes de
redistribuir datos se verificará la lista oficial de la FEEC y sus
condiciones de uso.

### RF-15. Actualización del conjunto de cimas

Al cambiar el conjunto seleccionado, la aplicación actualizará las cimas
etiquetadas según el filtro, sin obligar al usuario a volver a
seleccionar la posición ni la orientación. La visibilidad de cada cima
se volverá a calcular cuando sea necesario.

### RF-16. Información de una cima

El diseño deberá permitir seleccionar una etiqueta o una cima para
consultar, como mínimo, su nombre y altitud. El detalle exacto de esta
interacción podrá concretarse en una versión posterior.

## 5. Gestión de mapas descargados

### RF-17. Acceso a la gestión de mapas

La pantalla principal incluirá un control estándar para abrir la
pantalla de **gestión de mapas descargados**.

### RF-18. Contenido de la pantalla de gestión

La pantalla de gestión deberá permitir consultar los mapas o regiones
descargados y, como mínimo: - Ver qué regiones están disponibles sin
conexión. - Consultar el espacio ocupado, si el sistema lo permite. -
Eliminar una región descargada.

La descarga de nuevas regiones, el progreso, la comprobación de
integridad y la actualización de mapas se definirán con más detalle
antes de implementar esa funcionalidad. El diseño deberá dejar espacio
para incorporarlas.

### RF-19. Funcionamiento sin conexión

El objetivo del producto es que las regiones descargadas puedan
utilizarse sin cobertura. Para ello, los datos necesarios
---cartografía, elevación del terreno y catálogo de cimas--- deberán
estar disponibles localmente para las regiones descargadas.

La disponibilidad real sin conexión dependerá de la tecnología elegida y
deberá probarse especialmente en Safari/iOS antes de darla por
garantizada.

## 6. Control de modo cámara

### RF-20. Control visible, funcionalidad pendiente

La interfaz incluirá un control para entrar en **modo cámara**, pero
esta funcionalidad estará inicialmente sin implementar.

En la primera versión: - El control podrá mostrarse como deshabilitado o
indicar claramente «Próximamente». - No deberá abrir la cámara ni
solicitar permisos de cámara. - La vista principal seguirá siendo
exclusivamente el mapa topográfico.

La presencia de este control no implica que la cámara forme parte del
alcance funcional inicial.

## 7. Adaptación por plataforma

### RF-21. Prototipo de ordenador

La primera versión se ejecutará en un navegador de escritorio: - La
posición de observación podrá seleccionarse manualmente en el mapa. - El
rumbo podrá controlarse manualmente. - Se utilizarán datos de prueba
claramente identificados mientras no estén integrados los datos
geográficos reales.

### RF-22. Versión para iPhone

En la adaptación para iPhone: - La posición inicial procederá del GPS,
con permiso del usuario. - La orientación procederá de la brújula o de
los sensores disponibles, con permisos del sistema. - Se mantendrán la
selección manual del punto de observación, el movimiento del mapa y los
controles de zoom, en la medida compatible con la experiencia móvil. -
No se activará la cámara en la primera versión.

## 8. Requisitos de calidad y criterios de aceptación

### RC-01. Inicio

Al abrir la aplicación, se muestra el mapa sin tener que navegar primero
por un menú.

### RC-02. Ubicación

El seguimiento comienza al iniciar. El primer fix fija el observador GPS,
lo coloca al 75 % de la altura al centrar la cámara y deja norte arriba. Las actualizaciones mueven el
observador solo si su origen es GPS; no recentran cada vez. Si el origen es
manual, los fixes solo actualizan GPS. La recuperación recentra únicamente
un observador de origen GPS y conserva su bearing. La diana restaura GPS y
norte; sin fix está desactivada.

### RC-03. Navegación

El usuario puede arrastrar, hacer zoom y rotar el mapa con las interacciones
habituales. Arrastrar o rotar cambia solo la cámara, desactiva la brújula y
conserva el bearing. La rotación conserva el píxel actual del observador
como ancla. El zoom conserva el observador y no desactiva la brújula.

### RC-04. Escala

La aplicación intenta iniciar a escala 1:5.000 y muestra una referencia
de escala. Cualquier limitación de precisión deberá documentarse.

### RC-05. Punto de observación

Una pulsación prolongada selecciona un observador de origen manual,
centra la cámara con el punto al 75 % de la altura, conserva el zoom y
vuelve a norte arriba sin alterar GPS.

### RC-06. Orientación

El mapa ofrece los modos norte, brújula y manual. La parte superior de la
pantalla define el rumbo usado en visibilidad. La brújula contextual cambia
a diana durante navegación manual y gira con el sensor en modo brújula.

### RC-07. Etiquetas

Las cimas mostradas incluyen nombre y altitud y solo se presentan como
visibles si están dentro de la dirección seleccionada y no quedan
ocultas por el relieve.

### RC-08. Filtros de cimas

El usuario puede elegir cualquiera de los dos conjuntos definidos y
las etiquetas se actualizan según la selección.

### RC-09. Gestión de mapas

Existe un control que abre una pantalla diferenciada de gestión de mapas
descargados.

### RC-10. Modo cámara

Existe un control visible para el modo cámara, pero no activa la cámara
ni solicita permisos en esta versión.

### RC-11. Sin conexión

La aplicación no deberá declarar que una región funciona sin conexión
hasta que se haya probado con la región descargada y el dispositivo sin
acceso a Internet.

## 9. Decisiones técnicas pendientes

Estas decisiones no deben darse por cerradas solo con este documento:

-   Fuente, resolución, formato y licencia de la cartografía topográfica
    y de las curvas de nivel.
-   Fuente y resolución del modelo digital de elevaciones.
-   Fuente, formato y licencia del catálogo de cimas y de la lista de
    los 100 Cims de la FEEC.
-   Método de cálculo de visibilidad y precisión esperada.
-   Tecnología y límites de almacenamiento para mapas sin conexión,
    especialmente en iOS.
-   Comportamiento exacto del control de orientación en escritorio y
    móvil.
-   Diseño visual final de los controles y de la pantalla de gestión.

## 10. Fuera del alcance de la primera versión

-   Visualización mediante cámara o realidad aumentada.
-   Identificación de cimas mediante análisis de imágenes.
-   Garantizar visibilidad topográfica perfecta sin validación de los
    datos y del algoritmo.
-   Descargar regiones en segundo plano sin haber definido previamente
    la estrategia de almacenamiento y recuperación.

------------------------------------------------------------------------

**Principio de desarrollo:** implementar BuscaPics de forma incremental.
Cada requisito deberá verificarse con pruebas o comprobaciones manuales
antes de pasar a la siguiente fase. Los datos simulados deberán
identificarse como tales y nunca presentarse como datos reales.
