# Validación operativa del cierre Jugador

## Orden de aplicación

1. Migraciones base ya aplicadas hasta `20260718000002_fix_phone_e164_constraint.sql`.
2. `20260720_player_membership_atomic.sql`.
3. `20260720_player_security_and_assets.sql`.
4. Ejecutar `apps/web/supabase/qa/20260720_player_closure_validation.sql` exclusivamente en QA.

La migración atómica requiere las tablas `profiles`, `club_memberships`, `club_players`,
`user_settings` y `platform_admins`, los enums `club_role` y `membership_status`, y la
función `auth.uid()`. Los campos deportivos globales provienen
de `20260718000000_global_sports_profile.sql`; `cover_url` y contacto provienen de
`20260718000001_profile_contact_and_cover.sql`. La migración de seguridad no depende
de datos de género o ubicación, pero requiere Supabase Storage y `storage.foldername`.
Antes de volver público un bucket preexistente, la migración aborta si encuentra paths
fuera de `avatars/{uuid}/{archivo}` o `covers/{uuid}/{archivo}`.

## Matriz funcional mínima

| Caso | Resultado esperado |
|---|---|
| Propietario viendo su perfil | Endpoint privado disponible; puede editar sus datos permitidos. |
| Otro jugador viendo perfil | DTO público sin email, teléfono, nacimiento, metadata ni solicitudes. |
| Usuario sin sesión | Perfil público API, search y operaciones privadas responden `401`. |
| Jugador sin club | Accede a `/player`, `/perfil`, `/mis-datos`, `/actividad`, `/ajustes`, mensajes y notificaciones. |
| Solicitud pendiente | Navbar “Sin club”; solicitud visible solo al propietario; no hay club activo. |
| Un club aprobado | Se crea/repara `club_players` y se configura el club activo. |
| Varios clubes aprobados | Se conserva un club activo aprobado existente y se permite cambiarlo. |
| Aprobación con error | Membership, player y settings quedan sin cambios. |
| Cambio de club | Solo admite membresía `APPROVED` con `approved_at`; rechaza clubes ajenos. |
| Avatar | JPEG/PNG/WEBP, máximo 3 MB en `avatars/{userId}`. |
| Portada | JPEG/PNG/WEBP, máximo 5 MB en `covers/{userId}`. |
| Mensajes | POST legacy retirado; envío mediante `message_threads`. |
| Notificaciones | Lectura/actualización propia; inserción solo por backend/RPC autorizado. |
| Segundo login | Usuario completo entra a `/player`, sin repetir onboarding ni quedar atrapado en selección de club. |

## Criterio de aprobación

Aplicar primero en un proyecto QA con backup o snapshot. El SQL QA siempre debe
terminar en `ROLLBACK`. Luego completar la matriz desde navegador con al menos cuatro
cuentas: owner/admin, jugador objetivo, jugador común y jugador con múltiples clubes.
No aplicar en producción hasta guardar evidencia de todos los resultados.
