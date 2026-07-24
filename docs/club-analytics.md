# Club Admin — Estadísticas

## Arquitectura

La ruta `/club/estadisticas` es un workspace visual de uso diario. `/club/reportes` permanece separado para documentos y futuras exportaciones.

El navegador hace una sola solicitud a `/api/clubs/[clubId]/analytics`. El endpoint valida el usuario y `club_id`, consulta las fuentes en paralelo y devuelve agregados por sección. No se exponen observaciones internas, contactos ni datos privados.

## Permisos

- Acceso general: `reports:operational_view`.
- Finanzas: `finance:view`.
- Contenido: `content:view` o `ads:manage`.
- OWNER y ADMIN acceden a todo según la matriz canónica.
- OPERADOR accede al bloque operativo porque actualmente posee `reports:operational_view`; Finanzas queda oculto si no posee `finance:view`.
- PLANILLERO y PLAYER no acceden.

## Fuentes y fórmulas

- Jugadores: `club_players` aprobados; altas por `approved_at`.
- Solicitudes: `club_memberships.status = PENDING`.
- Torneos: `tournaments.created_at` dentro del período.
- Inscripciones: `tournament_registrations.created_at`; canceladas se excluyen de ocupación.
- Ocupación: inscripciones no canceladas / suma de `max_pairs`. Sin cupos configurados se informa “Sin datos”.
- Actividad: `tournament_matches.created_at`; hora y día usan `scheduled_at` cuando existe.
- Finanzas: `club_financial_transactions` y `club_receivables`. Cada moneda se agrega por separado; nunca se consolidan monedas.
- Contenido: noticias publicadas, sponsors/campañas vigentes y `club_ad_events`.
- CTR: clics / impresiones × 100.
- Comparación: período inmediatamente anterior de igual duración. Si la base es cero no se muestra un porcentaje.

## Timezone

El esquema actual no posee timezone configurable por club. Se documenta y muestra el fallback `America/Argentina/Buenos_Aires`. No se afirma precisión local para clubes fuera de esa zona hasta incorporar una configuración canónica.

## Insights

Reglas determinísticas: variación de inscripciones ≥10% o ≤-15%, ocupación ≥90%, gastos superiores a ingresos y sponsors que vencen dentro de 30 días. Se muestran como máximo cinco.

## Limitaciones reales

- No se calcula duración media: no existe una pareja confiable de timestamps de inicio/fin.
- No se calcula walkover ni sets de forma agregada: `score` es JSON y no hay contrato canónico uniforme para esos conceptos.
- No hay vistas de noticias porque no existe tracking de lectura.
- No se calcula tiempo hasta completar cupos ni lista de espera porque no hay eventos canónicos para ambos.
- La recaudación por torneo mostrable es proyectada desde precio e inscripciones; no se presenta como ingreso cobrado.
- La evolución mensual avanzada queda pendiente hasta estabilizar snapshots históricos o funciones SQL dedicadas.

## SQL

Aplicar:

1. `apps/web/supabase/migrations/20260729_club_analytics.sql`
2. `apps/web/supabase/qa/20260729_club_analytics_validation.sql`

La QA usa datos temporales y finaliza con `ROLLBACK`.
