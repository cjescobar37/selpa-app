import PlatformModuleShell from '@/components/platform/PlatformModuleShell'

export default function PlatformLiquidacionesPage() {
  return (
    <PlatformModuleShell title="Liquidaciones" subtitle="Cierre por club, períodos y exportación contable." aside={<div className="px-platformCard"><div className="px-sectionTitle">Pendiente backend</div><div className="px-platformChecklist"><div>Necesita tabla de cierres y detalle por operación.</div></div></div>}>
      <div className="px-contentList"><article className="px-contentItem"><div className="px-contentItemTitle">Sin datos conectados</div><div style={{ color:'rgba(23,37,63,.7)' }}>La estructura visual ya quedó lista para integrar cálculo real.</div></article></div>
    </PlatformModuleShell>
  )
}
