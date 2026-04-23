'use client'

export type StandingRow = {
  group_id: string
  team_id: string
  seed: number
  played: number
  wins: number
  losses: number
  match_points: number
  set_difference: number
  game_difference: number
}

export type StandingGroup = {
  group: {
    id: string
    name: string
    size?: number | null
    order?: number | null
  }
  standings: StandingRow[]
  qualifiers: StandingRow[]
}

type StandingsCardProps = {
  loading: boolean
  error: string
  groups: StandingGroup[]
  teamNames: Map<string, string>
}

export default function StandingsCard({ loading, error, groups, teamNames }: StandingsCardProps) {
  return (
    <section className="club-card club-standingsCard">
      <div className="club-cardHead">
        <div>
          <span className="club-kicker">Zonas</span>
          <h2>Standings</h2>
        </div>
      </div>

      {loading ? (
        <div className="px-empty">Cargando standings...</div>
      ) : error ? (
        <div className="club-standingsError">{error}</div>
      ) : groups.length === 0 ? (
        <div className="px-empty">Este torneo todavía no tiene grupos armados.</div>
      ) : (
        <div className="club-standingsGroups">
          {groups.map((group) => {
            const qualifierIds = new Set(group.qualifiers.map((row) => row.team_id))

            return (
              <div key={group.group.id} className="club-standingsGroup">
                <div className="club-standingsGroupHead">
                  <strong>Grupo {group.group.name}</strong>
                  <span>{group.standings.length}/{group.group.size ?? group.standings.length} equipos</span>
                </div>

                <div className="club-standingsTable" role="table" aria-label={`Standings grupo ${group.group.name}`}>
                  <div className="club-standingsRow club-standingsRow--head" role="row">
                    <span role="columnheader">#</span>
                    <span role="columnheader">Equipo</span>
                    <span role="columnheader">PJ</span>
                    <span role="columnheader">G</span>
                    <span role="columnheader">P</span>
                    <span role="columnheader">Pts</span>
                    <span role="columnheader">DS</span>
                    <span role="columnheader">DG</span>
                  </div>

                  {group.standings.map((row, index) => {
                    const qualifies = qualifierIds.has(row.team_id)
                    const teamName = teamNames.get(row.team_id) ?? `Equipo ${row.seed}`

                    return (
                      <div key={row.team_id} className="club-standingsRow" role="row">
                        <span role="cell">{index + 1}</span>
                        <span className="club-standingsTeam" role="cell">
                          <span>{teamName}</span>
                          {qualifies ? <b>Clasifica</b> : null}
                        </span>
                        <span role="cell">{row.played}</span>
                        <span role="cell">{row.wins}</span>
                        <span role="cell">{row.losses}</span>
                        <span role="cell">{row.match_points}</span>
                        <span role="cell">{row.set_difference}</span>
                        <span role="cell">{row.game_difference}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <style>{`
        .club-standingsCard { gap: 10px; }
        .club-standingsGroups { display: grid; gap: 10px; min-width: 0; }
        .club-standingsGroup { border: 1px solid rgba(15,23,42,.07); border-radius: 12px; display: grid; gap: 8px; min-width: 0; padding: 10px; }
        .club-standingsGroupHead { align-items: center; display: flex; gap: 8px; justify-content: space-between; min-width: 0; }
        .club-standingsGroupHead strong { color: #17253f; font-size: 14px; font-weight: 950; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-standingsGroupHead span { color: #64748b; flex: 0 0 auto; font-size: 12px; font-weight: 850; }
        .club-standingsTable { display: grid; gap: 4px; min-width: 0; }
        .club-standingsRow { align-items: center; display: grid; gap: 6px; grid-template-columns: 28px minmax(0, 1fr) repeat(6, minmax(28px, 38px)); min-width: 0; }
        .club-standingsRow span { color: #334155; font-size: 12px; font-weight: 850; min-width: 0; overflow: hidden; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
        .club-standingsRow span:nth-child(2) { text-align: left; }
        .club-standingsRow--head span { color: #64748b; font-size: 11px; font-weight: 950; text-transform: uppercase; }
        .club-standingsTeam { align-items: center; display: flex; gap: 6px; }
        .club-standingsTeam > span { text-align: left; }
        .club-standingsTeam b { background: #ecfdf3; border-radius: 999px; color: #166534; flex: 0 0 auto; font-size: 10px; font-weight: 950; padding: 3px 6px; white-space: nowrap; }
        .club-standingsError { background: #fff7df; border: 1px solid rgba(202,138,4,.22); border-radius: 10px; color: #854d0e; font-size: 13px; font-weight: 850; padding: 9px 10px; }
        @media (max-width: 620px) {
          .club-standingsGroup { padding: 8px; }
          .club-standingsRow { gap: 4px; grid-template-columns: 22px minmax(0, 1fr) repeat(6, minmax(24px, 30px)); }
          .club-standingsRow span { font-size: 11px; }
          .club-standingsTeam b { display: none; }
        }
      `}</style>
    </section>
  )
}
