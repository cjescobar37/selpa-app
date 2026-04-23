# Resumen del schema public

Archivo analizado: `supabase_full.sql`.

Este documento resume solo el schema `public`, dejando afuera los schemas internos/administrados por Supabase (`auth`, `storage`, `realtime`, `extensions`, etc.) salvo cuando una tabla `public` referencia `auth.users`.

## Vista general

El modelo de Pamprax se organiza alrededor de clubes, usuarios/perfiles, membresías, jugadores, torneos, contenido de plataforma, mensajes y notificaciones.

Enums de negocio detectados en `public`:

- `club_role`: `OWNER`, `ADMIN`, `PLANILLERO`, `PLAYER`.
- `membership_status`: `PENDING`, `APPROVED`, `REJECTED`, `BANNED`.
- `tournament_format`: `GROUPS_ELIM`, `DIRECT_ELIM`, `AMERICANO`, `GROUPS_ELIMINATION`.
- `tournament_gender`: `MALE`, `FEMALE`, `MIXED`.
- `tournament_reg_status`: `PENDING`, `CONFIRMED`, `CANCELLED`.
- `tournament_status`: `DRAFT`, `OPEN`, `RUNNING`, `FINISHED`, `CANCELLED`.
- `tournament_type`: `OPEN`, `CHALLENGER`, `MASTER`, `MASTER_FINAL`.

Funciones `public` relevantes:

- Autenticación/perfiles: `handle_new_auth_user()`, `handle_new_user()`, `profiles_sync_id()`, `profiles_sync_ids()`.
- Autorización: `is_platform_admin()`, `is_club_admin(uuid)`, `is_club_member_approved(uuid)`.
- Clubes/jugadores/torneos: `create_club(text, text, text)`, `ensure_club_player(uuid)`, `register_team_for_tournament(uuid, uuid, uuid)`, `search_club_players(uuid, text, integer)`.
- Triggers utilitarios: `set_updated_at()`, `tg_set_updated_at()`, `touch_updated_at()`, `set_updated_at_platform_content()`, `tg_sync_tournament_deadlines()`, `tg_tournaments_sync_legacy()`.

## Tablas

### `clubs`

Propósito funcional: entidad principal de clubes/sedes. Guarda datos comerciales, contacto, ubicación, branding, dueño y archivos asociados.

Columnas principales: `id`, `name`, `slug`, `city`, `address`, `phone`, `is_active`, `brand_name`, `legal_name`, `cuit`, `contact_email`, `website`, `instagram`, `province`, `country`, `opening_hours`, `courts_count`, `courts_surface`, `logo_url`, `rules_pdf_url`, `owner_name`, `owner_email`, `owner_phone`, `owner_user_id`, `notes`, `created_at`, `updated_at`.

Claves:

- PK: `clubs_pkey` sobre `id`.
- Unique: `clubs_slug_key` sobre `slug`.
- Indices: `clubs_cuit_key` unique parcial sobre `cuit` no vacio, `clubs_contact_email_idx`, `clubs_owner_email_idx`, `clubs_owner_user_id_idx`.
- No se detecta FK para `owner_user_id`, aunque por nombre parece apuntar a `auth.users`.

Relaciones:

- Referenciada por `club_categories`, `club_memberships`, `club_players`, `tournaments`, `tournament_teams`, `tournament_registrations` y `user_settings`.

RLS: habilitado.

Policies:

- `clubs_select`: platform admins o miembros aprobados de clubes activos.
- `clubs_insert_platform_admin`: solo platform admin.
- `clubs_update`: platform admin o admin del club.
- `clubs_delete_admin`: solo platform admin.

Triggers y funciones:

- `clubs_set_updated_at` usa `tg_set_updated_at()`.
- `trg_clubs_updated_at` usa `set_updated_at()`.
- `create_club(...)` crea clubes y probablemente membresía/owner inicial.

Observaciones/deuda:

- Dos triggers de `updated_at` sobre la misma tabla son redundantes.
- `owner_user_id` no tiene FK, mientras que otras relaciones a usuarios si usan `auth.users`.
- `clubs` replica campos presentes en `club_requests`, lo cual es razonable si `club_requests` es staging, pero conviene formalizar ese flujo.

### `club_memberships`

Propósito funcional: membresía y rol de un usuario dentro de un club.

Columnas principales: `id`, `club_id`, `user_id`, `role`, `status`, `approved_by`, `approved_at`, `rejection_reason`, `created_at`, `updated_at`.

Claves:

- PK: `club_memberships_pkey` sobre `id`.
- Unique: `club_memberships_club_id_user_id_key` sobre `(club_id, user_id)`.
- FK: `club_id` -> `clubs(id)` con `ON DELETE CASCADE`.
- FK: `user_id` -> `auth.users(id)` con `ON DELETE CASCADE`.
- FK: `approved_by` -> `auth.users(id)`.
- Indices: `idx_club_memberships_club`, `idx_club_memberships_user`.

Relaciones:

- Se usa para resolver permisos de club (`is_club_admin`, `is_club_member_approved`) y visibilidad de clubes/torneos.
- Se solapa parcialmente con `club_players`, que tambien vincula usuario y club.

RLS: habilitado.

Policies:

- `club_memberships_select`: el usuario ve su membresía; platform admin y club admin ven las del club.
- `club_memberships_insert`: platform admin o usuario creando su propia solicitud como `PLAYER/PENDING`.
- `club_memberships_update`: platform admin o club admin.
- `club_memberships_delete`: platform admin o club admin.

Triggers y funciones:

- `club_memberships_set_updated_at` usa `tg_set_updated_at()`.
- `trg_club_memberships_updated_at` usa `set_updated_at()`.
- Usada por `is_club_admin(uuid)` y `is_club_member_approved(uuid)`.

Observaciones/deuda:

- Dos triggers actualizan `updated_at`.
- Hay dos conceptos de pertenencia: `club_memberships` y `club_players`. Conviene definir si jugador aprobado deriva de membership o si son agregados distintos.
- Algunas policies usan `status = APPROVED`; otras usan `approved_at IS NOT NULL`, lo que puede divergir.

### `club_players`

Propósito funcional: perfil deportivo de un usuario dentro de un club.

Columnas principales: `id`, `club_id`, `user_id`, `display_name`, `category`, `gender`, `approved_at`, `approved_by`, `created_at`, `updated_at`.

Claves:

- PK: `club_players_pkey` sobre `id`.
- Unique: `club_players_club_id_user_id_key` sobre `(club_id, user_id)`.
- FK: `club_id` -> `clubs(id)` con `ON DELETE CASCADE`.
- FK: `user_id` -> `auth.users(id)` con `ON DELETE CASCADE`.
- FK: `approved_by` -> `auth.users(id)`.

Relaciones:

- Tiene datos privados asociados en `club_player_private`.
- Se usa en policies de `tournament_teams` y `tournament_registrations` para dar acceso a usuarios del club.

RLS: habilitado.

Policies:

- `club_players_select`: el propio usuario o admin del club.
- `club_players_insert_self`: el usuario puede insertarse a si mismo.
- `club_players_update_self`: el propio usuario o admin del club.

Triggers y funciones:

- `trg_club_players_updated_at` usa `set_updated_at()`.
- `ensure_club_player(uuid)` parece asegurar/crear el jugador para el club.
- `search_club_players(uuid, text, integer)` consulta jugadores del club.

Observaciones/deuda:

- `gender` es `text` aunque existe `tournament_gender`; podria requerir enum propio de jugador o constraint.
- `category` es `integer`, mientras `categories.id` es `smallint`; no hay FK directa.
- La aprobacion usa `approved_at/approved_by` pero no `status`, a diferencia de `club_memberships`.

### `club_player_private`

Propósito funcional: datos sensibles del jugador, separado del perfil deportivo publico/operativo.

Columnas principales: `club_player_id`, `dni`, `created_at`.

Claves:

- PK: `club_player_private_pkey` sobre `club_player_id`.
- FK: `club_player_id` -> `club_players(id)` con `ON DELETE CASCADE`.

Relaciones:

- Es extension 1:1 de `club_players`.

RLS: habilitado.

Policies: no se detectaron policies asociadas.

Triggers y funciones: no se detectaron triggers directos.

Observaciones/deuda:

- RLS habilitado sin policies bloquea acceso directo por defecto. Puede ser intencional para datos sensibles, pero conviene documentar que solo se accede por backend/service role o funciones seguras.
- `dni` esta como texto sin constraint de formato/unicidad.

### `club_requests`

Propósito funcional: solicitudes de alta/aprobacion de clubes antes de crear o activar un `club`.

Columnas principales: `id`, `club_name`, `brand_name`, `legal_name`, `cuit`, `contact_email`, `phone`, `website`, `instagram`, `address`, `city`, `province`, `country`, `opening_hours`, `courts_count`, `courts_surface`, `logo_url`, `rules_pdf_url`, `notes`, `owner_name`, `owner_email`, `owner_phone`, `status`, `created_at`, `updated_at`.

Claves:

- PK: `club_requests_pkey` sobre `id`.
- Indices: `club_requests_owner_email_idx`, `club_requests_status_idx`.
- No se detectaron FKs.

Relaciones:

- Relacion funcional con `clubs`, pero no hay FK ni referencia a club creado/aprobado.

RLS: no se detecto `ENABLE ROW LEVEL SECURITY`.

Policies: no se detectaron.

Triggers y funciones:

- `club_requests_set_updated_at` usa `tg_set_updated_at()`.

Observaciones/deuda:

- Tabla sin RLS pese a contener datos de contacto/propietario.
- Duplicacion de campos con `clubs`; falta trazabilidad formal de solicitud aprobada -> club resultante.
- `status` es `text`, sin enum/check.

### `profiles`

Propósito funcional: perfil publico/usuario de la persona autenticada.

Columnas principales: `user_id`, `id`, `email`, `first_name`, `last_name`, `display_name`, `city`, `birth_date`, `height_cm`, `dominant_hand`, `avatar_url`, `cover_url`, `created_at`, `updated_at`.

Claves:

- PK: `profiles_pkey` sobre `user_id`.
- Unique: `profiles_email_key` sobre `email`.
- Unique index: `profiles_id_uidx` sobre `id`.
- FK: `user_id` -> `auth.users(id)` con `ON DELETE CASCADE`.
- FK: `id` -> `auth.users(id)` con `ON DELETE CASCADE`.
- Indices: `profiles_email_idx`, `profiles_name_idx`.

Relaciones:

- Se relaciona logicamente con todas las tablas que referencian usuarios (`club_memberships`, `club_players`, contenido de plataforma, torneos, mensajes, notificaciones).
- La relacion real de FK en esas tablas apunta a `auth.users`, no a `profiles`.

RLS: habilitado.

Policies:

- `profiles_select_own`: el usuario ve su perfil si `id` o `user_id` coincide con `auth.uid()`.
- `profiles_insert_own`: el usuario crea su perfil si `id` o `user_id` coincide.
- `profiles_update_own`: el usuario edita su perfil si `id` o `user_id` coincide.

Triggers y funciones:

- `trg_profiles_sync_id` usa `profiles_sync_ids()`.
- `trg_profiles_updated_at` usa `set_updated_at()`.
- `handle_new_auth_user()` crea/sincroniza perfil al insertar en `auth.users`.
- Existe tambien `handle_new_user()` y `profiles_sync_id()`, aparentemente legacy/no conectadas a trigger actual.

Observaciones/deuda:

- `id` y `user_id` duplican identidad; ambos son FK a `auth.users`.
- Hay funciones duplicadas para sincronizacion (`profiles_sync_id` y `profiles_sync_ids`).
- `email` unique puede chocar con cambios de email o cuentas SSO si no se define estrategia.

### `user_settings`

Propósito funcional: preferencias por usuario, especialmente club activo.

Columnas principales: `user_id`, `active_club_id`, `created_at`, `updated_at`.

Claves:

- PK: `user_settings_pkey` sobre `user_id`.
- FK: `user_id` -> `auth.users(id)` con `ON DELETE CASCADE`.
- FK: `active_club_id` -> `clubs(id)` con `ON DELETE SET NULL`.

Relaciones:

- Marca el club activo del usuario; no valida por FK que el usuario sea miembro de ese club.

RLS: habilitado.

Policies:

- `user_settings_select` y `user_settings_select_own`: ambas permiten SELECT del propio usuario.
- `user_settings_insert` y `user_settings_upsert_own`: ambas permiten INSERT del propio usuario.
- `user_settings_update` y `user_settings_update_own`: ambas permiten UPDATE del propio usuario.

Triggers y funciones:

- `trg_user_settings_updated_at` usa `set_updated_at()`.
- `user_settings_set_updated_at` usa `tg_set_updated_at()`.
- `user_settings_updated_at` usa `set_updated_at()`.

Observaciones/deuda:

- Tres triggers redundantes sobre `updated_at`.
- Policies duplicadas en SELECT/INSERT/UPDATE.
- `active_club_id` puede apuntar a un club donde el usuario no tiene membership aprobada.

### `tournaments`

Propósito funcional: torneos organizados por un club.

Columnas principales: `id`, `club_id`, `name`, `type`, `format`, `gender`, `category_id`, `category`, `start_date`, `starts_on`, `end_date`, `ends_on`, `signup_deadline`, `registration_deadline`, `status`, `price_per_player`, `max_pairs`, `min_pairs`, `points_total`, `tournament_type`, `description`, `rules_json`, `rules`, `created_at`, `updated_at`.

Claves:

- PK: `tournaments_pkey` sobre `id`.
- FK: `club_id` -> `clubs(id)` con `ON DELETE CASCADE`.
- FK: `category_id` -> `categories(id)`.
- Index: `idx_tournaments_club`.

Relaciones:

- Tiene equipos en `tournament_teams`.
- Tiene inscripciones en `tournament_registrations`.
- Pertenece a `clubs` y categoria de `categories`.

RLS: habilitado.

Policies:

- `tournaments_select`: miembros con `status = APPROVED`.
- `tournaments_select_member`: miembros con `approved_at IS NOT NULL`.
- `tournaments_insert`: admin del club.
- `tournaments_update`: admin del club.
- `tournaments_update_admin`: platform admin o admin del club.
- `tournaments_write_admin`: OWNER/ADMIN aprobado por `approved_at IS NOT NULL`.
- `tournaments_delete_admin`: platform admin o admin del club.

Triggers y funciones:

- `tournaments_set_updated_at` usa `tg_set_updated_at()`.
- `trg_tournaments_updated_at` usa `set_updated_at()`.
- `trg_sync_tournament_deadlines` usa `tg_sync_tournament_deadlines()`.
- `trg_tournaments_sync_legacy` usa `tg_tournaments_sync_legacy()`.
- `register_team_for_tournament(...)` crea equipo/inscripcion.

Observaciones/deuda:

- Es la tabla con mayor deuda legacy: `type` vs `tournament_type`, `format` text vs enum `tournament_format`, `gender` text vs enum `tournament_gender`, `category_id` vs `category`, `start_date` vs `starts_on`, `end_date` vs `ends_on`, `signup_deadline` vs `registration_deadline`, `rules_json` vs `rules`.
- Multiples policies se solapan y usan criterios distintos (`status` vs `approved_at`).
- Dos triggers de `updated_at` y dos triggers de sincronizacion legacy/deadlines agregan complejidad.

### `tournament_teams`

Propósito funcional: pareja/equipo inscripto o candidato a inscribirse en un torneo.

Columnas principales: `id`, `tournament_id`, `club_id`, `player1_user_id`, `player2_user_id`, `created_by`, `created_at`.

Claves:

- PK: `tournament_teams_pkey` sobre `id`.
- Unique: `tournament_teams_tournament_id_player1_user_id_player2_user_key`.
- Unique index: `uq_team_pair_ordered` sobre `(tournament_id, LEAST(player1_user_id, player2_user_id), GREATEST(...))`.
- FK: `tournament_id` -> `tournaments(id)` con `ON DELETE CASCADE`.
- FK: `club_id` -> `clubs(id)` con `ON DELETE CASCADE`.
- FK: `player1_user_id`, `player2_user_id`, `created_by` -> `auth.users(id)`.

Relaciones:

- Referenciada por `tournament_registrations.team_id`.
- Pertenece a `tournaments` y `clubs`.

RLS: habilitado.

Policies:

- `teams_select`: jugadores del equipo o admin del club.
- `tt_select_club`: cualquier usuario presente en `club_players` del club.
- `teams_insert`: `created_by = auth.uid()` y el creador es jugador del equipo o admin del club.

Triggers y funciones: no se detectaron triggers directos.

Observaciones/deuda:

- Hay dos mecanismos de unicidad para parejas: unique directo en orden de columnas y unique index ordenado. El segundo previene duplicados invertidos; el primero queda parcialmente redundante.
- No hay constraint para impedir `player1_user_id = player2_user_id`.
- Policies de SELECT se solapan.

### `tournament_registrations`

Propósito funcional: inscripcion formal de un equipo a un torneo.

Columnas principales: `id`, `tournament_id`, `club_id`, `team_id`, `status`, `created_by`, `created_at`.

Claves:

- PK: `tournament_registrations_pkey` sobre `id`.
- Unique: `tournament_registrations_tournament_id_team_id_key`.
- FK: `tournament_id` -> `tournaments(id)` con `ON DELETE CASCADE`.
- FK: `club_id` -> `clubs(id)` con `ON DELETE CASCADE`.
- FK: `team_id` -> `tournament_teams(id)` con `ON DELETE CASCADE`.
- FK: `created_by` -> `auth.users(id)`.

Relaciones:

- Une `tournaments`, `tournament_teams`, `clubs` y usuario creador.

RLS: habilitado.

Policies:

- `regs_select`: admin del club o jugadores del equipo.
- `tr_select_club`: cualquier usuario presente en `club_players` del club.
- `regs_insert`: creador autenticado, admin del club o jugador del equipo.
- `regs_update_admin`: admin del club.

Triggers y funciones:

- `register_team_for_tournament(...)` probablemente crea registro junto con equipo.

Observaciones/deuda:

- `club_id` puede desnormalizar el club ya derivable de `tournament_id` o `team_id`; conviene asegurar consistencia.
- Policies SELECT solapadas.
- No se detecta validacion directa de cupos, fechas o estado del torneo en constraints; podria estar en funcion.

### `platform_admins`

Propósito funcional: lista de usuarios administradores globales de la plataforma.

Columnas principales: `user_id`, `created_at`.

Claves:

- PK: `platform_admins_pkey` sobre `user_id`.
- FK: `user_id` -> `auth.users(id)` con `ON DELETE CASCADE`.

Relaciones:

- Usada por `is_platform_admin()` y policies de administracion global.

RLS: habilitado.

Policies:

- `platform_admins_select_own`: solo permite ver el propio registro.

Triggers y funciones:

- Usada por `is_platform_admin()`.

Observaciones/deuda:

- No se detectan policies de INSERT/UPDATE/DELETE; la gestion depende de service role o SQL administrativo.
- Si los admins no pueden listar otros admins por RLS, la UI administrativa necesitaria RPC segura o service role.

### `platform_news`

Propósito funcional: noticias/contenido editorial de la plataforma.

Columnas principales: `id`, `title`, `slug`, `excerpt`, `body`, `cover_url`, `gallery_urls`, `status`, `placement`, `published_at`, `created_by`, `updated_by`, `created_at`, `updated_at`.

Claves:

- PK: `platform_news_pkey` sobre `id`.
- Unique: `platform_news_slug_key` sobre `slug`.
- FK: `created_by`, `updated_by` -> `auth.users(id)` con `ON DELETE SET NULL`.

Relaciones:

- Autores/editores referencian usuarios.

RLS: habilitado.

Policies:

- `platform_news_public_read`: lectura si `status = 'PUBLISHED'`.

Triggers y funciones:

- `trg_platform_news_updated_at` usa `set_updated_at_platform_content()`.

Observaciones/deuda:

- No se detectan policies de escritura para platform admins; gestion probablemente por service role o falta policy.
- `status` y `placement` son `text`, sin enum/check.

### `platform_sponsors`

Propósito funcional: sponsors visibles en la plataforma.

Columnas principales: `id`, `name`, `website_url`, `logo_url`, `tier`, `status`, `sort_order`, `created_by`, `updated_by`, `created_at`, `updated_at`.

Claves:

- PK: `platform_sponsors_pkey` sobre `id`.
- FK: `created_by`, `updated_by` -> `auth.users(id)` con `ON DELETE SET NULL`.

Relaciones:

- Autores/editores referencian usuarios.

RLS: habilitado.

Policies:

- `platform_sponsors_public_read`: lectura si `status = 'ACTIVE'`.

Triggers y funciones:

- `trg_platform_sponsors_updated_at` usa `set_updated_at_platform_content()`.

Observaciones/deuda:

- No se detectan policies de escritura para platform admins.
- `tier` y `status` son `text`, sin enum/check.

### `platform_ad_campaigns`

Propósito funcional: campañas/publicidades administradas por plataforma.

Columnas principales: `id`, `title`, `description`, `image_url`, `link_url`, `slot`, `status`, `starts_at`, `ends_at`, `sort_order`, `created_by`, `updated_by`, `created_at`, `updated_at`.

Claves:

- PK: `platform_ad_campaigns_pkey` sobre `id`.
- FK: `created_by`, `updated_by` -> `auth.users(id)` con `ON DELETE SET NULL`.

Relaciones:

- Autores/editores referencian usuarios.

RLS: habilitado.

Policies:

- `platform_ads_public_read`: lectura si `status = 'ACTIVE'`.

Triggers y funciones:

- `trg_platform_ads_updated_at` usa `set_updated_at_platform_content()`.

Observaciones/deuda:

- No se detectan policies de escritura para platform admins.
- `slot` y `status` son `text`, sin enum/check.
- La policy no considera `starts_at`/`ends_at`; una campaña `ACTIVE` vencida podria seguir visible si la app no filtra.

### `messages`

Propósito funcional: mensajes directos entre usuarios.

Columnas principales: `id`, `sender_user_id`, `recipient_user_id`, `subject`, `body`, `kind`, `read`, `metadata`, `created_at`.

Claves:

- PK: `messages_pkey` sobre `id`.
- No se detectaron FKs para `sender_user_id` ni `recipient_user_id`.

Relaciones:

- Relacion logica con usuarios (`auth.users`/`profiles`) por sender/recipient, sin FK.

RLS: habilitado.

Policies:

- `messages_select_own`: sender o recipient pueden leer.
- `messages_update_recipient`: recipient puede actualizar.

Triggers y funciones: no se detectaron triggers directos.

Observaciones/deuda:

- No hay policy de INSERT; crear mensajes desde cliente podria estar bloqueado.
- Falta FK a usuarios, por lo que podrian quedar mensajes huerfanos.
- `kind` es `text`, sin enum/check.

### `notifications`

Propósito funcional: notificaciones para usuarios.

Columnas principales: `id`, `user_id`, `sender_user_id`, `type`, `title`, `message`, `read`, `metadata`, `link`, `created_at`.

Claves:

- PK: `notifications_pkey` sobre `id`.
- No se detectaron FKs para `user_id` ni `sender_user_id`.

Relaciones:

- Relacion logica con usuarios, sin FK.

RLS: habilitado.

Policies:

- `notifications_select_own`: el usuario ve sus notificaciones.
- `notifications_update_own`: el usuario actualiza sus notificaciones.
- `notifications_insert_platform`: cualquier `authenticated` puede insertar porque `WITH CHECK (true)`.

Triggers y funciones: no se detectaron triggers directos.

Observaciones/deuda:

- `notifications_insert_platform` es riesgosa: cualquier usuario autenticado podria crear notificaciones para cualquier `user_id` si no hay otra capa de control.
- Faltan FKs a usuarios.
- `type` es `text`, sin enum/check.

### `categories`

Propósito funcional: catalogo de categorias deportivas.

Columnas principales: `id`, `name`.

Claves:

- PK: `categories_pkey` sobre `id`.

Relaciones:

- Referenciada por `club_categories.category_id`.
- Referenciada por `tournaments.category_id`.

RLS: no se detecto `ENABLE ROW LEVEL SECURITY`.

Policies: no se detectaron.

Triggers y funciones: no se detectaron.

Observaciones/deuda:

- Catalogo chico y probablemente publico; aun asi conviene decidir si se protege con grants/RLS o si queda como tabla publica de lectura.
- `name` no tiene unique.

### `club_categories`

Propósito funcional: categorias habilitadas por club.

Columnas principales: `club_id`, `category_id`, `is_enabled`, `created_at`.

Claves:

- PK: `club_categories_pkey` sobre `(club_id, category_id)`.
- FK: `club_id` -> `clubs(id)` con `ON DELETE CASCADE`.
- FK: `category_id` -> `categories(id)` con `ON DELETE RESTRICT`.

Relaciones:

- Une `clubs` con `categories`.

RLS: no se detecto `ENABLE ROW LEVEL SECURITY`.

Policies: no se detectaron.

Triggers y funciones: no se detectaron.

Observaciones/deuda:

- Sin RLS/policies, puede depender de grants globales.
- `is_enabled` permite conservar historico/configuracion sin borrar la fila.

### `user_roles`

Propósito funcional: rol global simple por usuario.

Columnas principales: `user_id`, `role`, `created_at`.

Claves:

- PK: `user_roles_pkey` sobre `user_id`.
- FK: `user_id` -> `auth.users(id)` con `ON DELETE CASCADE`.

Relaciones:

- Se solapa funcionalmente con `platform_admins` si se usa para roles globales.

RLS: no se detecto `ENABLE ROW LEVEL SECURITY`.

Policies: no se detectaron.

Triggers y funciones: no se detectaron.

Observaciones/deuda:

- `role` es `text`, sin enum/check.
- Al existir `platform_admins`, conviene definir si `user_roles` sigue vigente o es legacy.
- Sin RLS puede exponer/asumir permisos por grants.

## Hallazgos críticos para Pamprax

### Duplicaciones legacy

- `profiles.id` y `profiles.user_id` duplican la identidad del usuario y ambos referencian `auth.users`.
- `tournaments` mantiene columnas nuevas y legacy para los mismos conceptos:
  - `type` y `tournament_type`.
  - `format` y enum disponible `tournament_format`.
  - `gender` y enum disponible `tournament_gender`.
  - `category_id` y `category`.
  - `start_date` y `starts_on`.
  - `end_date` y `ends_on`.
  - `signup_deadline` y `registration_deadline`.
  - `rules_json` y `rules`.
- `club_memberships` y `club_players` representan pertenencia usuario-club desde perspectivas distintas; hay que fijar la fuente de verdad para aprobacion, rol y acceso.
- `user_roles` y `platform_admins` pueden representar roles globales de manera duplicada.

### Triggers redundantes

- `clubs`, `club_memberships`, `tournaments` y `user_settings` tienen triggers duplicados de `updated_at`.
- `user_settings` tiene tres triggers que actualizan el mismo campo.
- Existen tres funciones genericas de timestamp: `set_updated_at()`, `tg_set_updated_at()` y `touch_updated_at()`.
- En `tournaments`, los triggers de sincronizacion (`tg_sync_tournament_deadlines`, `tg_tournaments_sync_legacy`) sugieren compatibilidad temporal que conviene retirar cuando se unifiquen columnas.

### Problemas de diseño

- Varias columnas que parecen usuarios no tienen FK: `clubs.owner_user_id`, `messages.sender_user_id`, `messages.recipient_user_id`, `notifications.user_id`, `notifications.sender_user_id`.
- Varias columnas de estado/tipo son `text` sin enum/check: `club_requests.status`, `platform_news.status`, `platform_news.placement`, `platform_sponsors.status`, `platform_sponsors.tier`, `platform_ad_campaigns.status`, `platform_ad_campaigns.slot`, `messages.kind`, `notifications.type`, `user_roles.role`.
- `tournament_teams` tiene unique directo y unique ordenado para parejas; el indice ordenado es el que realmente evita duplicados invertidos.
- `user_settings.active_club_id` no valida que el usuario pertenezca al club activo.
- `club_player_private.dni` no tiene formato ni unicidad, aunque es dato sensible.

### Posibles riesgos de RLS

- `notifications_insert_platform` permite INSERT a cualquier usuario autenticado con `WITH CHECK (true)`. Es el riesgo mas claro: podria permitir crear notificaciones para terceros.
- `club_player_private` tiene RLS habilitado sin policies: seguro por defecto, pero puede romper lecturas legitimas si no hay RPC/backend.
- `club_requests`, `categories`, `club_categories` y `user_roles` no tienen RLS habilitado. Conviene revisar grants efectivos antes de asumir que estan protegidas.
- `platform_news`, `platform_sponsors` y `platform_ad_campaigns` tienen lectura publica condicionada por status, pero no policies de escritura para administradores; probablemente requieren service role o RPC.
- Policies de torneos/membresias mezclan criterios `status = APPROVED` y `approved_at IS NOT NULL`, lo que puede producir accesos inconsistentes.

### Campos que convendria unificar

- En `profiles`, dejar una sola PK/FK de usuario: preferentemente `user_id` o `id`, pero no ambos como identidad activa.
- En `tournaments`, elegir el set canonico:
  - `type` enum o `tournament_type` text.
  - `format` con enum `tournament_format`.
  - `gender` con enum `tournament_gender`.
  - `category_id` como FK y retirar `category`.
  - `starts_on`/`ends_on` o `start_date`/`end_date`.
  - `registration_deadline` o `signup_deadline`.
  - `rules` o `rules_json`.
- En usuarios/roles globales, elegir entre `platform_admins` y `user_roles` para autorizacion global.
- En membresia/jugador, definir si la aprobacion vive en `club_memberships.status` o en `club_players.approved_at`.

### Migraciones que convendria separar

- `001_public_enums`: enums y tipos de negocio.
- `002_core_profiles`: `profiles`, sync con `auth.users`, `user_settings` y roles globales.
- `003_clubs`: `clubs`, `club_requests`, `categories`, `club_categories`.
- `004_memberships_players`: `club_memberships`, `club_players`, `club_player_private` y funciones de club.
- `005_tournaments`: `tournaments`, `tournament_teams`, `tournament_registrations` y funciones de registro.
- `006_platform_content`: `platform_admins`, `platform_news`, `platform_sponsors`, `platform_ad_campaigns`.
- `007_messages_notifications`: `messages` y `notifications`.
- `008_rls_policies`: RLS y policies, separadas de DDL base para auditar permisos.
- `009_triggers`: triggers de `updated_at`, sync y deadline, idealmente ya deduplicados.
- `010_seed_data`: datos iniciales/demo (`categories`, clubes, perfiles, torneos, contenido), separados del schema.
- `011_legacy_cleanup`: migracion especifica para retirar columnas/functions/triggers legacy despues de backfill y validacion.
