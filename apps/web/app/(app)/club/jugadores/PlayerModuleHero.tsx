type PlayerModuleKpi = {
  label: string
  value: number
}

export default function PlayerModuleHero({ kpis }: { kpis: [PlayerModuleKpi, PlayerModuleKpi, PlayerModuleKpi] }) {
  return (
    <header className="clubPlayerModuleHero">
      <div className="clubPlayerModuleHero__title">
        <span>Comunidad del club</span>
        <h1>Jugadores</h1>
      </div>
      <div className="clubPlayerModuleHero__kpis" aria-label="Resumen del módulo Jugadores">
        {kpis.map((kpi) => (
          <div key={kpi.label}>
            <strong>{kpi.value}</strong>
            <span>{kpi.label}</span>
          </div>
        ))}
      </div>

      <style jsx>{`
        .clubPlayerModuleHero {
          background: linear-gradient(135deg, rgba(248, 250, 252, .98), var(--club-admin-soft, rgba(101, 163, 13, .08)));
          border: 1px solid rgba(15, 23, 42, .07);
          border-radius: 14px;
          box-sizing: border-box;
          display: grid;
          gap: 9px;
          min-height: 123px;
          padding: 11px;
          width: 100%;
        }

        .clubPlayerModuleHero__title span {
          color: var(--club-admin-accent, #65a30d);
          display: block;
          font-size: 10px;
          font-weight: 950;
          letter-spacing: .06em;
          text-transform: uppercase;
        }

        .clubPlayerModuleHero__title h1 {
          color: #17253f;
          font-size: 24px;
          font-weight: 700;
          line-height: 1;
          margin: 3px 0 0;
        }

        .clubPlayerModuleHero__kpis {
          display: grid;
          gap: 5px;
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .clubPlayerModuleHero__kpis div {
          align-content: center;
          background: rgba(255, 255, 255, .94);
          border: 1px solid color-mix(in srgb, var(--club-admin-accent, #65a30d) 15%, #e2e8f0);
          border-radius: 9px;
          display: grid;
          gap: 1px;
          min-height: 43px;
          padding: 4px;
          text-align: center;
        }

        .clubPlayerModuleHero__kpis strong {
          color: #17253f;
          font-size: 15px;
          line-height: 1;
        }

        .clubPlayerModuleHero__kpis span {
          color: #64748b;
          font-size: 9px;
          font-weight: 800;
          line-height: 1.05;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        @media (min-width: 761px) {
          .clubPlayerModuleHero {
            align-items: center;
            grid-template-columns: minmax(0, 1fr) minmax(360px, .7fr);
            min-height: 112px;
            padding: 16px 18px;
          }

          .clubPlayerModuleHero__title h1 { font-size: 28px; }
          .clubPlayerModuleHero__kpis div { min-height: 58px; }
          .clubPlayerModuleHero__kpis strong { font-size: 18px; }
          .clubPlayerModuleHero__kpis span { font-size: 11px; }
        }
      `}</style>
    </header>
  )
}
