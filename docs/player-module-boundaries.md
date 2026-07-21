# Módulo Jugador: límites de datos

## Fuente canónica global

`public.profiles` pertenece al usuario y no a un club. Es la fuente canónica de:

- `first_name`, `last_name`, `display_name`;
- género personal;
- país, provincia y ciudad;
- teléfono y fecha de nacimiento (privados);
- avatar y portada;
- altura, mano hábil y posición preferida.

Los endpoints públicos deben construir DTOs explícitos y nunca devolver email,
teléfono, fecha de nacimiento, metadata de autenticación ni estados de solicitud.

## Fuente canónica por club

`public.club_memberships` define pertenencia, rol, estado y aprobación.

`public.club_players` define únicamente el estado deportivo dentro de un club:

- categoría;
- ranking y puntos;
- aprobación deportiva vinculada a la membresía;
- estadísticas y referencias competitivas por club.

Las columnas legacy `display_name`, `gender` y `preferred_position` de
`club_players` pueden leerse como fallback durante la transición, pero no deben
recibir nuevas escrituras desde el perfil del usuario.

## Club activo

`public.user_settings.active_club_id` solo puede apuntar a un club con membresía
`APPROVED` y `approved_at` no nulo. Una solicitud `PENDING` nunca activa un club.
La RPC `approve_player_membership_atomic` aprueba la membresía, asegura
`club_players` y repara el club activo dentro de una única transacción.

## Contratos de perfil

- Privado: `/api/clubs/[clubId]/players/[playerId]/profile`, solo propietario o
  administración autorizada; contiene datos necesarios para edición/operación.
- Público: `/api/players/[playerId]/public-profile`, requiere autenticación y
  devuelve exclusivamente identidad pública, datos deportivos, club y
  estadísticas permitidas.
