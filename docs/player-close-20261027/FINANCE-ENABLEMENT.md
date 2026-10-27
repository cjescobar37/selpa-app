# Habilitación financiera — diagnóstico y plan separado

Estado: **sin cambios en Supabase compartido y sin cobros reales**.

## Fallo real identificado

Los logs locales existentes registran `GET /api/player/finance → 503` y:

```text
operation: get_player_finance_overview_f1d
code: PGRST202
```

No se registraron identidades, JWT ni argumentos privados en la evidencia exportada. PGRST202 señala que PostgREST no encuentra el contrato de esa RPC en su caché; por sí solo no prueba si falta la función, si cambió su firma, si sus grants la ocultan o si la caché está desactualizada.

El historial **sí registra F1A, F1B, F1C, F1D, F1E, F1F y F2**. Los metadatos muestran las tablas financieras correspondientes y RLS habilitado. Por lo tanto, no corresponde reinstalar toda la cadena ni afirmar que faltan todas sus migraciones.

La prohibición de SQL compartido se respetó. La existencia actual, firma y ACL de cada RPC/vista quedan pendientes del [preflight de catálogos preparado](read-model-preflight.sql). El historial de migraciones y la lista de tablas no sustituyen esa comprobación. La API falla primero en el overview; no se dan por certificadas las RPC posteriores.

## Inventario y dependencias

| Bloque | Función | Evidencia de instalación | Siguiente comprobación |
|---|---|---|---|
| F1A | Obligaciones, pagos, allocations, journals, postings y comandos idempotentes | Migración registrada y seis tablas presentes | Contratos, invariantes y grants; no ejecutar comandos ni recrear saldos |
| F1B | Vincula inscripción con obligación económica mediante RPC | Migración registrada; tablas base y referencias disponibles | Funciones de confirmación/revisión/cancelación e idempotencia, sin invocarlas en compartido |
| F1C | Tres RPC de lectura del club | Migración registrada, tablas fuente presentes | Firma, `finance:view`, propietario/search_path, paginación y grants |
| F1D | Helper de visibilidad y tres RPC del jugador | Migración registrada, tablas fuente presentes; overview devuelve PGRST202 en API | Firma `get_player_finance_overview_f1d(uuid)` con argumento `p_club_id`, listados, EXECUTE de authenticated y caché |
| F1E | Cuenta del proveedor, OAuth, intents, eventos y resultados | Migración registrada y tablas correspondientes presentes | Vault, permisos de servicio, cuenta conectada, credenciales, webhooks y sandbox; mantener cobros deshabilitados |
| F1F | Conciliación, historial de revisión y reportes | Migración registrada e historial presente | Tres vistas de lectura, RPC de reportes/casos y separación entre revisar y acreditar un pago |
| F2 | Facturación SELPA a los clubes | Migración registrada y tablas `platform_billing_*` presentes | Dominio independiente: no incorporarlo al saldo de Mis pagos ni al ledger del club |

La lista detallada de nombres y columnas está en `schema-contract.json`. El preflight enumera 68 funciones de los dominios deportivo y financiero, además de vistas, índices y policies. Incluye todos los contratos necesarios para distinguir objeto ausente de firma/grants/caché incorrectos.

Coexisten estructuras legacy como `club_financial_transactions`, `club_receivables` y las tablas antiguas de finanzas de plataforma. F1D usa `club_finance_*`. No se suman ambos modelos ni se realiza una migración o backfill automático para llenar pantallas. Tampoco se crean cargos retrospectivos a partir de inscripciones confirmadas.

## Lecturas, identidad y roles

La API F1D usa anon key + JWT verificado del jugador; las RPC derivan identidad de `auth.uid()`. El parámetro de club filtra el contexto, pero no concede propiedad sobre obligaciones de terceros. Una obligación TEAM solo es visible a integrantes de esa pareja; los movimientos muestran allocations visibles, no el pago completo con allocations de otras personas.

El rechazo de cuentas administrativas como PLAYER se realiza además en la API mediante `playerAccountDenial`. Las RPC F1D existentes restringen por identidad/propiedad y no incorporan el mismo rechazo global de STAFF. Esto debe revisarse como contrato de acceso directo antes de certificar la separación completa; no se cambió esa regla ni se otorgaron permisos nuevos. F1C exige `finance:view`, y F2 conserva su autorización independiente.

El overview de todos los clubes del jugador es intencional. Cambiar el club activo de navegación no autoriza leer finanzas ajenas ni debe mezclar F2 con las obligaciones del jugador.

## SQL candidato y rollback

[Candidato de reparación de lecturas](finance-read-candidate.sql): cuerpos de F1C/F1D tomados de sus fuentes, con CREATE OR REPLACE FUNCTION e índices IF NOT EXISTS. Conserva filtros y reglas financieras, search_path y grants explícitos; no reinstala F1A/F1B, no invoca escrituras y no toca F2 ni el proveedor.

**No aplicar antes de revisar el preflight.** Si los objetos existen correctamente y solo falla la caché, este candidato no sería necesario. Si cambia el retorno de una función, CREATE OR REPLACE debe fallar; no resolverlo con DROP automático. Los índices existentes deben contrastarse con su definición, ya que IF NOT EXISTS no valida equivalencia y crear un índice faltante puede adquirir locks.

Antes de cualquier reemplazo autorizado se deben guardar `pg_get_functiondef`, propietario, ACL e índices del estado real. El rollback consiste en restaurar esas definiciones y grants, no en borrar RPC que ya estaban instaladas. No existe un archivo universal de rollback financiero seguro sin ese preflight. El ensayo demuestra la restauración del contrato conocido aislado; no se presenta como un backup del proyecto compartido.

## Ensayo aislado realizado

```powershell
$env:SELPA_QA_MODULES='D:/SELPA/output/block1-qa'
$env:SELPA_REHEARSAL_REPORT='D:/SELPA/output/player-close-20261027/finance-rehearsal.json'
node scripts/qa/player-close-finance-rehearsal.mjs
```

No carga `.env`, no tiene red ni crea obligaciones, cobros, pagos, allocations, saldos artificiales o movimientos financieros. Construye tablas vacías con los tipos de los metadatos y aplica las lecturas F1C/F1D; usa identidades deportivas sintéticas para probar permisos.

Resultado aprobado:

- Lecturas F1D vacías derivan importes cero de tablas realmente vacías en el ensayo.
- F1C permite al ADMIN del club y deniega PLAYER, PLANILLERO y otro club.
- Identidad ausente y acceso anónimo a F1D son denegados.
- El candidato puede reaplicarse sin modificar firmas, cuerpos ni grants efectivos del contrato ensayado.
- Se revocó un permiso únicamente en memoria y se restauraron las definiciones y ACL guardadas; el contrato anterior volvió a coincidir.
- El preflight propuesto fue validado como transacción de solo lectura en PostgreSQL aislado.
- Hash de todas las tablas financieras, de proveedor y F2 antes/después: `80cce65621b5aa369c6566dae7ca03714f1bc60ef655c4cb7876c1c83ad112c5`.

Las suites completas de F1A–F1F y F2 complementan esto con contratos contables, balances canónicos, reversas, paginación, errores e idempotencia. No certifican datos financieros reales ni reemplazan una prueba sandbox de Mercado Pago.

## Orden de habilitación propuesto

1. Autorizar y revisar el preflight de catálogos. Distinguir ausencia real, firma, ACL y caché. Preservar backup de definiciones/propietarios/ACL/índices.
2. Si existe el contrato correcto y los grants correctos, considerar únicamente una recarga de caché de PostgREST, con autorización específica. Verificar F1D antes de reemplazar funciones.
3. Si faltan o difieren lecturas, revisar y aprobar un subconjunto preciso del candidato F1C/F1D. No reaplicar la cadena financiera ni tocar F1A/F1B por consecuencia.
4. Certificar lectura autenticada real, aislamiento entre clubes/usuarios/parejas/roles y relación entre cargo, pago acreditado, reversa y allocations. No crear un cobro para probar una pantalla.
5. Revisar F1F y reportes mediante lecturas autorizadas. Revisar F2 por separado, sin incluir sus facturas en el saldo deportivo del jugador.
6. Solo después preparar el entorno sandbox del proveedor y un protocolo de prueba aprobado.

## Mercado Pago: condición de bloqueo

El chequeo local, sin exponer credenciales, devuelve `enabledFlag=false`, `providerReady=false`, `liveMode=false`. No se modificaron `.env`, cuentas conectadas, dominios ni Vercel. Esto no certifica la configuración de otros entornos.

Los cobros reales permanecen bloqueados. Para proponer su habilitación deberán aprobarse y certificarse: credenciales sandbox y cuenta del club; almacenamiento/rotación server-side de secretos; OAuth y state de un solo uso; firma y tolerancia temporal del webhook; verificación servidor a servidor de cuenta, importe, moneda y referencia; idempotencia de checkout/eventos/reintentos; conciliación atómica con ledger/allocations; rechazos, pendientes, duplicados y reversas. El retorno del navegador no acredita un pago. No se ejecutó ninguna de esas operaciones contra Mercado Pago.
