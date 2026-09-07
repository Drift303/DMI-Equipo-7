# Definición del problema — CampusOps

> Sustituyan todas las indicaciones entre corchetes por el trabajo del equipo.

## Problema

CampusOps atiende el problema de la gestión de incidencias dentro de un campus universitario ficticio. Estudiantes y personal pueden reportar situaciones como fallas eléctricas, daños en laboratorios, fugas de agua, problemas de conectividad, equipos descompuestos y necesidades de mantenimiento.

El problema es importante porque se necesita organizar el proceso de atención de estas incidencias, permitiendo que sean reportadas, asignadas a un técnico, atendidas y posteriormente cerradas por el coordinador. De esta manera, cada incidencia puede mantener un seguimiento de su estado y de las acciones realizadas.

## Alcance

### Incluye

- Registro de incidencias con categoría, descripción y ubicación dentro del campus ficticio.
- Consulta, asignación, atención, resolución y cierre de incidencias mediante los perfiles de reportante, técnico y coordinador.

### No incluye

- Integración con instalaciones, cuentas o información institucional real.
- Implementación completa de la aplicación ni todas las funcionalidades acumulativas durante esta Semana 1.

## Actores y responsabilidades

- **Reportante:** Crear incidencias indicando su categoría, descripción, ubicación y, cuando corresponda, fotografías; consultar sus reportes y agregar información posterior.
- **Técnico:** Consultar las incidencias que tiene asignadas, iniciar su atención, registrar diagnóstico, notas y evidencias, y marcar la incidencia como resuelta.
- **Coordinador:** Consultar las incidencias, establecer prioridades, asignar o reasignar técnicos, revisar historial y evidencias, y cerrar o reabrir incidencias cuando sea necesario.

## Flujo principal

1. **Registrar:** La persona que detecta el problema crea una incidencia indicando su categoría, una descripción de lo ocurrido y el lugar donde se presenta.

2. **Asignar:** El coordinador verifica la incidencia registrada y selecciona al técnico que será responsable de atenderla.

3. **Resolver:** El técnico comienza a trabajar en la incidencia, agrega el diagnóstico, las observaciones y las evidencias necesarias. Al finalizar, registra la solución y cambia el estado a resuelta.

4. **Finalizar:** El coordinador revisa el trabajo realizado y, si la solución es correcta, da por cerrada la incidencia. En caso de que el problema continúe o necesite más trabajo, puede volver a abrirla siempre que tenga un técnico asignado.

## Criterios de aceptación verificables

1. **Registro de incidencia:** Cuando una persona crea una incidencia proporcionando la categoría, descripción y ubicación, esta debe guardarse correctamente y estar disponible para futuras consultas.

2. **Asignación de técnico:** Cuando existe una incidencia pendiente y el coordinador selecciona un técnico, esta debe quedar vinculada al responsable asignado para que pueda comenzar su atención.

3. **Resolución y cierre:** Cuando el técnico termina la atención, registra la solución y marca la incidencia como resuelta, el coordinador debe poder revisar la información y cerrar el caso si la solución es adecuada.
