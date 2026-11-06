# SELPA — Ranking: ajuste a referencia directa · 05/11/2026

El usuario rechazó la composición apilada de 2.4 y aportó Ranking del club de padel.png como dirección visual concreta. Esta entrada sustituye la composición visual anterior; preserva su lógica deportiva, defaults y estado local. Implementación lista para revisión, no aprobación del usuario.

## Cambio aplicado

- Parejas en una única unidad horizontal: retrato/nombre izquierdo, bloque central con puesto y total oficial, nombre/retrato derecho. Fotos circulares en los extremos; nombres orientados hacia el centro. Total mostrado una sola vez, con unidad pts pareja. No se fabrican aportes individuales ni se afirma que el total es una suma de campos que el lector no ofrece.
- Top1 con borde/luz cian y acento cyan/magenta sutil; todas las cards claras, sin conservar la tarjeta navy gigante anterior. Top2–5 y clasificación comparten composición y jerarquía descendente.
- A320 los nombres excepcionalmente largos aprovechan todo el ancho de su mitad colocando el nombre debajo del retrato; sin recortar identidades ni partir innecesariamente las palabras del ejemplo. A390+ permanecen foto/nombre enfrentados. Iniciales y fotos fallidas conservan el fallback existente.
- Encabezado local de Ranking compacto: Ranking del club, club y Actualizar. Navbar/header global y bottom nav intactos. Actualizar recarga la URL actual, preservando filtros; Club Admin conserva una sola acción de refresco y su configuración de publicación.
- Segmentos redondos con iconos; chips compactos abreviados y categoría actual visible. Búsqueda siempre visible + Filtros para Año y Grupo/división. Esta nueva referencia reemplaza la fila siempre abierta de selects de 2.4; no elimina los filtros. Limpiar búsqueda navega mediante GET como el formulario, conservando contexto.
- Individual acompaña la familia clara: posición, retrato, nombre y puntos a derecha. Empates y posición propia sin recalcular. Defaults de 2.4, temporadas, visibilidad, APIs y contratos deportivos sin cambios.

## Pruebas ejecutadas en esta tarea

- 82/82 tests focales PASS; TypeScript PASS; ESLint de archivos modificados 0 errores/8 avisos previos de navbar. Build final PASS, 167/167 páginas. diff check PASS.
- Navegador real en rutas /ranking, /player/ranking/club y /club/ranking con mock PostgreSQL/Data API sintético local; además /preview/demo aislada, reutilizando el mismo componente para comparar los nombres/fotos QA ya existentes. No se agregaron fixtures ni datos nuevos de producto.
- Buscar Alejandro conserva su puesto19; Limpiar restaura Top5 y URL sin q. Actualizar preserva filtros. Filtros abre año/grupo; cambiar Libres→General muestra vacío y volver a Libres recupera ranking. Categorías desplazables, Damas con empate1/2/2, Mixto parejas y Mixto individual pendiente verificados.
- PLAYER mantiene default Damas7/Parejas/Libres y puede navegar explícitamente a Caballeros6/Parejas con posición propia. Club Admin mantiene configuración de publicación, inspeccionada sin tocar interruptores; se comprobó ausencia del botón duplicado de refresco. Los dashboards ajenos a Ranking no se certifican con este mock.
- QA responsive 320/375/390/430, tablet768 y desktop1280; sin overflow horizontal. Gutter8 y controles principales >=44px. Dos fotos QA del primer par cargadas, circulares y sin distorsión. Comprobación DOM de nombres respecto al bloque central: cero superposiciones en320.
- Medidas de parejas a390: #1 90px, #2–3 ~83px, #4–5 82px, clasificación ~70,9px. A320 normales90/82/82/70; dos nombres largos del Top2 ~105,8px y del puesto19 ~93,8px (crecimiento natural). Individual90/70/58px.
- Comparativa guest390×844/scroll0: 2.4 anterior3 parejas completas; nueva composición4. Individual pasa de4 a5. Con marcador propio o controles administrativos entran3 parejas: no se oculta información para inflar densidad. La demo agrega su aviso visible y no se usa su primer viewport para esa comparación. En capturas Top5 con scroll380 entran los cinco puestos y parte de clasificación.
- Capturas JPEG reales; Windows reserva15px para scrollbar vertical (viewport390/contenido375). No equivale a Safari/iPhone/PWA físico.

## Alcance y estado

Solo seis archivos de app:

- apps/web/components/public/PublicRankingExperience.tsx
- apps/web/components/public/PublicRankingExperience.module.css
- apps/web/components/ranking/RankingDiscovery.tsx
- apps/web/components/ranking/RankingDiscovery.module.css
- apps/web/components/ranking/RankingRetryButton.tsx
- apps/web/app/(app)/club/ranking/page.tsx

Documentación: este informe y docs/SELPA_CONTINUIDAD.md. Se conserva copia previa de cada archivo editado en el output de esta tarea. Cambios locales anteriores, SQL pendiente, stashes y backend preservados. Sin Supabase compartido, SQL, datos reales, cambios .env, commit, push, merge ni deployment.

Checkout D:/SELPA/output/selpa-full-integration-20261030, rama codex/club-admin-overnight-20261102, HEAD e8a110dc1bb7fc9f85c41169ea1971c2ae8dde71. ls-remote confirmó mismo SHA en GitHub durante esta tarea; primer intento dentro de sandbox falló por DNS y se verificó con lectura autorizada fuera de sandbox. Trabajo nuevo exclusivamente local. Build/servidores QA usan variables de proceso falsas de loopback; no se modificaron credenciales. Generados Next restaurados y servidores propios cerrados al terminar.

[Galería local](../output/ranking-reference-20261105-2szZsl/REVISION_VISUAL.html). En ese output ignorado por Git: baseline/copia previa, capturas, métricas, tests, TypeScript, lint y build. Las capturas no se sincronizan por Git automáticamente.

Pendientes: aprobación de esta composición por el usuario, validación física y autorización nueva para publicar. Mixto individual y contrato de aportes individuales fiables continúan pendientes; no se amplió SQL ni se cambiaron permisos.
