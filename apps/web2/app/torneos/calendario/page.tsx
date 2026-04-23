import Link from 'next/link'

export default function TorneosCalendarioPage() {
  return (
    <div className="px-page">
      <div className="px-pageHead">
        <h1 className="px-pageTitle">Calendario</h1>
        <p className="px-pageSub">Agenda pública de torneos y fechas destacadas.</p>
      </div>

      <div className="px-card px-cardTopAccent px-sectionCard">
        <h2 className="px-cardTitle">Próximas fechas</h2>
        <div className="px-list" style={{ marginTop: 12 }}>
          {[
            ['Open LA33', '22–24 Mar · Santa Rosa'],
            ['Copa PAMPRAX', '05–07 Abr · General Pico'],
            ['Night Cup', '12–13 Abr · Toay'],
          ].map(([name, meta]) => (
            <div key={name} className="px-card px-card--flat">
              <div style={{ fontWeight: 900 }}>{name}</div>
              <div className="px-muted" style={{ marginTop: 4 }}>{meta}</div>
            </div>
          ))}
        </div>
        <div className="px-pageActions">
          <Link className="px-btn px-btn--ghost" href="/torneos">Volver a torneos</Link>
        </div>
      </div>
    </div>
  )
}
