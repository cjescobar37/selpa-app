# SELPA — Contexto compartido y continuidad operativa

**Última revisión documental:** 02/11/2026 (Argentina). Los apartados históricos conservan sus fechas originales.
**Naturaleza:** fuente de continuidad para Codex en ambas computadoras. Contiene decisiones estables y un estado de trabajo que **debe verificarse** contra el repositorio antes de actuar. No es un reemplazo del código ni de los tests.

## 1. Visión innegociable

SELPA es una plataforma comercial de pádel que integra clubes, jugadores, torneos, circuitos, rankings, carrera deportiva, comunidad, administración y finanzas. Debe sentirse como una **app instalada de primera calidad** (PWA) en iPhone/Android y mantenerse sólida en desktop. Trabajar **producto-first**, con recorridos completos, comprensibles y **APB (a prueba de boludos)**. No desarrollar funciones aisladas sin considerar usuario, rol, permisos, navegación, estados vacíos y QA.

Identidad: navy, cian y magenta, logo SELPA, terminología **Damas/Caballeros**. Conservar los diseños aprobados; no rediseñar por preferencias del agente. La experiencia móvil prioriza densidad útil, legibilidad, acciones táctiles, claridad y rendimiento.

### Reglas visuales globales

- **Un solo gutter exterior horizontal de aproximadamente 8 px por lado**, propiedad del shell móvil en 320–430 px. Evitar sumar paddings horizontales en page/layout/wrapper. El padding interno de las cards se mantiene. Los headers/heroes que lo requieran pueden ser full bleed.
- **Badges de estado** (Borrador, Programado, Abierto, Activo, Finalizado, etc.) **arriba a la derecha dentro de la card**, reservando espacio sin chocar con títulos largos; nunca una fila exclusiva para el badge.
- Cards compactas y comparables; flyers de torneos visibles. No usar gigantismo, relleno, espacios muertos ni cards anidadas innecesarias.
- Cabeceras de secciones coherentes y basadas en componentes compartidos; preservar diseño navy y acentos cian/magenta.
- Navegación móvil con barra inferior táctil adaptada por rol, safe areas, menú superior compacto y comportamiento PWA auténtico; no inventar rutas o permisos. Comprobar estado real implementado antes de editar.
- Diseñar y probar primero en 320/375/390/430 px y luego tablet/desktop sin regresiones.
- En Club Admin/STAFF, menú de usuario simplificado: Administración del club, Mi cuenta, Ver página pública del club, Facturación SELPA si corresponde, Cerrar sesión. Preferencias/Seguridad integradas en Mi cuenta y rutas anteriores conservadas si son necesarias por compatibilidad.

## 2. Arquitectura y límites

- Repositorio: `cjescobar37/selpa-app`. App canónica: `apps/web`; Next.js 16 / React / TypeScript / Tailwind v4 / Supabase Auth+DB / Vercel.
- **Toda fecha de circuito es un torneo; no todo torneo pertenece a un circuito.** El Tournament Engine es base deportiva. Respetar los invariantes de circuitos, series, divisiones, homologación, byes, walkovers, snapshots, settlement, ledger de puntos y ranking.
- Homologación de parejas: FINAL campeón/finalista; SEMI perdedores de semis; QUARTER perdedores de cuartos; otros participantes; byes estructurales sin tier propio; walkovers según ganador; proyección una vez por equipo. Validar contra código/tests vigentes antes de cualquier cambio.
- Respetar privacidad/autorización a nivel backend. No deducir permisos por la UI. No inventar clasificaciones, estadísticas, puntos, resultados, posiciones o pagos.
- `main` y Production no se modifican sin autorización; tampoco dominio, Supabase compartido, schema, RLS, migraciones o datos reales. Las claves `.env*` y `service_role` no deben divulgarse ni subirse a Git.
- Separar **solicitud de inscripción**, **cupo confirmado**, **obligación financiera** y **pago acreditado**. No presentar cobro online operativo hasta certificar integración real.

## 3. Estado Git e infraestructura

### Estado vigente: revisión final local, 02/11/2026, notebook C:\SELPA

- Casa respaldada y verificada directamente en GitHub: `codex/home-block2-recovery-20261102`, `a1eda932444077399a06ad7e971a0ed02e7e672b` (30 archivos). Base original `aa9cfac`. Sin modificaciones ajenas identificadas; no había stashes.
- Banco confirmado por consulta remota: `origin/codex/player-ux-20261102`, `e4161b2877f2aad15a277ce3f907590a5615398f`. Integración remota confirmada `9c28abcf79869a022b1cb745434246511cfc788e`; rama local de integración preservada en `aa9cfac`, un commit detrás. No se cambió ni publicó integración.
- Rama activa `codex/player-block2-consolidated-20261102`, creada sobre `e4161b2` sin upstream. Sprint aplicado mediante `cherry-pick --no-commit`; conflictos resueltos y secuenciador cerrado con `--quit`. Los cambios consolidados permanecen locales en índice/árbol; NO existe commit de consolidación ni push. No cambiar de rama en este checkout con este trabajo pendiente.
- Se preservan card canónica mediante adaptador `PlayerAgendaCard`, wrapper y container queries del banco, Perfil con retry acotado y filtros de pagos en una línea. Se agregan catálogo compartido, filtros URL con Aplicar/Cancelar, errores parciales, conteos conocidos y estados seguros de inscripción de casa. No se reintroduce el layout legacy de agenda ni sus overrides CSS por pantalla.
- QA de revisión final: 900/900 tests aislados, TypeScript código 0; lint código 0 (128 advertencias). Build optimizado aprobado (166/166 páginas); 11/11 checks HTTP locales. Navegador: Volver conserva filtros/origen incluso tras refresh y pestaña nueva; pagos con cinco filtros en una fila y targets >=44 px en mobile; cards canónicas conservadas. Límites y evidencia en el cierre de revisión final; resultados previos conservados como históricos.
- Sin cambios de schema/RLS/datos reales, pagos reales, stashes, main o deployment. Preview/Production no consultadas. Siguiente paso: autorizar commit/push exclusivamente de la consolidada y verificar el SHA publicado antes de recibirla en el banco. La revisión local no encontró bloqueos para esa publicación de rama; no certifica Production ni servicios reales. No hubo commit/push en la revisión final.

### Entrega PLAYER en rama exclusiva: 02/11/2026

- Checkout de trabajo: `D:\SELPA\output\selpa-full-integration-20261030`. Por autorización explícita del usuario se creó aquí `codex/player-ux-20261102`, conservando los trece archivos de esta tarea. La rama de integración sigue siendo `codex/selpa-full-integration-20261030`; su base local y el remoto consultado coinciden en `9c28abcf79869a022b1cb745434246511cfc788e`. La rama exclusiva no existía localmente ni en GitHub al crearla. No se incorporan estos cambios a integración ni a main.
- Alcance de entrega: diez archivos de producto/estilos de PLAYER, dos archivos de pruebas y este documento (lista exacta en el apartado de implementación siguiente y en el commit). No se incluyen .env, credenciales, datos privados, capturas, logs, configuración generada ni archivos ajenos. La revisión de CSS contra HEAD confirmó que los selectores/declaraciones ajenos a TournamentPublicCard se conservaron tanto en public.css como en navbar.css.
- Validaciones reejecutadas para el cierre: suite aislada 880/880, TypeScript sin errores y ESLint con 0 errores / 128 advertencias existentes; `git diff --check` PASS. El build de producción PASS y el QA visual 320/375/390/430/768/1280 px se ejecutaron durante la implementación anterior sobre estos mismos archivos de código, sin modificaciones posteriores. No se repitió el ensayo visual ni el build durante la sincronización. Las pruebas de cierre son sintéticas y no modifican Supabase.
- Perfil: se conserva la evidencia reproducible de HTTP 500 transitorio tratado como definitivo por el lector anterior; caso 500 → 200 ahora recuperado, 403 sin retry y fallos persistentes acotados. La corrección y los tests viajan en esta rama. El episodio histórico con sesión real y la prueba física iPhone/PWA siguen pendientes; no declarar certificado ese recorrido real ni reabrir toda la auditoría deportiva/financiera para continuarlo.
- Commit de entrega: mensaje `fix(player): unify tournament cards and stabilize profile loading`; el propio SHA se obtiene con `git log -1 --format=%H` sobre esta rama y se informa en el cierre. La publicación autorizada es únicamente a `origin/codex/player-ux-20261102`; comprobar igualdad del HEAD local con `git ls-remote origin refs/heads/codex/player-ux-20261102`. El documento incluido en el commit no intenta registrar su propio hash.
- Esta autorización cubre commit/push de la tarea y sustituye el pendiente de publicación local del apartado histórico siguiente. No autoriza merge a integración/main ni deployments manuales. No se operan Vercel, Production, Supabase ni stashes. La existencia de una rama publicada no certifica una Preview READY ni una validación física.
- Las capturas, logs detallados y measurements.json de `output/player-refinement-20261102-FosP1R` permanecen únicamente en la PC del trabajo y fuera de Git; no asumir que aparecerán en casa. El resumen, las decisiones y los casos reproducibles de tests sí quedan versionados. Próximo trabajo: revisión visual del usuario y prueba de login → Perfil con sesión real en una ejecución de esta rama, sin repetir el diagnóstico ya documentado.

#### Retomar desde C:\SELPA en la notebook

1. Leer este documento y AGENTS.md. Comprobar primero `git status --short --branch`, `git branch --show-current`, `git rev-parse HEAD`, `git remote get-url origin` y `git stash list` desde `C:\SELPA`. El remoto esperado es `https://github.com/cjescobar37/selpa-app.git`. Si hay cambios locales o una situación inesperada, conservarlos y detener el cambio de rama; no resetear, limpiar ni alterar stashes.
2. Solo con el checkout limpio y el remoto correcto, ejecutar:

```powershell
Set-Location -LiteralPath 'C:\SELPA'
git fetch origin
git switch --track -c codex/player-ux-20261102 origin/codex/player-ux-20261102
git status --short --branch
git rev-parse HEAD
git rev-list --left-right --count HEAD...origin/codex/player-ux-20261102
```

3. Comparar el SHA con el informe de cierre y confirmar `0 0` en la comparación con origin. Si la rama ya existe localmente, no recrearla ni forzarla: usar `git switch codex/player-ux-20261102`, inspeccionar la comparación y permitir `git pull --ff-only` únicamente si no hay commits locales pendientes ni divergencia. Detenerse ante diferencias incompatibles. No hacer merge con integración/main.
4. Releer las versiones de AGENTS.md y este documento cargadas desde la rama de entrega. Trabajar en `C:\SELPA\apps\web`; conservar las variables privadas locales y nunca copiarlas a Git. Usar únicamente puerto 3000. Con dependencias disponibles, iniciar con `npm.cmd run dev`. Si faltan dependencias, usar `npm.cmd ci` en apps/web. Los tests completos son reproducibles con `node scripts/qa/run-tests.mjs` desde apps/web; no necesitan las capturas de la otra PC.

### Implementación y QA antes de sincronizar: 02/11/2026

- Checkout canónico: `D:\SELPA\output\selpa-full-integration-20261030`; rama `codex/selpa-full-integration-20261030`. Inicio limpio en `9c28abcf79869a022b1cb745434246511cfc788e`, coincidente con el HEAD remoto consultado. La consulta remota final conservó ese SHA. No se hizo pull, commit, push ni deployment en esta pasada; los cambios de producto siguen únicamente en local.
- Se unificaron Inicio / Agenda competitiva / Mis torneos, Agenda con Historial y Explorar / Finalizados / calendario mediante `TournamentPublicCard`. `PlayerAgendaCard` conserva el contrato de sus consumidores y actúa como adaptador de datos, sin una segunda composición visual. Flyer a la izquierda, fecha compacta, estado arriba a la derecha y acceso completo al torneo. Se corrigió la resolución de flyers manuales y se ocultó “Cupo confirmado” si el torneo está cancelado.
- La card responde al ancho de su contenedor, también en columnas estrechas de desktop. Se trasladaron a `public.css` exclusivamente las reglas de torneo que estaban en `navbar.css`; una comparación de AST verificó que los demás selectores, declaraciones y condiciones de ese archivo permanecen iguales. Sin cambios en el diseño de navbar, bottom nav, headers, branding o gutter exterior móvil de 8 px.
- Torneos públicos: búsqueda “Torneo o club” y segunda fila liviana de categoría/género; controles de 44 px y texto de 16 px. Los estados vacíos equivalentes de torneos muestran solo “Sin torneos en esta sección”. Mis pagos: cinco filtros en una fila, sin scroll, con targets de al menos 44 × 44 px; sin cambios en su lógica financiera.
- Perfil: causa reproducible en ensayo controlado: `/api/clubs/my-memberships` convierte errores de lectura en HTTP 500, pero el lector anterior trataba ese estado como definitivo. Un solo 500 seguido de 200 bastaba para mostrar error. El lector GET ahora mantiene la carga, espera una sesión SDK del mismo usuario y admite dos reintentos con backoff de 300/900 ms para transporte o 500/502/503/504; refresh 401 una sola vez; sin reintentar 403 ni contratos inválidos. Cancelación también durante backoff. El resultado de pantalla queda asociado a usuario, intento y solicitud vigente, descartando resultados cancelados. Diagnósticos sin URL, identificadores, tokens ni cuerpos.
- Evidencia de Perfil en navegador local sintético: 500 único → 200 y Carrera sin refresh manual (2 solicitudes); fallo persistente → error después de 3 solicitudes por intento, sin bucle; 403 → 1 solicitud; Reintentar vuelve a carga y permite recuperación cuando el servicio responde. La Preview existente cargó Perfil durante esta sesión; no se capturó el incidente histórico con la sesión real ni logs históricos suficientes para atribuir la causa original de ese 500. No dar por certificada esa reproducción real.
- QA: suite completa 880/880; después de los últimos controles de solicitudes, regresiones dirigidas de Perfil/contratos 36/36; build de producción con configuración sintética PASS; ESLint 0 errores / 128 advertencias existentes. TypeScript final y `git diff --check`: PASS. QA visual de Inicio, Agenda/Historial y Explorar en 320/375/390/430/768/1280 px: sin overflow ni recorte del cuerpo de las cards, fecha/estado en orden y misma base visual. Los cinco filtros de pagos se probaron seleccionando cada estado en 320 px. Búsqueda, categoría/género y empty states probados con fixtures.
- Evidencia local no versionada: `output/player-refinement-20261102-FosP1R` dentro del checkout canónico. Capturas finales de Explorar y Agenda en 320/390 px, pagos en 320/390 px, Perfil recuperado y referencia desktop; logs de validación, mediciones y comparación CSS. Los ensayos usaron PostgreSQL/PGlite y credenciales sintéticas locales; ningún dato real se creó o modificó. Los servidores QA temporales se cierran al finalizar; las capturas no representan una nueva Preview ni una certificación física de Safari/iPhone.
- Archivos de producto: `apps/web/app/(app)/perfil/page.tsx`, `apps/web/app/(app)/player/page.tsx`, `apps/web/app/(app)/player/pagos/PlayerFinance.module.css`, `apps/web/app/(app)/player/torneos/TournamentsPlayerView.tsx`, `apps/web/app/styles/public.css`, `apps/web/app/styles/navbar.css`, `apps/web/components/player/PlayerAgendaCard.tsx`, `apps/web/components/player/PlayerAgenda.module.css`, `apps/web/components/public/TournamentPublicCard.tsx`, `apps/web/lib/playerProfileRead.ts`. Pruebas: `apps/web/lib/playerProfileRead.test.mjs` y `apps/web/lib/productCompletionPass1Contract.test.ts`. Se actualiza este documento de continuidad; `AGENTS.md` no cambia.
- Pendientes: revisión visual del usuario y prueba real de login → Perfil, especialmente en iPhone/PWA. Commit, push y eventual Preview requieren autorización específica para este paquete de producto; la autorización documental previa no se extiende a estos cambios. No se modificaron Supabase, permisos, datos deportivos/financieros, main, otros checkouts ni stashes.

### Cierre documental previo: 02/11/2026, PC del trabajo

- Checkout canónico: `D:\SELPA\output\selpa-full-integration-20261030`; rama `codex/selpa-full-integration-20261030`; remoto `origin`: `https://github.com/cjescobar37/selpa-app.git`.
- Inicio limpio en `7d5e8d431d8dcb0eaeb05cdfa49c8b20c0ea4b90`. Consulta remota y `git pull --ff-only` autorizado: avance a `aa9cfac315a7ec568853a5dca0d12191ab231322`, sin divergencia ni commit de merge. Esa es la base del cierre documental de esta sesión.
- Se unificó el protocolo mediante un parche puntual, sin reemplazar documentos completos. La documentación canónica es la de esta rama; los documentos locales del checkout histórico `D:\SELPA` permanecen preservados y no deben publicarse como una segunda versión del protocolo.
- Commit/push autorizados exclusivamente para `AGENTS.md` y `docs/SELPA_CONTINUIDAD.md`, con mensaje `docs: finalize SELPA cross-device synchronization protocol`. El hash resultante y la comprobación final de GitHub se entregan en el informe de cierre, sin intentar registrar dentro del commit su propio hash.
- Próximo traspaso: sincronizar la segunda computadora con el commit publicado, después de verificar rama y trabajo pendiente. Su estado local no fue comprobado en esta sesión. No se consultó ni operó Vercel; no inferir un deployment de esta actualización documental.

### Antecedente: sprint Home + Torneos, 01/11/2026 (respaldado el 02/11)

- La continuidad fue publicada en `aa9cfac315a7ec568853a5dca0d12191ab231322` con el mensaje `docs: establish shared SELPA context and Codex continuity`. Push y HEAD remoto comprobados en la sesión anterior.
- Checkout notebook `C:\SELPA`, app `apps/web`, rama `codex/selpa-full-integration-20261030`. Al comenzar el sprint se consultó `origin` y se verificó 0/0 de divergencia; fast-forward sin cambios. No había trabajo local ajeno.
- Implementación del sprint **solo local, sin commit ni push**. Detalle, archivos, evidencias y pendientes en `docs/SELPA_SPRINT_NOCTURNO.md`. Este estado sustituye las notas anteriores que indicaban que faltaba publicar la documentación inicial.
- Home maneja errores parciales y resuelve todos los clubes de sus torneos; público y Explorar PLAYER comparten catálogo y filtros con URL; detalle/inscripción distinguen estados cerrados; Inicio PLAYER prioriza inscripciones reales y la agenda conserva torneos RUNNING sin fecha final. Borradores protegidos por autorización del backend y respuestas personalizadas sin caché compartida.
- QA del sprint: 892/892 tests aislados aprobados, TypeScript sin errores, lint sin errores y 128 advertencias totales; build local optimizado aprobado (166 páginas estáticas). Mediciones responsive y revisión visual en navegador local; no equivalen a Safari/iPhone físico ni a Supabase live. El informe del sprint conserva el resultado HTTP y las limitaciones.
- No se modificaron schema, RLS, migraciones, datos reales, visibilidad de temporadas, reglas deportivas ni integraciones de cobro. Sin deployment a Preview/Production y sin cambios en `main`.
- Próxima acción: revisar los cambios locales y completar QA con cuentas/entorno autorizados e iPhone; luego, únicamente con autorización específica, versionar y sincronizar este sprint. La PC del trabajo todavía no recibió estos cambios locales.

### Corte anterior a publicar la continuidad: 01/11/2026, checkout `C:\SELPA`

- Remoto `origin`: `https://github.com/cjescobar37/selpa-app.git`; rama activa `codex/selpa-full-integration-20261030`.
- HEAD local y remoto consultado con `git ls-remote origin refs/heads/codex/selpa-full-integration-20261030`: `7d5e8d431d8dcb0eaeb05cdfa49c8b20c0ea4b90`. Coincidían al consultar; esto no sincroniza cambios locales sin commit.
- Al iniciar: sin cambios versionados ni stashes; único archivo pendiente no versionado: `docs/SELPA_CONTINUIDAD.md.md`. Se preservó una copia original en el directorio temporal del equipo antes de corregir su nombre a `docs/SELPA_CONTINUIDAD.md`. No se eliminó contenido histórico.
- Cambios de esta tarea: únicamente `AGENTS.md` y este documento, todavía locales, sin commit ni push. El documento de continuidad sigue sin versionar hasta un commit autorizado.
- Node `v26.13.0`, npm `11.20.0`, dependencias locales presentes. App canónica `apps/web`; package declara Next.js `16.1.4`, React `19.2.3`, Tailwind v4. No se modificó código ni configuración.
- Preview y Production: no consultadas ni desplegadas en esta tarea. Estado del otro equipo: no verificado en esta sesión. No inferirlo de la coincidencia de este checkout con GitHub.

### Antecedentes informados al 31/10/2026 (no revalidados aquí)

**Rama canónica de integración conocida:** `codex/selpa-full-integration-20261030`.
**HEAD informado y sincronizado entre equipos:** `7d5e8d4`.
**Notebook:** checkout `C:\SELPA`, app `C:\SELPA\apps\web`; Windows, Git y Node instalados, dependencias con `npm.cmd ci`, TS sin errores, Vercel CLI autenticada/vinculada al proyecto existente `selpa-app`, variables locales configuradas. Next.js `16.1.4` levantó con `npm.cmd run dev`; `/`, manifest, icono e imágenes desde Supabase devolvieron HTTP 200.

**PC trabajo:** integración previamente usada en `D:\SELPA\output\selpa-full-integration-20261030` (verificar al retomar). El checkout histórico `D:\SELPA` registraba muchos cambios locales no relacionados: **no resetear, limpiar ni sobrescribir**. Las ramas históricas PWA/mobile son antecedentes, no usar sus HEAD viejos como estado actual sin inspección Git. El último deploy Vercel observado era una **Preview READY** del commit integrado; **no** interpretar READY como publicación en Production ni como certificación de iPhone físico.

Antes de cualquier tarea: `git status -sb`, `git branch -vv`, `git log -1 --oneline`, comparar con `origin` y comprobar qué archivos están realmente presentes. Nunca efectuar un pull que sobreescriba trabajo local; primero resolver estados divergentes de forma explícita.

## 4. Datos deportivos y auditoría: último control 30/10/2026

Fuentes de la auditoría: `SELPA_QA_Ranking_Carrera_20261030.md` suministrado por el usuario y verificaciones previas; cifras observadas a esa fecha, **no son valores permanentes**.

- Supabase project `nenupmpjrzdxfrnwsmkx`. Tras migración instalada `20261029104356` y reinicio del proyecto, comprobación de 10 vistas y 2 RPC con `service_role`: **12/12 HTTP 200**. Restricción de acceso a vistas/RPC comprobada para `service_role`.
- Conteos observados: 38 jugadores elegibles, 36 filas de ranking individual interno, 17 filas de ranking de parejas interno, 76 resultados de Carrera y 252 partidos de Carrera.
- Integridad básica de puntos/posiciones sin problemas en muestras comprobadas; caso de `read_player_career_summary`: 11 partidos, 10 victorias, 1 derrota, consistente con lectura.
- **Las lecturas públicas vacías son esperables**: única temporada `ACTIVE`, pero `is_public=false`. Divisiones y clubes pueden estar activos sin que esa temporada sea visible. No cambiar `is_public` para hacer aparecer datos, salvo decisión autorizada y revisión de privacidad.
- No confundir filas de ranking interno con rankings visibles para visitantes; tampoco jugadores registrados con jugadores clasificados.
- QA todavía pendiente de certificación end-to-end: ranking público/privado, Carrera en UI autenticada, roles/permisos, navegación iPhone, estadísticas de parejas/empates, finanzas/cobros y promoción de Production.

## 5. Experiencias prioritarias

### Inicio / torneos / clubes
Home con torneos activos y próximos, rankings por club, comunidad, noticias, sponsors y anuncios según diseño vigente. Fichas de torneos compactas pero con flyer. Clubes con identidad visual, rankings de categorías y acceso directo. Mantener continuidad entre público y área autenticada.

### Ranking / Carrera / Perfil
Ranking premium con #1 destacado por categoría, fotografía real, nombre, club, puntos y contexto, sin rellenar datos ausentes. Selector Damas/Caballeros compacto y comprensible, filtros consistentes. Perfil público del jugador como pantalla deportiva/aspiracional y compartible; distinguirlo de Mi cuenta/edición. Historial y evolución solo con datos fiables.

### Club Admin / Finanzas
Flujos completos de inscripciones, competencias, reportes y administración; permisos por club/rol. Finanzas: pagos, parciales, reversos, cancelaciones, conciliación, facturación y errores de lectura; comprobar casos reales antes de certificar. **Mercado Pago** no estaba certificado operativamente en último contexto; no inventar disponibilidad.

### PWA / iPhone
Respetar navbar superior navy opaco, barra inferior con safe area, foco, teclado y menús táctiles. Hubo un destello iOS al abrir la PWA; no afirmar solucionado sin validación física del iPhone. Evitar nuevos ciclos de parches CSS especulativos de splash; seguir cerrando funcionalidad si persiste. Distinguir navegador de escritorio, emulación y prueba en dispositivo instalado.

## 6. Práctica de trabajo con Codex en dos computadoras

El repositorio es la memoria **compartida**; los chats de un equipo no se asumen transferidos a otro. `AGENTS.md` en raíz define reglas; este archivo (`docs/SELPA_CONTINUIDAD.md`) guarda visión, estado y pendientes. **No duplicar ni contradecir instrucciones existentes**: ante contradicción, identificar la decisión más reciente sustentada y proponer corrección explícita.

### Al iniciar una tarea
1. Leer `AGENTS.md`, confirmar repositorio, carpeta y worktree efectivos, rama, HEAD, upstream, `git status`, diferencias versionadas/no versionadas y stashes. Git no detecta buffers sin guardar del editor. No sobrescribirlos ni asumir que están guardados.
2. Leer estado, pendientes y decisiones pertinentes de este documento en cada sesión y al retomar/cambiar de equipo; contrastarlos con los archivos relevantes. No recitar ni releer todo para cambios triviales.
3. Distinguir: implementado/commiteado, observado en QA, desplegado en Preview, publicado en Production, validado físicamente.
4. Proponer cambio mínimo coherente con el recorrido completo, junto con riesgos y plan de QA.

### Al cerrar una tarea (actualización obligatoria cuando hubo cambios materiales)
1. Actualizar en este documento **solo** los apartados de estado y pendientes afectados, con fecha, rama, commit, evidencias y observaciones; conservar decisiones estables salvo autorización del usuario.
2. Documentar qué pruebas se ejecutaron y cuáles quedaron pendientes. No marcar como PASS pruebas heredadas, no ejecutadas, de fixture o físicas sin evidencia.
3. Mostrar archivos modificados y `git diff --check`; no cambiar un archivo ya modificado por otro proceso sin revisión.
4. **No hacer commit, push, merge ni deploy automáticamente**: actuar solo con autorización explícita. Si no existe y corresponde publicar, preparar primero el diff y las validaciones para revisión y solicitar autorización específica para commit/push. Si la tarea prohíbe publicar, no solicitarlo en ese cierre. Informar siempre qué continuidad sigue local y dejar su sincronización pendiente. La sincronización entre equipos ocurre al `push` autorizado y posterior `pull --ff-only` en el otro equipo.
5. No incluir secrets, `.env`, dumps, tokens, logs sensibles ni datos personales de jugadores en documentación o commits.

### Comandos de uso habitual (Windows / PowerShell)

```powershell
# Usar la ruta real del checkout de cada equipo; C:\SELPA es este equipo
cd C:\SELPA
git status -sb
git remote -v
git branch -vv
git log -1 --oneline
git diff --stat
git diff --cached --stat
git stash list
# Solo tras confirmar remoto, rama correcta y trabajo local protegido:
git fetch origin
# Comparar HEAD local, origin y divergencias antes de integrar:
git rev-list --left-right --count HEAD...origin/codex/selpa-full-integration-20261030
# Con árbol limpio y avance compatible, sin divergencia:
git pull --ff-only

# Desarrollo local
cd C:\SELPA\apps\web
npm.cmd run dev

# Fin de tarea: revisar antes de autorizar un commit/push
git status -sb
git diff --check
```

Estos comandos de sincronización son **para la rama activa correcta**, con árbol e índice limpios, upstream confirmado y sin una prohibición vigente de sincronizar. El mismo flujo aplica en la PC del trabajo desde su worktree correcto, nunca desde un checkout ambiguo.

Si hay cambios pendientes, revisar y preservar su contenido antes de sincronizar: no resetear, limpiar, sobrescribir ni alterar stashes. Si hay divergencia, detener la integración y documentarla; no resolverla mediante force push o reset automático. No copiar `.env`, credenciales o `node_modules` entre equipos como mecanismo de continuidad. Un fetch fallido deja referencias locales potencialmente antiguas: registrarlo.

### Plantilla de cierre y traspaso

Actualizar el estado vigente y los pendientes afectados tras cada tarea importante; además agregar una entrada fechada al historial. Incluir:

- Fecha, equipo/checkout, objetivo, alcance y archivos modificados.
- Rama y HEAD base; cambios locales sin commit; commit que contiene el trabajo, si existe; push comprobado y referencia remota. El HEAD base no contiene el trabajo sin commit.
- Preview: URL, commit, estado y fecha si se verificó; Production: los mismos datos por separado. De lo contrario, indicar «no verificado», sin heredar READY.
- QA automatizada: comando, alcance, resultado y límites; distinguir contratos/fixtures de pruebas end-to-end con servicios reales.
- QA visual en navegador/emulación: rutas, roles, viewports y resultado. Validación física: dispositivo, navegador/PWA, fecha y resultado, o pendiente.
- Decisiones nuevas/sustituidas y su evidencia; pendientes, bloqueos y siguiente acción concreta. No reabrir decisiones cerradas por preferencia del agente.
- Datos reales creados/modificados, si los hubo; autorizaciones pendientes. No incorporar secretos ni datos personales.

Después del commit/push autorizado, verificar su hash y presencia remota para el traspaso. No intentar escribir dentro de un commit su propio hash: el documento puede registrar el HEAD base y el informe de traspaso, el hash resultante. En el equipo receptor verificar ese hash y volver a leer estos documentos antes de continuar. GitHub comparte únicamente archivos versionados y enviados; no transfiere chats, buffers, borradores locales ni entornos.

### Informe final para la conversación central de ChatGPT

El informe debe ser breve, autónomo y listo para copiar manualmente; no enviarlo automáticamente a otros servicios. Debe terminar siempre con este bloque, completando los siete puntos y sin texto posterior:

**ESTADO PARA CHATGPT**

- Qué se completó: avances y decisiones de la tarea.
- Qué archivos cambiaron: rutas de los archivos propios; distinguir trabajo preexistente preservado.
- Qué pruebas pasaron o fallaron: resultados, alcance y validaciones no ejecutadas.
- Qué quedó pendiente: limitaciones, autorizaciones y validaciones físicas pendientes.
- Rama y último commit: rama, SHA y distinción entre HEAD y cambios sin commit.
- Estado de sincronización con GitHub: solo local, con commit o publicado; indicar la comprobación del remoto y el deployment por separado, si corresponde.
- Próximo paso recomendado: una acción concreta y la autorización necesaria, cuando corresponda.

## 7. Próximo objetivo: continuar auditoría sin reiniciar el proyecto

1. Verificar contra GitHub el HEAD vigente de la rama integrada y su estado en Vercel Preview. No mezclar ramas anteriores por defecto.
2. Confirmar el inventario funcional actual, especialmente UI de PLAYER, Comunidad SELPA, Carrera/Ranking, roles, enlaces y navegación mobile-first; contrastar implementaciones con requisitos, sin inventar resultados físicos.
3. Resolver pendientes por criticidad: lecturas deportivas reales y privacidad, QA end-to-end, navegación iPhone físico, finanzas/cobros, calidad de UX móvil y seguridad.
4. No realizar cambios en Supabase compartido ni pagos reales sin autorización particular; QA read-only por defecto.

## 8. Origen de este contexto y control de vigencia

Consolidado a partir de los documentos aportados `SELPA_Contexto_Maestro_2026-10-24.md`, `SELPA_Continuidad_Codex_2026-10-26_ACTUALIZADA.md`, `SELPA_Mobile_App_Experience_Especificacion_Vigente.md`, `SELPA_QA_Ranking_Carrera_20261030.md` y del trabajo posterior informado por el usuario hasta el 31/10. Las referencias históricas a ramas antiguas, migraciones todavía pendientes y HEAD viejos **quedaron superadas por controles posteriores**. Si código o Git contradicen esta foto, documentar la discrepancia y actualizar el estado verificado; nunca reescribir historia como si una prueba no ejecutada hubiera ocurrido.

## 9. Historial de decisiones y tareas

### 01/11/2026 — Publicación de continuidad y sprint Home + Torneos

- Continuidad inicial enviada a GitHub en `aa9cfac` tras autorización expresa. Identidad Git configurada solo en este repositorio con el nombre y correo noreply indicados por el usuario. El hash se verificó contra GitHub y el árbol quedó limpio antes del sprint.
- Nuevo encargo autorizado: implementación y QA local de Bloque 2, sin commit/push/deployment ni escrituras en Supabase compartido. Registro en `docs/SELPA_SPRINT_NOCTURNO.md`; los pendientes originales de iPhone y servicios reales permanecen abiertos.
- Se corrigieron regresiones demostradas: CTA abierto en finalizados sin deadline, errores de lectura convertidos en cero/vacíos, identidad de clubes truncada a cuatro destacados, historial desplazando próximos, filtros perdidos al volver, prioridad de Home confundida con descubrimiento, duplicados de inscripción y RUNNING pasado al historial sin fecha final. El detalle de borradores ahora comprueba autorización antes de devolver contenido.
- Se conserva el gutter aprobado de unos 8 px y la navegación inferior por rol. No se reabrió Bloque 1 ni se alteraron puntos, rankings, settlement o pagos.
- La falla de lectura de pagos del detalle/wizard ahora se presenta como «Pago sin verificar», conserva la inscripción y ofrece reintentar la consulta, en vez de inferir «Pago no registrado» y promover un nuevo pago. Se verificaron error de lectura, infraestructura ausente, ausencia real y aprobación sintética; no se ejecutaron cobros ni se cambió el estado financiero.
- Este hito no certifica Bloque 2 completo en servicios reales: faltan recorrido integral de inscripción con cuentas/club autorizado, datos publicados de partidos/resultados, dispositivo físico y auditoría posterior de Club/Platform.

### 01/11/2026 — Continuidad entre equipos (solo documentación)

- Se corrigió el nombre accidental `.md.md`, conservando todo el contexto anterior. Se vinculó este documento desde `AGENTS.md` y se estableció lectura inicial y actualización obligatoria al cierre de tareas importantes.
- Se sustituyó la guía obsoleta de margen exterior de 14–16 px por la decisión aprobada: gutter exterior de unos 8 px, propiedad del shell. Evidencia: instrucción explícita del usuario y tokens `--selpa-mobile-gutter: 8px` / `--app-mobile-gutter` en `apps/web/app/styles/base.css`. Los paddings internos y full bleed aprobados se conservan. No se certificó visualmente toda la app mediante esta lectura.
- Se conservaron las demás reglas y decisiones. Los resultados informados al 31/10 y la auditoría del 30/10 permanecen como antecedentes fechados, separados del estado comprobado hoy.
- QA histórica disponible: `docs/player-close-20261027/evidence/qa-summary.json`, sobre otra rama/base del 27/10; no representa QA actual. Inventario actual: scripts `test`, `lint`, `build`; runner Node en `apps/web/scripts/qa/run-tests.mjs`, con contratos TS/MJS en app/features/lib. Su bootstrap usa credenciales de prueba locales y bloquea fetch externo. Hay scripts de QA con fixtures; no se ejecutaron esos flujos ni seeders.
- QA actual: `npm.cmd test` desde `apps/web`, sobre código base `7d5e8d4`, finalizó con código 0: **874 tests aprobados, 0 fallidos, 0 omitidos** (72,7 s). Suite aislada de contratos/lógica, con PostgreSQL embebido para algunos casos; no certifica Supabase remoto, UI end-to-end, cobros operativos ni dispositivo físico. Node emitió advertencias por el loader experimental.
- QA documental: revisión de rutas locales, conservación del contenido original y `git diff --check` sin errores en cambios versionados. El respaldo temporal se creó antes del renombre, pero no resultó accesible en comandos posteriores del sandbox; no se pudo realizar una comparación automática contra esa copia. El contenido histórico se preservó mediante renombre y ediciones puntuales. Estado final comprobado: `AGENTS.md` modificado y este documento no versionado, sin otros archivos de proyecto modificados.
- TypeScript, ESLint y build: no ejecutados en esta tarea documental. QA UX en navegador y validación física: no realizadas. No se certifica experiencia actual de iPhone ni se crean datos reales.
- Pendientes al cerrar aquella tarea: autorizar commit/push de estos dos documentos y luego sincronizar el checkout correcto de la PC del trabajo. La publicación inicial quedó resuelta posteriormente en `aa9cfac`, como registra el hito superior; la recepción en el otro equipo debe comprobarse allí.
- Pendientes de producto: se mantienen los de las secciones 4, 5 y 7; no se cerraron auditorías funcionales, cobros ni validaciones físicas con esta tarea.

### 02/11/2026 — Unificación final del protocolo entre computadoras

- Se trabajó exclusivamente en el checkout canónico de integración. Se recibió por avance rápido la documentación publicada desde el otro equipo y se aplicó el parche preparado sobre `aa9cfac`, después de comprobar su compatibilidad.
- Cambios propios limitados a `AGENTS.md` y este documento: confirmación de carpeta/worktree/upstream, sincronización con árbol e índice limpios, preparación de diff y validaciones antes de solicitar publicación, y cierre obligatorio con los siete puntos de **ESTADO PARA CHATGPT**.
- Se preservaron las decisiones históricas, la separación entre QA histórica y actual, y el gutter mobile de 8 px. No se copiaron completos los documentos antiguos sobre los vigentes.
- QA documental: compatibilidad del parche, revisión del diff, alcance exclusivo de dos archivos, conservación de decisiones y revisión de información sensible. `git diff --check`: PASS. Sin credenciales nuevas ni datos personales en los cambios. No se ejecutaron tests de aplicación, TypeScript, ESLint, build ni QA UX por tratarse de documentación; no se crearon datos reales.
- El checkout histórico no se modificó. Stash compartido preservado; sin cambios de código, Supabase, `main`, Production ni operaciones de deployment.
- Publicación autorizada solo en esta rama y para estos dos documentos. El siguiente paso entre equipos es verificar el hash publicado y actualizar el checkout receptor de forma segura; los pendientes de producto históricos no se dan por resueltos mediante esta tarea.

### 02/11/2026 — Recuperación segura del sprint de casa (fase 1)

- Checkout `C:\SELPA`; base local `aa9cfac315a7ec568853a5dca0d12191ab231322`. Rama de respaldo `codex/home-block2-recovery-20261102`, creada desde ese HEAD conservando los 30 archivos del sprint (20 modificados y diez nuevos). Inventario contrastado con `SELPA_SPRINT_NOCTURNO.md`; sin archivos ajenos identificados, staging previo ni stashes.
- Consulta actual a GitHub con `git ls-remote`: integración `9c28abcf79869a022b1cb745434246511cfc788e`; banco `e4161b2877f2aad15a277ce3f907590a5615398f`. Primer intento bloqueado por DNS del sandbox; consulta fuera del sandbox aprobada y exitosa.
- Revisión de diferencias y archivos nuevos: solo app canónica y documentación del sprint. Sin archivos `.env`; búsqueda de patrones de claves privadas, GitHub, AWS, Supabase secret y JWT sin coincidencias. Credenciales del fixture son sintéticas, loopback y no se incluyen entornos reales. `git diff --check` aprobado; QA anterior permanece histórica, no repetida todavía en esta sesión.
- Usuario autorizó exclusivamente commit/push del sprint a esta rama de recuperación. La confirmación remota del commit es requisito antes de crear la consolidada sobre PLAYER. Integración/main/Production y stashes no se modifican. No se crearon datos reales. Próximo paso: verificar respaldo remoto y consolidar localmente, preservando card canónica, buscador compacto, filtros de pagos y corrección de Perfil del banco.


### 02/11/2026 — Resolución funcional de la consolidación (fase 2)

- Base `e4161b2`, respaldo `a1eda93`. Cinco archivos tuvieron conflicto: `apps/web/app/(app)/player/torneos/TournamentsPlayerView.tsx`, `apps/web/app/styles/public.css`, `apps/web/components/player/PlayerAgenda.module.css`, `apps/web/components/public/TournamentPublicCard.tsx`, `docs/SELPA_CONTINUIDAD.md`.
- Torneos PLAYER: se preservó `PlayerAgendaCard` como adaptador canónico, sin recuperar la composición legacy. Se incorporó catálogo público común, búsqueda normalizada, filtros URL, sheet compartido compacto con Aplicar/Cancelar y navegación Agenda/Explorar/Calendario. `registeredPairs` se transporta por el adaptador sin inventar conteos.
- CSS público: se conservaron los dos bloques de container queries del banco; se descartaron las variantes históricas por pantalla y alturas fijas del sprint. El archivo final coincide con banco. Agenda CSS: se conservó grid del banco, agregando solo navegación de casa; no se recuperaron estilos de card eliminados.
- Card: conserva wrapper, estado de inscripción y prioridad de flyer explícito/manual del banco; agrega lazy loading y categoría/rama/conteo del sprint en CSS Module limitado a esos datos, sin cambiar composición canónica.
- Continuidad: se conservaron las dos historias y el protocolo nuevo del banco, anteponiendo el estado vigente. `SELPA_SPRINT_NOCTURNO.md` permanece como informe histórico íntegro del sprint previo, cuyas frases sin commit/push ya fueron superadas por el respaldo.
- Perfil, lector de Perfil, tests de retry, filtros de pagos y navbar idénticos a `e4161b2`. Ajuste del script HTTP recuperado al puerto 3000 establecido por el protocolo del banco; fixture permanece en 45433 loopback. No se tocaron variables privadas.

### 02/11/2026 — Cierre de QA de consolidación, solo local

- `npm.cmd test`: código 0, 898 aprobados, 0 fallidos/omitidos (94,7 s). `npm.cmd exec tsc -- --noEmit --incremental false`: código 0. `npm.cmd run lint`: código 0, 0 errores y 128 advertencias. `npm.cmd run build`: PASS fuera del sandbox; compiló en 14,9 s y generó 166/166 páginas. Primer build detenido sin progreso en sandbox e interrumpido; no se presenta como PASS. Advertencias de module.register y Browserslist antiguo.
- `node scripts/qa/block2-http.mjs`: 11/11 PASS contra Next optimizado en 3000 y fixture en 45433. Home y club fuera de destacados, catálogo, estados finalizado/pausado/cierre/cupo, borrador anónimo 404, errores parciales y pagos sin verificar recuperables, vacío real. Primer intento HTTP bloqueado EACCES por aislamiento; servidores/checks reiniciados fuera del sandbox. Solo variables de proceso sintéticas; `.env.local` no modificado.
- Navegador real IAB, sesión ficticia: catálogo público, Aplicar categoría 5, Cancelar categoría 6 sin aplicar, detalle; login → Inicio PLAYER con prioridad confirmada → Agenda/Historial → Explorar compartido → búsqueda → detalle → Back conserva URL/búsqueda; Perfil redirige a carrera del jugador sintético. No se hizo submit de inscripción, pago ni edición de perfil.
- Responsive: catálogo público y Explorar PLAYER medidos en 320/375/390/430/768/1280; sin overflow horizontal. En catálogo se repitió 320 tras completar carga (ocho cards); no se contó el loader como revisión. Capturas revisadas de catálogo mobile/desktop, agenda y Explorar en 390. Las cards mantienen diseño canónico y conteos visibles; nombres extremos se truncan según diseño del banco. No equivale a QA visual exhaustiva de todas las rutas/viewports ni a Safari/iPhone físico.
- Limitación reproducida: el botón explícito «← Volver» del detalle usa `/torneos` y descarta filtros/origen; Back del navegador sí conserva búsqueda. Es código ya presente en sprint/base, no un conflicto no resuelto. Se documenta para revisión antes de certificar Bloque 2 completo; no se amplió la integración a un rediseño de navegación.
- El fixture no implementa el ledger completo: Mis pagos muestra error recuperable y no permite certificar visualmente la fila de filtros con datos. CSS financiero, Perfil y lector con retry se preservaron byte a byte respecto a `e4161b2`; tests de retry incluidos en los 898. Perfil/carrera sintética no certifica datos deportivos reales ni recuperación del incidente con una sesión real.
- Evidencia local ignorada: `output/consolidation-20261102/{tests,typescript,lint,build,build-unrestricted,http,http-unrestricted}.log`; reporte HTTP en `output/block2-qa/http-report.json` actualizado por la ejecución. No se incluyen logs en el respaldo. Cero datos reales creados/modificados; sin Supabase, pagos, Preview o Production.
- Conflictos resueltos, `git diff HEAD --check` PASS y stashes vacíos/preservados. Consolidación sin commit/push, en índice/árbol local sobre `e4161b2`; único commit/push propio de esta sesión es respaldo `a1eda93`, confirmado con ls-remote. Informe de traspaso: `docs/SELPA_ESTADO_CONSOLIDACION_20261102.md`.


### 02/11/2026 — Revisión final PLAYER + Home + Torneos, sin publicación

- Checkout y rama verificados: `C:\SELPA`, `codex/player-block2-consolidated-20261102`, HEAD `e4161b2877f2aad15a277ce3f907590a5615398f`; inicialmente 31 archivos staged, sin cambios unstaged/ajenos ni stashes. Se revisó el diff staged, archivos nuevos e informe completo; cinco conflictos siguen resueltos, sin unmerged ni marcadores. CSS público/agenda mantiene container queries y adaptador canónico del banco.
- Corrección solicitada: card común recibe `returnTo` desde catálogo público y Explorar PLAYER/calendario. El detalle, también en error de carga, usa ese destino validado. `tournamentNavigation.ts` permite solo rutas conocidas de torneos y filtros q/categoria/rama/club; rechaza destinos externos, backslashes/controles y descarta parámetros ajenos. Sin contexto se vuelve a `/torneos`. No usa almacenamiento global ni historial como única fuente.
- Evidencia nueva sustituye la limitación de Volver del cierre anterior: catálogo con cuatro filtros → detalle → refresh → enlace Volver conserva URL/filtros; Explorar PLAYER con cuatro filtros → detalle abierto en pestaña nueva → Volver regresa a Explorar y conserva valores. Nuevos tests verifican roundtrip Unicode/ampersand y rechazo de retornos maliciosos. Mes/día del calendario y paginación incremental no se convierten en estado URL en esta tarea.
- Revisión halló y corrigió dos detalles: combinación de datos públicos borraba city del club usada para prioridad local (ahora merge por propiedades); metadata de categoría/rama podía duplicarse en card compacta sin flyer (ahora una sola representación). No se cambió la composición visual canónica.
- Fixture local amplía exclusivamente tres RPC de lectura financiera con cargos falsos PENDING/PARTIAL/PAID/CANCELLED; exige JWT sintético y rechaza otras mutaciones. No contiene conexión o forward a Supabase. Permitió revisar la fila financiera sin tocar API/CSS financiero de producto o ledger real.
- Perfil, su lector/tests, estilos financieros, navbar y CSS público permanecen idénticos a `e4161b2`. `readPlayerProfile` tiene dos backoffs 300/900 ms y un refresh 401 como máximo; 403/contrato inválido fallan, 5xx persistente falla tras tres solicitudes, cancelación interrumpe espera; no hay reintentos automáticos infinitos desde la pantalla. Tests existentes incluidos y aprobados en la suite final. Navegador confirmó Perfil → Carrera sintética; no certifica el incidente con sesión real.
- QA ejecutada ahora desde `apps/web`: `npm.cmd test` 900/900 PASS (106,2 s), TypeScript `npm.cmd exec tsc -- --noEmit --incremental false` código 0, `npm.cmd run lint` 0 errores/128 advertencias; `npm.cmd run build` código 0, compilación 20,9 s y 166/166 páginas. Build/servidores/check HTTP fuera de sandbox por la restricción loopback conocida, con variables de proceso falsas; `.env.local` intacto. Un comando inicial npm test en raíz no encontró script y no ejecutó tests; se corrigió cwd y se ejecutó la suite indicada completa.
- `node scripts/qa/block2-http.mjs`: 11/11 PASS (datos y errores sintéticos). Evidencias actuales ignoradas en `output/consolidation-final-20261102/` (tests/typescript/lint/build/http); el script actualiza reporte sintético en `output/block2-qa/http-report.json`. No se incluyen logs/capturas/temporales en Git.
- QA navegador IAB: catálogo y Explorar con filtros, Apply, retorno explícito y refresh/nueva pestaña; Agenda/Historial, calendario y cards de Inicio PLAYER, Perfil → Carrera. Pagos: cinco estados seleccionados individualmente en 320 px, cargos correspondientes y online deshabilitado. Medidas de pagos/Agenda/Explorar en 320/375/390/430/768/1280 sin overflow horizontal ni interno de las cards; fila financiera misma coordenada Y, sin scroll y mínimos táctiles 44x44. Capturas revisadas de pagos 320, Explorar 390 e Inicio 390; no hay certificación visual exhaustiva de todas las combinaciones ni prueba física. Consola de la pestaña de QA: sin errores capturados.
- Lectura actual final de GitHub: respaldo casa `a1eda932444077399a06ad7e971a0ed02e7e672b`, banco `e4161b2877f2aad15a277ce3f907590a5615398f`, integración remota `9c28abcf79869a022b1cb745434246511cfc788e`; consolidada ausente del remoto. Integración local sigue aa9cfac; no se adelantó automáticamente. Se conserva el respaldo de ambos trabajos.
- Archivos de esta revisión: vista PLAYER Torneos, detalle, PlayerAgendaCard, CommunityTournamentCalendar, PublicTournamentsExperience, TournamentPublicCard, useTournamentDiscoveryFilters, fixture block2-server, nuevos tournamentNavigation.ts y su test; continuidad e informe actualizados. Solo `apps/web` y documentación pertinente.
- Sin bloqueos locales para publicar únicamente la rama consolidada tras autorización explícita. Persisten pendientes de sesión/datos reales, inscripción completa, finanzas operativas y Safari/iPhone/PWA físico; no bloquean el respaldo/sincronización de esta rama ni se dan por certificados. Cero datos reales creados/modificados, sin cambios Supabase, main, stashes, commits, pushes o deployment en esta revisión. Servidores de QA cerrados al finalizar.

- Revisión final del índice: 34 archivos staged (13 nuevos), cero cambios unstaged/ajenos; sin credenciales detectadas por revisión y patrones de claves privadas/GitHub/AWS/Supabase/JWT, ni .env, logs, capturas, temporales o directorios output/node_modules. `git diff --cached --check`, `git diff --check` y `git diff HEAD --check`: PASS. Búsqueda de marcadores/unmerged vacía. No se creó ningún commit en la revisión.

### 02/11/2026 — Publicación autorizada de la consolidada

- El pedido adjunto del sprint nocturno autoriza commit/push de los 34 archivos revisados exclusivamente a codex/player-block2-consolidated-20261102. Se reconfirmaron índice sin diferencias nuevas, diff check aprobado, ausencia de stashes y remoto sin esta rama; QA de la revisión inmediata anterior 900/900, TS/lint/build/HTTP/visual preservada sin cambios de código posteriores. El SHA y la verificación remota se registrarán en el primer checkpoint nocturno. No se autoriza merge ni deployment.

