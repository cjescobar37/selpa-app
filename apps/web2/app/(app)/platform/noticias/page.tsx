import PlatformModuleShell from '@/components/platform/PlatformModuleShell'

const noticias = [
  { title: 'Lanzamiento circuito otoño 2026', status: 'Publicado', section: 'Home invitado', date: '20/03/26', summary: 'Hero principal con CTA a inscripción y calendario.' },
  { title: 'Ranking actualizado de marzo', status: 'Programado', section: 'Noticias secundarias', date: '22/03/26', summary: 'Nota breve para empujar tráfico al ranking público.' },
  { title: 'Nuevos clubes aprobados', status: 'Borrador', section: 'Comunidad', date: '—', summary: 'Artículo institucional con foco en crecimiento de la plataforma.' },
]

export default function PlatformNoticiasPage() {
  return (
    <PlatformModuleShell
      title="Noticias platform"
      subtitle="Administrá el contenido editorial que se muestra en el index público y en la sección de noticias."
      metrics={[
        { label: 'Publicadas', value: '8' },
        { label: 'Programadas', value: '2' },
        { label: 'Borradores', value: '5' },
        { label: 'Hero activo', value: '1' },
      ]}
      actions={
        <>
          <button className="px-btn">Nueva noticia</button>
          <button className="px-btn px-btn--ghost">Recargar</button>
        </>
      }
      quickActions={[
        { title: 'Home público', description: 'Definí qué noticia ocupa el bloque principal del index.', tag: 'Hero' },
        { title: 'Programación', description: 'Dejá contenido listo para publicar por fecha.', tag: 'Scheduler' },
      ]}
      aside={
        <>
          <div className="px-platformCard">
            <div className="px-sectionTitle">Checklist editorial</div>
            <div className="px-platformChecklist">
              <div>Título corto y claro para desktop y mobile.</div>
              <div>Imagen hero consistente con la identidad PAMPRAX.</div>
              <div>CTA visible hacia torneos, ranking o registro.</div>
            </div>
          </div>
          <div className="px-platformCard">
            <div className="px-sectionTitle">Distribución actual</div>
            <div className="px-platformFactsGrid">
              <div><span>Hero</span><strong>1 noticia</strong></div>
              <div><span>Grid secundario</span><strong>3 noticias</strong></div>
              <div><span>Archivo</span><strong>24 notas</strong></div>
              <div><span>Última edición</span><strong>Hoy 10:45</strong></div>
            </div>
          </div>
        </>
      }
    >
      <div className="px-contentList">
        {noticias.map((item) => (
          <article key={item.title} className="px-contentItem">
            <div className="px-contentItemHead">
              <div>
                <div className="px-contentItemTitle">{item.title}</div>
                <div className="px-contentMeta">
                  <span>{item.section}</span>
                  <span>•</span>
                  <span>{item.date}</span>
                </div>
              </div>
              <span className="px-contentTag">{item.status}</span>
            </div>
            <div style={{ color: 'rgba(23,37,63,.7)', fontSize: 14 }}>{item.summary}</div>
            <div className="px-contentActions">
              <button className="px-btn px-btn--ghost">Editar</button>
              <button className="px-btn px-btn--ghost">Preview</button>
              <button className="px-btn px-btn--soft">Publicar</button>
            </div>
          </article>
        ))}
      </div>
    </PlatformModuleShell>
  )
}
