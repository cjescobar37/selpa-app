# SELPA · Fase 1 PWA · 2026-10-14

Control obligatorio posterior: [respaldo, comparación visual y reversibilidad](./selpa-pwa-visual-control.md).
Fase 1 detenida para revisión; no se autoriza rediseño ni Fase 2.

Implementada localmente en `apps/web`, rama `codex/club-admin-iphone-preview`.
Lista para revisión técnica; **sin commit, push o deploy**. Sin nuevas dependencias,
servicios, infraestructura paga, cambios en Supabase, migraciones o pagos.

## Alcance

- Manifest nativo Next.js 16, identidad estable `/`, start_url `/`, scope `/`,
  display standalone. Sigue funcionando como web normal donde no se instala.
- Ícono SELPA original 512 × 512 reutilizado sin modificar, también maskable;
  derivado 192 × 192 renderizado con `next/og` ya disponible. Apple Touch Icon
  original conservado. No se redibujó el logo ni se cambiaron colores o fuentes.
- Theme-color `#313b4c`: RGB del header actual; fondo de apertura `#f4f7fb`:
  token de fondo actual. Meta moderna mobile-web-app-capable y spelling Apple
  para compatibilidad; Apple status bar black-translucent sobre el header.
- Viewport-fit cover y safe areas en shell, header y footer. Eliminada únicamente
  la suma antigua del inset superior dentro de la barra autenticada, para aplicarlo
  una sola vez en el header. Menús móviles respetan alto disponible y laterales
  de landscape. No se rediseñó la navegación ni las pantallas.
- 22 imágenes de apertura nativas (11 perfiles de pantalla, portrait/landscape)
  pre-renderizadas, con dimensiones PNG exactas y selección por media query Apple.
  Android puede generar su apertura desde manifest/ícono. Modelos no cubiertos
  conservan fallback del sistema. No hay overlay JS, timer ni espera artificial.

La startup image pertenece al sistema operativo y no reemplaza el contenido de
la app. Su uso efectivo, status bar y Dynamic Island requieren prueba física.

## Sesión, navegación y privacidad

No se modificaron `supabaseClient`, SessionProvider, roles, cookies, callbacks,
login/logout ni permisos. Se conserva persistSession/autoRefreshToken del SDK;
club activo y rol se rehidratan desde settings/memberships autorizados existentes,
no desde un rol nuevo guardado por la PWA. La persistencia usa el almacenamiento
existente del SDK en ese origen; no se migró a HttpOnly ni se hizo una auditoría XSS.

No se duplican tokens ni se transportan por manifest, URL de inicio o assets.
Inicio desde el ícono: `/`; no se guarda automáticamente la última URL ni se
inventa un redirect por rol. Deep links conservan su URL y el login existente
continúa usando `next`. No se intercepta Atrás ni se cambia el historial.

**Sin service worker, Workbox, precache, background sync, push ni modo offline.**
La instalación no necesita incorporar caché offline en esta fase. No se cachea
HTML/API/RSC privado con una estrategia de PWA; los únicos recursos de instalación
son públicos y estáticos. Lecturas privadas verificadas conservan private/no-store.
Sin red no se promete funcionalidad ni se muestran saldos/estados viejos como actuales.

Safari y la app instalada pueden tener almacenamiento/sesión independientes según
versión y origen. Si se solicita login dentro de la app, hacerlo allí; no copiar
tokens entre Safari/PWA. Preview, producción y localhost siguen siendo orígenes
distintos aunque compartan DB. OAuth/email links que salten al navegador externo
requieren prueba física de retorno; no se modificó la configuración del proveedor.

La PWA no instala los read models deportivos pendientes ni certifica ranking live.

## Archivos intervenidos

Existentes, sólo estos dos por esta fase:

- `app/layout.tsx`: metadata, viewport, startup links e import de CSS de instalación.
- `app/styles/navbar.css`: dos declaraciones para quitar doble inset superior.

Nuevos:

- `app/manifest.ts`.
- `app/pwa.css`.
- `app/pwa/icon-192/route.tsx`.
- `app/pwa/startup/[screen]/route.tsx`.
- `lib/pwa.ts` (colores existentes y perfiles de apertura).
- `lib/pwaContract.test.ts`.
- `scripts/qa/pwa-{web,build,browser,installability}.mjs`.
- Este informe.

Íconos PNG, package.json/lockfile, ranking, perfil, cards, inscripción, auth,
migraciones, finanzas y next.config permanecieron sin nuevas modificaciones.
Los cambios locales anteriores siguen pendientes e intactos. Los cambios generados
de tsconfig/next-env por QA se restituyeron a su estado previo, incluida la variante
dev preexistente de next-env. No se alteraron stashes ni el servidor del usuario.

## QA ejecutada

| Verificación | Resultado y alcance |
| --- | --- |
| Build producción webpack | PASS, 168 páginas/artefactos estáticos; salida aislada `.next/pwa-phase1-build`, Supabase sintético loopback, pagos OFF. No deploy. |
| TypeScript | PASS, `--noEmit --incremental false`. |
| ESLint focal | PASS: layout, rutas nuevas, config PWA, contratos y scripts. |
| Lint global contra HEAD | 624 archivos versionados comparados: HEAD 178 errores/132 warnings, local 178/131. Sin infracciones nuevas; deuda global heredada NO está aprobada. |
| Contratos PWA | 5/5 PASS. |
| Sesión/roles existentes | 6/6 PASS; loader tsx existente. |
| Editor heredado | 5/5 PASS; sin cambios en esta fase. |
| Manifest real en Chrome | JSON válido, MIME correcto, metadata y URLs resueltas sin errores. |
| Instalabilidad Chrome no incógnito | PASS: Page.getAppManifest sin errores y Page.getInstallabilityErrors vacío. Perfil local temporal eliminado; NO instaló app del SO. |
| Imágenes | 26 referencias verificadas: 3 manifest, Apple Touch Icon y 22 startup PNG; dimensiones/MIME y 404 para tamaño no permitido. |
| Layout | Login y ranking a 320/375/390/430/768/1280, sin overflow; notch portrait/landscape y sesión autenticada con insets simulados por CDP. 15 mediciones. No es iOS. |
| Sesión en Chrome | Login password sintético conserva deep URL; recarga, Atrás, cierre/reapertura de perfil y restauración PLAYER/club; OWNER reabre STAFF, no PLAYER. Logout elimina sesión; tanto Atrás posterior como deep link privado vuelven a login. |
| Cachés y privacidad | Cache Storage vacío y cero service workers antes/después de sesión/logout. My ranking, player finance y club billing: 200 con private/no-store, con actores sintéticos. |
| Runtime | Cero pageerrors; sin conexión a Supabase real ni escrituras de negocio. El ícono externo preexistente de Google/SVGRepo se bloqueó durante QA, sin rediseñar login. |
| Diff-check | PASS. |

Recorrido repetido tanto en dev aislado como contra la salida compilada. El primer
servidor de QA heredado sufrió una caché Turbopack corrupta; se sustituyó por webpack
con output propio, sin borrar caches del usuario. Primer intento del contrato de
sesión con Node strip-types falló por imports sin extensión; pasó con loader tsx.
No se cambió código para esos problemas de ejecución.

Capturas revisadas visualmente: `output/pwa-phase1-qa/login-notch-390.png` y
`player-restored-390.png` (esta última con menú y notch autenticado).
Auth/DB son fixtures locales, NO JWTs reales ni certificación de producción.
Chrome en contexto incógnito reporta in-incognito por diseño; por eso se comprobó
también un perfil temporal no incógnito y éste no reportó bloqueos de instalación.

**No probados:** instalación real iPhone/Android, Safari/iOS nativo, teclado virtual,
retorno OAuth desde app instalada, expiración/revocación real, WebKit/Firefox
(sin ejecutables locales), Preview/producción. No se afirman PASS para ellos.

## Reproducción local, sin tocar datos reales

Herramientas ya presentes; scripts usan Playwright del runtime existente. Opciones
de ruta: SELPA_PLAYWRIGHT_PACKAGE y SELPA_QA_BROWSER. No instalan paquetes.

1. Terminal A: `SELPA_QA_RANKING=true` y `node scripts/qa/block1-server.mjs` (45432).
2. `node scripts/qa/pwa-build.mjs` (env sintético forzado; no usa DB productiva).
3. Terminal B: `node scripts/qa/pwa-web.mjs --production` (loopback 3012).
4. `SELPA_PWA_QA_BASE=http://127.0.0.1:3012` y `node scripts/qa/pwa-browser.mjs`.
5. `node scripts/qa/pwa-installability.mjs` (3012 por defecto).

Sintaxis de env depende del shell; en PowerShell usar `$env:NOMBRE='valor'`.
No ejecutar simultáneamente otras suites que cambien modos del fixture compartido.
Los servidores de esta verificación se detienen al finalizar, no el del usuario.

## Instalación tras revisión y publicación HTTPS autorizada

Estos cambios todavía no están publicados. No se garantiza instalación en un
deployment anterior. Usar la URL HTTPS exacta del entorno aprobado, no localhost
del teléfono ni un enlace externo al origen instalado.

iPhone:

1. Abrir SELPA en Safari.
2. Compartir (puede estar dentro del menú de página) → Agregar a Inicio / Añadir a
   pantalla de inicio; si falta, revisar Editar acciones.
3. Activar Abrir como app web si aparece y confirmar Agregar.
4. Abrir el ícono SELPA desde Inicio y, si lo pide, iniciar sesión dentro de la app.

Android:

1. Abrir SELPA en Chrome normal, no incógnito.
2. Menú ⋮ → Instalar y crear acceso directo → Instalar; según versión puede decir
   Instalar aplicación o Agregar a pantalla principal.
3. Confirmar y abrir el ícono SELPA. Si sólo crea un acceso directo con barras del
   navegador, no considerarlo PASS: verificar HTTPS, manifest y deployment usado.

Prueba física pendiente de aceptación: confirmar logo, apertura sin barra, status
bar sobre header, notch/Dynamic Island y home indicator sin tapar controles;
rotación/teclado; deep link; login, cierre/reapertura, club/rol, recarga, Atrás y
logout; volver a una ruta privada tras salir; mala conectividad sin datos privados
offline; cerrar/abrir OAuth si corresponde. Mantener browser/escritorio utilizables.
No iniciar fase de rediseño de navegación hasta revisión del usuario.

Fuentes oficiales: [Next.js PWA](https://nextjs.org/docs/app/guides/progressive-web-apps),
[WebKit safe areas](https://webkit.org/blog/7929/designing-websites-for-iphone-x/),
[Apple instalación](https://support.apple.com/es-lamr/guide/iphone/iphea86e5236/ios),
[Chrome instalación](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=Es).
