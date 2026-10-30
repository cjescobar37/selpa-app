# SELPA — Preview PWA universal preparada, NO publicada

2026-10-15 · origen `codex/club-admin-iphone-preview` · base `2fb0628db8566e5d48e5e8b86faca84f6b4170bb`.

**Detenida antes de commit, push y deploy. No existe una nueva URL HTTPS.**
Lista para revisión del paquete aislado, no para declarar compatibilidad universal
certificada. No se inició Fase 2 ni se rediseñó ninguna pantalla.

Actualización: paquete aceptado para preparar pruebas físicas; gutter de login
de 18 px diferido expresamente a Fase 2, sin modificarlo ahora. Publicación aún
sujeta a autorización. Ver [checklist de dispositivos y gates pendientes](./selpa-pwa-real-device-checklist.md).

## A. Cambios preparados para publicar

Sólo ocho archivos, idénticos byte a byte a la implementación PWA local:

| Grupo | Archivo en `apps/web` | Cambio |
| --- | --- | --- |
| A: existente | `app/layout.tsx` | Metadata instalable, viewport-fit, theme-color existente, startup links e import de safe areas |
| A: existente | `app/styles/navbar.css` | Dos declaraciones: quitar inset superior duplicado de barra autenticada; se aplica una vez en header |
| B: nuevo | `app/manifest.ts` | Manifest nativo, nombre SELPA, scope/start `/`, standalone, sin bloqueo de orientación |
| B: nuevo | `app/pwa.css` | Insets del sistema y límites de overlays, sin colores, fuentes ni diseño nuevo |
| B: nuevo | `app/pwa/icon-192/route.tsx` | Derivado del PNG original, sin redibujar logo |
| B: nuevo | `app/pwa/startup/[screen]/route.tsx` | Imágenes de apertura del OS; no splash JS ni demora artificial |
| B: nuevo | `lib/pwa.ts` | Colores actuales y tamaños de apertura Apple; otros tamaños usan fallback del OS |
| B: nuevo | `lib/pwaContract.test.ts` | Cinco invariantes de identidad, metadata, insets y sesión existente |

Apple Touch Icon e ícono 512/maskable existentes se conservan. Sin service worker,
offline completo, push, caché PWA de HTML/API privados, nueva persistencia de tokens,
pantalla obligatoria de instalación, dependencia nueva o servicio contratado.

Los helpers de QA, capturas y este informe **no están en el patch a publicar**.
Manifest sigue la convención soportada por [Next.js](https://nextjs.org/docs/app/guides/progressive-web-apps).
La instalación depende del soporte del navegador; la web sigue siendo accesible
sin instalación, conforme al enfoque de [instalabilidad progresiva](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).

## B. Base y aislamiento

Worktree Git real, detached HEAD:

`D:\SELPA\output\pwa-universal-preview-20261015`

App canónica dentro del checkout: `apps/web`. No se usaron `web2`/`web3` como base.
La rama original no se movió; no se creó commit ni rama remota. Base elegida:
HEAD actual `2fb0628`, que ya contiene ranking/carrera publicados en Git y permite
compilar la capa PWA sin superponer cambios locales deportivos.

Overlay por allowlist de ocho archivos; no copia masiva del working tree.
`package.json`, lockfile y Next config siguen en HEAD. Dependencias instaladas
reutilizadas por junction local (lockfile idéntico); no se instalan ni publican.
Los ajustes autogenerados de `tsconfig.json`/`next-env.d.ts` se retiraron del worktree.
Índice original y del worktree sin staging de este paquete.

## C. Diferencias exactas con localhost

**Cero diferencias de contenido en los ocho archivos PWA**; hashes en
`output/pwa-universal-20261015/publication-manifest.json`.

Grupo C excluido: modificaciones locales de ranking, discovery, protagonistas,
perfil/carrera, inscripción/torneos, endpoints de carrera/ranking/finanzas,
contratos heredados, scripts previos de QA, SQL/ZIPs y documentación anterior.
Tampoco se copia `.env`, `.vercel`, backups, credenciales, `node_modules` o `.next`.

Por diseño, la Preview muestra **las versiones deportivas del commit base**, no
las últimas recuperaciones aún sin commit que se ven en localhost. No se perdió
ni revirtió esa recuperación: simplemente queda fuera del paquete solicitado.
Comparación visual correcta: base `2fb0628` vs esa misma base + PWA, no contra el
working tree recuperado con funcionalidades expresamente excluidas.

El build de QA usa URL/key sintéticas de loopback y pagos deshabilitados. No debe
publicarse ese `.next`: la futura Preview requiere un build nuevo desde fuentes.

## D. QA técnica, motores, viewports y visual

| Comprobación | Resultado real |
| --- | --- |
| Build optimizado webpack / Next 16.1.4 en worktree | PASS, 166 páginas generadas, incluidas aperturas; sin WIP excluido |
| TypeScript | PASS en build y comando independiente sin emisión |
| ESLint focal PWA | PASS |
| Cinco contratos PWA | 5/5 PASS |
| Diff-check / validación inversa de patch | PASS sin aplicar reversión |
| Chromium | Chrome instalado, automatizado en Windows; no Android nativo |
| WebKit | NO EJECUTADO: motor Playwright no instalado |
| Firefox | NO EJECUTADO: motor Playwright no instalado |
| Lint global | No se declara PASS ni se repite refactor; deuda heredada documentada en Fase 1 |

Login, ranking y perfil públicos: 45 combinaciones ruta/viewport, todas HTTP 200,
sin overflow horizontal, sin controles/textos recortados por overflow detectados
ni scrolls verticales anidados en el contenido medido:

| Referencia | Dimensiones CSS probadas |
| --- | --- |
| Anchos mínimos requeridos | 320×568, 360×640, 375×667, 390×844, 412×915, 430×932, 480×800, 768×1024, 1280×800 |
| Altura reducida | 320×420, 390×480, 412×600 |
| Horizontal/tablet | 844×390, 915×412, 1024×768 |
| Menús PLAYER y OWNER | Ambos en 320×420, 390×480, 844×390, 915×412; logout alcanzable tras scroll del menú |
| Inicio público | 360×640, 390×844, 1280×800; 200 sin overflow |
| Densidad/táctil simulada | DPR 2 en 360×640 y DPR 3 en 412×915, puntero coarse/touch; sin overflow |
| Insets simulados | 390×844: top 59/bottom 34; 844×390: laterales 44/bottom 21, aplicados una vez |

Gutter medido: ranking/perfil, 8 px exteriores sin padding adicional en su raíz.
**Excepción heredada no corregida:** login en 320–430 px suma 8 px del contenedor
y 10 px del wrapper propio (card a 18 px del borde); en 480 px cambia su composición
auth preexistente. Por tanto **no se aprueba globalmente el requisito de gutter
único de 8 px para todas las pantallas**. Ajustarlo cambiaría el espaciado del login
aprobado; no se añadió ese cambio visual al paquete exclusivamente PWA. El usuario
aceptó diferirlo a Fase 2: conservarlo ahora, sin declararlo criterio satisfecho.

[Visor antes/después](./selpa-pwa-universal-preview-review.html): seis pares, login,
ranking y perfil a 390/1280 px. Antes: copia limpia del commit base. Después: build
del worktree aislado. Fixtures idénticos, fuentes cargadas, animaciones reducidas.
Geometría, texto y estilos medidos iguales en 6/6; ranking/perfil idénticos píxel a
píxel en 4/4. Login difiere en raster (17.179 píxeles a 390; 28.681 a 1280), sin
cambios de fuentes/assets/estilos medidos; antes dev y después producción, no una
comparación byte a byte de un mismo pipeline de render. No se declara igualdad
píxel perfecta global ni se modifican colores para forzarla.

Se inspeccionaron capturas renderizadas de los pares a 390, login desktop, home,
menú PLAYER de altura reducida, landscape con insets y simulación de texto/zoom.
No se observó rediseño por PWA en esos recorridos. Este control no aprueba el UX
completo de las pantallas antiguas del commit base.

## E. Instalabilidad y comprobaciones funcionales

Chrome real de escritorio, perfil temporal NO incógnito: manifestErrors `[]` e
installabilityErrors `[]`. Se usa loopback, tratado como contexto seguro por Chrome;
**no es una prueba HTTPS remota ni una app instalada**. 26 referencias de imagen
con PNG/tamaño correcto (3 manifest, Apple, 22 startup); ruta no admitida 404.

`display: standalone` configurado, web normal funcional. La emulación CDP de media
`display-mode: standalone` no produjo un match; se registra **no disponible**, no
un PASS de standalone real. No se creó acceso directo del OS ni se instaló en móvil.

Sesiones **sintéticas**, no JWTs de usuarios reales: login por formulario preserva
deep link; recarga, Atrás, restauración de club/PLAYER al reabrir contexto con el
estado en memoria, menú OWNER, logout y Atrás tras logout pasan. Caches PWA `[]`,
service workers 0; lectura privada Mi ranking 200 con `private, no-store`.
Esto no certifica login OAuth ni cookies/almacenamiento entre Safari y la PWA.

Red lenta simulada (250 ms / 128 KBps): ranking 200. Corte de red verificado con
request no-cache fallido y navegación fría `ERR_INTERNET_DISCONNECTED`; al volver
la conexión, login 200. No se promete lectura offline ni se presentan estados
financieros almacenados como actuales. Navegación/caché HTTP normal del navegador
no equivale a una estrategia nueva de caché privada PWA.

Teclado de escritorio/focus visible y pinch zoom CDP 2× probados. No se bloquea
zoom. La prueba de root-font 200% no equivale a escala de texto del OS ni certifica
reflow completo (varias medidas existentes usan px). Login: inputs 14 px en reposo,
16 px bajo focus en la ejecución; autozoom/teclado virtual requieren equipo físico.

Ejecución final: 53 mediciones de login/ranking/perfil/menús, cero fallos del
arnés, cero pageerrors, cero escrituras inesperadas. Único externo bloqueado:
imagen preexistente de SVGRepo del login. No se probó login Google real ni se
simuló el funcionamiento de ese proveedor como si fuera real.

Se conserva `qa-initial.json`: la primera ejecución tuvo una carrera de repaint
al cambiar insets, mezcla de dos controles de red que no produjo corte y errores
del propio initScript al tocar localStorage en about:blank. Se corrigió únicamente
el arnés (esperar repaint, una sesión CDP y seed limitado a loopback), conservando
las aserciones de privacidad y añadiendo guardas finales de runtime/escrituras.
El primer intento de build falló por cwd del lanzador; se corrigió a `apps/web`.
Ninguno de esos ajustes cambió la app ni los ocho archivos a publicar.

## F. Matriz física pendiente y pasos de instalación

Todos los renglones siguientes están **NO EJECUTADOS**, por falta de dispositivos
físicos/URL HTTPS publicada. Registrar modelo, OS, versión de navegador, URL exacta
de Preview y commit antes de empezar. WebKit automatizado futuro no sustituye Safari.

| Equipo/navegador | Comprobaciones manuales obligatorias |
| --- | --- |
| iPhone/Safari y otro navegador compatible | Compartir → Agregar a inicio → abrir ícono; standalone, icono, status bar, notch/island, giros, teclado, zoom/texto OS, cierre/reapertura, sesión y OAuth/links de retorno |
| Android/Chrome, al menos dos relaciones de aspecto/DPR | Menú → Instalar/Agregar a inicio cuando exista → abrir; icono maskable, barras, cámara perforada, orientación, teclado, Back del sistema, sesión y reapertura |
| Samsung/Samsung Internet | Instalar desde su menú si lo ofrece; repetir shell/safe areas, navegación, sesión, teclado y pérdida/retorno de conexión |
| Tablet iPad/Android | Ambos giros, altura disponible, zoom, teclado y overlays; comprobar navegador e instalada si se admite |
| Desktop Chrome/Firefox/Safari/Edge disponibles al revisor | Web normal, teclado/focus, enlaces, red y zoom; instalación sólo donde esté soportada |

En cada equipo: home → ranking → perfil → login con deep link → club/rol → Mi
ranking → Atrás → cerrar/reabrir → logout → Atrás no permite ruta privada.
Probar formularios sin enviar datos y links externos sin ejecutar pagos. Si el
navegador no ofrece instalar, seguir usando la web: ninguna pantalla lo impide.

## G. Riesgos, seguridad y futura publicación

- Aislamiento **de código**, no de datos. Según el contexto ya confirmado,
  Production/Preview/localhost usan Supabase `nenupmpjrzdxfrnwsmkx`, productivo
  compartido. No se volvió a auditar SQL ni se cambió configuración remota.
- La Preview no es un sandbox financiero. QA real sólo de lectura, con cuentas
  autorizadas; no enviar inscripciones, ajustes, pagos o formularios de escritura.
  No hay un firewall read-only nuevo en el producto: la restricción debe respetarse.
- Read models deportivos pendientes siguen siendo un bloqueo conocido para
  ranking/carrera real, no regresiones nuevas de PWA. No se aplicó migración alguna.
- Almacenamiento de Safari/PWA y de distintos orígenes puede ser independiente.
  No copiar tokens entre apps ni exportar storageState real. Renovación real de
  JWT, expiración, OAuth y links de email requieren validación aparte.
- Safe areas/altura del teclado/barras dinámicas y escala de texto del sistema no
  quedan certificados por las simulaciones. Gutter de login permanece exceptuado.
- Antes de publicar, aprobación expresa del paquete/limitaciones y del destino
  **Preview**, no Production. Reutilizar el proyecto Vercel existente con root
  `apps/web`, verificar branch Preview/variables por rama y que un push no active
  Production. No crear servicios/proyectos/planes ni activar opciones pagas.
- Si se autoriza después, crear una rama temporal `codex/pwa-universal-preview`
  desde este mismo commit base, revisar nuevamente allowlist/hash, commit sólo de
  esos ocho archivos y publicación exclusivamente Preview. Ese nombre es propuesta;
  aún no existe. Push puede disparar un deploy automático: requiere autorización.
- No publicar `.next` de fixtures, archivos de respaldo, .env ni artifacts de QA.
  No hay nueva URL o deployment para anunciar en este estado.

## H. Reversión limitada a Preview

Ahora no existe deploy que revertir. No tocar la rama principal de trabajo ni
restaurar el snapshot completo. El patch admite `git apply --reverse --check`
en el worktree aislado; sólo después de revisar cambios posteriores podría
revertirse allí. No se ejecutó la reversión.

Si se publica tras aprobación: retirar únicamente la URL/alias de esa Preview o
revertir su commit PWA en su propia rama y regenerar Preview. No promover ni
rollback de Production; no tocar Supabase. No hay service worker que desregistrar.
Una instalación en un dispositivo puede conservar icono/metadata: desinstalar
esa instalación de prueba o reinstalar desde la URL Preview correcta si hace falta.
Conservar el patch/evidencias antes de retirar el checkout aislado.

## I. Trabajo preservado

Nuevo checkpoint privado, fuera del repositorio, previo a preparar el worktree:

`C:\Users\CESCOBAR\.codex\visualizations\2026\10\08\01a11bbc-0bb5-7d41-80d0-eb70055f82b8\selpa-universal-checkpoint-20261015-hWI16x`

3.040 archivos, 315.315.549 bytes (~301 MiB), hashes verificados. Incluye código,
artefactos no ignorados y patches del working tree/índice. Excluye credenciales
ignoradas, dependencias y DB; no es backup Supabase/Storage.

Verificación final: 65 archivos previamente presentes bajo `apps/web` conservados
byte a byte; branch original `codex/club-admin-iphone-preview`, HEAD `2fb0628`,
índice/stashes preservados. En el checkout original sólo se añaden este informe,
visor y artefactos nuevos bajo output. No se modificó runtime original.

## J. Diff exacto y evidencias

- Patch: `output/pwa-universal-20261015/pwa-only.patch`.
- SHA-256: `285528224e6b740b2c24892b33c11257ebda618f381e290848630aee651a3d3c`.
- Allowlist/hashes: `publication-manifest.json` en esa misma carpeta.
- Resultado final: `qa.json`; capacidades/imágenes/instalabilidad: `capabilities.json`.
- Capturas PNG y fingerprints: misma carpeta; [visor comparativo](./selpa-pwa-universal-preview-review.html).
- Scripts de reproducción local: `prepare.mjs`, `server.mjs`, `browser.mjs`,
  `capabilities.mjs`, `export.mjs`; preparación es de una sola ejecución y rechaza
  sobrescribir el worktree. Todos fuera del patch; sólo loopback y datos sintéticos.

**Costo adicional $0. Sin cambios Supabase, movimientos económicos, commit,
push, deploy, modificación de main o Fase 2. Próximo paso: revisión del usuario,
autorización de publicación y acceso/costo Vercel pendientes; gutter diferido a Fase 2.**
