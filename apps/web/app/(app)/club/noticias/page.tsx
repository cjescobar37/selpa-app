'use client'

import { useSession } from '@/components/session/SessionProvider'

const CLUB_CONTENT_NOTICE =
  'Contenido propio del club. La persistencia se activará cuando estén listas las tablas club_news / club_sponsors / club_ad_campaigns.'

const editorialStats = [
  { label: 'Publicadas', value: '0', detail: 'Noticias visibles del club' },
  { label: 'Borradores', value: '0', detail: 'Notas en preparación' },
  { label: 'Destacadas', value: '0', detail: 'Contenido principal' },
  { label: 'Programadas', value: '0', detail: 'Publicación futura' },
]

const upcomingBlocks = [
  'Crear noticias propias del club',
  'Destacar novedades en el home del club',
  'Programar publicaciones',
  'Adjuntar imágenes y galerías',
]

export default function ClubNoticiasPage() {
  const { activeClub } = useSession()
  const clubName = activeClub?.name ?? 'tu club'

  return (
    <div className="club-shell">
      <div className="club-panel club-content-page">
        <header className="club-content-hero">
          <div>
            <span className="club-content-kicker">Contenido del club</span>
            <h1 className="club-title">Noticias del club</h1>
            <p className="club-sub">
              Centro editorial para publicar novedades, comunicados y coberturas propias de {clubName}.
            </p>
          </div>
          <button className="club-content-primary" type="button" disabled>
            Nueva noticia
            <span>Próximamente</span>
          </button>
        </header>

        <div className="club-content-notice" role="status">
          <span aria-hidden="true" />
          <p>{CLUB_CONTENT_NOTICE}</p>
        </div>

        <section className="club-content-stats" aria-label="Resumen editorial">
          {editorialStats.map((stat) => (
            <article className="club-content-stat" key={stat.label}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
              <small>{stat.detail}</small>
            </article>
          ))}
        </section>

        <section className="club-content-grid">
          <article className="club-content-card club-content-card--wide">
            <div className="club-content-cardHeader">
              <div>
                <span className="club-content-kicker">Editorial</span>
                <h2>Panel de noticias</h2>
              </div>
              <span className="club-content-pill">Sin conexión a backend</span>
            </div>

            <div className="club-news-empty">
              <div className="club-news-emptyIcon">N</div>
              <div>
                <h3>Todavía no hay noticias del club</h3>
                <p>
                  Esta vista ya queda preparada para listar borradores, publicaciones destacadas y notas archivadas
                  cuando se active la persistencia propia del club.
                </p>
              </div>
            </div>

            <div className="club-news-listPreview" aria-label="Estructura futura de noticias">
              <div>
                <strong>Título</strong>
                <span>Estado</span>
                <span>Ubicación</span>
                <span>Última edición</span>
              </div>
              <p>No hay registros para mostrar.</p>
            </div>
          </article>

          <aside className="club-content-card">
            <div className="club-content-cardHeader">
              <div>
                <span className="club-content-kicker">Preview público</span>
                <h2>Cómo se verá</h2>
              </div>
            </div>

            <div className="club-news-preview">
              <span>Destacada</span>
              <h3>Comunicado oficial de {clubName}</h3>
              <p>
                El preview usará el mismo lenguaje visual de Platform, pero con contenido filtrado por club cuando
                existan las tablas dedicadas.
              </p>
              <div>
                <small>Noticias</small>
                <small>Club</small>
              </div>
            </div>
          </aside>
        </section>

        <section className="club-content-card club-content-roadmap">
          <div>
            <span className="club-content-kicker">Próxima capa</span>
            <h2>Flujo editorial previsto</h2>
          </div>
          <div className="club-content-roadmapGrid">
            {upcomingBlocks.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </section>
      </div>

      <style>{`
        .club-content-page {
          display: grid;
          gap: 18px;
        }

        .club-content-hero {
          align-items: flex-start;
          display: flex;
          gap: 18px;
          justify-content: space-between;
        }

        .club-content-kicker {
          color: #64748b;
          display: inline-block;
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          margin-bottom: 4px;
          text-transform: uppercase;
        }

        .club-content-primary {
          align-items: center;
          background: #d7f9ff;
          border: 1px solid #7dd9e8;
          border-radius: 10px;
          color: #063449;
          cursor: not-allowed;
          display: inline-flex;
          flex-direction: column;
          font: inherit;
          font-size: 0.9rem;
          font-weight: 800;
          gap: 2px;
          min-width: 138px;
          padding: 10px 14px;
          text-align: center;
        }

        .club-content-primary span {
          color: #4b7280;
          font-size: 0.68rem;
          font-weight: 800;
          text-transform: uppercase;
        }

        .club-content-notice {
          align-items: center;
          background: #effaff;
          border: 1px solid #bfecf7;
          border-radius: 12px;
          color: #17435a;
          display: flex;
          gap: 10px;
          padding: 11px 13px;
        }

        .club-content-notice span {
          background: #16a6c9;
          border-radius: 999px;
          flex: 0 0 auto;
          height: 9px;
          width: 9px;
        }

        .club-content-notice p {
          font-size: 0.87rem;
          font-weight: 650;
          line-height: 1.35;
          margin: 0;
        }

        .club-content-stats {
          display: grid;
          gap: 10px;
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .club-content-stat,
        .club-content-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
        }

        .club-content-stat {
          display: grid;
          gap: 4px;
          padding: 13px;
        }

        .club-content-stat span,
        .club-content-stat small {
          color: #64748b;
          font-size: 0.75rem;
          font-weight: 750;
        }

        .club-content-stat strong {
          color: #061b3a;
          font-size: 1.55rem;
          font-weight: 850;
          line-height: 1;
        }

        .club-content-grid {
          display: grid;
          gap: 14px;
          grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.65fr);
        }

        .club-content-card {
          padding: 16px;
        }

        .club-content-card--wide {
          min-width: 0;
        }

        .club-content-cardHeader {
          align-items: flex-start;
          display: flex;
          gap: 12px;
          justify-content: space-between;
          margin-bottom: 14px;
        }

        .club-content-cardHeader h2,
        .club-content-roadmap h2 {
          color: #061b3a;
          font-size: 1.05rem;
          font-weight: 850;
          line-height: 1.15;
          margin: 0;
        }

        .club-content-pill {
          background: #f1f5f9;
          border: 1px solid #dbe5ef;
          border-radius: 999px;
          color: #587086;
          flex: 0 0 auto;
          font-size: 0.7rem;
          font-weight: 850;
          padding: 6px 9px;
        }

        .club-news-empty {
          align-items: center;
          background: #f8fafc;
          border: 1px dashed #cbd5e1;
          border-radius: 14px;
          display: flex;
          gap: 14px;
          padding: 16px;
        }

        .club-news-emptyIcon {
          align-items: center;
          background: #0f172a;
          border-radius: 14px;
          color: #ffffff;
          display: flex;
          flex: 0 0 48px;
          font-size: 1.15rem;
          font-weight: 900;
          height: 48px;
          justify-content: center;
        }

        .club-news-empty h3,
        .club-news-preview h3 {
          color: #061b3a;
          font-size: 1rem;
          font-weight: 850;
          line-height: 1.2;
          margin: 0 0 5px;
        }

        .club-news-empty p,
        .club-news-preview p {
          color: #52657d;
          font-size: 0.86rem;
          font-weight: 550;
          line-height: 1.45;
          margin: 0;
        }

        .club-news-listPreview {
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          margin-top: 12px;
          overflow: hidden;
        }

        .club-news-listPreview div {
          background: #f8fafc;
          color: #64748b;
          display: grid;
          font-size: 0.72rem;
          font-weight: 850;
          gap: 10px;
          grid-template-columns: minmax(160px, 1fr) 90px 100px 110px;
          padding: 10px 12px;
          text-transform: uppercase;
        }

        .club-news-listPreview p {
          color: #64748b;
          font-size: 0.86rem;
          font-weight: 650;
          margin: 0;
          padding: 14px 12px;
        }

        .club-news-preview {
          background: #0f172a;
          border-radius: 16px;
          color: #ffffff;
          display: grid;
          gap: 10px;
          min-height: 260px;
          padding: 18px;
        }

        .club-news-preview > span {
          align-self: start;
          background: #d7f9ff;
          border-radius: 999px;
          color: #063449;
          font-size: 0.72rem;
          font-weight: 900;
          justify-self: start;
          padding: 6px 9px;
        }

        .club-news-preview h3 {
          color: #ffffff;
          font-size: 1.45rem;
          margin-top: auto;
        }

        .club-news-preview p {
          color: rgba(255, 255, 255, 0.78);
        }

        .club-news-preview div {
          display: flex;
          gap: 7px;
        }

        .club-news-preview small,
        .club-content-roadmapGrid span {
          background: rgba(255, 255, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 999px;
          color: rgba(255, 255, 255, 0.84);
          font-size: 0.72rem;
          font-weight: 800;
          padding: 6px 9px;
        }

        .club-content-roadmap {
          align-items: center;
          display: grid;
          gap: 14px;
          grid-template-columns: minmax(180px, 0.35fr) 1fr;
        }

        .club-content-roadmapGrid {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .club-content-roadmapGrid span {
          background: #f8fafc;
          border-color: #dbe5ef;
          color: #334155;
        }

        @media (max-width: 920px) {
          .club-content-hero,
          .club-content-cardHeader,
          .club-content-roadmap {
            align-items: stretch;
            grid-template-columns: 1fr;
          }

          .club-content-hero,
          .club-content-cardHeader {
            flex-direction: column;
          }

          .club-content-stats,
          .club-content-grid {
            grid-template-columns: 1fr;
          }

          .club-content-primary {
            width: 100%;
          }

          .club-news-listPreview div {
            display: none;
          }
        }

        @media (max-width: 560px) {
          .club-content-stat strong {
            font-size: 1.35rem;
          }

          .club-news-empty {
            align-items: flex-start;
            flex-direction: column;
          }

          .club-content-card {
            padding: 13px;
          }
        }
      `}</style>
    </div>
  )
}
