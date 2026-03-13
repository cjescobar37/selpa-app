export default function RankingPublicPage() {
  return (
    <div className="px-page">
      <div className="px-pageHead">
        <h1 className="px-pageTitle">Ranking</h1>
        <p className="px-pageSub">Masculino / Femenino con selector de categoría dentro de la vista.</p>
      </div>

      <div className="px-card px-cardTopAccent px-sectionCard">
        <h2 className="px-cardTitle">Ranking público</h2>
        <div className="px-help" style={{ marginTop: 10 }}>
          (placeholder) Acá va el ranking público con filtros por categoría, género y club.
        </div>
      </div>
    </div>
  )
}
