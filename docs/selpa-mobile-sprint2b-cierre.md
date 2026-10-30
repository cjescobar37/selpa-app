# SELPA · cierre Sprint 2B · 15/10/2026

Estado: ajustes locales verificados, detenidos a la espera de autorización de
publicación Preview. Sin commit, push ni deployment. Production no se tocó.

## Diff mínimo sobre el piloto aprobado

Trabajo sólo en `apps/web` del checkout aislado
`D:/SELPA/output/pwa-universal-preview-20261015`, rama
`codex/pwa-universal-preview-20261015`. No se trasladaron cambios al principal.

- PLAYER excepcionalmente largo: dos líneas iniciales, misma fuente y tamaño.
  Sólo si excede dos líneas, el propio título permite desplegar/contraer el nombre
  completo con toque, Enter o Espacio; Escape contrae sin perder foco. Nombre
  completo en la etiqueta accesible y en title. Nombre normal sin botón ni recorte.
- Orden móvil real: hero → selector → instalación → contenido. Se eliminó el
  reordenamiento negativo CSS. Comunidad conserva el selector también durante
  carga/error. El foco se restaura en el modo elegido al cambiar composición.
- Selector móvil: grupo de botones nativos con aria-pressed; no se anuncia como
  un tablist incompleto. Desktop conserva estructura, roles y composición previa.
- El viewport se lee mediante useSyncExternalStore con snapshot SSR estable;
  no se ocultan advertencias ni se desactiva SSR. La revisión React priorizó
  orden semántico, foco y consistencia de hidratación. Referencia:
  [React](https://react.dev/reference/react/useSyncExternalStore).
- Invitación, paletas, fuentes, íconos, cards, ranking, torneos y lógica de datos
  no se rediseñaron. Continúan el gutter de 8 px y los heroes integrados aprobados.

Archivos del cierre (no todos los cambios pendientes de 2A/2B):

1. `apps/web/app/(app)/player/page.tsx`: composición móvil y preservación del foco.
2. `apps/web/components/ModeSegmentedControl.tsx`: ref y semántica móvil opt-in.
3. `apps/web/components/public/PublicHomeEmbed.tsx`: slot semántico tras hero.
4. `apps/web/components/home/HomeMobilePilot.module.css`: sin order negativo;
   clamp y foco del nombre, exclusivamente dentro del media query del piloto.
5. `apps/web/components/home/PlayerHomeName.tsx`: disclosure local del nombre.
6. `apps/web/lib/useHomeMobileLayout.ts`: detección móvil compatible con SSR.
7. `apps/web/lib/homeMobilePilot.test.ts`: contrato adicional de accesibilidad.
8. Este informe.

## QA técnica y visual

| Comprobación | Evidencia / resultado |
| --- | --- |
| Pública / PLAYER / Comunidad, 320/375/390/430 | 12 pares con nombre normal idénticos píxel a píxel al piloto aprobado; sin overflow, hero unido, selector 10 px debajo |
| Desktop 1024/1280/1440 | 9 pares idénticos píxel a píxel, mismas fuentes/colores/cards/navbar |
| Nombre excepcional PLAYER, 320 | Título de 153,59 a 61,44 px (5 a 2 líneas); sigue en 32 px; expansión completa de 153,59 px, sin limitar acceso al nombre |
| Nombre de 100 W sin espacios | Sin overflow a 320; disclosure disponible |
| Comunidad con nombre largo, 320 | Nombre completo legible en párrafo de 42 px; hero de 205 px, sin overflow |
| Lectura / teclado | DOM y visual coinciden; Tab desde cuenta alcanza el enlace del hero antes del selector; Enter/Espacio, foco tras cambio de modo y resize PASS |
| Comunidad demorada / error 503 | Selector único y utilizable, foco conservado y regreso a Mi espacio PASS |
| Invitación en las tres vistas | Visible en navegador compatible; fila útil completa pulsable, controles de 44 px, guía/Escape/foco, cierre y descarte por 7 días tras recarga PASS |
| Standalone | Ausente por navigator.standalone y por display-mode:standalone simulados en las tres vistas |
| Capacidad nativa | beforeinstallprompt sintético conservado al pasar a Comunidad, sin prompt automático, consumido una vez por gesto |
| Safe areas / horizontal | 6 pares, top 59/bottom 34 y landscape 844×390 con laterales 47/bottom 21; igual geometría y estilos, sin doble inset ni overflow; menús dentro del viewport |
| Rutas de control: login, torneos, pagos | 3 pares a 390 idénticos píxel a píxel; invitación ausente; sin extensión del piloto |
| Cambio de club / persistencia / logout / navegación y Atrás | Handlers existentes PASS con respuestas locales en memoria; tema limeNavy → cyan, contexto y persistencia correctos |
| Fix #418 | HEAD 5504f8844a6ef292e931c41d6c36bd1e2dfbbe1f sigue incluido; helpers, tests y TournamentPublicCard intactos |
| Hidratación | SSR UTC vs clientes UTC/Buenos Aires: mismas 4 fechas renderizadas, cero errores #418/hydration; contratos cubren también medianoche y Tokyo |
| Runtime | Cero excepciones JS y cero escrituras externas en los recorridos |
| Contratos | 20/20: piloto 4, PWA 5, instalación 5, fechas 6 |
| TypeScript / build webpack | PASS; 166 páginas estáticas; sin instalar dependencias |
| ESLint | 3 archivos nuevos/focales y selector sin hallazgos; PLAYER conserva 2 warnings; PublicHomeEmbed conserva 7 errores any heredados, cero nuevos |
| Git diff --check / reverso del patch --check | PASS |

Se esperó estabilización de layout, fuentes y decodificación de imágenes antes
de comparar. En algunos pares PLAYER/Comunidad con insets simulados hay diferencias
de raster dentro del hero; geometría y computed styles permanecen iguales y se
revisaron visualmente. No se declara identidad píxel a píxel para esos pares.
La identidad desktop y los 12 pares móviles normales sí se verificó por píxeles.
Warnings heredados: Browserslist antiguo y type stripping experimental de Node.
No se declara PASS global de ESLint ni de todas las pantallas de SELPA.

Limitación UX heredada, no regresión: en horizontal 844×390 el hero PLAYER
conserva 429 px de altura y sus métricas apiladas; el selector requiere scroll.
Se dejó igual al piloto aprobado, sin extender este cierre a un rediseño de
breakpoints o cards. Pública y Comunidad no presentan esa altura de hero.

## Alcance real de la evidencia

Capturas de la app Next compilada ejecutándose en Chrome, no maquetas HTML ni
imágenes generadas. Navegador móvil/UA/insets/standalone emulados: no una nueva
certificación de Safari o dispositivos físicos. Los pares usan los mismos datos.
Pública reproduce el DTO público de Preview ya capturado; PLAYER reproduce los
datos visibles de las referencias (Jose Escobar, Cristal/BLP, categorías 7/6,
cuatro inscripciones, ranking sin lectura) con transporte loopback y sesión
sintética. No se afirma haber abierto una cuenta PLAYER remota nueva.

El plazo de FINAL MASTER ya había vencido al capturar: su ausencia en próximos
torneos públicos sigue el filtro existente. No se alteró esa lógica para QA.
La revisión Supabase/entornos mantuvo las pruebas aisladas, sin claves reales ni
escrituras remotas. No certifica permisos/RLS, logout remoto o instalación del OS.
Referencias físicas pendientes: Safari/iPhone y Android instalados, notch/rotación
del OS y cambio de club/logout con una sesión real autorizada.

No se crearon datos reales. Sin cambios en Supabase, finanzas, migraciones,
sesiones, permisos, paquetes, servicios pagos o navegación inferior. Costo
adicional de servicios: $0. PWA/startup/íconos originales preservados.

## Preservación y reversibilidad

El checkpoint del principal confirma sus 65 archivos byte a byte; HEAD, main,
índice y stash sin cambios. La rama aislada conserva su HEAD y todos los cambios
previos de 2A/2B ajenos a este cierre. Next sólo usó un build ignorado separado;
tsconfig y next-env se restauraron byte a byte. Capturas, fixtures y scripts
descartables están fuera del repo y fuera del patch.

`sprint2b-cierre-only.patch` se calcula contra el estado local exacto previo al
cierre, no contra HEAD ni contra el checkout principal. Incluye sólo estos ocho
archivos. Su reverso fue comprobado sin aplicarlo. Para volver al piloto aprobado,
desde el checkout aislado revisar primero:

```text
git apply --reverse --check C:/Users/CESCOBAR/Desktop/SELPA-Sprint2B-Cierre-20261015/sprint2b-cierre-only.patch
```

Sólo aplicar el reverso tras revisar hunks; si hay cambios posteriores superpuestos,
no forzarlo. No usar reset/clean/stash. El interruptor local ya existente
HOME_MOBILE_PILOT_ENABLED permite desactivar todo el piloto sin afectar PWA o #418.
El patch anterior del Sprint 2B no debe revertirse directamente sobre este cierre:
primero revertir el cierre y luego comprobar el patch anterior.

No hubo commit, push ni deploy. Detenido para autorización de publicación Preview.
