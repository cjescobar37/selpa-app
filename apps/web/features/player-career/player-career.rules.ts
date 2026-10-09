/** Presentation and contracts only. Competition remains the points/placement authority. */
export function computableMatch(match: { status?: string | null; team1_id?: string | null; team2_id?: string | null; winner_team_id?: string | null; score?: Record<string, unknown> | null }) {
  const score = match.score ?? {}
  return match.status === 'PLAYED' && Boolean(match.team1_id && match.team2_id && match.team1_id !== match.team2_id)
    && Boolean(match.winner_team_id && [match.team1_id, match.team2_id].includes(match.winner_team_id))
    && score.walkover !== true && score.bye !== true && score.administrative !== true
    && !['WALKOVER','WO','BYE','ADMINISTRATIVE'].includes(String(score.type ?? '').toUpperCase())
    && !/\bWO\b|WALKOVER|\bBYE\b/.test(String(score.text ?? '').toUpperCase())
}
export function resultLabel(role: string) {
  return ({CHAMPION:'Campeón',RUNNER_UP:'Finalista',SEMIFINALIST:'Semifinalista',QUARTERFINALIST:'Cuartos de final',EIGHTH_FINALIST:'Octavos',SIXTEENTH_FINALIST:'Dieciseisavos',PARTICIPANT:'Participación',ADMINISTRATIVE:'Resolución administrativa'} as Record<string,string>)[role] ?? 'Resultado oficial'
}
export function winRate(wins: number, losses: number) { return wins + losses ? Math.round(100 * wins / (wins + losses)) : null }
export function pageNumber(value: string | null | undefined) { return Math.max(1, Math.min(100000, Math.floor(Number(value) || 1))) }
export function validId(id: string | null | undefined): id is string { return Boolean(id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) }
