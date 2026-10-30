# SELPA · Sprint 2A · revisión local

Fecha: 2026-10-15. Rama `codex/pwa-universal-preview-20261015`.
Base local: `5504f8844a6ef292e931c41d6c36bd1e2dfbbe1f`; fix #418 separado e intacto.

## Estado y límites

Implementadas localmente **sólo apertura PWA e invitación de instalación**. Navbar,
cabeceras y barra inferior son artefactos de propuesta; **no están importados por la app**.
Sin commit, push, deployment, dependencias nuevas, servicios pagos ni operaciones en
Supabase. No se modificaron datos reales, pagos, migraciones o permisos.

El checkout principal permanece intacto: misma rama, HEAD, main, índice, stashes y
SHA-256 de sus 65 archivos locales inventariados. Copia recuperable previa:

`C:/Users/CESCOBAR/.codex/visualizations/2026/10/08/01a11bbc-0bb5-7d41-80d0-eb70055f82b8/selpa-sprint2a-checkpoint-20261015`

La Preview aislada no incorpora el WIP deportivo/económico del checkout principal.
No se copiaron esas modificaciones al prototipo. El usuario confirmó instalación
previa e icono aprobado en iPhone; **eso no certifica este Sprint en un iPhone real**.
Las capturas nativas de referencia aún no están adjuntas a este turno. Pendiente
compararlas cuando el usuario las facilite; no se sustituyen por estos fixtures.

## Implementación

### Apertura

- Misma imagen original del icono, mismo fondo `#f4f7fb` y wordmark original
  `public/brand/selpa-wordmark-clean-dark.png`; ningún logo recreado.
- Composición nativa: isotipo 112 px lógicos, separación 18 px, wordmark 164 px,
  conjunto centrado con ajuste óptico de -12 px. Antes: isotipo aislado de 128 px.
- Los 22 recursos nativos siguen estáticos y acotados al allowlist anterior.
  No se cambió ningún archivo del icono instalado ni el manifest.
- Entrada CSS de 160 ms: opacidad .96 → 1 del contenido ya interactivo, sólo
  `max-width:980px`, standalone y `prefers-reduced-motion:no-preference`.
  Sin overlay, spinner, JS de arranque, timer, transform, bloqueo o cambio geométrico.
- La startup image de iOS no anima. El empalme real entre imagen del sistema y
  documento web sigue pendiente de dispositivo físico y futura publicación autorizada.

### Invitación

- CTA “Usar SELPA como app” al final de `/` y `/player`, antes del pie. En flujo
  normal, no fixed, sin tapar acciones. Ausente de formularios, login, torneos,
  inscripción, ranking, carrera y pagos. Invisible en >=981 px y en standalone.
- Android: conserva `beforeinstallprompt` cuando existe y sólo llama `prompt()`
  desde el clic; consume el evento una sola vez. No dispara instalación automática.
  Conserva la promoción nativa del navegador como fallback, incluso fuera de mobile.
- Guías manuales específicas para Safari/iOS, otros navegadores iOS (abrir Safari),
  Chrome Android y Samsung Internet. Navegadores desconocidos/embebidos sin capacidad:
  no se ofrece una acción inservible. La opción depende de la versión del navegador.
- Descarte durante siete días: únicamente timestamp en
  `selpa:pwa-install-dismissed:v1`. Sin identificadores, tokens o telemetría. Storage
  bloqueado: descarte en memoria y sin error de UI; no puede persistir entre recargas.
- Disclosure accesible, controles >=44 px, foco devuelto al cerrar la guía, cleanup
  de listeners, render SSR inicial nulo. Reutiliza botones y tokens SELPA actuales.

Se aplicaron las guías de React/verificación para limitar listeners, almacenamiento,
hidratación y accesibilidad, y hacer QA con transporte sintético aislado. No se
modificó sesión, restauración de club/rol ni lógica de autenticación.

## Propuesta visual, NO aplicada

Dos HTML autocontenidos exportados del DOM real renderizado (no una maqueta genérica):
`prototype-public.html` y `prototype-player.html`. Sin React payload, tokens ni sesión
exportada. Sólo Cuenta y enlaces de sección son interactivos; los menús existentes
requieren el runtime de la app. Salir está expresamente desactivado en el prototipo.

| Muestra a 390 px | Antes | Propuesta |
| --- | --- | --- |
| Inicio de hero público | y=63 | y=55, pegado al navbar |
| Alto de hero público | 132 px | 132 px, misma tipografía |
| Inicio de hero PLAYER | y=119 | y=57, antes del selector de modo |
| Alto de hero PLAYER | 227.06 px | 226.06 px, sólo borde superior eliminado |
| Gutter de contenido | 8 px | 8 px |
| Navegación PLAYER inferior | Ausente | 4 destinos, targets de 48 px + safe area |

Se integran bordes superiores y se reduce la separación, sin cambiar paleta, fuentes,
texto, datos o cards. En la muestra pública se libera **sólo en el artefacto** el
`contain:paint` que recortaba la extensión del hero. No se oculta overflow para forzar
el resultado. En PLAYER se reordena hero/selector mediante layout CSS de prototipo;
el modo Comunidad no queda implementado aquí: requiere validación funcional antes
de llevar esta idea a código. Ranking, perfiles y componentes deportivos intactos.

### Contrato propuesto de navegación (requiere aprobación)

- PLAYER: Inicio `/player`, Torneos `/player/torneos`, Ranking `/player/ranking`,
  Cuenta (menú existente consolidado). Carrera, pagos y preferencias dentro de Cuenta.
- Cuenta tiene un único acceso principal: quitar sólo en la propuesta el avatar
  duplicado del topbar. Notificaciones y mensajes permanecen arriba, no duplicados abajo.
- Club activo permanece en el topbar como selector contextual; su menú final no debe
  repetir Inicio/Torneos/Ranking. Cambiar club usa la autoridad de sesión existente;
  nunca un rol inventado o escrito sólo en localStorage.
- Atrás: historial real de navegación interna en detalle; entrada profunda sin origen
  interno vuelve a la ruta padre segura. Las pestañas principales no agregan otro Atrás.
  Mantener scroll y navegación nativa; no usar sólo `history.length` como prueba de origen.
- STAFF: conservar navegación administrativa filtrada por permisos, club activo y Mi
  cuenta. Proponer accesos de gestión según capacidades, no reutilizar el menú PLAYER.
- PLATFORM: mantener contexto global y menú propio; cambiar de ámbito sólo mediante
  sesión y destinos ya autorizados. No se implementó barra global para estos roles.
- Barra inferior reservando espacio al final del documento y safe area; revisar con
  teclado físico antes de adoptarla. Sin superponer acciones sticky deportivas existentes.

## Evaluación de altura de pantallas actuales

Inspección de capturas a 390 px, con datos **sintéticos, no certificación del backend**:

| Pantalla | Observación, sin modificarla |
| --- | --- |
| Home PLAYER | Selector previo desplaza hero a y=119; propuesta lo lleva bajo hero. Resumen muestra “Sin lectura”, no puntos inventados. |
| Home pública | Hero 132 px; se propone integrar el hueco de 8 px con navbar. |
| Torneos | Hero + filtros + vacío “En juego” empujan “Próximos”; posible disclosure futuro, no aplicado. |
| Calendario | Hero 121 px y calendario mensual ocupan primer viewport; evento visible al final. |
| Login | Gutter heredado de 18 px, aire superior y CTA bajo fold en altura 420; sin cambios en este Sprint. |
| Carrera | Error de lectura visible, no se puede valorar una carrera poblada ni confundir el vacío con diseño. |
| Mis pagos | Cabecera compacta, error sintético separado y reintento. No se probó un estado financiero real. |
| Ranking público | Hero + selector; fixture sin categorías. No certifica ranking publicado de Cristal. |
| Mi ranking | Hero 118 px y error de lectura; sin datos deportivos fabricados para ocultarlo. |

**Limitaciones visuales heredadas**: en la base Preview, 768 px presenta cards de
torneo/ranking estrechas con textos comprimidos y espacios muertos; ya existe antes.
No se tocaron por ser componentes deportivos fuera de alcance. No hay PASS UX global.
El botón negro flotante **no se identificó**: no apareció en el recorrido local; falta
la captura nativa y su contexto. No se afirma que sea AssistiveTouch, Vercel o SELPA.

## QA ejecutada

Build Next.js 16.1.4 de producción con webpack y entorno sintético loopback; 166 páginas
estáticas generadas. El build de referencia corresponde al HEAD local previo al Sprint,
que ya incluye el fix de hidratación. Ninguna prueba usa la base compartida.

| Comprobación | Resultado |
| --- | --- |
| Contratos nuevos + PWA + fechas de home | 16/16 PASS |
| TypeScript independiente `tsc --noEmit --incremental false` | PASS |
| ESLint focal (los cinco archivos TS/TSX afectados/nuevos) | PASS, sin warnings |
| Build producción + TypeScript integrado | PASS |
| `git diff --check` | PASS |
| Home pública, PLAYER y login: 320/360/375/390/412/430/480/768/1024/1280/1440 | 33 pares; HTTP 200, sin overflow ni error JS |
| Recorrido adicional de seis pantallas a 390 | 6 pares; errores de negocio visibles, sin crash JS |
| Desktop de app en 1024/1280/1440 | 9 pares idénticos píxel a píxel |
| Tablet 768, homes con carga directa estable | 2 pares idénticos píxel a píxel |
| Prototipo desktop autocontenido | 6 pares idénticos, animaciones congeladas y dos frames de asentamiento |
| Prototipos públicos/PLAYER en ocho anchos mobile/tablet | Sin overflow; inspección visual a 390 |
| Guías iOS/Chrome Android/Samsung (UA emulado) | Apertura, cierre y descarte tras recarga PASS |
| beforeinstallprompt sintético | Gesto explícito y consumo único PASS; NO instalación OS real |
| Standalone `navigator.standalone` simulado | Invitación ausente |
| Storage denegado | Sin crash; descarte en memoria PASS |
| Keyframes de entrada activados en demo QA Chrome | Caja idéntica antes/durante; interacción disponible |
| Manifest | Byte idéntico |
| Icon, Apple icon, icon-192 | Byte idénticos |
| 22 imágenes de apertura | PNG válidos, medidas originales; cambiadas sólo por composición aprobable |
| Service workers / Cache Storage | 0 / vacíos antes y después |
| Safe areas top=59/bottom=34, landscape 844×390, login 390×420, zoom CDP 2× | Capturas Chrome; no equivalen a teclado/OS físico |
| Home en UTC / Buenos Aires | Sin #418 con fixture de fecha al borde del día |
| Escrituras HTTP del recorrido | 0 |

Dos capturas a 768 tomadas durante cambios sucesivos de viewport presentaron diferencias
de raster; la comparación repetida con carga directa estable dio cero píxeles distintos.
En el prototipo se esperaron dos frames después de cambiar clases para comparar pintura
estable. No se cambió código de la app para obtener igualdad.

No confundir “sin CLS añadido por los keyframes” con CLS global cero: la instrumentación
local heredada observa aproximadamente .157 en home pública, .125 en PLAYER y .74 en login.
Son medidas de un fixture local, no Web Vitals productivos; no se corrigieron fuera de alcance.

Playwright requiere WebKit 2336, no instalado; WebKit 2311 existente falla con protocolo
`Unknown setting: PushAPIEnabled`. Se detuvo el intento sin instalar dependencias ni
declarar Safari PASS. iPhone real, Chrome Android real y Samsung Internet real pendientes.
Los dos videos son Chrome local: guía de instalación y demo CSS que activa explícitamente
los keyframes en QA; **no son videos de apertura nativa de iOS**.

Warnings heredados del build: Browserslist/caniuse desactualizado. Sin actualizar paquetes.
No se repitió lint global ni auditorías SQL ajenas a este Sprint.

## Archivos del cambio

Sólo seis archivos de app/tests y este informe:

1. `apps/web/app/pwa/startup/[screen]/route.tsx` — composición estática.
2. `apps/web/app/pwa.css` — invitación móvil y entrada standalone.
3. `apps/web/components/AppShellClient.tsx` — import y montaje único de invitación.
4. `apps/web/components/pwa/PwaInstallInvitation.tsx` — interacción progresiva.
5. `apps/web/lib/pwaInstallation.ts` — selección de guía, rutas y descarte temporal.
6. `apps/web/lib/pwaInstallation.test.ts` — cinco regresiones específicas.
7. `docs/selpa-mobile-sprint2a.md` — entrega y límites.

`tsconfig.json` y `next-env.d.ts` fueron autoajustados por Next durante el build y
devueltos byte a byte a HEAD. Package/lock, iconos, navbar, ranking, perfiles y finanzas sin cambios.

## Evidencia y reversibilidad

Carpeta privada permanente (capturas, videos, HTML autocontenidos, JSON, scripts de QA,
patch exacto y fuentes de este Sprint):

`C:/Users/CESCOBAR/.codex/visualizations/2026/10/08/01a11bbc-0bb5-7d41-80d0-eb70055f82b8/selpa-sprint2a-evidence-20261015`

Abrir `review.html`: parejas de apertura, invitación, cabeceras pública/PLAYER, enlace
a ambos prototipos y videos. Capturas completas antes/después a todos los anchos en la
misma carpeta; `before.json`, `after.json`, `extra.json`, `tablet-motion.json`,
`frozen-desktop.json`, `paired-installation.json` y `checkpoint.json` respaldan los checks.
Los scripts y fixtures se guardan como evidencia, no están importados por la app.

Revertir individualmente mediante hunks revisados, sin reset/clean/stash ni tocar WIP ajeno:

- Apertura nativa: revertir sólo el hunk de `startup/[screen]/route.tsx` a `5504f88`.
- Transición: quitar sólo el media query `selpa-app-entry` y sus keyframes al final de
  `pwa.css`. Mantener intactos safe areas y reglas PWA previas.
- Invitación: quitar import/montaje en AppShell, bloque CSS `.pwa-install`, componente
  y helper nuevos; ajustar únicamente sus tests. El resto de PWA/#418 permanece.
- Navbar/barra inferior: no hay nada que revertir en app; son HTML/CSS de propuesta.
  Conservarlos o retirarlos de la carpeta de evidencia no cambia SELPA.

Antes de publicar hace falta revisión, capturas reales y autorización explícita.
No se ejecutó ninguna operación remota. Production/main sin modificaciones por este trabajo.
No se inició otra fase ni se propagó la propuesta de navegación.

## Referencias de compatibilidad

- [MDN: beforeinstallprompt y gesto de instalación](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event).
- [WebKit: instalación y modo app en Safari 26](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/).
- [MDN: instalación según navegador](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Installing).
