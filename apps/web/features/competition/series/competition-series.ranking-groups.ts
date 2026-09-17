export type SeriesDivisionLabel = { id: string; name: string; modality?: string }

export function groupSeriesRankingByDivision<Row extends { series_division_id: string }>(
  rows: Row[],
  divisions: SeriesDivisionLabel[],
): Array<{ id: string; name: string; rows: Row[] }> {
  const groups = divisions.map(division => ({ ...division, rows: [] as Row[] }))
  const byId = new Map(groups.map(group => [group.id, group]))
  for (const row of rows) {
    let group = byId.get(row.series_division_id)
    if (!group) {
      group = { id: row.series_division_id, name: 'División', rows: [] }
      groups.push(group)
      byId.set(group.id, group)
    }
    group.rows.push(row)
  }
  return groups.filter(group => group.rows.length > 0)
}
