# SELPA — fix puntual de hidratación de la home

2026-10-15 · rama aislada `codex/pwa-universal-preview-20261015`.
Base del fix: `7f555ee740305d9c5e3b732ad3c9ddcdb5ae84ee` (paquete PWA publicado).
Commit local separado preparado para revisión. **No push ni deployment.**

## Causa confirmada y nodo exacto

Recorrido: datos públicos → HTML SSR de Next production → hidratación Chrome.
Se capturó HTML con JS del navegador deshabilitado sólo para inspeccionar SSR;
la aplicación conserva SSR y no cambia su forma de renderizar.

En la Preview publicada, el primer nodo divergente es:

`article.TournamentPublicCard .TournamentPublicCard__agendaDates small`

```html
<!-- Servidor UTC, antes -->
<small>Cierra el <!-- -->15/10/2026 a las 19:57</small>
<!-- Cliente America/Argentina/Buenos_Aires, antes -->
<small>Cierra el 15/10/2026 a las 16:57</small>
```

`TournamentPublicCard.formatAgendaDeadline` usaba getHours/getDate/getMonth sobre
un timestamp sin fijar zona de presentación. UTC y Buenos Aires discrepaban tres
horas; React descartaba el árbol SSR con #418. En UTC no había error. Ambas
funciones implicadas ya existían sin cambios en `2fb0628`; no nacieron con PWA.

### Hipótesis de noticias

Las cuatro fechas de noticias actualmente publicadas coinciden entre SSR/cliente:
no eran la causa observada en ese payload. La hipótesis sí identifica otro caso
real del mismo defecto: con `published_at = 2026-04-16T01:30:00Z`,
`.px-homeNewsDateChip` mostraba día 16 en SSR UTC y día 15 en Buenos Aires.
El fixture de borde reproduce ambas diferencias y #418 en un build de producción.

Evidencia antes: `apps/web/.next/hydration-qa-20261015/live-before.json`,
`before.json` y `edge-before.json`. Son capturas/fixtures, no escrituras de datos.

## Semántica y cambio mínimo

El dump local establece:

- `platform_news.published_at/updated_at`: timestamp with time zone, instantes.
- `tournaments.registration_deadline/signup_deadline`: timestamp with time zone.
- `tournaments.starts_on/ends_on/start_date/end_date`: date, días calendario.

La home legacy ya sigue la convención argentina de `tournamentDisplayStatus`:
datetimes sin offset representan hora argentina. Se conserva esa regla de legado
(-03:00), sin cambiar estados deportivos, vencimientos o datos almacenados.

Presentación de instantes con zona IANA explícita `America/Argentina/Buenos_Aires`
en servidor y cliente. No se elige UTC sólo para ocultar el mismatch: se conserva
la hora que veía el usuario argentino tras hidratar (16:57).

Una fecha calendario conserva su YYYY-MM-DD. UTC/noon sólo sirve como ancla
interna de formato, no como instante del negocio; no se muestra una hora inventada.
Un cierre legado que sólo contiene fecha ahora muestra `17 de oct`, sin el 12:00
artificial del parser previo. Valores inválidos/no soportados usan placeholders,
sin parseo dependiente del idioma del dispositivo.

Fuentes técnicas: [parseo de fechas e instantes](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/parse),
[zona explícita de Intl](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat).

Archivos del cambio:

1. `apps/web/lib/publicHomeDatePresentation.ts`: helper puro de presentación.
2. `apps/web/components/public/PublicHomeExperience.tsx`: importar helper; retirar
   función local no determinista. Ningún cambio de JSX/CSS.
3. `apps/web/components/public/TournamentPublicCard.tsx`: igual para el cierre.
4. `apps/web/lib/publicHomeDatePresentation.test.ts`: seis tests de regresión.
5. Este informe. Los artefactos QA/visor son locales ignorados, no código runtime.

Sin suppressHydrationWarning, client-only workaround, efecto para formatear fechas,
desactivación SSR, cambios de diseño, ranking, perfiles, pagos o esquema.
No se amplió la corrección a filtros de publicidad o estados de torneo.

## QA y evidencia visual

Producción local real, Next.js 16.1.4/webpack; servidor TZ UTC. Backend HTTP
sintético de sólo lectura en loopback: noticias/torneos/club ficticios. No DB,
SQL, claves reales ni autenticación. El único recorrido remoto fue lectura de la
Preview ya publicada para capturar el nodo original; no se publicó el fix.

| Check | Resultado |
| --- | --- |
| Build optimizado después | PASS, TypeScript integrado y 166 páginas generadas |
| TypeScript independiente sin emisión | PASS |
| Tests nuevos | 6/6 PASS: host UTC/Argentina/Tokyo, offsets, cruce de medianoche, calendario, legado y fallbacks |
| Contratos PWA existentes | 5/5 PASS |
| Producción SSR/cliente, noticia al mediodía | UTC y Buenos Aires sin diferencias HTML ni #418 después |
| Producción SSR/cliente, noticia cerca de medianoche | Igual, con fecha argentina correcta y cierre 16:57 |
| Viewports después | 320, 375, 390, 430, 768 y 1280 px en ambas zonas, sin overflow |
| Manifest e imágenes | Manifest byte idéntico; 26 referencias PNG idénticas por SHA-256 entre builds antes/después |
| Lint helper/test nuevos | PASS, cero errores/warnings |
| Lint componentes existentes | No PASS absoluto: mismos siete errores y ocho warnings heredados, cero regresiones |
| Diff-check | PASS |

Los siete errores de home son seis `no-explicit-any` y un `react-hooks/purity`
en Date.now del filtro publicitario, con mismos rule IDs y mismas líneas de
expresión que la base (cambia sólo su número de línea). No se desactivaron reglas
ni se hizo un refactor ajeno para conseguir un PASS. TournamentPublicCard sólo
conserva su warning previo de img. Evidencia: lint-before/after.json.

[Visor visual local](../apps/web/.next/hydration-qa-20261015/review.html).
Se inspeccionaron capturas renderizadas antes/después, principalmente 390 px.
Comparación del cliente Buenos Aires, mismo fixture de borde: **cero píxeles
distintos** a 390 y 1280 px. Se conserva composición, colores, fuentes y cards;
lo corregido es el HTML inicial del servidor. Las capturas JS-off sólo diagnostican
HTML SSR y no se usan para aprobar la composición visual.

Todos los JSON, PNGs y scripts de reproducción permanecen en
`apps/web/.next/hydration-qa-20261015/`, ignorados por Git. No son pruebas de
iPhone/Safari nativo. Manifest/safe areas/instalabilidad no se rediseñan; los
ocho archivos PWA conservan exactamente sus hashes originales.

## Entrega y límites

Patch exacto local: `apps/web/.next/hydration-qa-20261015/fix.patch`, obtenido del
commit separado. Reversión futura limitada a ese commit, sin revertir PWA ni
trabajo principal; no se ejecutó ahora.

Checkout principal, índice/stashes, main, remoto Preview y deployment Production
permanecen sin cambios. Costo $0, sin dependencias nuevas. La URL publicada sigue
sirviendo `7f555ee` y conserva el error hasta que se autorice un push posterior.
No Fase 2. **Detenido para revisión.**
