# SELPA — control visual, separación y reversibilidad de Fase 1

2026-10-14 · `codex/club-admin-iphone-preview` · HEAD `2fb0628`.

**Fase 1 detenida para revisión. No Fase 2, rediseño global, commit, push ni deploy.**
No se autorizó cambiar identidad, colores, tipografía, cards, botones, ranking,
protagonistas, perfil público, clubes o componentes deportivos recuperados.
Este control añade respaldo, pruebas y documentación; no nuevos cambios de diseño.

## 1. Copia recuperable y alcance de evidencia

Checkpoint privado fuera del repositorio:

`C:\Users\CESCOBAR\.codex\visualizations\2026\10\08\01a11bbc-0bb5-7d41-80d0-eb70055f82b8\selpa-visual-checkpoint-20261014-d9439fd7`

Contiene 1.951 archivos, 259.651.464 bytes (~248 MiB), verificados por SHA-256:

- `working-tree/`: copia byte a byte de archivos Git modificados y untracked no
  ignorados, incluyendo código recuperado, documentación, ZIPs y evidencias previas.
- `inventory.json`: branch, HEAD, timestamp, paths, tamaños y hashes individuales.
- `working.patch` e `index.patch`: diferencias binarias de working tree e índice.
- `head-context/`: fuentes anteriores a PWA de layout/navbar para reconstrucción.
- `pwa-shell-only.patch`: sólo los hunks PWA de los dos archivos existentes.

No incluye `.env` ignorados, dependencias, DB ni almacenamiento externo. No es un
backup de Supabase. Los archivos originales, stashes e índice no se alteraron.
Puede recuperarse un archivo individual desde su path en working-tree, después de
compararlo con cambios posteriores; nunca restaurar toda la carpeta sobre trabajo nuevo.

**Límite cronológico:** este checkpoint se creó al recibir el control obligatorio,
antes de los ajustes de QA/documentación de este turno, no antes de la implementación
PWA anterior. Entonces se habían guardado hashes y una captura real de login, pero
no una copia completa persistente. No se presenta ese respaldo como retroactivo.

## 2. Cambios PWA vs cambios visuales

Fuentes runtime existentes modificadas por PWA, sólo dos:

| Archivo | Cambio exacto | No se tocó |
| --- | --- | --- |
| `apps/web/app/layout.tsx` | Metadata instalable Apple/manifest, viewport-fit, theme-color equivalente al header, links startup e import CSS safe-area | Fuentes, pesos, árbol visual y AppShell |
| `apps/web/app/styles/navbar.css` | Dos declaraciones: retirar inset superior de barra autenticada para aplicarlo una vez en el header | Colores, botones, tamaños sin inset, menús y destinos |

Archivos nuevos de Fase 1:

- `apps/web/app/manifest.ts`.
- `apps/web/app/pwa.css` (únicamente insets y límites de overlays).
- `apps/web/app/pwa/icon-192/route.tsx` y `pwa/startup/[screen]/route.tsx`.
- `apps/web/lib/pwa.ts` y `pwaContract.test.ts`.
- `apps/web/scripts/qa/pwa-{web,build,browser,installability}.mjs`.
- `docs/selpa-pwa-phase1.md`.

Nuevos sólo para este control:

- `apps/web/scripts/qa/pwa-visual-web.mjs`.
- `apps/web/scripts/qa/pwa-visual-compare.mjs`.
- Este informe y `docs/selpa-pwa-visual-review.html`.
- `docs/selpa-pwa-phase1.md`: agregado el enlace a este control y el punto de pausa.
- Capturas/métricas en `output/pwa-visual-control-20261014/` y copia temporal de QA
  en `output/pwa-visual-before-20261014/` (no forman parte del código a publicar).

No se modificaron en este control colores, fuentes, componentes premium, PNGs de
marca, ranking, perfil, cards, flujos deportivos, Supabase, migraciones o pagos.
No se añadió ninguna dependencia o servicio. Los cambios anteriores ajenos a PWA
siguen separados y pendientes; no deben incluirse indiscriminadamente en un commit.

## 3. Capturas ANTES y DESPUÉS

[Visor local lado a lado](./selpa-pwa-visual-review.html).

Captura histórica real disponible de antes de implementar PWA:
`output/pwa-before-390.png` (login). Se conserva como evidencia original, no se
usa para comparación estricta por haberse tomado con otra ejecución de QA.

Para los pares controlados se reconstruyó el estado pre-PWA en una copia aislada:
HEAD + **50 archivos locales no-PWA superpuestos y verificados**, incluidas las
recuperaciones de ranking, perfil e inscripción. Sólo layout/navbar volvieron allí
a su fuente previa; se excluyeron los archivos nuevos PWA. No se usó HEAD limpio
como sustituto del trabajo recuperado ni se cambió el checkout principal.

Se comprobó por HTTP que el antes no contiene viewport-fit/theme-color PWA y el
después sí. Ambos usan Chrome, mismos datos sintéticos, locale, viewport, fuentes
cargadas y animaciones desactivadas. Se bloquearon externos y todos los submits.
No se utilizaron datos, JWTs ni escrituras de producción.

18 pares renderizados:

- 390 px: inicio, login, ranking público, perfil público, Mi ranking, cuenta PLAYER,
  club PLAYER, cuenta OWNER, club OWNER, torneo, inscripción pendiente y pasos 1–4.
- 1280 px: login, ranking y perfil público.

Cada par tiene PNG `*-before.png` / `*-after.png`, fingerprints de layout/estilos
y un JSON de diferencias. `summary.json` conserva los resultados completos.

### Resultado y honestidad del control

- 18/18 pares: misma geometría y propiedades medidas de color/fondo, fuentes,
  pesos, line-height, espaciados, radios, bordes, sombras, grid/flex y texto visible.
- 13/18 pares idénticos píxel a píxel. Incluye ranking, perfil, Mi ranking y pasos
  1–4 a 390 px, menús de cuenta y club OWNER; perfil desktop también idéntico.
- 5 pares con diferencias raster; **no se declara equivalencia píxel perfecta global**:

| Par | Píxeles distintos | Hallazgo |
| --- | ---: | --- |
| Login 390 | 1.238 | Bordes del wordmark; geometría y todos sus estilos computados iguales, PNG servido con el mismo SHA-256 |
| Club PLAYER 390 | 10.268 | Gradientes: delta máximo de canal 2/255; ninguno supera 5 |
| Torneo 390 | 345 | Delta máximo 8/255; sólo un píxel supera 5 |
| Login 1280 | 2.743 | Wordmark; sin cambio de tamaño, fuente, color declarado ni asset |
| Ranking 1280 | 2.493 | Delta máximo 7/255; dos píxeles superan 5 |

El wordmark original se verificó idéntico entre ambos servidores:
`538a174a711c446970c6f10f099249088668a455000cab772bce4eb049b6e8a0`.
Repetir cada lado del login dio cero diferencias internas; no se atribuye la
diferencia entre lados a azar ni se la oculta con tolerancia de test.
No se modificó el PNG o su CSS para forzar una igualdad artificial.

Se inspeccionaron capturas renderizadas de los pares críticos, incluyendo todos
los pares con diferencias. No se observó un rediseño de composición, jerarquía,
cards o identidad en ellos. Las diferencias raster anteriores quedan explícitas
para revisión del usuario. Esto es control de conservación, **no aprobación visual
global del producto ni aprobación nativa de iPhone**.

## 4. Regresiones y pendientes

- No se encontró una regresión de composición/estilos medidos por la capa PWA en
  estos recorridos. No se revirtió código deportivo ni trabajo ajeno.
- Variaciones raster del wordmark/gradientes: pendientes de aceptación visual del
  usuario; no se afirma que todos los PNG sean idénticos.
- Safe areas, status bar, splash y menús con teclado en iPhone físico/Safari nativo:
  **pendientes**. Simulación Chrome no prueba Dynamic Island ni instalación iOS.
- El detalle de torneo fixture ya muestra un mensaje de pago pendiente junto con
  inscripción confirmada en ambos lados. Es una observación previa de contenido,
  no una regresión PWA; no se tocó el flujo deportivo para resolverla aquí.
- No hay validación live, publicación ni transformaciones de navegación aprobadas.

## 5. QA técnica

El informe de Fase 1 conserva build PASS, TypeScript PASS, lint focal PASS, 16
contratos PASS, manifest/installability Chrome sin errores fuera de incógnito,
cero caches PWA y recorridos de sesión sintéticos. Lint global conserva deuda
heredada (178 errores), sin nuevas infracciones de esa fase.

En este control: 18 comparaciones completadas, cero pageerrors, cero submits,
ninguna conexión a Supabase real; imagen externa preexistente SVGRepo bloqueada.
TypeScript sin emisión PASS, lint focal de los dos helpers PASS, cinco contratos
PWA PASS y diff-check PASS. No se repitió el build completo porque no se cambió
código runtime en este control; su PASS corresponde a la implementación anterior.
Las advertencias de Node sobre type stripping/ES modules no son fallos de tests.

Se detuvieron únicamente los tres procesos locales de esta QA. Se restauraron
los ajustes autogenerados por Next en `tsconfig.json`/`next-env.d.ts`, conservando
el `next-env.d.ts` modificado que ya existía. Verificación final SHA-256: los 62
archivos de `apps/web` presentes en el checkpoint siguen idénticos byte a byte;
los 1.951 archivos de la copia privada siguen íntegros. `tsconfig.json` sin diff.

El patch de shell admite
`git apply --reverse --check`, comprobado **sin aplicarlo**.

No se considera un PASS visual por el solo hecho de que build/overflow pasen.

## 6. Reversibilidad individual

1. **Safe areas**: revertir juntos import de `pwa.css`, viewportFit y las dos
   declaraciones de navbar. No retirar sólo el padding del header dejando
   la barra sin su fallback anterior. Mantener manifest/íconos si se desea.
2. **Startup images iOS**: retirar únicamente startupImage del layout y la ruta/
   catálogo de aperturas; el OS conserva su fallback. No tocar loaders deportivos.
3. **Instalabilidad**: retirar manifest/metadata instalable y sus referencias de
   íconos derivados. Conservar los PNG originales de SELPA y la web normal.
4. **Pruebas/documentación**: pueden retirarse sin cambiar la app; conservar antes
   las evidencias necesarias para revisión.
5. **Fase 1 completa**: los hunks de `pwa-shell-only.patch` revierten sólo los dos
   archivos existentes; luego retirar exclusivamente los archivos nuevos PWA que
   no hayan recibido cambios posteriores. El patch solo NO elimina rutas nuevas.

Antes de cualquier reversión futura: revisar diff nuevo, guardar checkpoint,
comprobar hashes y `--reverse --check`; si no coincide, detenerse y adaptar los
hunks. No usar reset/checkout global, no restaurar todo el snapshot sobre el repo,
no borrar untracked ajenos ni modificar stashes. No se ejecutó una reversión ahora.

**Próximo punto de control: revisión del usuario. No se inicia Fase 2.**
