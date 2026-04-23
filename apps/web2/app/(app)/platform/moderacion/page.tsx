import PlatformModuleShell from '@/components/platform/PlatformModuleShell'

export default function PlatformModeracionPage() {
  return (
    <PlatformModuleShell title="Moderación" subtitle="Control de contenido, reportes y piezas visibles al público." aside={<div className="px-platformCard"><div className="px-sectionTitle">Áreas</div><div className="px-platformChecklist"><div>Noticias.</div><div>Publicidad y sponsors.</div><div>Reportes futuros de usuarios y clubes.</div></div></div>}>
      <div className="px-contentList"><article className="px-contentItem"><div className="px-contentItemTitle">Centro de moderación</div><div style={{ color:'rgba(23,37,63,.7)' }}>Desde acá el superadmin va a gobernar todo el contenido visible de la plataforma.</div></article></div>
    </PlatformModuleShell>
  )
}
