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

- En la parte superior se situarán los botones para volver a la posición
  GPS, abrir la gestión de mapas descargados y acceder al modo cámara.
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

### RF-03. Posición inicial mediante GPS

En un dispositivo compatible, la aplicación intentará obtener la
posición actual mediante GPS y centrar el mapa en ella.

-   Si se concede el permiso de ubicación, el mapa se centrará en la
    posición obtenida.
-   Si se deniega el permiso o la ubicación no está disponible, la
    aplicación seguirá permitiendo explorar el mapa manualmente.
-   La aplicación indicará de forma comprensible cuándo no puede obtener
    la ubicación.

### RF-04. Escala inicial

Al abrir la aplicación, el mapa intentará mostrarse a una escala
cartográfica equivalente a **1:5.000**.

La escala efectiva dependerá del tamaño y la densidad de píxeles de la
pantalla y de la cartografía disponible. La aplicación deberá mostrar
una referencia de escala en el mapa; no deberá presentar una escala
1:5.000 como exacta si no puede garantizarla.

### RF-05. Control para volver a la posición GPS

La interfaz incluirá un control estándar para volver a centrar el mapa
en la posición GPS actual.

Al activarlo, el mapa volverá a la ubicación actual y, si procede,
recuperará la orientación basada en el rumbo del dispositivo.

El botón correspondiente se ubicará en la parte superior de la pantalla,
superpuesto sobre el mapa, según DI-02. Mientras la función no esté
implementada, el control deberá identificarse como provisional conforme
a DI-04.

### RF-06. Control de zoom

La interfaz incluirá controles de zoom estándar para acercar y alejar el
mapa. También se podrá cambiar el zoom mediante los gestos habituales de
la plataforma.

Los controles de zoom serán botones flotantes agrupados en un lateral y
superpuestos sobre el mapa, según DI-02. Mientras el zoom no esté
implementado, los botones deberán identificarse como provisionales
conforme a DI-04.

### RF-07. Desplazamiento del mapa

El usuario podrá desplazarse por el mapa: - En ordenador, arrastrándolo
con el ratón. - En dispositivos táctiles, arrastrándolo con un dedo. -
En dispositivos táctiles, utilizando el gesto habitual de pellizcar para
acercar o alejar.

Los controles y gestos no deberán impedir la selección de un punto de
observación.

## 3. Selección del punto de observación y orientación

### RF-08. Selección mediante pulsación prolongada

Al mantener pulsado un punto del mapa, la aplicación establecerá ese
punto como **posición de observación** para calcular las montañas
visibles.

-   En un dispositivo táctil, se utilizará una pulsación prolongada.
-   En ordenador, se implementará una interacción equivalente adecuada
    para ratón.
-   La posición seleccionada se distinguirá visualmente de la posición
    GPS.
-   La aplicación actualizará los resultados de visibilidad para la
    nueva posición.

La posición de observación seleccionada manualmente podrá ser distinta
de la posición GPS real.

### RF-09. Orientación del mapa

El mapa se orientará según la dirección de observación, de forma que las
montañas situadas delante del usuario aparezcan hacia la parte superior
de la pantalla.

-   En el prototipo de ordenador, el usuario podrá modificar manualmente
    el rumbo mediante un control de orientación.
-   En iPhone, la orientación se obtendrá de la brújula/sensores de
    orientación, con los permisos correspondientes.
-   El usuario podrá girar la orientación para explorar qué montañas hay
    en otras direcciones.
-   La aplicación deberá distinguir entre la orientación real del
    dispositivo y la orientación modificada manualmente, si ambas están
    disponibles.

### RF-10. Montañas en la parte superior

La parte superior del mapa representará siempre la dirección hacia la
que se está mirando. Por tanto, al cambiar el rumbo, el mapa girará para
mantener esa dirección arriba.

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

Si el usuario concede el permiso de GPS y el dispositivo obtiene una
posición válida, el mapa se centra en ella. Si no, el usuario puede
seguir usando el mapa manualmente.

### RC-03. Navegación

El usuario puede arrastrar el mapa y acercar/alejar mediante los
controles habituales, tanto con ratón como con pantalla táctil.

### RC-04. Escala

La aplicación intenta iniciar a escala 1:5.000 y muestra una referencia
de escala. Cualquier limitación de precisión deberá documentarse.

### RC-05. Punto de observación

Una pulsación prolongada selecciona un punto y actualiza la posición
desde la que se calculan las cimas visibles.

### RC-06. Orientación

La dirección de observación queda representada en la parte superior del
mapa. Cambiar el rumbo hace girar el mapa de forma coherente.

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
