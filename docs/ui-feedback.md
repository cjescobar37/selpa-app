# Feedback de acciones SELPA

Todo feedback transitorio resultado de una acción debe mostrarse como toast flotante visible en viewport. Los estados persistentes permanecen inline.

Usar `toast.success`, `toast.error`, `toast.warning` y `toast.info` de `apps/web/lib/toastStore.ts`. El único viewport está en AppShellClient, fuera del contenido desplazable mediante portal. No agregar banners, timers por pantalla ni nuevas librerías. ActionFeedbackNotice es un puente de compatibilidad hacia ese mismo store, no otro sistema visual.

Success: verde/check, 4.5 segundos. Info: celeste, 5 segundos. Warning: ámbar, 7 segundos. Error: rojo, cierre manual por defecto. Hasta tres visibles, con prioridad para errores; el resto queda en cola. El tiempo comienza al mostrarse, no mientras espera en cola.

Los mensajes no roban foco. Success/info/warning usan live-region polite; error assertive. Cierre de 44px, gutters mobile de 12px, ancho máximo 440px en desktop, safe-area y ubicación bajo navbar. Respetar reduced motion.

Usar mensajes humanos; los códigos backend y JSON no se muestran en el toast. Traducir errores conocidos en el flujo y mantener diagnósticos técnicos sólo en logs seguros.

Mantener inline: blockers, campos inválidos que requieren corrección, estados, reglas, empty states y errores persistentes de carga. Una acción no debe duplicar su confirmación en banner y toast. Un resumen persistente con próximos pasos no es una confirmación transitoria.

Ejemplo seed: título “Seed generado correctamente”, mensaje “19 parejas quedaron ordenadas.” No volver a insertar un banner arriba del documento.

## Archivos de esta unificación

- Infraestructura: `apps/web/lib/toastStore.ts`, `components/ui/ToastViewport.tsx`, `components/ui/ToastViewport.module.css`, `components/ui/ActionFeedbackNotice.tsx` y `components/AppShellClient.tsx` (paths de componentes relativos a apps/web).
- Torneos: `apps/web/app/(app)/club/torneos/nuevo/page.tsx`, `torneos/[id]/page.tsx`, `torneos/[id]/editar/page.tsx`. Crear/editar/publicar, configuración, parejas e inscripciones, seed/grupos/playoff, resultados y finalización usan el viewport común. Los dos últimos paths son relativos al mismo directorio club.
- Competition: `apps/web/app/(app)/club/competition/EventTournamentConfiguration.tsx`, `SeriesEventsAdmin.tsx`, `SeriesDraftEditor.tsx`, `EventOperationsDashboard.tsx`, `CompetitionDivisionsAdmin.tsx`, `SeriesCreateWizard.tsx`, `EventHomologationAdmin.tsx`, `EventSettlementPanel.tsx`. Los archivos adicionales son relativos al mismo directorio competition.
- Consumidores de ActionFeedbackNotice que ahora comparten el viewport sin editar sus acciones: CompetitionAdmin, PointsSchemesAdmin y SeriesPrizesPanel, además de los anteriores.
- Tests: `apps/web/lib/toastStore.test.ts` y `mobile-review/event-polish-qa.mjs` (`QA_SEEDS=1`, `QA_TOASTS=1`). Todas las APIs, autenticación y sockets se interceptan en QA; no se generan seeds reales.
- Regla permanente enlazada desde `docs/product-blueprint.md`.
