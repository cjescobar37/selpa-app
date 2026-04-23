# AGENTS.md

## Contexto del proyecto

Este proyecto es PAMPrax, hecho con Next.js + Supabase.

La app canónica para desarrollo es `apps/web`.

Las carpetas `apps/web2` y `apps/web3` son copias paralelas/no canónicas. No usarlas como base para cambios nuevos salvo que el usuario pida explícitamente comparar o migrar contenido desde ellas.

La fuente de verdad del esquema de base de datos es `supabase_full.sql`.

El resumen operativo del esquema esta en `docs/schema-summary.md`.

## Instrucciones para trabajar en este repo

Antes de tocar codigo de la app, confirmar que el cambio se aplica en `apps/web`.

Antes de tocar codigo relacionado con cualquiera de estas areas o tablas, primero revisar `supabase_full.sql` y `docs/schema-summary.md`:

- `auth`
- `profiles`
- `clubs`
- `club_memberships`
- `club_players`
- `club_player_private`
- `club_requests`
- `user_settings`
- `tournaments`
- `tournament_teams`
- `tournament_registrations`
- `platform_admins`
- `platform_news`
- `platform_sponsors`
- `platform_ad_campaigns`
- `messages`
- `notifications`
- `categories`
- `club_categories`
- `user_roles`

No asumir estructura de Supabase sin revisar esos archivos.

Priorizar el schema `public` como modelo de negocio de Pamprax y distinguirlo de los schemas internos de Supabase (`auth`, `storage`, `realtime`, `extensions`, etc.).

Si se detectan diferencias entre el codigo y el dump/documentacion, advertirlo antes de modificar logica sensible.

Prestar especial atencion a:

- duplicaciones legacy
- triggers redundantes
- problemas de RLS
- campos que convendria unificar

No tocar nada fuera de documentacion cuando la tarea indique documentacion solamente.
