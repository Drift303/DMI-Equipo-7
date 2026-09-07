# Registro de riesgos — CampusOps

> Registren exactamente tres riesgos y ordénenlos del más al menos prioritario.

| Prioridad | Riesgo | Probabilidad | Impacto | Mitigación | Cómo comprobar la mitigación |
|---:|---|---|---|---|---|
| 1 | Una asignación o cambio de estado puede perderse o duplicarse durante una desconexión o reintento. | Alta: la atención técnica puede ocurrir sin cobertura y las respuestas de red pueden tardar o perderse. | Alto: se puede mostrar información contradictoria, perder trabajo o generar eventos repetidos. | Mantener una cola persistente con identidad de operación, incidencia, versión base y autor; aplicar idempotencia y reportar conflictos. | Una prueba de reintento y conflicto muestra que la operación conserva su clave, no duplica eventos y deja visible el conflicto para resolverlo. |
| 2 | Un usuario puede consultar o modificar una incidencia fuera de su perfil o asignación. | Media: existen tres perfiles con permisos distintos y la interfaz por sí sola no protege el servicio. | Alto: se expondrían datos o se alterarían incidencias sin autorización. | Validar autorización en el servicio para reportante, técnico y coordinador, incluida la asignación vigente del técnico. | Pruebas negativas rechazan una lectura o modificación no autorizada y una revisión confirma que el botón oculto no es la única barrera. |
| 3 | La captura de ubicación o fotografía puede fallar por permisos denegados, datos incompletos o ausencia de conexión. | Media: el permiso puede ser rechazado o revocado y el dispositivo puede estar desconectado. | Medio: el reporte podría quedar incompleto o bloquearse aunque la incidencia siga siendo registrable. | Solicitar cada permiso sólo cuando se necesita y permitir continuar con ubicación manual; conservar adjuntos pendientes para sincronización posterior. | Pruebas de cancelación, denegación y desconexión permiten registrar una referencia manual y muestran el adjunto como pendiente sin fingir que se cargó. |

## Riesgo que atenderíamos primero

Atenderíamos primero el riesgo de pérdida o duplicación de operaciones durante desconexiones y reintentos. Es el más prioritario porque combina una probabilidad alta con un impacto alto y puede afectar directamente el flujo de atención: una incidencia podría quedar con un estado incorrecto, perder una nota técnica o registrar dos veces la misma operación. La cola persistente, la idempotencia y la detección explícita de conflictos reducen ese daño y se pueden comprobar con escenarios reproducibles sin usar datos reales.

