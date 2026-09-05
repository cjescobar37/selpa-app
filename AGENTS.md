# AGENTS.md

## Contexto del proyecto

Este proyecto es SELPA, una plataforma para gestión de clubes, jugadores, rankings y torneos de pádel.

Stack principal:

- Next.js
- TypeScript
- Supabase
- Tailwind CSS
- Vercel

La app canónica para desarrollo es:

`apps/web`

Las carpetas `apps/web2` y `apps/web3` son copias paralelas/no canónicas.

No usarlas como base para cambios nuevos salvo que el usuario pida explícitamente comparar o migrar contenido desde ellas.

La fuente de verdad del esquema de base de datos es:

`supabase_full.sql`

El resumen operativo del esquema está en:

`docs/schema-summary.md`


# 1. REGLAS GENERALES DE TRABAJO

Antes de tocar código de la app, confirmar que el cambio se aplica en:

`apps/web`

No modificar otras aplicaciones o copias del proyecto salvo pedido explícito.

No hacer refactors amplios, migraciones, cambios arquitectónicos o modificaciones no relacionadas con la tarea sin necesidad real.

Preservar funcionalidades existentes que no formen parte del pedido.

No considerar una pantalla terminada solamente porque compile o pase tests.

La calidad visual, UX mobile y coherencia con SELPA son requisitos funcionales del producto.


# 2. BASE DE DATOS Y SUPABASE

Antes de tocar código relacionado con cualquiera de estas áreas o tablas, primero revisar:

- `supabase_full.sql`
- `docs/schema-summary.md`

Áreas/tablas sensibles:

- `auth`
- `profiles`
- `clubs`
- `club_memberships`
- `club_players`
- `club_player_private`
- `club_requests`
- `user_settings`
- `tournaments`
- `tournament_teams`
- `tournament_registrations`
- `platform_admins`
- `platform_news`
- `platform_sponsors`
- `platform_ad_campaigns`
- `messages`
- `notifications`
- `categories`
- `club_categories`
- `user_roles`

No asumir estructura de Supabase sin revisar esos archivos.

Priorizar el schema `public` como modelo de negocio de SELPA y distinguirlo de los schemas internos de Supabase:

- `auth`
- `storage`
- `realtime`
- `extensions`
- etc.

Si se detectan diferencias entre código, dump y documentación, advertirlo antes de modificar lógica sensible.

Prestar especial atención a:

- duplicaciones legacy;
- triggers redundantes;
- problemas de RLS;
- campos duplicados;
- estructuras que convendría unificar.

No modificar schema, RLS, triggers o datos reales como efecto secundario de una tarea visual.


# 3. PRINCIPIO CENTRAL DE UX

SELPA debe sentirse especialmente buena en un teléfono.

La experiencia mobile es prioridad de producto, no una adaptación secundaria del desktop.

Usar SELPA desde un teléfono debe sentirse:

- simple;
- rápido;
- intuitivo;
- compacto;
- cómodo;
- claro;
- liviano;
- predecible.

El objetivo es que tareas potencialmente complejas se sientan fáciles.

El usuario nunca debe tener que pelearse con la interfaz.

Una pantalla técnicamente correcta puede ser UX incorrecta.

Si una implementación funciona pero resulta incómoda, grande, confusa, lenta de recorrer o poco natural en mobile, NO está terminada.


# 4. MOBILE-FIRST OBLIGATORIO

Todo cambio visual o funcional debe pensarse primero para mobile.

Viewport principal de referencia:

- 390 px

También validar como mínimo:

- 320 px
- 375 px
- 430 px

Después adaptar correctamente a:

- tablet;
- desktop.

No degradar desktop para solucionar mobile.

Pero tampoco conservar una estructura desktop cuando esa estructura perjudica la experiencia mobile.


# 5. MOBILE NO ES DESKTOP APILADO

Está prohibido considerar una interfaz mobile resuelta simplemente mediante:

- `width: 100%`;
- `flex-direction: column`;
- apilar componentes desktop;
- reducir ligeramente fuentes;
- esconder overflow.

Cuando una interacción lo requiera, diseñar específicamente para mobile.

Considerar patrones como:

- bottom sheets;
- sticky action bars;
- accordions;
- disclosures;
- drawers;
- menús contextuales;
- segmented controls;
- wizards;
- edición progresiva;
- cards administrativas compactas.

La interacción puede y debe cambiar entre desktop y mobile cuando eso mejore claramente la experiencia.


# 6. DENSIDAD VISUAL

SELPA debe tener alta densidad útil sin sentirse apretada.

Evitar sistemáticamente:

- cards gigantes;
- heroes innecesariamente altos;
- tipografía excesivamente grande;
- botones XXL;
- inputs sobredimensionados;
- paddings excesivos;
- márgenes excesivos;
- espacios muertos;
- secciones que ocupan una pantalla completa sin necesidad;
- cards dentro de cards dentro de cards;
- información repetida;
- bloques decorativos que empujan contenido importante hacia abajo.

Antes de aumentar el tamaño de algo, preguntarse si realmente mejora comprensión o interacción.

No usar tamaño como sustituto de jerarquía.


# 7. GUÍAS DE TAMAÑO MOBILE

Estas medidas son referencias, no valores rígidos.

Preferir aproximadamente:

- margen lateral: 14–16 px;
- gap normal: 8–14 px;
- controles táctiles: mínimo 44 px;
- inputs: normalmente 44–52 px;
- botones principales: normalmente 46–52 px;
- títulos principales: normalmente 24–30 px;
- títulos de sección: normalmente 18–22 px;
- texto normal: normalmente 14–16 px.

Evitar títulos de 36–48 px en interfaces administrativas mobile salvo que exista una razón excepcional.

Evitar inputs de 60–80 px cuando un control más compacto sea igualmente usable.

No reducir áreas táctiles por debajo de niveles cómodos solamente para ganar espacio.


# 8. TIPOGRAFÍA

La tipografía debe tener jerarquía sin sentirse pesada.

Evitar:

- exceso de bold;
- demasiados textos con font-weight 700/800;
- títulos enormes;
- múltiples niveles compitiendo visualmente.

Preferir una jerarquía basada en:

- tamaño;
- peso;
- contraste;
- espaciado;
- posición.

La interfaz administrativa debe sentirse moderna, limpia y eficiente.


# 9. PRIMER VIEWPORT

El primer viewport de cada pantalla es especialmente importante.

En pocos segundos el usuario debe comprender:

1. dónde está;
2. qué información importa;
3. cuál es la acción principal;
4. qué puede hacer después.

No desperdiciar el primer viewport con:

- encabezados gigantes;
- métricas innecesarias;
- banners decorativos;
- espacios vacíos;
- títulos repetidos;
- introducciones largas.

Priorizar contenido y acciones reales.


# 10. JERARQUÍA DE ACCIONES

Cada pantalla debe tener una acción principal evidente.

Evitar varios botones grandes compitiendo entre sí.

Cuando existan múltiples acciones, clasificarlas como:

- primaria;
- secundaria;
- contextual;
- destructiva.

Preferir para acciones secundarias:

- botones discretos;
- links;
- menú contextual;
- menú `⋮`;
- acciones dentro de una sección apropiada.

No colocar cuatro o cinco CTAs grandes consecutivos si pueden organizarse mejor.


# 11. BARRAS STICKY Y SAFE AREA

Las acciones principales de formularios o wizards pueden utilizar barras inferiores persistentes cuando sea útil.

Deben:

- respetar `safe-area`;
- no tapar contenido;
- no competir con otros controles flotantes;
- funcionar correctamente con Safari iOS;
- permanecer accesibles con teclado virtual cuando corresponda.

Siempre dejar padding inferior suficiente en el contenido cuando exista una barra fixed/sticky.


# 12. FORMULARIOS

Los formularios largos deben dividirse en tareas manejables.

Preferir:

- pasos;
- agrupaciones lógicas;
- progressive disclosure;
- valores predeterminados razonables;
- campos condicionales;
- configuraciones avanzadas ocultas hasta ser necesarias.

No mostrar veinte controles simultáneamente si el usuario solamente necesita cuatro para continuar.

Las configuraciones opcionales deben identificarse claramente como opcionales.


# 13. EDICIÓN DE WIZARDS

Cuando un wizard tenga una pantalla final de revisión y permita editar pasos anteriores, seguir este patrón:

`Revisión -> Editar -> modificar -> Guardar -> volver a Revisión`

También debe existir:

`Cancelar/Volver -> volver a Revisión sin obligar a recorrer los pasos siguientes`

No obligar al usuario a presionar:

`Siguiente -> Siguiente -> Siguiente`

para regresar al punto desde donde inició la edición.

Mantener el contexto de origen de la edición.


# 14. AUTOGUARDADO Y RECUPERACIÓN

En procesos largos como creación o edición de torneos, priorizar protección contra pérdida accidental de trabajo.

Cuando sea técnicamente razonable implementar:

- persistencia del estado del wizard;
- recuperación después de navegación accidental;
- recuperación después de refresh;
- recuperación después de cierre inesperado.

No generar registros reales en base de datos solamente para implementar autoguardado salvo que el modelo funcional lo requiera.

Preferir almacenamiento temporal/local cuando corresponda y sea seguro.

Distinguir claramente entre:

- borrador local;
- borrador persistido;
- torneo creado.


# 15. LISTADOS ADMINISTRATIVOS

Las áreas administrativas deben priorizar eficiencia y escaneabilidad.

El usuario debe poder ver varios elementos rápidamente.

Evitar cards enormes para:

- torneos;
- jugadores;
- solicitudes;
- pagos;
- noticias;
- sponsors;
- clubes.

Una imagen o flyer puede ayudar a identificar un elemento, pero no debe dominar el listado.

Para torneos, priorizar información como:

- nombre;
- estado;
- fecha;
- categoría;
- género;
- inscriptos/cupos;
- acción principal.

El flyer debe funcionar como apoyo visual, no necesariamente como protagonista.

Cuando haya muchos elementos, pensar primero en densidad y comparación rápida.


# 16. FLYERS Y PREVIEWS

Los previews deben ayudar a editar, no dificultar la edición.

En mobile evitar:

- preview enorme;
- repetir el mismo preview varias veces;
- obligar a hacer scroll continuamente entre preview y controles.

Cuando exista edición visual considerar:

- preview sticky compacto;
- preview colapsable;
- mini-preview persistente;
- bottom sheet;
- tabs entre preview y controles;
- controles agrupados progresivamente.

El usuario debería poder modificar:

- colores;
- tipografías;
- fondo;
- datos visibles;
- estilo;

y observar rápidamente el resultado.

No mostrar dos previews idénticos simultáneamente sin una razón funcional.


# 17. SELECTS Y CONTROLES NATIVOS

Prestar especial atención a Safari/iOS.

Validar:

- selects;
- date inputs;
- time inputs;
- color inputs;
- teclado virtual;
- focus;
- zoom automático.

Los inputs de texto que puedan provocar auto-zoom en iOS deben utilizar un tamaño de fuente adecuado, normalmente >=16 px.

No utilizar:

`user-scalable=no`

para ocultar problemas de responsive o zoom.


# 18. COMPLEJOS, SEDES Y CANCHAS

El modelo de UX debe contemplar que un torneo pueda utilizar instalaciones de más de un complejo cuando el modelo de negocio lo permita.

Un club organizador puede necesitar:

- su propio complejo;
- otro complejo registrado en SELPA;
- determinadas canchas de ese complejo.

La interfaz debe diferenciar claramente:

- complejo;
- cancha;
- club organizador;
- club/complejo externo seleccionado.

No asumir que todas las canchas pertenecen al club organizador.

Antes de implementar lógica relacionada con esto, verificar que el schema actual soporte correctamente esas relaciones.

Si no las soporta, informar la limitación antes de inventar una solución de frontend.


# 19. MENÚS Y NAVEGACIÓN MOBILE

Los menús deben permanecer completamente utilizables después del login.

Validar especialmente diferencias entre:

- visitante;
- jugador autenticado;
- Club Admin;
- Platform Admin.

Un cambio de rol o autenticación no debe provocar:

- zoom visual;
- ancho mayor al viewport;
- recortes;
- navegación horizontal accidental;
- elementos fuera de pantalla;
- headers sobredimensionados.

No esconder un problema de layout mediante `overflow-x: hidden` sin encontrar primero la causa real.


# 20. CONSISTENCIA VISUAL

SELPA debe mantener una identidad visual coherente.

Evitar que cada pantalla parezca pertenecer a una aplicación distinta.

Mantener coherencia en:

- radios;
- bordes;
- sombras;
- espaciados;
- inputs;
- botones;
- títulos;
- estados;
- badges;
- cards;
- barras sticky.

Usar los tokens y componentes existentes cuando sean adecuados.

Evitar CSS global para solucionar problemas locales.

Preferir cambios por componente.


# 21. REFERENCIAS DE CALIDAD

La referencia conceptual de SELPA son productos digitales maduros y simples.

Tomar inspiración de aplicaciones y productos como:

- Mercado Pago;
- Airbnb;
- Stripe;
- Linear;
- Notion.

NO copiar branding, layouts o colores.

Sí estudiar principios como:

- claridad;
- densidad;
- jerarquía;
- progressive disclosure;
- feedback inmediato;
- navegación predecible;
- reducción de esfuerzo;
- calidad de interacción mobile.


# 22. QA TÉCNICA

Antes de declarar terminado un cambio relevante, validar según corresponda:

- TypeScript;
- ESLint;
- build;
- `git diff --check`;
- errores de runtime;
- rutas afectadas;
- ausencia de 404/500;
- overflow horizontal;
- persistencia de estado;
- comportamiento de navegación;
- viewport mobile.

No crear datos reales durante QA salvo autorización o necesidad explícita.

Preferir mocks, navegación sin submit o mecanismos seguros cuando sea posible.


# 23. QA UX

QA técnica y QA UX son cosas diferentes.

Después de QA técnica realizar una revisión visual real.

Preguntarse:

1. ¿Se entiende la pantalla en cinco segundos?
2. ¿La acción principal es evidente?
3. ¿Hay algo innecesariamente grande?
4. ¿Hay demasiado espacio vacío?
5. ¿Hay demasiado scroll?
6. ¿Hay acciones desparramadas?
7. ¿La tipografía es demasiado pesada?
8. ¿Los controles tienen dimensiones razonables?
9. ¿Se puede utilizar cómodamente con una mano?
10. ¿Parece una app mobile madura?
11. ¿Hay información repetida?
12. ¿Puede completarse la tarea con menos esfuerzo?
13. ¿Existe alguna configuración que debería permanecer oculta hasta ser necesaria?
14. ¿El primer viewport está bien aprovechado?
15. ¿La pantalla se siente mejor que antes?

Si alguna respuesta importante es negativa, continuar refinando.

No declarar PASS solamente porque no existe overflow.


# 24. REGRESIONES

No aceptar regresiones de UX.

Si una pantalla o componente ya fue optimizado para mobile, preservar esa mejora.

No volver accidentalmente a:

- cards gigantes;
- heroes altos;
- formularios completos abiertos;
- tipografía excesiva;
- botones desordenados;
- espacios muertos;
- scroll innecesario;
- layouts desktop apilados.

Antes de modificar un componente existente, entender qué decisiones visuales ya fueron aprobadas.


# 25. CAMBIOS RESPONSIVE

Cuando se modifica una pantalla por problemas mobile:

- preservar desktop si ya funciona correctamente;
- evitar cambios globales innecesarios;
- utilizar breakpoints de forma consciente;
- verificar que el arreglo mobile no genere regresiones en tablet o desktop.

Cuando mobile y desktop necesiten estructuras diferentes, está permitido utilizar composiciones diferentes si eso produce mejor UX y el mantenimiento sigue siendo razonable.


# 26. ACCESIBILIDAD

Mantener:

- targets táctiles cómodos;
- contraste suficiente;
- focus visible;
- labels;
- semántica apropiada;
- navegación por teclado donde corresponda.

No sacrificar accesibilidad para ganar algunos píxeles.


# 27. CRITERIO DE FINALIZACIÓN

Una tarea visual NO está terminada cuando:

- compila;
- el build pasa;
- no hay overflow.

Está terminada cuando además:

- la jerarquía es correcta;
- el tamaño es correcto;
- la densidad es correcta;
- las acciones están correctamente ubicadas;
- mobile resulta cómodo;
- desktop no presenta regresiones;
- no hay complejidad innecesaria;
- la experiencia se siente coherente con SELPA.

La pregunta final debe ser:

> ¿Esta solución reduce el esfuerzo del usuario?

Si no lo hace, seguir trabajando.


# 28. DISCIPLINA DE CAMBIOS

No tocar archivos no relacionados con la tarea.

No incluir cambios locales preexistentes ajenos.

No alterar stashes existentes.

No borrar trabajo previo del usuario.

Antes de operaciones Git potencialmente destructivas, verificar el estado del repositorio.

No usar:

- `git reset --hard`
- `git clean -fd`
- operaciones equivalentes destructivas

salvo autorización explícita.


# 29. COMMIT, PUSH Y DEPLOYMENT

No hacer commit, push, merge o deployment salvo que la tarea lo solicite explícitamente.

Si se solicita trabajar en una rama Preview:

- respetar esa rama;
- no modificar `main`;
- no desplegar Production;
- informar claramente rama, commit y entorno desplegado.

No asumir que autorización para modificar código implica autorización para desplegar Production.


# 30. TAREAS DE DOCUMENTACIÓN

Cuando la tarea indique documentación solamente:

- no modificar código;
- no modificar base de datos;
- no modificar configuración;
- no hacer refactors.

Limitar el cambio a la documentación solicitada.


# 31. REPORTE FINAL DE CODEX

Al finalizar una tarea relevante informar de forma concreta:

- archivos modificados;
- qué se cambió;
- qué problema resuelve;
- validaciones realizadas;
- resultado de QA técnica;
- resultado de QA UX;
- cualquier limitación pendiente;
- si se crearon datos durante QA;
- estado de Git;
- si hubo commit;
- si hubo push;
- si hubo deployment.

No afirmar "sin problemas reales" solamente porque las pruebas automáticas pasaron.

Si visualmente existe una deficiencia, reportarla.


# 32. PRINCIPIO FINAL

SELPA no debe sentirse como un panel administrativo desktop reducido para entrar en un teléfono.

Debe sentirse como un producto diseñado deliberadamente para mobile.

Cada cambio debe buscar:

menos esfuerzo,
menos ruido,
menos pasos,
menos scroll innecesario,

y al mismo tiempo:

más claridad,
más velocidad,
más control,
más confianza.

La experiencia mobile debe ser un alivio para el usuario, no una tarea adicional.