# SELPA — cierre de integración real · 2026-10-13

Actualización posterior: el usuario confirmó que Production, Preview y localhost
comparten `nenupmpjrzdxfrnwsmkx`; tratarlo como base productiva compartida. La
incertidumbre de entorno de la sección A queda como registro histórico, no como
estado vigente. Preflight final y bloqueo de respaldo en
[`selpa-ranking-production-readiness.md`](./selpa-ranking-production-readiness.md).

Estado: preparación completada; integración real **NO certificada**. Sin DDL,
migraciones aplicadas, cargos, deploy, cambios de env ni datos económicos.
Rama `codex/club-admin-iphone-preview`; HEAD `2fb0628db8566e5d48e5e8b86faca84f6b4170bb`.
Este informe complementa, no reemplaza, `selpa-premium-recovery.md`.

## A. Entorno y evidencia

Consulta actual de Management API: `nenupmpjrzdxfrnwsmkx`, nombre `pamprax-app`,
organización `cncrwhdaffakfnsjebmw`, región `sa-east-1`, `ACTIVE_HEALTHY`,
PostgreSQL `17.6.1.063`. La única rama informada es `main`, default, mismo ref.
**Ni nombre, default/main ni estado permiten clasificar el uso de negocio.**

| Ámbito | Evidencia local | Resultado verificable |
| --- | --- | --- |
| localhost canónico | `apps/web/.env.local`, 2026-07-03 | URL apunta al ref anterior; service-role JWT declara ese mismo ref/rol. Anon/publishable presente. No se publicaron valores. |
| raíz | `.env.local` | Sólo OIDC; no es la configuración Supabase de `apps/web`. |
| Preview | Sin export vigente ni acceso de lectura a Vercel | Destino y diferencias de credenciales **desconocidos**. |
| producción | `.vercel/.env.production.local` y copia en `apps/web`, 2026-07-03 | Etiqueta `production`, tres valores Supabase vacíos. No prueba que hoy estén vacíos ni identifica destino vigente. |

Proyecto Vercel vinculado en raíz: `selpa-app`, `prj_YCZQYY3T6DJiloC7wdIuvnkBiz92`,
team `team_srXv0SC2wHc9KWyAiay6lu5k`, rootDirectory `apps/web`.
No Vercel MCP ni token de acceso disponible en el proceso o auth CLI en las rutas
convencionales comprobadas. Un OIDC de proyecto no sustituye ese acceso.

**Clasificación inequívoca todavía bloqueada.** Tratar conservadoramente este DB
como potencialmente productivo/compartido, no como sandbox. Falta evidencia vigente:
lectura autorizada de env Vercel Development/Preview/Production, incluidos overrides
de `codex/club-admin-iphone-preview`, y de los deployments activos (ID, commit,
alias, fecha). Comparar host/ref URL, ref de credenciales cuando sea verificable,
igualdad mediante huella sólo en memoria y flags MP, nunca secretos. Una key
publishable opaca no demuestra por sí sola el ref. Confirmar con responsable qué
entornos comparten DB y registrar la clasificación. No modificar settings para ello.

## B. Migración y procedimiento exclusivo, pendiente de autorización

Archivo canónico revisado **completo**:
`apps/web/supabase/migrations/20261009100429_player_career_read_models.sql`.
SHA256 de bytes actuales:
`4ff4faa506f49e88631947a4c2dc51b968f79400769fe05b80b85866bca03540`.

Catálogo y ledger consultados hoy: versión `20261009100429` ausente, cinco vistas
ausentes, `read_player_career_summary(uuid,uuid)` ausente. Dependencias Competition,
homologación, settlement, ledger y proyección PAIRS presentes; esta última tiene
`pairs_division_id`. Service role tiene BYPASSRLS. El dump base contiene tablas
legacy; Competition se complementa con documentación/migraciones incrementales
y catálogo live, no se inventaron columnas a partir del dump antiguo.

`scripts/qa/career-migration-preflight.mjs` imprime JSON con inventario y SQL
READ ONLY y postflight de catálogo/ACL, sin conectar ni aplicar nada. Extrae **los cinco SELECT exactos y el
cuerpo SQL de la RPC** y los expande como CTEs. Ejecutado hoy bajo `service_role`
con timeout 5 s y LIMIT 0: seis checks compilaron. Los ceros son verificadores de
compilación, **no estadísticas ni evidencia de vacío real**. No valida ACL futuras,
PostgREST, tipos RETURNS TABLE al crear la función ni prestaciones con datos.

### Revisión de semántica y seguridad

- Sólo CREATE VIEW/CREATE FUNCTION y GRANT/REVOKE dentro de BEGIN/COMMIT; sin DML,
  backfill, triggers, cambios RLS ni reemplazo de RPC deportiva.
- Eligibility exige club activo, membership PLAYER aprobada con approved_at y
  club_player aprobado; excluye STAFF a nivel cuenta, incluyendo memberships
  staff no rechazadas, owners y platform admins. No expone email, teléfono o DNI.
- Ranking individual usa entrada vigente, ledger con reversals, empates por puntos
  y orden estable; población/rank calculados antes de paginar. Limitado al universo
  tradicional M/F, categorías 1–7, INDIVIDUAL, sin segmento. No promete otros modos.
- PAIRS reutiliza puntos canónicos publicados de la proyección y su división de
  parejas; no suma puntos actuales de ambos jugadores.
- Carrera usa homologación APPROVED vigente y torneo no cancelado, no inscripción.
  BYE/administrativo excluidos; WO decidido puede acreditar participación pero no
  partido/victoria/derrota computable. Puntos no publicados pueden permanecer NULL;
  NON_SCORING da cero. La RPC agrega sólo resultados de ese club_player/temporada.
- Cinco vistas security_invoker; RPC STABLE SECURITY INVOKER, search_path vacío,
  referencias calificadas. Revoca PUBLIC/anon/authenticated y concede lectura/RPC
  al backend service_role. BYPASSRLS implica que el backend debe seguir validando
  actor/scope y DTO público; security_invoker no restringe a service_role por usuario.
  Se deben comprobar grants efectivos, incluyendo defaults/herencia, tras aplicación.

### Gates y secuencia para el operador — NO ejecutada

1. Registrar autorización explícita que nombre **ref, clasificación y alcance exacto
   de esta versión**; identificar entornos consumidores y ventana de intervención.
   No ejecutar mientras A siga desconocido. Revalidar hash, ref de conexión,
   PostgreSQL >=15, roles y configuración de la app destino.
2. Ejecutar inventario y compatibilidad del generador en destino con conexión
   READ ONLY y timeout. Exigir cinco objetos y firma RPC ausentes y versión ausente.
   Cualquier estado parcial/version existente/conflicto: STOP, no CREATE OR REPLACE
   ni drops automáticos. Capturar columnas/tipos, PK/unique de memberships/perfiles,
   entries vigentes, dependencia PAIRS y sus grants, índice de ledger. Verificar
   duplicados por club/user y dos participantes distintos por pareja; no reparar datos.
3. Respaldo antes de DDL: verificar backup existente utilizable (hora/retención,
   responsable y recuperación documentada); no contratar PITR/infraestructura.
   Crear export **schema-only** de `public` y `supabase_migrations`, con definiciones,
   ACL y dependencias, en ubicación privada fuera de Git, usando herramienta/credencial
   autorizada. Mantener un manifiesto de hash/ref/catálogo previo y ausencia de seis
   objetos. Comprobar legibilidad y recuperación del esquema en entorno aislado
   existente. Si no hay respaldo utilizable, STOP. No se hizo backup en este turno.
4. Rehearsal aislado autorizado: aplicar únicamente este archivo, probar firma y
   retornos, ACL y rollback sin CASCADE. La compilación read-only no sustituye esto.
   Si no hay entorno aislado, dejar esa limitación y solicitar decisión explícita;
   no crear infraestructura paga ni usar DB compartida como sandbox.
5. Aplicación autorizada posterior: conexión exacta confirmada, `ON_ERROR_STOP`,
   timeout de locks corto (p.ej. 5 s) y statement timeout acotado aprobado (p.ej. 30 s).
   Ejecutar **sólo el archivo cuyo hash fue aprobado**, con sus BEGIN/COMMIT, desde
   psql/SQL Editor autorizado. No `db push`, `migration up`, ZIP ni lote de pendientes.
   psql no está disponible actualmente en PATH; preparar herramienta aprobada antes.
   No hay runner de escritura instalado por esta tarea.
6. Postflight antes de registrar versión: comprobar exactamente las cinco vistas y
   firma; pg_get_viewdef/pg_get_functiondef contra fuente; reloptions security_invoker,
   RPC invoker/STABLE/search_path; has_table_privilege para SELECT de service_role
   y denegación de anon/authenticated, has_function_privilege para EXECUTE (incluido
   PUBLIC/herencia); verificar ausencia de cambios en tablas, triggers y RLS.
   Consultar por backend/REST con límite/timeout para Cristal, comparar ranking con
   ledger y carrera con homologaciones, realizar recorrido JWT de C/D. Probar
   PostgREST: tras recarga normal del cache deben desaparecer PGRST202/205. Si cache
   está obsoleto, recarga explícita sólo con autorización; no confundirse con vacío.
7. Registrar **sólo** `20261009100429` en migration ledger mediante operación de
   repair controlada de Supabase, después de postflight correcto; nunca simular
   aplicación de otras versiones. Registro separado de DDL deja una ventana:
   si falla, conservar evidencia y reparar sólo ledger, NO rerun CREATE ni db push.
   Hacer inventario final y registrar operador, tiempos y resultado.

### Recuperación y riesgos concretos

Fallo antes de COMMIT: la transacción revierte los seis objetos/ACL; verificar
ausencia y ledger sin versión. Fallo después de COMMIT: detener consumidores nuevos
según procedimiento operativo autorizado, preservar logs y comparar catálogo.
Si se autoriza rollback, comprobar que sólo existen objetos de esta intervención
y no dependencias externas añadidas; retirar con **RESTRICT** en orden: RPC,
competition_pair_standings_read, player_career_results_read,
player_career_matches_read, competition_player_standings_read,
player_sports_eligible_read. Si RESTRICT falla, STOP; nunca CASCADE. Revertir sólo
su entrada de ledger mediante repair específico si se había registrado.
No restaurar toda la DB sobre operaciones económicas posteriores, no tocar ledger
de puntos, homologaciones, obligaciones o pagos. Si existían objetos antes, este
procedimiento no aplica: requiere comparar/restaurar definiciones previas.

Riesgos: afectar todos los deployments si comparten DB; locks/latencia en joins y
ventanas; cache PostgREST; SQL CREATE no idempotente; permisos de backend privilegiado;
catálogo legacy y ramas/categorías fuera del universo soportado; identidad pública
y pareja deben seguir allowlist; grants de defaults; aplicación/ledger no atómicos
en el procedimiento de archivo + repair. No se declaró rendimiento live certificado.
Referencia de permisos: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## C. Recorrido real para certificar ranking/carrera

Cristal: `7c70723b-8244-4117-9a2e-b9a129f661a9`, activo, nombre live
`cristal padel club`. Temporada de referencia del informe previo:
`38763b95-7450-4780-a984-99bc41ded6f0`; revalidar vigencia/publicación antes de QA.

Preparar dos contextos de navegador separados con cuentas existentes: PLAYER
aprobado deportivo, no STAFF, y OWNER/ADMIN aprobado de Cristal. Login manual
normal por el titular; no solicitar contraseñas/JWT por chat, no fabricar tokens,
no crear usuarios. Para ADMIN y OWNER registrar resultados individualmente si
se certifican ambos roles; una cuenta no prueba el otro. Auth.getUser debe aceptar
JWT firmado del ref destino y los endpoints usar ese Authorization. No exportar
storageState/HAR con tokens, no registrar Authorization/PII ni cuerpos financieros.

| Recorrido GET, sin submit | Aceptación real requerida |
| --- | --- |
| Visitante `/ranking?clubId=<Cristal>` | Contexto publicado, datos de ledger, cambio M/F/categoría/modalidad, empate y población completos, búsqueda/paginación sin renumeración; error de modelo distinto de vacío. |
| PLAYER `/player/ranking`, `/api/player/my-ranking?clubId=<Cristal>` | Su identidad/posición coincide con ranking público mismo contexto; STAFF denegado; no entrada es estado legítimo, fallo DB no produce puntos cero. |
| `/jugadores/<userId>` y `/api/players/<userId>/career` | Identidad/club público, historial y logros coinciden con homologación vigente, WO/BYE correctos, sin contacto ni finanzas; probar persona sin carrera y perfil inexistente. |
| OWNER/ADMIN | Ranking público accesible, acceso a experiencia privada PLAYER denegado; navegar no muta aprobación, entries ni puntos. |

Registrar entorno/deployment/commit, rol verificado, HTTP/código, contexto, timestamp
y capturas redactadas. Repetir 320/375/390/430/768/1280 sin rediseñar; comprobar
gutter, navegación, errores y retry. No declarar Safari/iOS nativo sin dispositivo.
Faltan destino inequívoco, aplicación autorizada de B y sesiones reales. Fixtures,
PGlite y SQL con set_config de claims son evidencia separada: **NO JWT real**.

## D. Certificación Facturación/Pagos

Catálogo actual confirma `get_platform_billing_overview_f2`, `list_platform_billing_f2`,
`get_player_finance_overview_f1d`, `list_player_finance_obligations_f1d`,
`list_player_finance_movements_f1d`: SECURITY DEFINER, search_path fijo
`pg_catalog, public`. Su presencia no certifica autorización HTTP.
La migración deportiva pendiente NO es dependencia de estas RPC financieras.

- OWNER y ADMIN reales: `/club/facturacion`, GET `/api/clubs/billing?clubId=<Cristal>`
  y kind invoices/payments/periods, paginación y filtros; sólo su club. PLAYER,
  OPERADOR/PLANILLERO y usuario ajeno deben ser denegados según permisos.
- PLAYER real: `/player/pagos`, GET `/api/player/finance?clubId=<Cristal>` y vistas
  obligations/movements; sólo obligaciones USER propias o TEAM donde participa.
  STAFF denegado. Datos no se derivan de tournament_payments legacy.
- Sin JWT y JWT inválido: 401 con parámetros válidos. Falta de permisos: 403.
  Vacío legítimo: respuesta 200 sin rows; falla modelo/config/red/DB: error explícito
  y retry, nunca lista vacía inventada. Fallos inyectados sólo en fixtures/local
  controlado, no alterando DB ni env del deployment real.
- Con datos: usar registros existentes y autorizados; no crear facturas/obligaciones
  o pagos para poblar UI. Si no existen, declarar live vacío probado y live con
  movimientos **pendiente**; cubrirlo aparte en fixtures sin certificarlo como real.

Informe anterior: lecturas SQL con roles/claims simulados retornaron vacíos válidos;
Chrome fixture verificó estados y permisos. No hubo sesión JWT financiera real.
Faltan sesiones, mapping vigente de env y evidencia HTTP/UI con y sin datos según
disponibilidad. Certificar visualmente no equivale a certificar conciliación.

## E. Conexión precisa Mercado Pago — plan, NO habilitado

Corrección de nomenclatura del informe previo: prepare real es
`prepare_club_payment_intent_f1e(uuid,text)` (catálogo actual: existe), **no**
`prepare_club_payment_checkout_f1e`. Existen claim/finish/fail checkout y reconciler.
Cristal tiene **cero cuentas provider** registradas. Env local no tiene configuración
MP. No se inspeccionaron tokens Vault ni se conectó vendedor.

Flujo preservado: solicitud PENDING → confirmación deportiva autorizada → trigger
F1B genera obligación TEAM canónica → eligibility F1D/F1E → checkout existente →
retorno read-only → webhook verificado/API proveedor → reconciliación F1A.

Punto decisivo: F1B sólo crea deuda al pasar a CONFIRMED; total congelado = precio
por jugador ×2 ARS, source_id registrationId, único e idempotente. PENDING no debe
generar deuda, y pagar no debe confirmar cupo. No existe todavía el puente wizard.

Implementación posterior mínima, conservando las pantallas:

1. Reusar `app/api/tournaments/[tournamentId]/registration/submit/route.ts`
   y `register_team_for_tournament` para solicitud/retry, sin crear obligaciones
   manualmente ni equiparar tournament_payments.APPROVED a dinero. Hoy submit y
   payments/request rechazan métodos distintos de CASH_ON_SITE_REQUEST.
2. Exponer una lectura autorizada pequeña desde registrationId hacia obligación
   F1B/F1D y opciones F1E; derive TEAM/club desde DB, no confíe en IDs del browser.
   Reutilizar lector F1D y `get_player_payment_options_f1e`, sin N+1 ni acceso libre
   service_role. Revisar contrato SQL disponible para lookup por source_id antes
   de decidir si necesita RPC nueva; **no asumir que ya existe** ni crear schema hoy.
3. En wizard existente, PENDING muestra espera de confirmación, sin checkout. Tras
   CONFIRMED/obligación OPEN con saldo y eligibility server-side, ofrecer continuar
   al checkout. Histórico sin obligación no hace backfill; NO_CHARGE/PAID/CANCELLED
   no habilitan pago. Si producto exige pagar antes de confirmar, requiere decisión
   explícita y modelo separado: no se introduce en este cierre.
4. Enviar POST existente `/api/player/finance/checkout` sólo
   `{obligationId,idempotencyKey}` UUID. Actor real verificado; clave estable por
   operación/retry. Reusar `createPaymentCheckout` y repositorio F1E; importe/moneda
   y seller salen del saldo canónico. Claim/índice impiden preferencias concurrentes;
   intent CHECKOUT_READY se reutiliza. No trasladar lógica de checkout al submit
   ni re-registrar pareja tras error del proveedor.
5. Retorno existente `/player/pagos?paymentReturn=<reference>` consulta GET checkout
   con `reference` y sesión autorizada; no acepta status/amount del browser.
   Webhook verifica HMAC antes de inbox, obtiene evidencia de API MP y valida
   collector/reference/importe/ARS. Sólo reconciler registra dinero F1A de forma
   atómica/idempotente. Retry y segundo webhook no duplican payments/allocations.
6. Mantener feature OFF. Adaptar controles actuales sólo después de verificar
   conexión completa en QA aislada; nunca habilitar método simplemente por flag.
   Sandbox técnico deberá permitir probar checkout con acceso controlado sin
   habilitar pagos a usuarios reales; activación de producto es un gate posterior.

Precondiciones sandbox: DB QA aislada ya existente con F1A–F1E/Vault, cuentas MP
de prueba vendedor/comprador separadas Argentina, OAuth Marketplace/PKCE habilitado,
Client ID/Secret, secreto Webhooks, origin HTTPS estable, callback exacto y webhook
públicamente alcanzable (sin cambiar protección Vercel en este turno), SELLER
test conectado por OAuth en Vault, LIVE_MODE=false, JWTs del DB QA y autorización
para crear sólo datos ficticios allí. No usar DB conectada mientras A sea incierto.
No se creó infraestructura paga, credencial, conexión, preferencia ni transacción.

Gates: checkout importe/saldo neto/fee cero; cancel/retry/multi-tap; retorno
success/pending/failure sin POSTED; firma inválida sin inbox; provider timeout/retry;
replay aprobado exactamente un payment y journal; pagos manuales concurrentes,
seller/reference/currency incorrectos → RECONCILIATION_REQUIRED sin doble dinero;
refund/chargeback sin reversión automática; UI club/player y aislamiento F2.
F2 Facturación SELPA permanece independiente: no agregamos comisión ni cobro SELPA.
Contratos locales F1B/F1E no sustituyen OAuth, webhook ni conciliación sandbox real.

## F. Cambios locales, QA y commits pendientes

De este cierre: un test actualizado y dos scripts QA nuevos, más este informe.
Sin modificación de runtime/UI, schema, migración, RLS o datos. Continúan todos
los cambios locales seguros del informe previo y untracked ajenos, sin stashes
alterados. `next-env.d.ts` conserva su variante dev del usuario.

Contrato heredado: fallo reproducido anteriormente en HEAD y árbol local, debido
a regex `dateConfigurationCta(blockerIssues)` obsoleta; dashboard usa helper de
capabilities. No se modificó dashboard ni semántica deportiva. El test mantiene
sus cuatro contratos previos y suma comportamiento real: duplicados entre divisiones
se eliminan por código, diagnósticos de lifecycle no son CTA de setup, 16 combinaciones
de permisos/issues, labels concretos y destino de edición con contexto event.

QA ejecutada en este cierre:

- Editor/issues/presentation: **17/17 PASS** (editor 5/5).
- F1B/F1E: **35/35 PASS** con loader tsx existente; mocks/contratos, NO MP real.
  Primer intento con Node strip-types dio error de resolución de imports sin
  extensión en F1E; rerun con loader correcto pasó, no se cambió código para ello.
- Comparación lint con HEAD, mismas dependencias/config actual, 624 archivos
  versionados de app/components/features/lib: baseline **178 errores/132 warnings**,
  local **178 errores/131 warnings**; diferencia única: desaparece unused
  paymentStatusLabel en inscripción por recuperación previa. No nuevas infracciones;
  no equivale a lint global aprobado ni a comparación con herramientas históricas.
- Lint focal del test y scripts: PASS. TypeScript `--noEmit --incremental false`:
  PASS; `git diff --check`: PASS (sólo avisos Git LF/CRLF). Build/browser anteriores constan en el informe previo;
  no se vuelven a declarar como prueba de este cierre sin ejecutarlos.
- Preflight real read-only: cinco SELECT + cuerpo de RPC compatibles; objetos
  siguen ausentes. Catálogo financiero presente. No JWT real, Safari/iOS físico,
  Preview, producción ni Mercado Pago sandbox certificados.

Reproducción local: `node scripts/qa/lint-head-comparison.mjs` compara fuentes de
HEAD en memoria, sin cambiar checkout. `node scripts/qa/career-migration-preflight.mjs`
sólo emite consultas; no ejecutar archivo de migration para reproducir checks.

No commit, push ni deploy en este cierre. HEAD permanece igual; los commits de
recuperación visual/errores/contratos del informe previo siguen pendientes junto
con este test y preparación. No incluir archivos ajenos/temporales/ZIP en futuros
commits. No iniciar Bloque 2.

Siguiente entrada necesaria: evidencia vigente de Vercel y declaración del
responsable que clasifique el ref; después autorización explícita de destino para
esta única migración. Sesiones reales de QA se manejan en navegador, nunca en chat.
