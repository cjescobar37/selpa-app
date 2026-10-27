# SELPA — Cierre PLAYER y preparación funcional · 27/10/2026

Cambios locales sobre `8e0b9c83733f4c74ee2e9dd681440f4f69415f05`, en `D:/SELPA/output/pwa-universal-preview-20261015`, rama `codex/selpa-mobile-experience-20261025`. Aplicación canónica: `apps/web`.

## Resultado de experiencia

- Agenda: conserva Próximos, Pendientes e Historial. Cards compactas con fecha destacada, logo, acentos del organizador, flyer manual real cuando existe, categoría/rama/modalidad y badge superior derecho con espacio reservado. Toda la card abre el detalle. Historial toma protagonismo cuando no hay próximos ni pendientes; pago e inscripción siguen siendo conceptos separados.
- Inicio: un único contenedor compartido prolonga el selector mediante trazos de 2 px. Mi espacio usa el club; Comunidad usa cyan/magenta propios. Los trazos no capturan eventos ni cambian el layout. Solo se anima brevemente el conector superior; reduced-motion desactiva la animación.
- Menú: identidad → Perfil; después Mi cuenta, Mi actividad, Mis pagos y Cerrar sesión separado. Pareja/invitaciones siguen accesibles desde Inicio y Mi cuenta. Barra inferior aprobada: Inicio, Torneos, Mi ranking, Perfil con avatar. Mensajes y Notificaciones permanecen arriba.
- Editores: encabezado compacto y Volver contextual con fallback seguro a Mi cuenta; una columna en 320 px y dos cuando hay espacio, sin forzar tres en móvil. Guardar y Salir de edición están diferenciados. Se advierten cambios pendientes al usar enlaces, salida, Back del navegador y beforeunload. Red/servidor fallidos conservan la entrada. El resultado se muestra dentro del formulario para no tapar Volver. Se mantienen restricciones de género/nacimiento y entradas existentes de avatar/portada.
- Recorridos secundarios: regreso en Mi cuenta, actividad, preferencias, mensajes y notificaciones; seguridad devuelve al contexto autenticado. No se agregaron botones Atrás a las cuatro pestañas principales. Perfil social y ranking público conservan su composición aprobada; Carrera solo añade el retorno contextual del editor.

## Fechas: evidencia y límite de la comprobación

Se inspeccionó la respuesta pública existente de la app, el mapeo de DTO y los metadatos de columnas DATE. No se ejecutó SQL compartido para volver a leer filas ni se cambió ninguna fecha almacenada.

| Torneo | DTO actual | Render civil correcto | Resultado de interpretar medianoche UTC en Argentina |
|---|---|---|---|
| Torneo Invernal Premium | 2026-07-10 | 10/07 | 09/07 |
| Mv | 2026-08-15 | 15/08 | 14/08 |
| Nuevo Torneo Full | 2026-10-10 | 10/10 | 09/10 |
| FINAL MASTER | 2026-10-17 | 17/10 | 16/10 |

El DTO toma `starts_on ?? start_date` sin sumar días. El patrón UTC reproduce exactamente el día anterior visto en las capturas. El helper nuevo distingue fechas civiles de instantes con zona y prueba cruces de mes/año. Mi actividad también usaba medianoche UTC: ahora comparte el helper y su texto visible se comprueba contra la agenda en los seis anchos. Esto explica la discrepancia reproducible; no demuestra por sí solo cómo estaban las filas en la fecha de cada captura histórica.

## QA técnica y visual

| Comprobación | Resultado |
|---|---|
| TypeScript sin emisión ni incremental | PASS |
| Build Next.js webpack | PASS; un intento previo falló por EPERM del sandbox en una ruta generada, y se completó al permitir el build local |
| Contratos relevantes completos seleccionados por dominio | 36 archivos, 531 pruebas PASS, cero fallos/omitidos |
| PWA | Contratos de instalación/apertura/service worker incluidos; navegación y safe-area standalone simulados |
| Fechas | 8 contratos PASS en UTC, Argentina y Los Ángeles |
| Lint focal de 28 archivos TS/TSX/MJS | 9 errores y 16 warnings heredados; cero problemas nuevos respecto de HEAD base |
| Navegador | 123 comprobaciones PASS, cero errores de runtime en los recorridos ensayados. Ver informes adjuntos: Inicio/Comunidad, menú, agenda, ranking, editores, errores/reintentos, roles y rutas secundarias |
| Viewports | 320, 375, 390, 430, 768 y 1280 px |
| Revisión visual | Cards/estados, flyer, marco, menú, cuenta, editores y recorridos secundarios; sin overflow horizontal en los recorridos ensayados |

Los nueve errores de lint ya estaban en Datos personales/deportivos (8) y Notificaciones (1). No se amplió el alcance para refactorizar efectos/refs heredados. Dos contratos obsoletos de navegación/perfil y la expectativa duplicada de Mis pagos se actualizaron a los mecanismos aprobados actuales; las pruebas de lectura/reintento mantienen cobertura del comportamiento.

Las capturas con datos QA son dobles locales, claramente identificados. La imagen del slot de flyer es un asset de prueba; demuestra la composición del flyer sin atribuirla a un torneo real. Las escrituras de API/REST en navegador fueron interceptadas. No se editaron datos personales reales, ni se crearon cobros, movimientos o saldos en el proyecto compartido. El ensayo financiero conserva sus tablas vacías; el ensayo deportivo usa datos sintéticos exclusivamente en memoria.

El popup de instalación esperado se descartó mediante su botón Ahora no en la automatización para permitir recorrer el resto; no se modificó la PWA para evitarlo. El safe-area de Chromium es una simulación. El botón circular N visible en algunas capturas pertenece a las herramientas de desarrollo de Next.

## Evidencia

- [Índice de capturas antes/después](CAPTURES.md).
- [Archivos incluidos](FILES.md).
- [QA resumida y reportes reproducibles](evidence/qa-summary.json).
- [Ensayo deportivo](evidence/sports-rehearsal.json).
- [Ensayo financiero](evidence/finance-rehearsal.json).
- Logs completos y scripts de navegador: `D:/SELPA/output/player-close-20261027`.
- Los scripts de ensayo aislado se incluyen en `apps/web/scripts/qa/player-close-*-rehearsal.mjs`; no cargan .env ni acceden a red.

## Habilitaciones separadas: siguen pendientes

[Plan deportivo y SQL exacto](SPORTS-ENABLEMENT.md): diez vistas y dos RPC; migraciones originales preservadas, orden/dependencias/grants/privacidad revisados, ensayo tipado, rollback y restauración con hash idéntico. No cambia partidos, homologaciones, ledger ni reglas de ascenso. La ausencia de esos objetos se confirmó en la auditoría anterior y las migraciones siguen sin aparecer en el historial; esta pasada no ejecutó SQL compartido.

[Plan financiero](FINANCE-ENABLEMENT.md): F1A–F1F y F2 constan instalados en el historial. Los logs reales registran 503/PGRST202 para `get_player_finance_overview_f1d`. Falta autorizar el preflight para separar objeto ausente, firma, ACL y caché. Se prepara un candidato condicional de lectura F1C/F1D, sin reinstalar la cadena completa. F2 sigue separado. Mercado Pago local permanece deshabilitado; no se probó ni habilitó un cobro.

Los fixtures no certifican lecturas deportivas/financieras reales. También queda pendiente revisar el rechazo STAFF en acceso directo F1D antes de certificar su separación completa. El SQL de catálogos y todos los cambios compartidos requieren autorización específica posterior.

## Preservación y entrega

La URL sigue siendo [http://10.4.21.30:3000/](http://10.4.21.30:3000/). Se conserva la instancia Next existente; no se lanzó un servidor alternativo. Se prepara un único commit local de esta tarea, sin push ni deployment. main, Production, dominios, Supabase y las migraciones originales permanecen sin cambios por esta tarea.

Se excluyen `Start-SELPA.ps1` y los tres documentos preexistentes sin seguimiento. Hash SHA256 del launcher preservado: `A7C425DBDD0529CCB73DEBABBA49304748B1D6B6459240EFEE724ADE990B3D50`.

**Pendiente expresamente:** validación física del usuario en iPhone/PWA instalada, incluidas fotos, portada, guardado real autorizado, teclado, navegación, colores y safe-area. Las pruebas locales no certifican esas funciones en el dispositivo.
