import PlatformModuleShell from '@/components/platform/PlatformModuleShell'

export default function PlatformReclamosPage() {
  return (
    <PlatformModuleShell title="Reclamos" subtitle="Soporte vinculado a pagos, membresías y operaciones sensibles." aside={<div className="px-platformCard"><div className="px-sectionTitle">Tipos</div><div className="px-platformChecklist"><div>Cobros mal imputados.</div><div>Errores de membresía.</div><div>Incidentes comerciales.</div></div></div>}>
      <div className="px-contentList"><article className="px-contentItem"><div className="px-contentItemTitle">Centro de soporte</div><div style={{ color:'rgba(23,37,63,.7)' }}>Vista administrativa preparada para conectar tickets o mensajes de soporte.</div></article></div>
    </PlatformModuleShell>
  )
}
