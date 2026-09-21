# Modelo de amenazas de CampusOps

## Activo

Los activos principales de CampusOps son la información de incidencias, la asignación de técnicos, los datos de ubicación y fotografías, y la sesión del usuario que atiende cada emergencia. El sistema también debe proteger la confidencialidad de los datos del campus y la integridad del flujo de trabajo de asignación.



## Fronteras de confianza

Las fronteras de confianza del sistema son la interfaz móvil, la capa de aplicación, el dominio de incidencias y los proveedores externos de persistencia o ubicación. La UI no debe poder saltar directamente a infraestructura; la aplicación debe coordinar la lógica de negocio y el dominio debe validar datos antes de entregarlos a las pantallas.

## Amenaza priorizada 1: consulta de incidencias ajenas

Un usuario sin permisos suficientes podría consultar incidencias que no corresponden a su perfil o a su zona. El riesgo principal es la exposición de información sensible de otros reportes o personal del campus.

### Control

Usar los perfiles de usuario, un caso de uso que valide permisos y un conjunto de pruebas que verifiquen que sólo se devuelven incidencias permitidas.

Esta amenaza es especialmente urgente porque puede exponer información de incidencias que debería estar restringida según el perfil del usuario.
Aunque se corrija, todavía podría existir el riesgo de que un usuario autorizado modifique información que no debería cambiar.

## Amenaza priorizada 2: alteración de asignaciones

Un atacante o un flujo defectuoso podría sobrescribir la asignación actual, cambiar un técnico o reabrir una incidencia sin iniciar un proceso validado. Esto afecta la integridad operativa y la trazabilidad.

### Control

La aplicación debe respetar estados y validaciones del dominio; la infraestructura debe aceptar únicamente entradas con el formato esperado y la capa de aplicación debe impedir cambios fuera del flujo autorizado.

Esta amenaza es especialmente grave porque una modificación no autorizada puede afectar directamente la atención y seguimiento de una incidencia.
Aunque se corrija, todavía podría existir el riesgo de que información sensible sea expuesta mediante logs o registros.

## Amenaza priorizada 3: fuga de datos en logs o registros

Los registros pueden incluir ubicaciones, notas de incidentes o identificadores del operador. Si se expone información sin normalización, queda un riesgo de privacidad y de auditoría.

### Control

Aplicar sanitización de logs, evitar imprimir los datos completos en pantalla y comprobar con pruebas que la salida no incluye secretos ni payloads sensibles.

Esta amenaza requiere atención porque puede exponer información sensible incluso cuando el funcionamiento principal de la aplicación sea correcto.
Aunque se corrija, todavía podría existir el riesgo de que las credenciales o secretos queden expuestos en archivos o configuraciones.

## Amenaza priorizada 4: exposición de credenciales o secretos

Un secreto en archivos de configuración, ejemplos o scripts puede quedar visible en el repositorio y comprometer el entorno de despliegue.

### Control

Escaneo de secretos, revisión de diffs y bloqueo de commits con credenciales, junto con evidencia en la revisión de CI.

Esta amenaza es crítica porque una credencial expuesta podría permitir el acceso no autorizado a recursos o servicios del proyecto.
Aunque se corrija, todavía podrían permanecer riesgos relacionados con los permisos de los usuarios y el acceso a las incidencias.

## Control general de seguridad

La estrategia de CampusOps combina validación de dominio, permisos por perfil, sanitización y revisión automática en CI. Estas medidas manejan los riesgos más importantes sin desactivar comprobaciones ni convertir la seguridad en una tarea manual.

## Verificación

La verificación se realiza con un workflow de GitHub Actions que instala dependencias, ejecuta typecheck, lint, smoke tests y auditoría de seguridad. Además, el repositorio conserva evidencia reproducible en `reports/week-03/security.json` para demostrar que un incumplimiento de seguridad hace fallar el proceso y que el estado corregido vuelve a pasar la validación.
