'use client'

import { useSession } from '@/components/session/SessionProvider'

const CLUB_CONTENT_NOTICE =
  'Contenido propio del club. La persistencia se activará cuando estén listas las tablas club_news / club_sponsors / club_ad_campaigns.'

const advertisingStats = [
  { label: 'Campañas activas', value: '0', detail: 'Piezas publicadas' },
  { label: 'Sponsors activos', value: '0', detail: 'Marcas del club' },
  { label: 'Impacto local', value: '0', detail: 'Visualizaciones medidas' },
  { label: 'Pausadas', value: '0', detail: 'Campañas detenidas' },
]

const plannedPlacements = ['Home del club', 'Detalle de torneo', 'Agenda en vivo', 'Noticias del club']

export default function ClubPublicidadPage() {
  const { activeClub } = useSession()
  const clubName = activeClub?.name ?? 'tu club'

  return (
    <div className="club-shell">
      <div className="club-panel club-ads-page">
        <header className="club-ads-hero">
          <div>
            <span className="club-ads-kicker">Contenido del club</span>
            <h1 className="club-title">Sponsors y publicidad</h1>
            <p className="club-sub">
              Panel comercial para ordenar sponsors, campañas y espacios promocionales propios de {clubName}.
            </p>
          </div>
          <div className="club-ads-actions" aria-label="Acciones no disponibles">
            <button type="button" disabled>Crear campaña</button>
            <button type="button" disabled>Nuevo sponsor</button>
          </div>
        </header>

        <div className="club-ads-notice" role="status">
          <span aria-hidden="true" />
          <p>{CLUB_CONTENT_NOTICE}</p>
        </div>

        <section className="club-ads-stats" aria-label="Resumen de publicidad">
          {advertisingStats.map((stat) => (
            <article className="club-ads-stat" key={stat.label}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
              <small>{stat.detail}</small>
            </article>
          ))}
        </section>

        <section className="club-ads-layout">
          <article className="club-ads-card club-ads-card--campaigns">
            <div className="club-ads-cardHeader">
              <div>
                <span className="club-ads-kicker">Campañas</span>
                <h2>Publicidad del club</h2>
              </div>
              <span className="club-ads-pill">Próximamente</span>
            </div>

            <div className="club-ads-empty">
              <div className="club-ads-emptyIcon">AD</div>
              <div>
                <h3>No hay campañas configuradas</h3>
                <p>
                  Esta sección queda lista para administrar piezas por ubicación, vigencia, estado y prioridad sin
                  mezclar datos con la publicidad global de Platform.
                </p>
              </div>
            </div>

            <div className="club-ads-tableMock" aria-label="Estructura futura de campañas">
              <div>
                <strong>Campaña</strong>
                <span>Ubicación</span>
                <span>Estado</span>
                <span>Vigencia</span>
              </div>
              <p>No hay campañas para mostrar.</p>
            </div>
          </article>

          <aside className="club-ads-card">
            <div className="club-ads-cardHeader">
              <div>
                <span className="club-ads-kicker">Sponsors</span>
                <h2>Marcas del club</h2>
              </div>
            </div>
            <div className="club-ads-sponsorStack">
              <div>
                <span>Principal</span>
                <strong>Sin sponsor principal</strong>
                <small>Logo, enlace y nivel se conectarán a club_sponsors.</small>
              </div>
              <div>
                <span>Secundarios</span>
                <strong>0 marcas</strong>
                <small>Ordenados por tier y prioridad.</small>
              </div>
            </div>
          </aside>
        </section>

        <section className="club-ads-layout club-ads-layout--secondary">
          <article className="club-ads-card">
            <div className="club-ads-cardHeader">
              <div>
                <span className="club-ads-kicker">Impacto actual</span>
                <h2>Métricas comerciales</h2>
              </div>
            </div>
            <div className="club-ads-impact">
              <div>
                <strong>0</strong>
                <span>Impresiones</span>
              </div>
              <div>
                <strong>0</strong>
                <span>Clics</span>
              </div>
              <div>
                <strong>0%</strong>
                <span>CTR</span>
              </div>
            </div>
            <p className="club-ads-muted">
              La medición se activará cuando existan endpoints propios para campañas del club.
            </p>
          </article>

          <article className="club-ads-card">
            <div className="club-ads-cardHeader">
              <div>
                <span className="club-ads-kicker">Ubicaciones previstas</span>
                <h2>Inventario local</h2>
              </div>
            </div>
            <div className="club-ads-placementGrid">
              {plannedPlacements.map((placement) => (
                <span key={placement}>{placement}</span>
              ))}
            </div>
          </article>
        </section>
      </div>

      <style>{`
        .club-ads-page {
          display: grid;
          gap: 18px;
        }

        .club-ads-hero {
          align-items: flex-start;
          display: flex;
          gap: 18px;
          justify-content: space-between;
        }

        .club-ads-kicker {
          color: #64748b;
          display: inline-block;
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          margin-bottom: 4px;
          text-transform: uppercase;
        }

        .club-ads-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: flex-end;
        }

        .club-ads-actions button {
          background: #d7f9ff;
          border: 1px solid #7dd9e8;
          border-radius: 10px;
          color: #063449;
          cursor: not-allowed;
          font: inherit;
          font-size: 0.86rem;
          font-weight: 850;
          padding: 10px 12px;
        }

        .club-ads-notice {
          align-items: center;
          background: #effaff;
          border: 1px solid #bfecf7;
          border-radius: 12px;
          color: #17435a;
          display: flex;
          gap: 10px;
          padding: 11px 13px;
        }

        .club-ads-notice span {
          background: #16a6c9;
          border-radius: 999px;
          flex: 0 0 auto;
          height: 9px;
          width: 9px;
        }

        .club-ads-notice p {
          font-size: 0.87rem;
          font-weight: 650;
          line-height: 1.35;
          margin: 0;
        }

        .club-ads-stats {
          display: grid;
          gap: 10px;
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .club-ads-stat,
        .club-ads-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
        }

        .club-ads-stat {
          display: grid;
          gap: 4px;
          padding: 13px;
        }

        .club-ads-stat span,
        .club-ads-stat small {
          color: #64748b;
          font-size: 0.75rem;
          font-weight: 750;
        }

        .club-ads-stat strong {
          color: #061b3a;
          font-size: 1.55rem;
          font-weight: 850;
          line-height: 1;
        }

        .club-ads-layout {
          display: grid;
          gap: 14px;
          grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.75fr);
        }

        .club-ads-layout--secondary {
          grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
        }

        .club-ads-card {
          min-width: 0;
          padding: 16px;
        }

        .club-ads-cardHeader {
          align-items: flex-start;
          display: flex;
          gap: 12px;
          justify-content: space-between;
          margin-bottom: 14px;
        }

        .club-ads-cardHeader h2 {
          color: #061b3a;
          font-size: 1.05rem;
          font-weight: 850;
          line-height: 1.15;
          margin: 0;
        }

        .club-ads-pill {
          background: #f1f5f9;
          border: 1px solid #dbe5ef;
          border-radius: 999px;
          color: #587086;
          flex: 0 0 auto;
          font-size: 0.7rem;
          font-weight: 850;
          padding: 6px 9px;
        }

        .club-ads-empty {
          align-items: center;
          background: #f8fafc;
          border: 1px dashed #cbd5e1;
          border-radius: 14px;
          display: flex;
          gap: 14px;
          padding: 16px;
        }

        .club-ads-emptyIcon {
          align-items: center;
          background: #0f172a;
          border-radius: 14px;
          color: #ffffff;
          display: flex;
          flex: 0 0 48px;
          font-size: 1rem;
          font-weight: 900;
          height: 48px;
          justify-content: center;
        }

        .club-ads-empty h3 {
          color: #061b3a;
          font-size: 1rem;
          font-weight: 850;
          line-height: 1.2;
          margin: 0 0 5px;
        }

        .club-ads-empty p,
        .club-ads-muted {
          color: #52657d;
          font-size: 0.86rem;
          font-weight: 550;
          line-height: 1.45;
          margin: 0;
        }

        .club-ads-tableMock {
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          margin-top: 12px;
          overflow: hidden;
        }

        .club-ads-tableMock div {
          background: #f8fafc;
          color: #64748b;
          display: grid;
          font-size: 0.72rem;
          font-weight: 850;
          gap: 10px;
          grid-template-columns: minmax(150px, 1fr) 110px 90px 110px;
          padding: 10px 12px;
          text-transform: uppercase;
        }

        .club-ads-tableMock p {
          color: #64748b;
          font-size: 0.86rem;
          font-weight: 650;
          margin: 0;
          padding: 14px 12px;
        }

        .club-ads-sponsorStack {
          display: grid;
          gap: 10px;
        }

        .club-ads-sponsorStack div {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 13px;
          display: grid;
          gap: 4px;
          padding: 13px;
        }

        .club-ads-sponsorStack span,
        .club-ads-sponsorStack small {
          color: #64748b;
          font-size: 0.74rem;
          font-weight: 800;
        }

        .club-ads-sponsorStack strong {
          color: #061b3a;
          font-size: 0.98rem;
          font-weight: 850;
        }

        .club-ads-impact {
          display: grid;
          gap: 9px;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          margin-bottom: 12px;
        }

        .club-ads-impact div {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 13px;
          display: grid;
          gap: 3px;
          padding: 12px;
        }

        .club-ads-impact strong {
          color: #061b3a;
          font-size: 1.3rem;
          font-weight: 850;
          line-height: 1;
        }

        .club-ads-impact span {
          color: #64748b;
          font-size: 0.72rem;
          font-weight: 800;
        }

        .club-ads-placementGrid {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .club-ads-placementGrid span {
          background: #f8fafc;
          border: 1px solid #dbe5ef;
          border-radius: 999px;
          color: #334155;
          font-size: 0.78rem;
          font-weight: 800;
          padding: 8px 10px;
        }

        @media (max-width: 920px) {
          .club-ads-hero,
          .club-ads-cardHeader {
            align-items: stretch;
            flex-direction: column;
          }

          .club-ads-actions {
            justify-content: stretch;
          }

          .club-ads-actions button {
            flex: 1;
          }

          .club-ads-stats,
          .club-ads-layout,
          .club-ads-layout--secondary {
            grid-template-columns: 1fr;
          }

          .club-ads-tableMock div {
            display: none;
          }
        }

        @media (max-width: 560px) {
          .club-ads-empty {
            align-items: flex-start;
            flex-direction: column;
          }

          .club-ads-card {
            padding: 13px;
          }

          .club-ads-impact {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  )
}
