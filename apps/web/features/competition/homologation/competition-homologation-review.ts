export type HomologationReviewRow = Record<string, unknown>

export type HomologationTeamResult = {
  tournamentTeamId: string
  participantNames: string[]
  pairName: string
  resultRole: string
  resultLabel: string
}

const roleOrder: Record<string, number> = { CHAMPION: 1, RUNNER_UP: 2, SEMIFINALIST: 3, QUARTERFINALIST: 4, EIGHTH_FINALIST: 5, SIXTEENTH_FINALIST: 6, PARTICIPANT: 7, PARTICIPATION: 7 }
const roleLabels: Record<string, string> = { CHAMPION: 'Campeón', RUNNER_UP: 'Subcampeón', SEMIFINALIST: 'Semifinalista', QUARTERFINALIST: 'Cuartofinalista', EIGHTH_FINALIST: 'Octavos', SIXTEENTH_FINALIST: 'Dieciseisavos', PARTICIPANT: 'Participante', PARTICIPATION: 'Participante' }

function snapshot(row: HomologationReviewRow, key: 'participant_snapshot' | 'result_snapshot') {
  const value = row[key]
  return value && typeof value === 'object' ? value as HomologationReviewRow : {}
}

function text(row: HomologationReviewRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function teamId(row: HomologationReviewRow) {
  return text(row, ['tournament_team_id']) || text(snapshot(row, 'participant_snapshot'), ['team_id']) || text(snapshot(row, 'result_snapshot'), ['team_id'])
}

function participantName(row: HomologationReviewRow) {
  return text(row, ['display_name', 'entry_name']) || text(snapshot(row, 'participant_snapshot'), ['display_name', 'name']) || 'Participante'
}

function resultRole(row: HomologationReviewRow) {
  const explicit = text(row, ['result_role']) || text(snapshot(row, 'result_snapshot'), ['result_role'])
  if (explicit) return explicit.toUpperCase()
  const position = typeof row.final_position === 'number' ? row.final_position : Number.NaN
  if (position === 1) return 'CHAMPION'
  if (position === 2) return 'RUNNER_UP'
  return 'PARTICIPANT'
}

export function buildHomologationTeamResults(participants: HomologationReviewRow[], results: HomologationReviewRow[]): HomologationTeamResult[] {
  const namesByTeam = new Map<string, string[]>()
  for (const participant of participants) {
    const id = teamId(participant)
    if (!id) continue
    const names = namesByTeam.get(id) ?? []
    const name = participantName(participant)
    if (!names.includes(name)) names.push(name)
    namesByTeam.set(id, names)
  }

  const teams = new Map<string, HomologationTeamResult & { sourceIndex: number }>()
  results.forEach((result, sourceIndex) => {
    const id = teamId(result) || text(result, ['id']) || `result-${sourceIndex}`
    if (teams.has(id)) return
    const role = resultRole(result)
    const names = namesByTeam.get(id) ?? []
    const fallbackName = text(result, ['pair_name', 'entry_name', 'display_name']) || `Pareja ${sourceIndex + 1}`
    teams.set(id, { tournamentTeamId: id, participantNames: names, pairName: names.length ? names.join(' / ') : fallbackName, resultRole: role, resultLabel: roleLabels[role] ?? 'Participante', sourceIndex })
  })

  return [...teams.values()]
    .sort((left, right) => (roleOrder[left.resultRole] ?? 99) - (roleOrder[right.resultRole] ?? 99) || left.sourceIndex - right.sourceIndex)
    .map(team => ({ tournamentTeamId: team.tournamentTeamId, participantNames: team.participantNames, pairName: team.pairName, resultRole: team.resultRole, resultLabel: team.resultLabel }))
}
