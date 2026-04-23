type Stats = { matches: number; wins: number; winRate: number }

export default function StatsRow({ stats }: any) {
  return (
    <section className="statsStrip">
  <div className="tableTitle">
  <span className="tableTitleMain">Estadisticas Globales</span>
</div>


      <div className="statsGrid">
        <div className="statsItem">
          <div className="statsK">Match played</div>
          <div className="statsV">{stats.matches}</div>
        </div>
        <div className="statsItem">
          <div className="statsK">Match won</div>
          <div className="statsV">{stats.wins}</div>
        </div>
        <div className="statsItem">
          <div className="statsK">Match lost</div>
          <div className="statsV">{stats.losses ?? 54}</div>
        </div>
        <div className="statsItem">
          <div className="statsK">Win rate</div>
          <div className="statsV">{stats.winRate.toFixed(1)}%</div>
        </div>
        <div className="statsItem">
          <div className="statsK">Titles</div>
          <div className="statsV">{stats.titles ?? 2}</div>
        </div>
        <div className="statsItem">
          <div className="statsK">Best rank</div>
          <div className="statsV">{stats.bestRank ?? 1}</div>
        </div>
      </div>
    </section>
  )
}
