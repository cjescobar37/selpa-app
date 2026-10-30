# SELPA · Sprint 2B · piloto móvil local

Fecha: 15/10/2026. Checkout aislado: `output/pwa-universal-preview-20261015`.
Rama: `codex/pwa-universal-preview-20261015`, HEAD sin cambios: `5504f88`.

## Alcance implementado

Sólo `/` y `/player`, hasta 980 px. La clase opt-in se calcula con coincidencia
exacta de ruta; las reglas viven en un CSS Module. No se editó el CSS ni el
componente del navbar global, ni se agregó navegación inferior.

- Home pública: hero unido al navbar, sin hueco superior, ancho completo del área
  disponible. Se libera exclusivamente su contención de pintura que recortaba el
  hero; no se oculta desborde para aparentar responsive.
- PLAYER: mismo hero, contenidos, fuentes, colores y variables de identidad del
  club. Cabecera primero; selector Mi espacio / Comunidad SELPA debajo, separado
  por 10 px. La cabecera de Comunidad usa la misma integración y conserva su diseño.
- Contenido: un solo gutter exterior de 8 px, adicional a los safe-area insets ya
  existentes. Los héroes pueden extenderse sobre ese gutter, no sobre los controles
  protegidos por el notch.
- En 320 px el título conserva la fuente/tamaño heredados (32 px para PLAYER) y
  permite saltos naturales. No se agregó fit-text, nowrap, reducción de fuente o
  recorte. El nombre habitual cabe en una línea con el nuevo ancho; uno largo usa
  varias líneas. No se garantiza que un nombre arbitrariamente largo ocupe sólo dos.
- Instalar SELPA: después del hero público; en PLAYER, después del selector en
  ambos modos. Fila de 46 px incluyendo borde; acción principal y cierre de al
  menos 44 px. Todo el interior responde, excepto el área reservada al cierre.
  Disclosure e instrucciones en flujo normal, sin overlay ni acción tapada.
- La invitación mantiene las capacidades, guías y descarte de siete días de 2A.
  Un único host permanece montado: un portal sólo cambia su ubicación. No se
  pierden el evento nativo ni el descarte al cambiar de modo o navegar por la app.
  `useId` vincula el disclosure con su control. Ausente si ya está instalada,
  fuera de mobile o sin capacidad compatible.

La lógica deportiva, sesiones, permisos, finanzas, cards, ranking, perfiles,
paletas, fuentes, iconos PWA y startup del Sprint 2A no se modificaron. El fix #418
continúa en su commit funcional independiente; no se agregó otra corrección aquí.

## Evidencia y frontera de QA

Capturas del **runtime real de la app local compilada**, no HTML de prototipo ni
imágenes generadas. Chrome de escritorio con viewport y UA emulados; **no son
capturas nuevas de Safari/iPhone físico**. No se dibuja una barra de sistema iOS.

El transporte de QA está fuera del repo y sólo escucha loopback. La home pública
reproduce una lectura pública de Preview; PLAYER usa un usuario de QA local y los
datos visibles de las referencias del usuario (Jose Escobar, Cristal/Complejo BLP,
categorías 7/6, cuatro inscripciones, puntos sin lectura). La miniatura del avatar
es una ventana SVG sobre los píxeles del JPEG aportado, no una nueva foto.
Los IDs de sesión y las respuestas privadas son sintéticos, **no un JWT real**.
Cambio de club y logout se ejecutaron con los handlers reales de UI y respuestas
locales en memoria. No se certifican RLS, permisos remotos o cierre de una sesión
real. Ranking/carrera no se sustituyen por éxitos inventados: sus read models
permanecen no disponibles en este transporte.

Al capturar ya había vencido el plazo de inscripción de FINAL MASTER (15/10,
16:57 Argentina). La home pública deja de listar ese torneo según su filtro
actual; Comunidad conserva el calendario y PLAYER su próximo torneo. Esa
diferencia frente al ZIP de mediodía no es un cambio de diseño ni fue corregida.
Los pares de este Sprint usan el mismo contenido y condiciones antes/después.

## Resultados

| Prueba | Resultado |
| --- | --- |
| Pública, PLAYER, Comunidad · 320/375/390/430 | 12 pares, sin desborde horizontal; cabeceras sin hueco y de ancho disponible completo |
| Desktop · 1024/1280/1440, tres experiencias | 9 pares idénticos píxel a píxel |
| Fuentes/colores/estilos de cards y navbar protegidos | Computed styles iguales antes/después |
| Controles fuera del piloto: login, torneos, pagos | 3 pares a 390 px idénticos; invitación ausente |
| Safe areas top 59/bottom 34 y landscape 844×390, laterales 47/bottom 21 | Chrome/CDP; sin doble inset ni desborde; menús dentro del viewport |
| Texto largo, persona y club a 320 | Se envuelve sin reducir fuente ni recortar horizontalmente; prueba sintética de estrés |
| Comunidad / Mi espacio | Cambio por clic/teclado, persistencia tras recarga y posición de selector correctos |
| Cambio de club | Tema limeNavy → cyan y contexto visual correctos; persistencia local tras recarga |
| Logout y navegación pública / Atrás | PASS en transporte local, sin escrituras remotas |
| Invitación iOS/Android | Fila completa pulsable, cierre 44×44, guía, Escape/foco y descarte tras recarga PASS |
| PWA instalada / evento nativo | Invitación ausente; evento sintético conservado al navegar y consumido una vez por gesto |
| Runtime de los recorridos | Sin errores JS; ninguna escritura no permitida |
| Contratos piloto/PWA/fechas | 14/14 PASS |
| TypeScript y build producción webpack | PASS; 166 páginas estáticas generadas |
| ESLint focal nuevo/compartido | Sin errores ni warnings en los cinco archivos focales |
| ESLint de las dos vistas legacy | Sin hallazgos nuevos: pública conserva 7 errores/7 warnings; PLAYER conserva 0 errores/2 warnings |
| diff --check | PASS |

Se esperó la decodificación de imágenes visibles antes de comparar píxeles: las
primeras tomas durante resize mostraron diferencias transitorias de raster de una
publicidad/miniaturas. No se modificó la publicidad para conseguir igualdad.
Warning heredado de build: datos Browserslist antiguos; no se actualizaron paquetes.
No hay PASS global de ESLint ni de UX de toda SELPA. Las limitaciones heredadas de
cards en anchos intermedios se conservaron, por estar fuera de este piloto.

Pendientes: iPhone físico instalado/Safari, Android físico, notch/rotación del OS,
instalación nativa y sesión PLAYER real con cambio de club/logout. No se instalaron
dependencias, navegadores o servicios para simular una certificación física.

## Archivos del piloto

1. `apps/web/components/AppShellClient.tsx` — opt-in exacto y host persistente.
2. `apps/web/components/home/HomeMobilePilot.module.css` — geometría móvil aislada.
3. `apps/web/components/public/PublicHomeExperience.tsx` — slot tras hero, sin duplicarlo en Comunidad.
4. `apps/web/app/(app)/player/page.tsx` — slot tras selector, sin tocar consultas ni reglas.
5. `apps/web/components/pwa/HomeInstallPlacement.tsx` — destino DOM y host único.
6. `apps/web/components/pwa/PwaInstallInvitation.tsx` — portal, fila compacta y vínculo accesible.
7. `apps/web/lib/homeMobilePilot.ts` — interruptor local y allowlist de rutas.
8. `apps/web/lib/homeMobilePilot.test.ts` — contratos durables de alcance/estilos/host.
9. Este informe.

## Reversibilidad y Git

Desactivar sólo `HOME_MOBILE_PILOT_ENABLED` en `homeMobilePilot.ts` restaura la
distribución 2A y la invitación al final de las homes. No afecta la PWA existente,
startup, fix #418 o trabajo deportivo/financiero ajeno. No es un flag de servicio
pago ni requiere cambiar variables de entorno.

La entrega contiene además `sprint2b-only.patch`, calculado contra el estado local
exacto previo al Sprint, **no contra HEAD**, para preservar los hunks pendientes
de 2A. Antes de una reversión completa comprobar, desde la raíz del checkout
aislado, `git apply --reverse --check RUTA_AL_PATCH`; revisar los hunks y sólo
entonces aplicar el reverso. Si aparecen cambios posteriores superpuestos,
detenerse y resolverlos; nunca usar reset/clean/stash para forzar la reversión.

Las copias previas y el estado/hashes de preservación están en el directorio
privado `selpa-sprint2b-work/baseline`, fuera de Git. El checkout principal, su
índice, HEAD, main y stashes permanecen intactos. Los cambios 2A ajenos al piloto
se conservan. Los autoajustes temporales de Next a tsconfig/next-env se devuelven
byte a byte a su estado previo. Capturas, fixtures, logs y scripts descartables
están fuera del repo; sólo el build ignorado usa `.next/sprint2b-after`.

No se crearon datos reales. Sin cambios en Supabase, compras, servicios nuevos,
commit, push o deployment. Piloto local detenido para revisión; no se extendió a
otras pantallas.
