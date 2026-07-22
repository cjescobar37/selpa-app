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

La Etapa 2A define cuatro operaciones atómicas de invitación:

- `create_club_team_invite_atomic()`;
- `accept_club_team_invite_atomic()`;
- `reject_club_team_invite_atomic()`;
- `cancel_club_team_invite_atomic()`.

Las invitaciones comunes aceptan `ADMIN`, `OPERADOR`, `PLANILLERO` y `PLAYER`,
pero nunca `OWNER` ni el legacy `OPERATIVO`. Una membership existente bloquea
la creación: `APPROVED`, `PENDING`, `REJECTED` y `BANNED` tienen códigos
funcionales diferentes y ninguna se rehabilita silenciosamente.

Aceptar una invitación crea una membership `APPROVED` con `approved_at`, consume
la invitación y audita en la misma transacción. No crea ni modifica
`club_players`; `PLAYER` sigue sin ser prueba de condición deportiva.

Durante esta etapa los endpoints continúan usando `supabaseAdmin`. Los IDs de
actor y destinatario son derivados exclusivamente de la sesión autenticada y
validados nuevamente por las RPC. Por eso su ejecución queda concedida solo a
`service_role`. Esta compatibilidad es transitoria: una etapa futura migrará las
operaciones a un cliente con JWT y `auth.uid()`.

## Gestión atómica de miembros

La Etapa 2B mantiene las firmas de `change_club_staff_role_atomic()`,
`remove_club_staff_atomic()` y `transfer_club_ownership_atomic()`. Las tres
serializan operaciones por club mediante advisory lock, bloquean actor y target
con `FOR UPDATE`, validan el actor dentro de SQL y registran auditoría en la
misma transacción.

Los roles administrables son `ADMIN`, `OPERADOR`, `PLANILLERO` y `PLAYER`.
`OWNER` solo se asigna mediante transferencia. La transferencia admite como
destino únicamente una membership `ADMIN` u `OPERADOR` aprobada y degrada al
OWNER anterior a `ADMIN`.

Remover un miembro elimina físicamente `club_memberships`, repara su club activo
y conserva `club_players`. El historial queda en `club_team_audit`.

Un índice único parcial garantiza como máximo un OWNER aprobado por club. El
trigger protege al OWNER contra UPDATE/DELETE directo y exige tanto contexto
interno como ejecución bajo la RPC privilegiada. Las policies de UPDATE y DELETE
directo para `authenticated` se eliminan; solicitudes PENDING y lecturas no se
modifican.

Cambiar o quitar una función nunca debe borrar `club_players`. La condición
deportiva depende de `is_club_player()` y no del rol de la membership.

## Dump

`supabase_full.sql` no se edita manualmente. Tras aplicar y validar la migración
en desarrollo, debe regenerarse con el procedimiento de dump del proyecto.
