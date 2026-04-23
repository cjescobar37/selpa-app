import PlatformModuleShell from '@/components/platform/PlatformModuleShell'

export default function PlatformAnalyticsPage() {
  return (
    <PlatformModuleShell
      title="Analytics"
      subtitle="Vista ejecutiva de crecimiento, actividad y rendimiento global de la plataforma."
      metrics={[
        { label: 'Clubes activos', value: '2' },
        { label: 'Jugadores activos', value: '6' },
        { label: 'Torneos creados', value: '7' },
        { label: 'Conversión registro', value: '18%' },
      ]}
      actions={<button className="px-btn px-btn--ghost">Exportar</button>}
      aside={<div className="px-platformCard"><div className="px-sectionTitle">Próximo paso</div><div className="px-platformChecklist"><div>Conectar eventos reales del home y funnels de registro.</div><div>Sumar métricas por club y por campaña de sponsors.</div></div></div>}
    >
      <div className="px-contentList">
        <article className="px-contentItem"><div className="px-contentItemTitle">Embudo principal</div><div style={{ color:'rgba(23,37,63,.7)' }}>Visitante → registro → alta en club → inscripción a torneo.</div></article>
        <article className="px-contentItem"><div className="px-contentItemTitle">Uso por módulo</div><div style={{ color:'rgba(23,37,63,.7)' }}>Ranking, torneos, noticias y mensajes listos para instrumentación real.</div></article>
      </div>
    </PlatformModuleShell>
  )
}
