# QA controlado — CLUB Sprint 1

No ejecutar en producción. Aplicar primero `20260721_club_authorization_security.sql` en QA.

## Actores requeridos

Completar `supabase/qa/20260721_club_authorization_validation.sql` con dos clubes y estos usuarios:

- OWNER, ADMIN, PLANILLERO y PLAYER aprobados del club A;
- ADMIN aprobado del club B, sin membership en A;
- usuarios PENDING, REJECTED y BANNED del club A.

Cada membership aprobada debe tener `status = APPROVED` y `approved_at` no nulo. Los demás estados no deben conservar capacidades aunque tengan datos legacy inconsistentes.

## Matriz funcional adicional

Probar con sesión real:

| Acción | OWNER/ADMIN | PLANILLERO | PLAYER/no aprobado |
|---|---|---|---|
| Abrir `/club` | Permite | Permite | Redirige |
| Configuración/branding | Permite | 403 | 403 |
| Membresías y datos privados | Permite | 403 | 403 |
| Roster | Completo | DTO sin email/teléfono/DNI | 403 |
| Crear/editar/cancelar torneo | Permite | 403 | 403 |
| Inscripciones/grupos/partidos/playoff | Permite | Permite | 403 |
| Pagos completos | Permite | DTO con estado solamente | 403 |
| Subir logo/reglamento del club A | Permite | 403 | 403 |
| Escribir assets del club B | 403 salvo ADMIN B | 403 | 403 |
| Insert/update directo `club_players` propio | Solo admin deportivo | Solo lectura | Rechazado |

Verificar además que `/perfil`, `/mis-datos`, `/actividad`, `/ajustes`, mensajes y notificaciones Player continúen accesibles.
