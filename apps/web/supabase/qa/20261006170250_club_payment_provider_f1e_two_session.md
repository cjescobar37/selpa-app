# F1E · QA real en DB descartable

Instalar las migrations F1A–F1E en una DB descartable; nunca usar datos live.
Ejecutar primero `20261006170250_club_payment_provider_f1e_validation.sql`
con ON_ERROR_STOP. Todo queda bajo rollback. Necesita un OWNER aprobado,
un torneo y tres usuarios distintos que no sean administradores del club.
La DB necesita Supabase Vault instalado. El SQL usa tokens/PKCE sintéticos en Vault
y rollback; no habla con Mercado Pago ni crea credenciales reales.

## Carreras en dos sesiones

Crear fixtures descartables equivalentes al QA secuencial y guardar los UUIDs.
En ambas sesiones usar `SET ROLE authenticated` y claims reales del jugador;
para simular provider usar `SET ROLE service_role` y su claim role.

1. **R1 · create-intent/checkouts.** TEAM player1 / player2: A inicia BEGIN y llama a
   `prepare_club_payment_intent_f1e(obligation_id, 'session-a-key')`.
   B llama a la misma RPC con otra key. Debe esperar el lock de obligación;
   al confirmar A, B devuelve el mismo intent. Sólo un intent activo.
2. Doble creación de preferencia: dos workers llaman
   `claim_club_payment_checkout_f1e(intent_id, claim_uuid_distinto)`.
   Sólo uno recibe el intent; el otro recibe NULL. Nunca repetir el POST externo
   tras timeout: `fail_club_payment_checkout_f1e` exige conciliación.
3. **R2 · webhook duplicado.** APPROVED / APPROVED: dos eventos firmados distintos consultan la API y
   llaman `reconcile_payment_provider_event_f1e` para el mismo provider payment.
   Confirmar exactamente un payment POSTED, allocation y journal PAYMENT_RECEIVED.
   Misma firma/fingerprint devuelve el mismo inbox event.
4. **R3 · APPROVED vs manual.** A ejecuta `register_club_finance_payment` por el saldo
   completo y mantiene la transacción; B concilia el provider por el mismo monto.
   Tras commit A, B conserva evidencia y devuelve RECONCILIATION_REQUIRED;
   no persiste un segundo cobro. Probar también ambas direcciones, pago manual
   parcial y REPEATABLE READ. Bajo RR, 40001 debe abortar/reintentar la transacción
   completa; no capturar ese conflicto como éxito contable.
5. Balance cambiado antes del checkout: un cobro manual parcial reduce el saldo.
   Una key nueva expira el intent viejo y genera uno por el saldo actual.
   El worker invalida primero la preferencia anterior con PUT; si ese paso falla,
   no crea otra y exige conciliación. Una confirmación tardía del intent expirado
   no se contabiliza automáticamente.
6. Actualización APPROVED seguida de refund/chargeback: no revertir F1A ni emitir
   refunds automáticos; conservar evidencia y exigir revisión operativa.
7. **R4 · refresh concurrente.** Account con expiración próxima (<60 s), tokens
   sintéticos y status CONNECTED. Sesión A (service_role) llama dentro de BEGIN a
   `claim_payment_provider_credentials_f1e(account_id, claim_A, 'CHECKOUT')`.
   Sesión B llama con claim_B y espera el row lock. COMMIT A: B devuelve BUSY y
   no recibe refreshToken. Fuera de DB, sólo worker A llama al adapter mock.
   A llama `rotate_payment_provider_credentials_f1e(account_id, claim_A,
   seller_id, 'synthetic-access-new', 'synthetic-refresh-new', now()+interval '1 hour', false)`.
   B reintenta claim: READY con el mismo nuevo access; exactamente una llamada MP.
   Verificar ambos UUID Vault permanecen, ambos valores cambiaron y claim se limpió.
   Con claim viejo, vendedor/modo distinto o refresh incompleto: se rechaza y no
   cambia ningún secret. Simular fallo tras primera escritura dentro de una
   subtransacción: rollback revierte ambos secrets y expires_at.
   Para 429, failRefresh definitivo=false/uncertain=false libera claim y conserva
   ambos tokens. Para timeout/crash/DB fallo después de API, uncertain=true conserva
   claim y tokens: no hay segundo POST ciego. Después de 30 s retorna UNCERTAIN.
   401/403/invalid_grant: sólo esos casos ponen CONNECTED→RECONNECT_REQUIRED.
   Desconectar mientras hay claim: no permite CHECKOUT nuevo; finalización del
   claim sólo puede servir a evidencia WEBHOOK retenida, o falla si refs purgadas.

## QA del adapter / sandbox previo a activación

Contratos Node usan adapter/transport y secret store en memoria exclusivamente
en tests. Verifican firma HMAC, una sola llamada concurrente a Checkout Pro,
retry reusable, fallo ambiguo y snapshot obtenido desde API. No prueban DB live.

El runtime ya usa VaultProviderSecretStore. Ejecutar el QA SQL actualizado para
refs UUID, ausencia de plaintext en public, PKCE delete/expiry, refresh CAS,
denegación Vault SELECT/WRITE de anon/authenticated, RPCs secret-bearing sólo para
service_role, search_path, RLS y disconnect sin borrar historia. service_role es
backend confiable y conserva privilegios Vault administrados por Supabase: no
exigir denegación de su acceso nativo. El runtime usa sólo VaultProviderSecretStore
y RPCs F1E acotadas, sin getter genérico ni consultas Vault directas.
La prueba de fallo post-Vault fuerza rollback después de ambas escrituras, sin
alterar objetos internos Vault. Para simular indisponibilidad real de Vault usar
fallo RPC en adapter mock; verificar callback nunca devuelve connected.
Antes de tokens reales, comprobar redacción de logs/APM/argumentos RPC. Backend
recibe sólo la credencial de la cuenta solicitada; no get_any_secret ni scan Vault.

Con credenciales sandbox: validar OAuth/PKCE, callback,
refresh/reconexión, desconexión para nuevos checkouts, firma/reintentos MP,
preferencia vencida y URL de retorno en 320/375/390/430 px. Revocar acceso OAuth
en MP debe activar Requiere reconexión y bloquear nuevos intents.

La resolución manual de diferencias, refund, chargeback y comisión comercial
no está implementada en foundation. Disconnect purga secrets sin actividad; conserva
refs protegidas para intents/evidencia sin resolver y notificaciones tardías 30 días.
Definir ejecución de cleanup_payment_provider_secrets_f1e antes de activar: cleanup
es oportunista en el flujo, no un cron instalado por esta migration. Vencido PKCE
no se puede consumir desde RPCs F1E ni leer por anon/authenticated aunque aún no
se haya purgado; service_role sigue siendo backend confiable, no un rol cliente.
