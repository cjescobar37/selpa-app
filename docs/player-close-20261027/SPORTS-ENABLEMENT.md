# Habilitación deportiva — propuesta para aprobación

Estado: **preparado y ensayado en PostgreSQL aislado; no aplicado a Supabase compartido**.

## Evidencia y compatibilidad

- Base de código: `8e0b9c83733f4c74ee2e9dd681440f4f69415f05`, worktree móvil vigente.
- Destino auditado mediante herramientas de metadatos: proyecto `nenupmpjrzdxfrnwsmkx`. El historial sigue terminando en `20261008133156`; no registra las dos migraciones de lectura.
- La auditoría anterior confirmó diez vistas y dos RPC ausentes. En esta pasada no se ejecutó SQL compartido: se revisaron historial, columnas, tipos, claves primarias y flags RLS mediante `list_tables` / `list_migrations`.
- `schema-contract.json` contiene únicamente metadatos, sin filas de negocio. Permite construir el esquema de columnas/tipos usado en el ensayo. No equivale a restaurar todas las constraints, policies, triggers y extensiones de un backup de Supabase.
- Se revisaron `supabase_full.sql`, `docs/schema-summary.md` y las dependencias de las migraciones. El dump no sustituye al catálogo actual ni contiene por sí solo todas las proyecciones pendientes.

## SQL exacto propuesto

1. [Preflight de catálogos](read-model-preflight.sql): SELECT de existencia, firma, retorno, propietario, ACL, RLS, policies e índices. Transacción de solo lectura, con rollback. **Todavía requiere autorización para ejecutarse en el proyecto compartido.**
2. [Habilitación deportiva](sports-enable.sql): copias exactas, en este orden:
   - `20261009100429_player_career_read_models.sql`.
   - `20261022135243_public_sports_visibility_reads.sql`.
3. [Rollback](sports-rollback.sql): elimina exclusivamente las diez vistas y dos RPC nuevas, en orden inverso de dependencia, sin CASCADE ni operaciones sobre datos.
4. [Firmas de las fuentes](source-manifest.json): SHA256 de texto UTF-8 normalizado a LF; las migraciones originales permanecen intactas.

No debe ejecutarse el conjunto completo de migraciones pendientes del repositorio. El preflight debe confirmar que los nuevos objetos siguen ausentes y que los tipos/columnas/grants base coinciden. Si existe alguno de esos objetos, detenerse y respaldar su definición/ACL antes de proponer un reemplazo. El rollback incluido presupone su ausencia inicial; no es un rollback genérico para objetos preexistentes.

## Contrato deportivo y privacidad

- Elegibilidad: vínculo aprobado de PLAYER y cuenta excluida de roles administrativos, antes de calcular posiciones.
- Puntos: ledger canónico, incluidas reversas; empates conservan posición. No se utilizan puntos legacy como sustituto.
- Participación: homologaciones y resultados oficiales. Una inscripción o un cupo confirmado no prueban partidos jugados ni victorias.
- Lectura pública: temporada pública ACTIVE/CLOSED, catálogos visibles y contexto autorizado. Carrera pública requiere además publicación y estado correctos de series/eventos y homologación/finalización.
- Nuevas vistas con `security_invoker`; grants únicamente a service_role. Las RPC se restringen a backend. La API propia verifica JWT e identidad; poseer la carrera propia no autoriza leer competidores privados.
- No se publican temporadas privadas ni se cambian flags para llenar pantallas.
- La proyección individual actual admite INDIVIDUAL sin segmento, caballeros/damas y categorías legacy 1–7. No se amplía desde frontend ni se inventan categorías de ascenso. Una ampliación requerirá definición deportiva y revisión separada.

**Las sentencias propuestas no modifican partidos, puntos, homologaciones ni ledger.** El ensayo confirmó que habilitar estas lecturas no necesita reescribir esas tablas. Esto no demuestra que todo jugador compartido tenga una entry activa válida o resultados elegibles; se verificará mediante lecturas autorizadas posteriores, sin backfills automáticos.

## Ensayo reproducible y restauración

Desde `apps/web`, con el paquete PGlite disponible:

```powershell
$env:SELPA_QA_MODULES='D:/SELPA/output/block1-qa'
$env:SELPA_REHEARSAL_REPORT='D:/SELPA/output/player-close-20261027/sports-rehearsal.json'
node scripts/qa/player-close-sports-rehearsal.mjs
```

El script no carga `.env` ni tiene llamadas de red. Usa PostgreSQL en memoria, columnas/tipos del contrato y datos deportivos sintéticos. Comprueba instalación de ambos archivos, ranking propio, exclusión STAFF, club privado, grants de servicio, denegación de lectura directa a anon/authenticated, rollback y reaplicación con puestos/puntos iguales.

Resultado aprobado. Hash de tablas base antes y después del rollback:

`cb65b401fe6e61b991a0348976c38828e6fcf1a92e5f1010cc51baadd8cff788`

El hash incluye las tablas deportivas base, no solo los resultados de las vistas. El rollback dejó los objetos nuevos ausentes; reaplicarlos restauró la misma posición y puntos del fixture. Las suites de privacidad complementan el ensayo con categorías, temporadas ACTIVE/CLOSED/privadas, series/eventos ocultos, empates, reversas, parejas, paginación y capacidades de API.

## Riesgos y secuencia de aprobación

1. Autorizar únicamente el preflight de catálogos y revisar su resultado actual.
2. Si coincide, acordar el destino y respaldar definiciones/ACL y esquema del proyecto. No modificar main, Production, dominios ni datos como parte de esta habilitación.
3. Aprobar expresamente el paquete deportivo. Cada archivo conserva su transacción original: si falla el segundo, el primero puede haber quedado instalado. Verificar estado y usar el rollback específico de objetos nuevos; no improvisar un rollback de datos.
4. Vistas no materializadas calculan sobre tablas existentes. Medir tiempos y planes con datos reales autorizados; los fixtures no prueban rendimiento productivo.
5. Si el catálogo es correcto pero PostgREST aún no expone las RPC, evaluar una recarga de caché por separado. No reinstalar modelos ni alterar grants indiscriminadamente.
6. Contrastar API y UI con datos reales autorizados: club, categoría, temporada, posición, puntos, participantes, carrera y privacidad. No transformar falta de elegibilidad en un puesto inventado.
7. Validación física posterior en iPhone/PWA instalada. El ensayo no la certifica.
