# Controles de seguridad y privacidad

## Datos revisados

CampusOps puede manejar sesión, identificadores de actores, ubicación de incidencias, fotografías, evidencias, nombres, comentarios internos y respuestas de servicios externos. Estos datos no deben aparecer completos en telemetría, reportes de error ni archivos de evidencia. Los fixtures del curso son ficticios y no representan credenciales reales.

### Minimización y propósito

Cada flujo debe solicitar y conservar sólo el dato necesario para su propósito: la ubicación se usa para localizar una incidencia, las fotografías y evidencias para documentarla y el identificador del actor para aplicar permisos. Los datos no se reutilizan para analítica, perfiles u otros fines sin una decisión explícita. Los reportes técnicos deben preferir identificadores sintéticos de incidencia y contexto operativo mínimo en lugar de información personal o contenido libre.

## Controles implementados

- `redactForTelemetry` recorre objetos y listas de forma recursiva.
- Las claves sensibles se comparan normalizadas a minúsculas y sin guiones ni guiones bajos.
- Los valores sensibles completos se reemplazan por `[REDACTED]`, incluso cuando están anidados.
- Los campos técnicos seguros, como `incidentId`, `correlationId`, `status`, `attempt` y `durationMs`, se conservan para diagnóstico.
- La función construye nuevos objetos y listas; no muta la entrada original.
- Los escaneos de secretos y las pruebas negativas forman parte de la evidencia reproducible de esta semana.

## Almacenamiento y errores

La información de sesión o cualquier secreto real no debe guardarse en AsyncStorage ni escribirse en el código. En una implementación móvil de producción, los secretos de sesión requieren el almacenamiento seguro provisto por la plataforma, con expiración, revocación y mínimo privilegio. Los mensajes de error deben conservar sólo códigos, estados y correlaciones sanitizadas, nunca encabezados de autorización, tokens, ubicación, fotografías o texto interno.

Las respuestas de servicios externos se tratan como datos no confiables: se validan antes de mostrarse o persistirse. Al cerrar sesión, revocar acceso o eliminar una incidencia conforme a la política del producto, deben borrarse los tokens, referencias locales de evidencia y datos en caché que ya no sean necesarios. Las copias de respaldo y registros operativos deben aplicar el mismo principio de retención mínima.

## Relación con amenazas

La sanitización reduce la amenaza de fuga de datos en logs descrita en `docs/threat-model.md` y evita que una pantalla protegida oculte un dato que después quede expuesto en registros. El escaneo de secretos atiende la amenaza de credenciales expuestas en archivos. Los controles de autorización y permisos siguen siendo necesarios: redactar un log no autoriza el acceso a una incidencia.

## Riesgo residual

La lista de claves sensibles es un mínimo contractual y no sustituye una clasificación completa de datos. Texto libre, nuevos campos o SDKs externos podrían introducir información personal si se registran antes de sanitizarse. También permanece el riesgo de configuración incorrecta del almacenamiento seguro, captura de logs del sistema operativo y pérdida de control sobre datos ya enviados a servicios externos. Se requiere revisión de cambios, escaneo en CI y pruebas negativas cada vez que se agreguen campos o integraciones.
