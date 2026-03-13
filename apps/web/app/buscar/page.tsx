export default function BuscarPage() {
  return (
    <div className="px-page">
      <div className="px-pageHead">
        <h1 className="px-pageTitle">Buscar</h1>
        <p className="px-pageSub">Búsqueda global: torneos, jugadores, clubes y noticias.</p>
      </div>

      <div className="px-card px-cardTopAccent px-sectionCard">
        <h2 className="px-cardTitle">Buscador</h2>
        <div className="px-help" style={{ marginTop: 10 }}>
          (placeholder) Acá va la búsqueda global con resultados agrupados por tipo.
        </div>
      </div>
    </div>
  )
}
