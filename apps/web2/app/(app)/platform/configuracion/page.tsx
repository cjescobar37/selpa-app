import PlatformModuleShell from '@/components/platform/PlatformModuleShell'

export default function PlatformConfiguracionPage() {
  return (
    <PlatformModuleShell title="Configuración" subtitle="Parámetros globales, reglas y switches operativos de la plataforma." aside={<div className="px-platformCard"><div className="px-sectionTitle">Configuración global</div><div className="px-platformChecklist"><div>Feature flags.</div><div>Reglas de aprobación.</div><div>Textos institucionales del home.</div></div></div>}>
      <div className="px-contentList"><article className="px-contentItem"><div className="px-contentItemTitle">Ajustes del sistema</div><div style={{ color:'rgba(23,37,63,.7)' }}>Pantalla lista para sumar llaves, reglas y parámetros sensibles sin tocar el navbar.</div></article></div>
    </PlatformModuleShell>
  )
}
