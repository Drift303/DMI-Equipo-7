# ADR-001: Arquitectura por límites para CampusOps

## Contexto

CampusOps tendrá pantallas de incidencias, reglas de dominio, sesión, persistencia y proveedores externos. En Semana 2 sólo necesitamos una lista y un detalle con datos sintéticos, pero el diseño debe permitir sustituir el almacenamiento o transporte sin rehacer la UI.

## Alternativas consideradas

1. **UI conectada directamente a un repositorio concreto.** Es rápida para un prototipo, pero mezcla presentación, selección de datos y detalles del proveedor. Las pruebas requieren montar la UI con esa implementación y cambiar de proveedor obliga a editar pantallas.
2. **Límites UI, application, domain e infrastructure.** La UI solicita casos de uso; application coordina el contrato del dominio; infrastructure implementa ese contrato. El fake en memoria permite probar el flujo sin red y después puede sustituirse por API o persistencia.

## Decisión

Elegimos separar `ui` (App.tsx), `application` (casos de uso), `domain` (modelo y contrato `IncidentRepository`) e `infrastructure` (fake determinista y composición de dependencias). La UI no importa el fake ni conoce transporte, DTO o almacenamiento.

Los perfiles reportante, técnico y coordinador, así como sesión, persistencia y ubicación, quedan como límites previstos en el diagrama. No se implementan todavía porque pertenecen a hitos posteriores.

## Consecuencias y trade-off

Ganamos pruebas deterministas y un costo menor para cambiar el fake por un proveedor real. La aplicación también puede reutilizarse desde otra pantalla. A cambio, hay más archivos y una interfaz que mantener para un flujo pequeño; aceptamos esa complejidad porque reduce el acoplamiento futuro y permite detectar imports prohibidos.

## Verificación

La prueba pública comprueba que el diagrama contiene los cuatro límites y no declara una flecha directa UI a infrastructure. El typecheck y el smoke test comprueban que la lista/detalle y el estado del backend siguen siendo ejecutables.
