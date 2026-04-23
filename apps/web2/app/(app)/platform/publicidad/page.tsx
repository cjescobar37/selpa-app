import PlatformModuleShell from '@/components/platform/PlatformModuleShell'

const campañas = [
  { title: 'Sponsor principal home', type: 'Sponsor', slot: 'Hero banner', status: 'Activo', summary: 'Marca principal visible en portada y landing de torneos.' },
  { title: 'Carrusel aliados estratégicos', type: 'Sponsor', slot: 'Footer público', status: 'Activo', summary: 'Logos secundarios con enlace externo.' },
  { title: 'Promo equipamiento marzo', type: 'Publicidad', slot: 'Bloque lateral home', status: 'Pausada', summary: 'Campaña temporal para tiendas asociadas.' },
]

export default function PlatformPublicidadPage() {
  return (
    <PlatformModuleShell
      title="Publicidad y sponsors"
      subtitle="Gestioná banners, sponsors y piezas que se muestran en el index del invitado."
      metrics={[
        { label: 'Campañas activas', value: '3' },
        { label: 'Sponsors', value: '5' },
        { label: 'Pausadas', value: '1' },
        { label: 'Slots home', value: '4' },
      ]}
      actions={
        <>
          <button className="px-btn">Nueva campaña</button>
          <button className="px-btn px-btn--ghost">Recargar</button>
        </>
      }
      quickActions={[
        { title: 'Slots del index', description: 'Control total de banners y sponsors del home invitado.', tag: 'Home' },
        { title: 'Sponsors oficiales', description: 'Listado de aliados con logo, enlace y prioridad.', tag: 'Branding' },
      ]}
      aside={
        <>
          <div className="px-platformCard">
            <div className="px-sectionTitle">Ubicaciones visibles</div>
            <div className="px-platformChecklist">
              <div>Hero principal del index.</div>
              <div>Bloque de sponsors debajo de noticias.</div>
              <div>Banners secundarios para campañas temporales.</div>
            </div>
          </div>
          <div className="px-platformCard">
            <div className="px-sectionTitle">Control comercial</div>
            <div className="px-platformFactsGrid">
              <div><span>CTR esperado</span><strong>2.8%</strong></div>
              <div><span>Contrato vigente</span><strong>3 sponsors</strong></div>
              <div><span>Vence próximo</span><strong>05/04/26</strong></div>
              <div><span>Prioridad home</span><strong>Manual</strong></div>
            </div>
          </div>
        </>
      }
    >
      <div className="px-contentList">
        {campañas.map((item) => (
          <article key={item.title} className="px-contentItem">
            <div className="px-contentItemHead">
              <div>
                <div className="px-contentItemTitle">{item.title}</div>
                <div className="px-contentMeta">
                  <span>{item.type}</span>
                  <span>•</span>
                  <span>{item.slot}</span>
                </div>
              </div>
              <span className="px-contentTag">{item.status}</span>
            </div>
            <div style={{ color: 'rgba(23,37,63,.7)', fontSize: 14 }}>{item.summary}</div>
            <div className="px-contentActions">
              <button className="px-btn px-btn--ghost">Editar</button>
              <button className="px-btn px-btn--ghost">Mover slot</button>
              <button className="px-btn px-btn--soft">Activar</button>
            </div>
          </article>
        ))}
      </div>
    </PlatformModuleShell>
  )
}
