import PlatformModuleShell from '@/components/platform/PlatformModuleShell'

export default function PlatformPagosPage() {
  return (
    <PlatformModuleShell
      title="Pagos y comisiones"
      subtitle="Seguimiento comercial global, conciliaciones y reglas de comisión por plataforma."
      metrics={[
        { label: 'Pendientes', value: '0' },
        { label: 'Conciliados', value: '0' },
        { label: 'Comisión base', value: '10%' },
        { label: 'Alertas', value: '0' },
      ]}
      actions={<button className="px-btn">Configurar comisión</button>}
      aside={<div className="px-platformCard"><div className="px-sectionTitle">Estado</div><div className="px-platformChecklist"><div>Página lista para conectar Mercado Pago.</div><div>El superadmin va a poder ver cobros, devoluciones y reclamos.</div></div></div>}
    >
      <div className="px-contentList"><article className="px-contentItem"><div className="px-contentItemTitle">Centro de pagos</div><div style={{ color:'rgba(23,37,63,.7)' }}>Panel preparado para comisiones por club, liquidaciones y conciliación.</div></article></div>
    </PlatformModuleShell>
  )
}
