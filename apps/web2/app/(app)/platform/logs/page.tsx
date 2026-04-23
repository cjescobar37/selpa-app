import PlatformModuleShell from '@/components/platform/PlatformModuleShell'

export default function PlatformLogsPage() {
  return (
    <PlatformModuleShell title="Logs" subtitle="Auditoría técnica y trazabilidad de acciones críticas." aside={<div className="px-platformCard"><div className="px-sectionTitle">Eventos a registrar</div><div className="px-platformChecklist"><div>Aprobaciones de clubes y usuarios.</div><div>Cambios de estado de clubes.</div><div>Altas y ediciones de noticias y campañas.</div></div></div>}>
      <div className="px-contentList"><article className="px-contentItem"><div className="px-contentItemTitle">Auditoría lista para crecer</div><div style={{ color:'rgba(23,37,63,.7)' }}>Falta conectar la fuente real de eventos, pero la vista ya no queda vacía.</div></article></div>
    </PlatformModuleShell>
  )
}
