# SELPA · entorno local y cierre de detalles móviles · 26/10/2026

Base: `ac28e13623cbee49319c8d0601f0ad9fc7e0207a`. Trabajo en
`D:/SELPA/output/pwa-universal-preview-20261015`, rama
`codex/selpa-mobile-experience-20261025`, exclusivamente en `apps/web`.

## URL local canónica

`http://10.4.21.30:3000/` y `http://localhost:3000/` sirven el desarrollo vigente.
La IP se confirmó con ipconfig. El puerto 3000 estaba ocupado por PID 14976,
Next iniciado desde `D:/SELPA/apps/web`, mediante la cadena
6224 → 18032 → 28588 → 14976. Ese checkout está en `2fb0628`; el worktree de
desarrollo estaba en `ac28e13`. Por eso se veía código anterior.

Se detuvo exclusivamente esa cadena comprobada y se inició Next con el directorio
del worktree explícito, Webpack, hostname `0.0.0.0` y puerto `3000` explícito.
Se cerraron también cinco procesos antiguos de QA de SELPA, identificados por
sus rutas exactas. Quedó un solo listener de SELPA en el rango 3000–3150:
`0.0.0.0:3000`, PID 11216 al verificar.

Desde PowerShell, para volver a iniciarlo:

```powershell
& 'D:\SELPA\output\pwa-universal-preview-20261015\Start-SELPA.ps1'
```

El script resuelve el directorio desde su propia ubicación. No depende del cwd
del terminal, no cae a otro puerto y no termina procesos automáticamente.
Si 3000 está ocupado, informa el conflicto y sale. Reutiliza las credenciales
locales sin copiar ni mostrar su contenido; un `.env.local` propio del worktree
tiene prioridad. No se copió código al checkout principal.

`/api/dev/local-runtime` informa cwd, rama y HEAD sólo en desarrollo; en producción
responde 404. Ambas direcciones devolvieron el worktree y SHA esperados.
La prueba HMR abrió una pestaña en la URL LAN, agregó temporalmente un atributo
al componente de login y comprobó su aparición y reversión sin recarga manual.
El cambio temporal quedó revertido.

## Perfil y sincronización

La entrada `/perfil` dependía del objeto completo de usuario. La autorización
rápida y la hidratación final del mismo usuario podían disparar dos lecturas de
membresías. Ahora depende de su ID y estado de sesión, cancela peticiones obsoletas
y conserva los errores persistentes con Reintentar.

Las lecturas privadas del perfil y sus secciones usan `getCurrentSession` y
comprueban que la sesión pertenezca al usuario esperado. Recuperan una renovación
de JWT ante 401, o un único fallo transitorio de red/502/503/504. No reintentan
403 ni errores 500 y nunca convierten fallos persistentes en datos vacíos.
No se incorporaron logs con tokens, cookies o datos personales.

La prueba de primera navegación desde la barra inferior inyectó un 503 inicial:
se efectuaron dos solicitudes, se abrió la carrera y la hidratación final no
produjo una tercera lectura. Otro caso mantuvo 503, mostró el error y recuperó
con Reintentar. Los contratos cubren además 401 persistente, 403, 500, red,
cambio de cuenta y navegación abortada.

Esto verifica las condiciones corregidas; no demuestra que el fallo físico
original de iPhone tuviera exclusivamente esa causa. Su confirmación con sesión
real en Safari, navegador de WhatsApp y PWA instalada continúa pendiente.

## Cambios de experiencia

- Inicio público: carga en el mismo frame horizontal, con 18 px de separación
  superior. Loading de Torneos y Ranking reutiliza el mismo componente.
- Torneos: búsqueda principal «Buscá un torneo o club», botón Filtros, panel
  progresivo con categoría/rama/club, chips removibles y limpieza de filtros.
  Se conservó la lógica de combinación, orden y estados En juego/Próximos.
- Ranking público: usa PageHeader canónico, con kicker y «Ranking SELPA».
  Se retiró del encabezado la copa decorativa y el texto adicional.
  No se alteraron puntos, posiciones, filtros ni reglas deportivas.
- Perfil: se conservaron medidas y composición principal de portada/avatar.
  Cámara de portada de 44×44, sólo icono y nombre accesible.
- Fotos: toque en la imagen abre un diálogo oscuro con imagen completa, cerrar,
  Escape, Atrás, restauración de foco y scroll, ampliación 2× y desplazamiento.
  La cámara y el visor tienen controles separados. El perfil público amplía
  fotos sin mostrar edición.
- Se corrigieron enlaces que agregaban un segundo `?` después de `own=1`.
  Se preserva también el `next` anidado de selección de club. El editor existente
  enfoca el control de la foto elegida y mantiene su carga real de archivo.
- Club deportivo: logo, color institucional discreto, categoría/rama, indicador
  de club activo, acceso para visitarlo y selector sólo si existen varios
  contextos válidos. No se agregó una nueva lógica de membresías ni de activación.
- Bloques inferiores: paneles compactos, tabs coherentes y acciones privadas
  agrupadas al final. Los números continúan sujetos a datos oficiales.
- PLAYER mantiene Inicio / Torneos / Mi ranking / Perfil con avatar. Mensajes
  permanece accesible desde el header. No se alteró el controlador de iOS.

## Archivos principales

Entorno: `Start-SELPA.ps1`, `apps/web/scripts/dev-local.mjs`,
`app/api/dev/local-runtime/route.ts`.

Sesión y perfil: `app/(app)/perfil/page.tsx`,
`app/(app)/player/carrera/[id]/page.tsx`, `lib/playerProfileRead.ts`,
`lib/profileEditorHref.ts`, `app/(app)/club/jugadores/[id]/page.tsx`.

Composición: `CareerIdentityHero`, `CareerExperience`, `CareerClubCard`,
`ProfilePhotoViewer` y sus estilos. `player-career.repository/types` agregan al
DTO únicamente logo y tema públicos ya existentes del club.

Públicas: `PublicTournamentsExperience`, `TournamentSearch`,
`PublicRankingExperience`, `PublicPageLoading`, `app/page.tsx` y loading de
Torneos/Ranking. `ModalDialog` comparte foco, Escape y Atrás de filtros y visor.

Pruebas: `playerProfileRead.test.mjs` y actualización del contrato de enlaces
en `mobilePolishContract.test.ts`.

## QA y límites

Artefactos completos: `D:/SELPA/output/local-ui-20261026/`.

- TypeScript: PASS.
- Build webpack: PASS, 166 páginas estáticas; se repite al cerrar los últimos cambios.
- Contratos relevantes: 113/113 PASS, incluyendo deportes, privacidad, PWA,
  navegación, autorización y recuperación del perfil. SQL de prueba sólo en
  PostgreSQL embebido en memoria, sin conexión al Supabase compartido.
- Lint global: 174 errores y 132 warnings previos. Comparación por archivo
  contra HEAD: ningún incremento. `app/page.tsx` conserva sus seis `any` previos;
  componentes nuevos y flujos de perfil modificados no tienen hallazgos.
- Git diff --check: PASS al verificar.
- Navegador: 320/375/390/430 y desktop 1280; búsqueda combinada, filtros,
  Escape/Atrás/foco, fotos, cámara y primer ingreso al perfil comprobados.
- Header de Ranking y Torneos: misma altura medida en cada ancho probado.
- Sin overflow horizontal ni excepciones JS en los recorridos controlados.
- Insets 59/34 y `navigator.standalone` simulados, con paletas cyan/magenta.
- Portada/avatar, filtros, loader y desktop revisados visualmente. Las capturas
  son del código real con fixtures claramente identificadas, no de un iPhone.
- Los snapshots antiguos de servidores QA devolvían CSS obsoleto: se descartó
  esa comparación automática y se apagaron esas instancias. No se afirma
  identidad píxel a píxel con un screenshot anterior de contenido distinto.
- La ruta temporal `local-qa-review` se retiró antes del commit. Capturas,
  transporte sintético y scripts descartables están fuera del commit.
- No se eligió ni subió un archivo a Supabase durante QA. Se comprobó que la
  cámara alcanza el input real de archivos. Guardado remoto de fotos/datos,
  teclado del OS, pinch nativo y Safari/PWA físicos siguen pendientes.

Se aplicó la revisión React a dependencias primitivas, cancelación de efectos,
semántica de diálogo, foco y replay de Strict Mode. No se añadieron dependencias.
Referencias: [Supabase Auth](https://supabase.com/docs/reference/javascript/auth-onauthstatechange),
[Next CLI](https://nextjs.org/docs/app/api-reference/cli/next).

## Seguridad y entrega

No se modificaron main, Production, dominios, schema, RLS, migraciones ni datos
compartidos. No se crearon datos reales ni se habilitaron servicios con costo.
El checkout principal y sus cambios previos permanecen fuera de este commit.
Los tres documentos previamente no versionados del worktree tampoco se incluyen.

Entrega: commit local solicitado; sin push ni deployment. Nueva Preview y
validación física de iPhone requieren la siguiente autorización/prueba del usuario.
