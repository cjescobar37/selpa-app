# SELPA — Contexto compartido y continuidad operativa

**Última revisión documental:** 01/11/2026 (Argentina). Los apartados históricos conservan sus fechas originales.
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

### Verificación actual: 01/11/2026, checkout `C:\SELPA`

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
1. Leer `AGENTS.md`, confirmar repositorio, rama, HEAD, `git status`, diferencias versionadas/no versionadas y stashes. Git no detecta buffers sin guardar del editor. No sobrescribirlos ni asumir que están guardados.
2. Leer estado, pendientes y decisiones pertinentes de este documento en cada sesión y al retomar/cambiar de equipo; contrastarlos con los archivos relevantes. No recitar ni releer todo para cambios triviales.
3. Distinguir: implementado/commiteado, observado en QA, desplegado en Preview, publicado en Production, validado físicamente.
4. Proponer cambio mínimo coherente con el recorrido completo, junto con riesgos y plan de QA.

### Al cerrar una tarea (actualización obligatoria cuando hubo cambios materiales)
1. Actualizar en este documento **solo** los apartados de estado y pendientes afectados, con fecha, rama, commit, evidencias y observaciones; conservar decisiones estables salvo autorización del usuario.
2. Documentar qué pruebas se ejecutaron y cuáles quedaron pendientes. No marcar como PASS pruebas heredadas, no ejecutadas, de fixture o físicas sin evidencia.
3. Mostrar archivos modificados y `git diff --check`; no cambiar un archivo ya modificado por otro proceso sin revisión.
4. **No hacer commit, push, merge ni deploy automáticamente**: actuar solo con autorización explícita. Si no existe, informar que la continuidad todavía es local y dejar la sincronización pendiente. La sincronización entre equipos ocurre al `push` autorizado y posterior `pull --ff-only` en el otro equipo.
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

Estos comandos de sincronización son **para la rama activa correcta** y solamente si no hay cambios locales incompatibles. El mismo flujo aplica en la PC del trabajo desde su worktree correcto, nunca desde un checkout ambiguo.

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

## 7. Próximo objetivo: continuar auditoría sin reiniciar el proyecto

1. Verificar contra GitHub el HEAD vigente de la rama integrada y su estado en Vercel Preview. No mezclar ramas anteriores por defecto.
2. Confirmar el inventario funcional actual, especialmente UI de PLAYER, Comunidad SELPA, Carrera/Ranking, roles, enlaces y navegación mobile-first; contrastar implementaciones con requisitos, sin inventar resultados físicos.
3. Resolver pendientes por criticidad: lecturas deportivas reales y privacidad, QA end-to-end, navegación iPhone físico, finanzas/cobros, calidad de UX móvil y seguridad.
4. No realizar cambios en Supabase compartido ni pagos reales sin autorización particular; QA read-only por defecto.

## 8. Origen de este contexto y control de vigencia

Consolidado a partir de los documentos aportados `SELPA_Contexto_Maestro_2026-10-24.md`, `SELPA_Continuidad_Codex_2026-10-26_ACTUALIZADA.md`, `SELPA_Mobile_App_Experience_Especificacion_Vigente.md`, `SELPA_QA_Ranking_Carrera_20261030.md` y del trabajo posterior informado por el usuario hasta el 31/10. Las referencias históricas a ramas antiguas, migraciones todavía pendientes y HEAD viejos **quedaron superadas por controles posteriores**. Si código o Git contradicen esta foto, documentar la discrepancia y actualizar el estado verificado; nunca reescribir historia como si una prueba no ejecutada hubiera ocurrido.

## 9. Historial de decisiones y tareas

### 01/11/2026 — Continuidad entre equipos (solo documentación)

- Se corrigió el nombre accidental `.md.md`, conservando todo el contexto anterior. Se vinculó este documento desde `AGENTS.md` y se estableció lectura inicial y actualización obligatoria al cierre de tareas importantes.
- Se sustituyó la guía obsoleta de margen exterior de 14–16 px por la decisión aprobada: gutter exterior de unos 8 px, propiedad del shell. Evidencia: instrucción explícita del usuario y tokens `--selpa-mobile-gutter: 8px` / `--app-mobile-gutter` en `apps/web/app/styles/base.css`. Los paddings internos y full bleed aprobados se conservan. No se certificó visualmente toda la app mediante esta lectura.
- Se conservaron las demás reglas y decisiones. Los resultados informados al 31/10 y la auditoría del 30/10 permanecen como antecedentes fechados, separados del estado comprobado hoy.
- QA histórica disponible: `docs/player-close-20261027/evidence/qa-summary.json`, sobre otra rama/base del 27/10; no representa QA actual. Inventario actual: scripts `test`, `lint`, `build`; runner Node en `apps/web/scripts/qa/run-tests.mjs`, con contratos TS/MJS en app/features/lib. Su bootstrap usa credenciales de prueba locales y bloquea fetch externo. Hay scripts de QA con fixtures; no se ejecutaron esos flujos ni seeders.
- QA actual: `npm.cmd test` desde `apps/web`, sobre código base `7d5e8d4`, finalizó con código 0: **874 tests aprobados, 0 fallidos, 0 omitidos** (72,7 s). Suite aislada de contratos/lógica, con PostgreSQL embebido para algunos casos; no certifica Supabase remoto, UI end-to-end, cobros operativos ni dispositivo físico. Node emitió advertencias por el loader experimental.
- QA documental: revisión de rutas locales, conservación del contenido original y `git diff --check` sin errores en cambios versionados. El respaldo temporal se creó antes del renombre, pero no resultó accesible en comandos posteriores del sandbox; no se pudo realizar una comparación automática contra esa copia. El contenido histórico se preservó mediante renombre y ediciones puntuales. Estado final comprobado: `AGENTS.md` modificado y este documento no versionado, sin otros archivos de proyecto modificados.
- TypeScript, ESLint y build: no ejecutados en esta tarea documental. QA UX en navegador y validación física: no realizadas. No se certifica experiencia actual de iPhone ni se crean datos reales.
- Pendientes de continuidad: autorizar commit/push de estos dos documentos; luego sincronizar el checkout correcto de la PC del trabajo y comprobar el hash recibido. Hasta entonces este cambio solo está disponible en este equipo.
- Pendientes de producto: se mantienen los de las secciones 4, 5 y 7; no se cerraron auditorías funcionales, cobros ni validaciones físicas con esta tarea.
