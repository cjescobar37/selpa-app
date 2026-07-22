# CLUB: funciones y condición deportiva

## Fuentes canónicas

- `public.profiles`: identidad global.
- `public.club_memberships`: pertenencia, estado y función administrativa.
- `public.club_players`: condición y datos deportivos dentro del club.

Una persona pertenece con membership `APPROVED` y `approved_at` no nulo. Es
jugador cuando además posee un `club_players` del mismo usuario y club con
`approved_at` no nulo. El rol `PLAYER` no es la fuente de esa condición: un
`OWNER`, `ADMIN`, `OPERADOR` o `PLANILLERO` también puede jugar.

## Roles

- `OWNER`: acceso total y transferencia de propiedad.
- `ADMIN`: acceso completo salvo transferencia de propiedad.
- `OPERADOR`: gestión cotidiana deportiva y de contenido, sin roles, finanzas,
  pagos, seguridad, branding, auditoría ni eliminación de torneos.
- `PLANILLERO`: consulta de torneo y carga/corrección de resultados.
- `PLAYER`: sin capacidades administrativas.

El legacy `OPERATIVO` se normaliza a `OPERADOR` preservando su OID cuando existe.
La migración no reconstruye `public.club_role`.

## Equipo e invitaciones

Las RPC de Equipo deben conservar una sola membership por `(club_id, user_id)`.
Una intención de crear o reparar `club_players` será una acción pendiente de la
invitación, nunca una segunda fuente del estado final.

Quitar una función no debe borrar `club_players`. Si existe el registro
deportivo, la membership queda aprobada como `PLAYER`; sin registro deportivo,
la membership puede retirarse mediante el flujo atómico correspondiente.

## Dump

`supabase_full.sql` no se edita manualmente. Tras aplicar y validar la migración
en desarrollo, debe regenerarse con el procedimiento de dump del proyecto.
