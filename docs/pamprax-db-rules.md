# Reglas operativas de base de datos para Pamprax

Este documento resume reglas practicas para trabajar con la base de datos de Pamprax. La fuente de verdad sigue siendo `supabase_full.sql`; el resumen amplio esta en `docs/schema-summary.md`.

## Tablas criticas

- Identidad y perfil: `profiles`, `user_settings`, `platform_admins`, `user_roles`.
- Clubes: `clubs`, `club_requests`, `club_memberships`, `club_players`, `club_player_private`.
- Torneos: `tournaments`, `tournament_teams`, `tournament_registrations`, `categories`, `club_categories`.
- Comunicacion: `messages`, `notifications`.
- Contenido de plataforma: `platform_news`, `platform_sponsors`, `platform_ad_campaigns`.

## Relaciones clave

- La mayoria de las tablas de usuario referencian o deberian referenciar `auth.users`.
- `profiles` duplica identidad con `user_id` e `id`; ambos apuntan a `auth.users`.
- `clubs` es el centro del dominio: conecta membresias, jugadores, torneos, categorias y settings.
- `club_memberships` define pertenencia/rol/estado dentro de un club.
- `club_players` define perfil deportivo por club y se usa para acceso a torneos.
- `tournament_teams` agrupa dos usuarios para un torneo.
- `tournament_registrations` formaliza la inscripcion de un equipo a un torneo.
- `user_settings.active_club_id` apunta a `clubs`, pero no garantiza por si solo que el usuario sea miembro aprobado.

## Roles y permisos

- `platform_admins` es la fuente principal detectada para permisos globales mediante `is_platform_admin()`.
- `club_memberships.role` usa `club_role`: `OWNER`, `ADMIN`, `OPERADOR`, `PLANILLERO`, `PLAYER`.
- El rol define permisos administrativos; jugar exige membership aprobada y un `club_players` aprobado del mismo usuario y club.
- `club_memberships.status` usa `membership_status`: `PENDING`, `APPROVED`, `REJECTED`, `BANNED`.
- `is_club_admin(club_id)` es la funcion central para permisos administrativos de club.
- El criterio canónico de membership aprobada exige conjuntamente `status = APPROVED` y `approved_at IS NOT NULL`.
- `user_roles` existe, pero su relacion con `platform_admins` no esta clara. No usarlo como fuente nueva de autorizacion sin revisar el flujo completo.

## Riesgos de RLS

- `notifications` no permite `INSERT` directo a usuarios autenticados; crear notificaciones solo desde backend/RPC autorizado.
- `club_player_private` tiene RLS habilitado sin policies. Esto bloquea acceso directo por defecto; tratarlo como dato sensible.
- `club_requests`, `categories`, `club_categories` y `user_roles` no tienen RLS habilitado en el dump. Revisar grants efectivos antes de exponerlas desde cliente.
- `platform_news`, `platform_sponsors` y `platform_ad_campaigns` tienen lectura publica por `status`, pero no policies de escritura para admins.
- Las policies de `tournaments`, `tournament_teams` y `tournament_registrations` se solapan. Cambios en una tabla pueden abrir o cerrar acceso en otra.

## Duplicaciones legacy a no empeorar

- No agregar mas columnas paralelas en `tournaments`; ya existen pares legacy/nuevo para tipo, formato, genero, fechas, deadlines, categoria y reglas.
- No agregar otra forma de identificar usuario en `profiles`; resolver primero `id` vs `user_id`.
- No crear nuevos triggers de `updated_at`; ya hay funciones y triggers redundantes.
- No crear nuevas fuentes de roles globales sin decidir entre `platform_admins` y `user_roles`.
- No duplicar pertenencia usuario-club sin definir si la fuente de verdad es `club_memberships` o `club_players`.

## Advertencias por tabla

### `tournaments`

Es la tabla con mayor deuda legacy. Antes de tocarla, revisar especialmente:

- `type` vs `tournament_type`.
- `format` text vs enum `tournament_format`.
- `gender` text vs enum `tournament_gender`.
- `category_id` vs `category`.
- `start_date`/`end_date` vs `starts_on`/`ends_on`.
- `signup_deadline` vs `registration_deadline`.
- `rules_json` vs `rules`.
- Triggers: `tg_sync_tournament_deadlines`, `tg_tournaments_sync_legacy`, y triggers duplicados de `updated_at`.

### `profiles`

`profiles` conserva `user_id` como PK y `id` como identificador sincronizado. Ambos referencian `auth.users`.

No cambiar logica de perfiles, alta de usuarios o policies sin revisar:

- `handle_new_auth_user()`
- `handle_new_user()`
- `profiles_sync_id()`
- `profiles_sync_ids()`
- `trg_profiles_sync_id`

### `user_settings`

`user_settings` tiene policies y triggers duplicados.

Antes de cambiarlo, considerar:

- `active_club_id` no valida membresia aprobada.
- Hay tres triggers de `updated_at`.
- Hay policies duplicadas para `select`, `insert` y `update`.

## Criterios para futuras migraciones SQL

- Separar DDL base, RLS/policies, triggers/functions y seed data en migraciones distintas.
- Mantener cambios de `public` separados de schemas internos de Supabase.
- Toda migracion sensible debe declarar si afecta permisos, datos existentes o compatibilidad legacy.
- Antes de eliminar columnas legacy, crear migracion de backfill y verificacion.
- Preferir enums/check constraints para estados y tipos nuevos.
- Agregar FKs faltantes solo despues de revisar datos existentes y comportamiento esperado ante deletes.
- Evitar nuevas policies solapadas; modificar o reemplazar las existentes con criterio explicito.
- Cada migracion que toque auth/perfiles/clubes/torneos debe revisar `supabase_full.sql` y `docs/schema-summary.md` antes de implementarse.
