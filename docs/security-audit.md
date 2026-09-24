# Auditoría de seguridad - Semana 4

## Hallazgos

| # | Hallazgo | Riesgo | Solución aplicada | Evidencia |
|---|---|---|---|---|
| 1 | La telemetría podía recibir correo, ubicación y datos de la incidencia sin ocultarlos. | Un log podría mostrar datos personales o información interna. | Se implementó `redactForTelemetry` para ocultar las claves sensibles y conservar solo el contexto técnico. | `docs/evidence/captura-1.png` |
| 2 | Algunos errores mostraban el código HTTP o que se trataba de un fixture de enseñanza. | El usuario podía ver detalles internos que no necesita conocer. | Se cambiaron por mensajes generales. | `docs/evidence/captura-2.png` |
| 3 | El backend usa tokens escritos en el código para los escenarios públicos de prueba. | Si alguien copiara esos valores a una aplicación real, podría confundirlos con credenciales verdaderas. | Se revisó el caso. Son valores ficticios documentados y necesarios para las pruebas del curso; no son secretos reales. | `docs/evidence/captura-3.png` |

## Hallazgo 1 - Datos sensibles en telemetría

### Problema encontrado

La función `redactForTelemetry` estaba pendiente. Eso dejaba sin una protección clara los objetos que pudieran terminar en logs o telemetría.

### Riesgo

Un objeto puede tener correo, nombre, ubicación, fotos, token o comentarios internos. Registrar esos datos puede exponer información de personas o de una incidencia.

### Solución

Se agregó una sanitización recursiva en `src/course-evaluation/index.ts`. Oculta las claves sensibles con `[REDACTED]`, también dentro de objetos y listas. Los datos técnicos como `incidentId` se conservan.

### Evidencia

La prueba pública de la Semana 4 pasó después del cambio. Ver `docs/evidence/captura-1.png`.

## Hallazgo 2 - Mensajes de error con detalles internos

### Problema encontrado

El cliente incluía el código de estado en el error de salud del backend y el servidor mencionaba que el límite pertenecía a un fixture de enseñanza.

### Riesgo

Los mensajes de error pueden revelar detalles de implementación y ayudar a conocer cómo está construido el servicio.

### Solución

Se cambiaron por mensajes generales: `No fue posible consultar el servicio`, `La respuesta del servicio no es válida` y `request too large`.

### Evidencia

El typecheck, lint y self-test del backend terminaron correctamente. Ver `docs/evidence/captura-2.png`.

## Hallazgo 3 - Tokens ficticios del backend

### Problema encontrado

Los escenarios del backend tienen valores de token escritos directamente en el código.

### Riesgo

Aunque son datos ficticios, alguien podría copiar la costumbre y poner una credencial real de la misma forma.

### Revisión

No se modificaron porque el contrato público del curso los usa como fixtures de prueba y dice que no son credenciales de producción. Se verificó que no hay un archivo `.env` para subir y que `.env` está incluido en `.gitignore`.

### Evidencia

Ver `docs/evidence/captura-3.png`.

## Comprobación final

- La rama local es `week4/security-audit-local`.
- No se creó ni se subió ningún commit.
- No se usaron credenciales reales.
- `.env` está ignorado por Git.
