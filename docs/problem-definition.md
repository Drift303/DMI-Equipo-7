# Definición del problema — CampusOps

> Sustituyan todas las indicaciones entre corchetes por el trabajo del equipo.

## Problema

[¿Qué problema del campus ficticio atiende CampusOps y por qué importa?]
CampusOps atiende el problema de la gestión de incidencias dentro de un campus universitario ficticio. Estudiantes y personal pueden reportar situaciones como fallas eléctricas, daños en laboratorios, fugas de agua, problemas de conectividad, equipos descompuestos y necesidades de mantenimiento.

El problema es importante porque se necesita organizar el proceso de atención de estas incidencias, permitiendo que sean reportadas, asignadas a un técnico, atendidas y posteriormente cerradas por el coordinador. De esta manera, cada incidencia puede mantener un seguimiento de su estado y de las acciones realizadas.

## Alcance

### Incluye

- [Registro de incidencias con categoría, descripción y ubicación dentro del campus ficticio.]
- [Consulta, asignación, atención, resolución y cierre de incidencias mediante los perfiles de reportante, técnico y coordinador.]

### No incluye

- [Integración con instalaciones, cuentas o información institucional real.]
- [Implementación completa de la aplicación ni todas las funcionalidades acumulativas durante esta Semana 1.]

## Actores y responsabilidades

- **Reportante:** [Crear incidencias indicando su categoría, descripción, ubicación y, cuando corresponda, fotografías; consultar sus reportes y agregar información posterior.]
- **Técnico:** [Consultar las incidencias que tiene asignadas, iniciar su atención, registrar diagnóstico, notas y evidencias, y marcar la incidencia como resuelta.]
- **Coordinador:** [Consultar las incidencias, establecer prioridades, asignar o reasignar técnicos, revisar historial y evidencias, y cerrar o reabrir incidencias cuando sea necesario.]

## Flujo principal

1. Reportar: [El reportante registra una incidencia proporcionando la categoría, descripción y ubicación del problema.]
2. Asignar: [El coordinador revisa la incidencia y asigna un técnico responsable de atenderla.]
3. Atender: [El técnico inicia la atención, registra el diagnóstico, notas y evidencias, y posteriormente marca la incidencia como resuelta.]
4. Cerrar: [El coordinador revisa la resolución realizada por el técnico y cierra la incidencia. Si requiere atención adicional, puede reabrir el caso cuando exista un técnico asignado.]

## Criterios de aceptación verificables

1. [Dada una incidencia nueva, cuando el reportante proporciona una categoría, descripción y ubicación, entonces la incidencia queda registrada y puede ser consultada posteriormente.]
2. [Dada una incidencia abierta, cuando el coordinador asigna un técnico, entonces la incidencia queda asociada al técnico responsable y puede continuar con el proceso de atención.]
3. [Dada una incidencia atendida por un técnico, cuando este registra la resolución y la marca como resuelta, entonces el coordinador puede revisar la resolución y cerrar la incidencia.]

