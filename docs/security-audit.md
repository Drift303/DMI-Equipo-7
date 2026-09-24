# Auditoría de seguridad y privacidad - Semana 4

## Alcance

Se revisaron los puntos de entrada de configuración y las utilidades de diagnóstico de CampusOps. Todos los ejemplos y pruebas usan datos sintéticos; no se agregaron credenciales ni datos personales reales.

## Hallazgos

| # | Hallazgo | Riesgo | Solución aplicada | Evidencia |
|---|---|---|---|---|
| 1 | `redactForTelemetry` estaba pendiente en `src/course-evaluation/index.ts`; al recibir un evento de diagnóstico lanzaba un error en vez de generar una copia segura. | Un registro futuro podía incluir autorización, tokens, ubicación, fotos, comentarios internos o datos de perfil sin una barrera central de sanitización. | Se implementó sanitización profunda y sin mutación. Los campos sensibles se sustituyen por `[REDACTED]`; se preservan campos técnicos como `incidentId`, estado e intento. | `docs/evidence/telemetry-redaction-test.png` |
| 2 | La URL del backend configurable mediante `EXPO_PUBLIC_COURSE_BACKEND_URL` no se validaba antes de usarla. | Una URL malformada o con `usuario:contraseña@host` podía llegar a solicitudes o a diagnósticos y exponer información de configuración. | Se agregó `resolveBackendUrl`, que sólo acepta HTTP(S) y rechaza URLs con credenciales. Los fallos de red se reemplazan por un mensaje genérico. | `docs/evidence/backend-url-validation-test.png` |
| 3 | El archivo `.env` es un posible vector de fuga si Git no lo ignora. | Una configuración local podría subirse accidentalmente al repositorio. | Se verificó el control existente: `.gitignore` contiene `.env` y `git status --ignored --short .env` confirma que el archivo queda ignorado. No se añadieron secretos al repositorio. | `docs/evidence/env-ignored.png` |

## Hallazgo 1 - Telemetría sin sanitización funcional

### Problema encontrado

`redactForTelemetry` era un marcador pendiente y no devolvía una representación segura del evento. Los eventos pueden contener información de sesión, perfiles, ubicación y evidencias de una incidencia.

### Riesgo

Registrar el objeto completo puede revelar información privada en la consola, reportes de errores o servicios de observabilidad.

### Solución

Se implementó una copia recursiva que reconoce claves sensibles aunque usen guiones o guiones bajos. Redacta, entre otras, `authorization`, `token`, `email`, `location`, `photos` e `internalComments`. La entrada no se modifica.

### Comprobación

```bash
npm test -- --ci --runInBand course-tests/public/week-04.test.ts
```

La prueba comprueba que la información sensible cambia a `[REDACTED]` y que el contexto técnico permitido se conserva.

## Hallazgo 2 - Configuración de endpoint no validada

### Problema encontrado

La URL pública del backend se utilizaba directamente. Aun cuando no debe contener secretos, una configuración como `https://usuario:contrasena@servidor.test` incorporaría credenciales en la URL.

### Riesgo

Las credenciales embebidas pueden quedar expuestas en herramientas de red, mensajes de excepción o diagnósticos.

### Solución

Se creó `resolveBackendUrl` en `src/api/courseBackend.ts`. Acepta únicamente URLs HTTP(S) sin usuario ni contraseña y devuelve un error genérico si la configuración no es válida. El manejo de un fallo de red tampoco incluye la URL configurada.

### Comprobación

```bash
npm test -- --ci --runInBand src/api/courseBackend.test.ts
```

La prueba acepta una URL HTTPS sin credenciales y rechaza protocolos no permitidos, URLs con usuario y contraseña, y valores que no son URL.

## Hallazgo 3 - Riesgo de incluir configuración local

### Problema encontrado

Los archivos `.env` suelen almacenar configuración local y se pueden agregar por accidente. En este proyecto no se encontró una filtración: se auditó el riesgo y se confirmó el control preventivo ya existente.

### Riesgo

Si `.env` dejara de estar ignorado, una futura configuración local podría llegar al historial de Git.

### Solución y comprobación

`.gitignore` incluye `.env`. Se verificó con el comando siguiente, usando sólo la configuración local de ejemplo:

```bash
git status --ignored --short .env
```

La salida esperada comienza con `!! .env`, lo que confirma que Git lo ignora. `.env.example` se conserva como plantilla y no contiene secretos.

## Verificación final

```bash
npm run typecheck
npm test -- --ci --runInBand course-tests/public/week-04.test.ts
npm test -- --ci --runInBand src/api/courseBackend.test.ts
git status --ignored --short .env
git status
```
