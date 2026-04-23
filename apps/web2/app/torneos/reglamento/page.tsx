import Link from 'next/link'

export default function TorneosReglamentoPage() {
  return (
    <div className="px-page">
      <div className="px-pageHead">
        <h1 className="px-pageTitle">Reglamento</h1>
        <p className="px-pageSub">Documento general y acceso al reglamento específico por club.</p>
      </div>

      <div className="px-card px-cardTopAccent px-sectionCard">
        <h2 className="px-cardTitle">Reglamento general</h2>
        <p className="px-muted" style={{ marginTop: 8 }}>
          Acá podés publicar el reglamento general del circuito y derivar al reglamento PDF cargado por cada club.
        </p>
        <div className="px-pageActions">
          <Link className="px-btn px-btn--ghost" href="/torneos">Volver a torneos</Link>
        </div>
      </div>
    </div>
  )
}
