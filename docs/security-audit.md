# Auditoría de Seguridad y Privacidad

## 1. Objetivo

Realizar una revisión de seguridad y privacidad del proyecto DMI-Equipo-7, identificando configuraciones inseguras, mecanismos de autenticación, manejo de tokens, almacenamiento de información, exposición de secretos y controles de acceso.

La auditoría busca distinguir entre vulnerabilidades reales, debilidades de configuración y elementos que pertenecen exclusivamente al entorno educativo de pruebas.

## 2. Alcance

La revisión se concentró principalmente en:

- Backend ubicado en `course-backend/`.
- Código cliente relacionado con el consumo del backend.
- Configuración CORS.
- Autenticación y autorización.
- Manejo de tokens.
- Almacenamiento de información sensible.
- Exposición de secretos y credenciales.
- Logs.
- Documentación de seguridad y modelo de amenazas.

La revisión corresponde al estado del repositorio analizado durante septiembre de 2026.

## 3. Metodología

Se realizaron búsquedas estáticas mediante `git grep`, revisión directa de archivos fuente, revisión del historial mediante `git blame` y pruebas dinámicas contra el backend local.

Entre las comprobaciones realizadas se buscaron:

- `allow-origin`
- `authorization`
- `accessToken`
- `refreshToken`
- `localStorage`
- `sessionStorage`
- `password`
- `api_key`
- `apikey`
- `jwt`
- `console.log`
- `console.error`
- `process.env`

También se realizó una prueba HTTP utilizando un origen externo simulado para comprobar el comportamiento de CORS.

## 4. Hallazgos

### H-01 — Política CORS demasiado permisiva

**Severidad:** Media / contextual.

**Estado:** Corregido y verificado.

**Archivo afectado:**

`course-backend/server.mjs`

**Problema identificado:**

El servidor establecía inicialmente:

```js
'access-control-allow-origin': '*',
```

Esto provocaba que una solicitud enviada con un origen externo recibiera el encabezado:

```text
access-control-allow-origin: *
```

### Evidencia antes de la corrección

Se ejecutó:

```powershell
curl.exe -i -H "Origin: https://sitio-malicioso.example" http://127.0.0.1:4310/health
```

La respuesta contenía:

```text
HTTP/1.1 200 OK
access-control-allow-origin: *
```

### Corrección aplicada

Se eliminó la configuración global que establecía:

```js
'access-control-allow-origin': '*',
```

De esta manera, el backend deja de anunciar que acepta cualquier origen mediante CORS.

### Evidencia después de la corrección

Se repitió la misma prueba:

```powershell
curl.exe -i -H "Origin: https://sitio-malicioso.example" http://127.0.0.1:4310/health
```

La respuesta obtenida fue:

```text
HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
```

La respuesta ya no contiene:

```text
access-control-allow-origin: *
```

### Resultado

La condición observada originalmente fue reproducida y posteriormente corregida. La prueba posterior confirma que el backend ya no devuelve la política CORS global que permitía cualquier origen.

El hallazgo se considera **corregido**, sujeto a que las pruebas de regresión del proyecto continúen pasando.

### H-02 — Credencial fija utilizada por el fixture de autenticación

**Severidad:** Baja / contextual.

**Estado:** Detectado, pero no clasificado como secreto real.

En `course-backend/server.mjs` y `course-backend/campusops.mjs` se utiliza el valor:

```text
course-valid-token
```

como credencial de prueba.

También existe el refresh token:

```text
course-refresh-0
```

El comportamiento representa una autenticación simplificada.

Sin embargo, la documentación del proyecto identifica estos valores como fixtures públicos de enseñanza y especifica que no constituyen autenticación de producción.

Por lo tanto, no existe evidencia suficiente para clasificar estos valores como credenciales reales comprometidas.

### Recomendación

En un entorno de producción se debería utilizar autenticación real basada en tokens firmados, expiración, rotación y validación en servidor. Las credenciales de prueba deben permanecer limitadas al entorno educativo.

---

## 5. Comprobaciones sin hallazgo

Durante la revisión no se encontraron evidencias de los siguientes problemas:

| Control revisado | Resultado |
|---|---|
| `localStorage` | No encontrado |
| `sessionStorage` | No encontrado |
| API keys explícitas | No encontradas |
| Contraseñas hardcodeadas | No encontradas |
| Implementación JWT real | No encontrada |
| `console.log` | No encontrado |
| `console.error` | No encontrado |
| Secretos reales confirmados | No encontrados |

La ausencia de coincidencias no demuestra que el sistema sea completamente seguro, pero sí constituye evidencia de las áreas revisadas.

## 6. Privacidad

No se identificaron durante esta revisión credenciales reales, información personal real o claves privadas expuestas en el código analizado.

El backend de CampusOps utiliza identidades sintéticas como `reporter-1`, `technician-1` y `coordinator-1`, por lo que los datos observados corresponden al entorno educativo.

Debe evitarse utilizar información personal real dentro de fixtures, pruebas o archivos versionados.

## 7. Riesgos principales

Los riesgos identificados o revisados se resumen de la siguiente manera:

1. **CORS permisivo:** la API acepta cualquier origen mediante `*`.
2. **Autenticación simplificada:** el fixture utiliza tokens fijos para simular autenticación.
3. **Exposición accidental de credenciales en futuros cambios:** los valores de prueba deben mantenerse claramente separados de secretos reales y nunca reutilizarse en producción.

## 8. Evidencia técnica

La configuración CORS fue localizada mediante:

```powershell
git grep -n -i "allow-origin"
```

Resultado:

```text
course-backend/server.mjs:12:
'access-control-allow-origin': '*',
```

El origen de la línea fue revisado mediante:

```powershell
git blame -L 8,15 -- .\course-backend\server.mjs
```

La línea corresponde al commit:

```text
0441c27
```

La vulnerabilidad fue reproducida mediante una solicitud HTTP con un origen externo simulado.

## 9. Conclusión

La auditoría permitió confirmar una configuración CORS demasiado permisiva en el backend. La condición es reproducible y constituye el principal hallazgo técnico confirmado durante la revisión.

También se identificó una autenticación simplificada mediante tokens fijos; sin embargo, la evidencia y documentación del proyecto indican que dichos valores son fixtures educativos y no secretos institucionales reales.

No se encontraron evidencias de almacenamiento de tokens mediante `localStorage` o `sessionStorage`, API keys explícitas, contraseñas hardcodeadas, logs sensibles o secretos reales.

Como acción principal se recomienda restringir la política CORS a los orígenes autorizados y mantener las credenciales de prueba completamente separadas de cualquier configuración de producción.

