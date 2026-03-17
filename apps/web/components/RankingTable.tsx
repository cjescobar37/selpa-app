type Row = { tournament: string; category: string; date: string; round: string; points: number }

export default function RankingTable({ rows }: { rows: Row[] }) {
  return (
    <section className="tableWrap">
      <div className="tableTitle">Points breakdown</div>

      <div className="tableDesktop">
        <table className="table">
          <thead>
            <tr>
              <th>Tournament</th>
              <th>Category</th>
              <th>Date</th>
              <th>Round</th>
              <th className="points">Points</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 900 }}>{r.tournament}</td>
                <td>{r.category}</td>
                <td>{r.date}</td>
                <td>{r.round}</td>
                <td className="points">{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="tableCards" aria-label="Points breakdown mobile">
        {rows.map((r, i) => (
          <article key={i} className="tableCard">
            <div className="tableCardHead">
              <div className="tableCardTitle">{r.tournament}</div>
              <div className="tableCardPoints">{r.points} pts</div>
            </div>
            <div className="tableCardGrid">
              <div className="tableCardMeta">
                <span className="tableCardLabel">Category</span>
                <span className="tableCardValue">{r.category}</span>
              </div>
              <div className="tableCardMeta">
                <span className="tableCardLabel">Date</span>
                <span className="tableCardValue">{r.date}</span>
              </div>
              <div className="tableCardMeta tableCardMeta--full">
                <span className="tableCardLabel">Round</span>
                <span className="tableCardValue">{r.round}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
