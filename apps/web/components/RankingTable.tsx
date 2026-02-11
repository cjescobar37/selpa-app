type Row = { tournament: string; category: string; date: string; round: string; points: number }

export default function RankingTable({ rows }: any) {
  return (
    <section className="tableWrap">
      <div className="tableTitle">Points breakdown</div>

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
          {rows.map((r: any, i: number) => (
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
    </section>
  )
}
