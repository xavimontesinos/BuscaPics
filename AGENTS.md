
# AGENTS.md — BuscaPics

## Objetivo
Desarrollar BuscaPics siguiendo los requisitos de docs/requisitos.md.

## Forma de trabajo
- El propietario del proyecto está aprendiendo desarrollo asistido por agentes.
- Trabaja en tareas pequeñas, independientes y explicables.
- Antes de realizar cambios importantes, presenta un plan y espera aprobación.
- No implementes fases futuras sin autorización expresa.
- Explica los conceptos técnicos nuevos con ejemplos sencillos.
- Resume los archivos modificados y las decisiones tomadas.
- No afirmes que has ejecutado pruebas que no hayas ejecutado.
- Si una decisión importante no está clara, pregunta antes de asumirla.

## Arquitectura
- Utiliza TypeScript y React.
- Mantén separada la lógica geográfica de los componentes de interfaz.
- Evita concentrar toda la lógica en un único archivo.
- Diseña el motor de visibilidad para que pueda probarse sin interfaz gráfica.
- Documenta las interfaces entre módulos.

## Datos geográficos
- No inventes coordenadas, altitudes ni datos de cimas reales.
- Identifica claramente cualquier dato simulado.
- Documenta la procedencia, licencia y resolución de los datos incorporados.
- No des por implementada la visibilidad real hasta verificarla con pruebas.

## Producto
- La interfaz principal es un mapa topográfico.
- No utilices la cámara ni implementes realidad aumentada.
- En escritorio, la posición y el rumbo podrán simularse manualmente.
- En iPhone, el objetivo es utilizar GPS y sensores de orientación.
- El funcionamiento sin conexión es un requisito del producto.
- Consulta docs/requisitos.md antes de implementar funcionalidades.

## Calidad
- Implementa solo lo necesario para la tarea autorizada.
- Añade pruebas proporcionadas a cada funcionalidad.
- Ejecuta las comprobaciones pertinentes antes de finalizar.
- No añadas dependencias sin explicar por qué son necesarias.
- Todo el código en ingles
