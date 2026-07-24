# Club Admin — Sponsors y publicidad

## Alcance implementado

El módulo canónico vive en `/club/publicidad` y mantiene dos áreas: Sponsors y Campañas. Reutiliza exclusivamente las ubicaciones que ya renderiza la home pública del club:

- `CLUB_HOME_HERO`
- `CLUB_HOME_AFTER_TOURNAMENTS`
- `CLUB_HOME_AFTER_NEWS`

No se mezcla con `platform_sponsors` ni `platform_ad_campaigns`.

## Modelo

- `club_sponsors`: acuerdo, contacto privado, vigencia, prioridad y logo.
- `club_ad_campaigns`: contenido, vigencia, estado, prioridad y configuración visual.
- `club_ad_campaign_placements`: relación de una campaña con una o varias ubicaciones reales.
- `club_ad_events`: impresiones y clics anonimizados, deduplicados por sesión/campaña/ubicación/hora.
- Bucket público `club-commercial-assets`, con escritura restringida por capacidad y path de club.

Los estados `scheduled` pasan a ser visibles automáticamente cuando comienza la vigencia porque la consulta pública valida las fechas. `active` y `scheduled` dejan de renderizarse al vencer. No se requiere cron para la visibilidad.

## Autorización

Las APIs exigen `sponsors:manage` o `ads:manage`; RLS repite la misma autorización. La matriz canónica vigente concede esas capacidades a OWNER, ADMIN y OPERADOR. PLANILLERO y PLAYER no acceden. Cambiar la matriz de OPERADOR requiere un sprint de autorización separado.

## Métricas

`record_club_ad_event()` es `security definer`, fija `search_path`, valida campaña vigente y placement real, y solo recibe una clave de sesión que almacena como SHA-256. La UI pública registra una impresión por montaje y el clic antes de navegar con `keepalive`. La restricción única evita duplicados dentro de una hora.

## Aplicación

Ejecutar en Supabase Web:

1. `apps/web/supabase/migrations/20260728_club_sponsors_advertising.sql`
2. `apps/web/supabase/qa/20260728_club_sponsors_advertising_validation.sql`

La QA corre en una transacción y finaliza con `ROLLBACK`.
