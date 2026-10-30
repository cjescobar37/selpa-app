# Ranking real — preparación de única migración en DB productiva compartida

Fecha: 2026-10-13. Destino: `nenupmpjrzdxfrnwsmkx`. Production, Preview y localhost
comparten DB, según confirmación explícita del usuario. Preview **no es sandbox**.
Rama local: `codex/club-admin-iphone-preview`. Sin DDL, DML, deploy, commit ni push.

## Decisión actual

- Respaldo completo, reciente y recuperable: **NO confirmado**. No recomendar DDL.
- Preflight técnico final read-only: **APROBADO**, con los límites indicados abajo.
- Bloqueo: falta evidencia de backup recuperable; procedimiento alternativo preparado.
- Aplicación exclusiva y postflight preparados, **no ejecutados**.

## 1. Evidencia de backup, no inferencias

El conector MCP no expone backups. Se descubrió vía `--help` la operación de lectura
de Supabase CLI instalada, v2.117.0, y se ejecutó exclusivamente:

```powershell
supabase backups list --project-ref nenupmpjrzdxfrnwsmkx --output-format json
```

Consulta autorizada, exit 0. Metadatos retornados: región `sa-east-1`,
`walg_enabled=true`, `pitr_enabled=false`, `backups=[]`, `physical_backup_data={}`.
**Cero backups disponibles en esta consulta**; walg habilitado no demuestra un
backup existente. Tampoco prueba que no haya respaldos externos privados.
No se leyeron/imprimieron tokens, passwords ni URLs firmadas; se procesaron sólo
metadatos. No se ejecutó `backups restore` ni se activó PITR.

Para resolver: responsable con acceso a
[Database > Backups del proyecto](https://supabase.com/dashboard/project/nenupmpjrzdxfrnwsmkx/database/backups)
debe aportar ref, ID/timestamp UTC, estado completado, retención vigente y mecanismo
de recuperación; si hay respaldo externo, manifiesto y log del ensayo de restauración.
Una captura de backup exitoso acredita existencia, no un ensayo real de recuperación.
No compartir archivos de datos ni secretos por chat.

## 2. Backup completo sin infraestructura nueva paga — procedimiento pendiente

El dump de esquema indicado en el informe anterior es sólo respaldo adicional de
definiciones: **no satisface** el requisito de backup completo.

1. Usar primero un respaldo ya disponible y confirmado. Si no existe, preparar un
   dump lógico consistente con `pg_dump` PostgreSQL 17 o posterior compatible;
   `pg_dump`, `pg_restore` y `psql` no están en PATH actualmente. No instalar herramientas,
   comprar planes, activar PITR, crear proyectos/branches ni resetear contraseñas como
   efecto secundario. Un operador puede usar herramientas libres en su equipo autorizado.
2. Elegir ubicación privada cifrada **fuera de `D:\SELPA` y de todo repositorio**,
   con ACL restringida y espacio suficiente. Capturar backup y logs privados allí,
   más una segunda copia cifrada en almacenamiento existente autorizado. No usar
   `output/`, attachments del chat, Git ni carpetas públicas para datos de producción.
3. Obtener conexión autorizada desde Connect del proyecto. Preferir conexión directa
   o Session pooler compatible; no transaction pooler para snapshot/dump. Mantener
   credencial en gestor seguro/pgpass/service file privado con permisos mínimos,
   TLS verificado y sin password en argumentos, historial, stdout o Git. No imprimir
   cadena ni usar CLI `--debug`. La key service_role REST **no sustituye** password DB.
4. Usar **un solo dump completo** custom-format para esquema y datos en un snapshot
   consistente. Ejemplo operativo no ejecutado; `selpa_backup` debe resolver al ref
   correcto en un servicio libpq privado, y la ruta es un placeholder no existente:

   ```powershell
   pg_dump --dbname="service=selpa_backup" --format=custom --file="X:\RESPALDO_PRIVADO\database.dump"
   pg_dumpall --dbname="service=selpa_backup" --globals-only --no-role-passwords --file="X:\RESPALDO_PRIVADO\globals.sql"
   pg_restore --list "X:\RESPALDO_PRIVADO\database.dump"
   ```

   Exit no cero, archivo truncado o permisos insuficientes: STOP. No omitir tablas
   problemáticas para etiquetar el resultado como completo. Verificar alcance de
   public (deporte/ledger/finanzas), auth, storage metadata, supabase_migrations,
   esquemas de aplicación, funciones/triggers/RLS/ACL, extensiones y secuencias.
   Capturar globals/roles sin passwords; credenciales de roles se recuperan mediante
   el mecanismo privado existente. En Supabase hay objetos/esquemas administrados:
   compatibilidad y exclusiones de plataforma requieren validación explícita del
   manifiesto y restore; no prometer restauración de un dump no ensayado.
5. Registrar ref, PostgreSQL/tool version, comienzo/fin UTC, snapshot/alcance,
   tamaños, exit codes y SHA256; cifrar el artefacto y verificar lectura de ambas
   copias. Objetivo propuesto: backup completado en las 24 h previas y nuevamente
   verificado inmediatamente antes de DDL; registrar RPO real, no asumir cero.
   No guardar conteos/payloads financieros en documentación pública. Dump completo
   consume recursos/egress: comprobar cuotas existentes, no contratar infraestructura
   ni garantizar costo cero si se supera una cuota.
6. Si usa Vault/pgsodium/column encryption, asegurar que el material de recuperación
   de cifrado esté conservado por el mecanismo oficial privado. Un dump de valores
   cifrados sin clave recuperable no es backup recuperable. No extraer ni loggear
   secretos Vault desde SQL durante este cierre.
7. Ensayar restauración **sólo** en instancia local/aislada compatible ya disponible
   y autorizada, sin correo, webhooks, workers ni conexiones externas productivas.
   Comprobar schema, ACL/RLS, relaciones, datos de aplicación/auth, secuencias,
   ledger/finanzas íntegros y cifrado recuperable. No restaurar en Production o
   Preview compartido. Si no hay destino aislado ni prueba previa válida, reportar
   recuperación no confirmada, no crear infraestructura cloud automáticamente.

Backups DB no incluyen binarios de Supabase Storage; copiar/verificar esos archivos
por separado si se pretende certificar recuperación del producto completo. Esta
migración no modifica Storage, pero no debe confundirse metadata con contenido.
Fuentes oficiales: [backups](https://supabase.com/docs/guides/platform/backups),
[restore y cifrado](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

No se creó ni descargó backup en este turno. No se verificó una restauración.

## 3. Preflight final ejecutado — alcance exclusivo

Archivo: `apps/web/supabase/migrations/20261009100429_player_career_read_models.sql`.
SHA256: `4ff4faa506f49e88631947a4c2dc51b968f79400769fe05b80b85866bca03540`.
Fuente leída completa, hash igual al previamente revisado; ningún cambio al archivo.

READ ONLY con timeout 5 s; sólo catálogo y compilación, sin DDL ni datos económicos:

- PostgreSQL 17.6; cinco vistas y RPC exacta ausentes; ningún overload con ese nombre.
- Versión `20261009100429` ausente del ledger de migrations.
- Cinco SELECT exactos y cuerpo de RPC expandidos a CTEs: seis checks compilan.
- Tipos inferidos de los nueve retornos coinciden exactamente con RETURNS TABLE:
  siete bigint, best_result text, best_position integer. Sin crear función de prueba.
- Las 20 relaciones referenciadas existen; service_role tiene SELECT en todas.
  `competition_pair_ranking_projection` es vista y dispone de pairs_division_id.
- Existen postgres/service_role/anon/authenticated. Postgres puede CREATE en public;
  service_role BYPASSRLS; anon/authenticated sin BYPASSRLS.
- PK de profiles por user_id; unique club/user en memberships y club_players.
  No faltan dependencias estructurales ni permisos de lectura necesarios.

No se reabrieron auditorías generales, F1/F2, lint o UI. Compilación LIMIT 0 y
tipos no certifican prestaciones ni ranking vivo; grants efectivos de objetos
nuevos sólo podrán verificarse después de crearlos. Aplicación debe usar el actor
autorizado con CREATE, no intentar DDL con service_role REST.

## 4. Aditividad y preparación de aplicación exclusiva

Sólo BEGIN/COMMIT, cinco CREATE VIEW, una CREATE FUNCTION y ACL sobre **esos nuevos
objetos**. No ALTER/DROP/CREATE OR REPLACE de objetos existentes, DML, backfill,
índices/triggers/policies nuevos, escrituras deportivas/ledger/finanzas ni cambios
de roles existentes. No altera grants de tablas o RPC actuales. Vistas invoker;
RPC invoker/STABLE/search_path vacío; revoca PUBLIC/anon/authenticated de los nuevos
objetos y permite backend service_role. No abre lectura directa al browser.

Gates antes de autorización: backup recuperable confirmado, hash/ref revalidados,
ventana y responsable definidos, postflight JWT real preparado. Al compartir DB,
los tres entornos serán afectados al mismo tiempo, aunque no haya deploy.

Ruta exclusiva preparada para operador autorizado, **NO ejecutar ahora**:

1. Confirmar ref `nenupmpjrzdxfrnwsmkx`, backup y hash; rerun inventario si transcurre
   tiempo. Cualquier objeto/conflicto/version aplicada: STOP, no reemplazo automático.
2. Conexión postgres autorizada por TLS y ON_ERROR_STOP; aplicar timeout lock 5 s y
   statement timeout acotado aprobado. Ejecutar sólo el archivo exacto con sus
   BEGIN/COMMIT; no `db push`, `migration up`, ZIP ni otras versiones pendientes.
3. Verificar COMMIT + postflight SQL/REST. Registrar sólo `20261009100429` con
   `supabase migration repair 20261009100429 --status applied --project-ref nenupmpjrzdxfrnwsmkx`
   por operador autorizado después de validar objetos. Sintaxis comprobada con
   CLI `--help`; el comando de escritura **no se ejecutó**. Registro de ledger es
   separado: si falla, reparar únicamente esa entrada, nunca rerun CREATE ni lote.
4. Conservación: ningún deploy requerido para DDL; no declarar recuperación UI
   hasta verificar que el deployment utilizado ya contiene el lector correcto.
   Si un deployment antiguo usa otro código, identificarlo, no desplegar automáticamente.

Recuperación antes de COMMIT: rollback transaccional y catálogo/ledger previo.
Después: sólo con autorización nueva, retirar seis objetos con RESTRICT en orden
RPC → pair standings → results → matches → individual standings → eligibility.
Si hay dependencia externa, STOP; nunca CASCADE. Revertir sólo su versión de ledger
si se registró. Un backup completo no autoriza restaurar toda producción encima
de movimientos posteriores: tal restore requiere decisión/RPO e intervención separada.

## 5. Postflight preparado, pendiente de objetos y JWT real

`scripts/qa/career-migration-preflight.mjs` ya emite inventoryQuery, compatibilityQuery
y postflightQuery. Postflight de catálogo comprueba definiciones/reloptions de cinco
vistas, firma/result de RPC, invoker/STABLE/search_path y permisos efectivos SELECT /
EXECUTE para service_role, anon y authenticated (incluidas herencias). Exigir cinco
vistas y RPC, backend permitido y ambos roles cliente denegados; comparar fuente.
Verificar ledger final, RLS/triggers/grants de dependencias sin cambios.

Verificar exposición/cache PostgREST desde backend sin publicar service key;
PGRST202/205 deben desaparecer. Cache obsoleto no es estado vacío. Recarga explícita
de cache sólo dentro de autorización acordada, no ejecutar ahora.

Cristal: `7c70723b-8244-4117-9a2e-b9a129f661a9`.

1. Visitante: `/ranking?clubId=7c70723b-8244-4117-9a2e-b9a129f661a9`; comprobar
   temporada/divisiones publicadas, población y puntos contra ledger, categorías
   M/F, empates y búsqueda/paginación que no renumera. HTML 200 por sí solo no PASS.
2. Cuenta PLAYER existente aprobada de Cristal, no STAFF: titular inicia sesión
   normal en navegador. Confirmar JWT firmado válido del ref mediante Auth.getUser;
   no claims SQL simulados, tokens fabricados ni credenciales en chat/Git/logs.
3. GET `/api/player/my-ranking?clubId=<Cristal>` con bearer real debe devolver
   identidad/contexto/posición coincidentes con ranking público, y UI `/player/ranking`
   debe mostrarlos sin error de modelo. Ausencia de entry legítima se distingue de
   error DB; no forzar una asignación para obtener datos. Cache privado/no-store.
4. OWNER/ADMIN real: puede ver ranking público pero no experiencia privada PLAYER;
   sin sesión/invalid JWT → 401; STAFF → 403. Datos propios no se obtienen por UUID
   arbitrario del browser. No crear usuarios, entradas o puntos para QA.
5. Usar primero el deployment Preview de la rama con código correcto y sesión
   PLAYER, sabiendo que lee producción; luego producción publicada. Sólo GET,
   capturas redactadas, sin HAR/storageState con tokens. Registrar URL/deployment,
   commit, timestamp, rol y resultado; no declarar Safari/iOS ni producción aprobados
   por fixtures locales. Si hace falta deploy para el lector, pedir autorización aparte.

No hay JWT real disponible en este turno; recorrido preparado pero no ejecutado.
Cerrar esta condición operativa antes de la aplicación controlada, no inventar PASS.

## 6. Preservación

Se modificó sólo documentación: este runbook y una nota de estado en el informe
anterior. UI/código, migration, hashes previos y trabajo local quedaron conservados.
Sin backup/secret dentro del repo, ninguna escritura económica ni de producción,
ningún cambio de stashes, commit, push, deploy o Bloque 2.
