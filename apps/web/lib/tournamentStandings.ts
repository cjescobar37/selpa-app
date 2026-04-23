type JsonObject = Record<string, unknown>

export type TournamentClassificationRules = {
  classify_per_group?: number
  tie_breakers?: string[]
  points_for_win?: number
  points_for_loss?: number
}

export type TournamentGroup = {
  id: string
  tournament_id: string
  name: string
  order?: number
  size?: number
}

export type TournamentGroupTeam = {
  group_id: string
  tournament_id: string
  team_id: string
  seed: number
  position?: number | null
}

export type TournamentStandingMatch = {
  id: string
  group_id?: string | null
  phase?: string | null
  status?: string | null
  team1_id: string
  team2_id: string
  winner_team_id?: string | null
  score?: JsonObject | null
}

export type GroupStandingRow = {
  group_id: string
  team_id: string
  seed: number
  played: number
  wins: number
  losses: number
  match_points: number
  sets_for: number
  sets_against: number
  set_difference: number
  games_for: number
  games_against: number
  game_difference: number
}

export type GroupStandings = {
  group: TournamentGroup
  standings: GroupStandingRow[]
  qualifiers: GroupStandingRow[]
}

type ParsedScore = {
  setsForTeam1: number
  setsForTeam2: number
  gamesForTeam1: number
  gamesForTeam2: number
}

const defaultTieBreakers = ['match_points', 'set_difference', 'game_difference', 'seed']

function asNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function parseSetPair(value: unknown): { team1: number; team2: number } | null {
  if (!value || typeof value !== 'object') return null
  const row = value as JsonObject
  const team1 = asNumber(row.team1 ?? row.team1_games ?? row.a)
  const team2 = asNumber(row.team2 ?? row.team2_games ?? row.b)
  return team1 !== null && team2 !== null ? { team1, team2 } : null
}

function parseScoreText(text: string): ParsedScore | null {
  const regularScoreText = text.replace(/\([^)]*\)/g, ' ')
  const pairs = Array.from(regularScoreText.matchAll(/(\d{1,2})\s*[-/]\s*(\d{1,2})/g))
    .map((match) => ({ team1: Number(match[1]), team2: Number(match[2]) }))
    .filter((set) => Number.isFinite(set.team1) && Number.isFinite(set.team2))

  if (pairs.length === 0) return null
  return summarizeSets(pairs)
}

function summarizeSets(sets: Array<{ team1: number; team2: number }>): ParsedScore {
  return sets.reduce<ParsedScore>(
    (acc, set) => {
      if (set.team1 > set.team2) acc.setsForTeam1 += 1
      if (set.team2 > set.team1) acc.setsForTeam2 += 1
      acc.gamesForTeam1 += set.team1
      acc.gamesForTeam2 += set.team2
      return acc
    },
    { setsForTeam1: 0, setsForTeam2: 0, gamesForTeam1: 0, gamesForTeam2: 0 }
  )
}

export function parseTournamentMatchScore(score?: JsonObject | null): ParsedScore | null {
  if (!score) return null
  if (score.walkover === true || score.type === 'WALKOVER') return null

  if (Array.isArray(score.sets)) {
    const sets = score.sets.map(parseSetPair).filter((set): set is { team1: number; team2: number } => Boolean(set))
    return sets.length > 0 ? summarizeSets(sets) : null
  }

  if (typeof score.text === 'string' && score.text.trim()) return parseScoreText(score.text)
  return null
}

function emptyStanding(groupTeam: TournamentGroupTeam): GroupStandingRow {
  return {
    group_id: groupTeam.group_id,
    team_id: groupTeam.team_id,
    seed: groupTeam.seed,
    played: 0,
    wins: 0,
    losses: 0,
    match_points: 0,
    sets_for: 0,
    sets_against: 0,
    set_difference: 0,
    games_for: 0,
    games_against: 0,
    game_difference: 0,
  }
}

function applyScore(row: GroupStandingRow, parsed: ParsedScore, side: 'team1' | 'team2') {
  const setsFor = side === 'team1' ? parsed.setsForTeam1 : parsed.setsForTeam2
  const setsAgainst = side === 'team1' ? parsed.setsForTeam2 : parsed.setsForTeam1
  const gamesFor = side === 'team1' ? parsed.gamesForTeam1 : parsed.gamesForTeam2
  const gamesAgainst = side === 'team1' ? parsed.gamesForTeam2 : parsed.gamesForTeam1

  row.sets_for += setsFor
  row.sets_against += setsAgainst
  row.set_difference = row.sets_for - row.sets_against
  row.games_for += gamesFor
  row.games_against += gamesAgainst
  row.game_difference = row.games_for - row.games_against
}

function compareByBreaker(a: GroupStandingRow, b: GroupStandingRow, breaker: string) {
  if (breaker === 'seed') return a.seed - b.seed
  if (breaker === 'head_to_head') throw new Error('El desempate head_to_head todavía no está implementado.')

  const aValue = asNumber(a[breaker as keyof GroupStandingRow]) ?? 0
  const bValue = asNumber(b[breaker as keyof GroupStandingRow]) ?? 0
  return bValue - aValue
}

export function sortGroupStandings(rows: GroupStandingRow[], rules?: TournamentClassificationRules | null) {
  const tieBreakers = rules?.tie_breakers?.length ? rules.tie_breakers : defaultTieBreakers
  const normalized = tieBreakers.includes('seed') ? tieBreakers : [...tieBreakers, 'seed']

  return [...rows].sort((a, b) => {
    for (const breaker of normalized) {
      const result = compareByBreaker(a, b, breaker)
      if (result !== 0) return result
    }
    return a.team_id.localeCompare(b.team_id)
  })
}

export function calculateTournamentGroupStandings(input: {
  groups: TournamentGroup[]
  groupTeams: TournamentGroupTeam[]
  matches: TournamentStandingMatch[]
  classificationRules?: TournamentClassificationRules | null
}): GroupStandings[] {
  const winPoints = input.classificationRules?.points_for_win ?? 3
  const lossPoints = input.classificationRules?.points_for_loss ?? 0
  const classifyPerGroup = input.classificationRules?.classify_per_group ?? 2

  return input.groups
    .map((group) => {
      const groupTeams = input.groupTeams.filter((team) => team.group_id === group.id)
      const rows = new Map(groupTeams.map((team) => [team.team_id, emptyStanding(team)]))
      const groupMatches = input.matches.filter(
        (match) => match.group_id === group.id && match.phase === 'GROUP' && match.status === 'PLAYED'
      )

      for (const match of groupMatches) {
        const team1 = rows.get(match.team1_id)
        const team2 = rows.get(match.team2_id)
        if (!team1 || !team2 || !match.winner_team_id) continue

        const winner = match.winner_team_id === match.team1_id ? team1 : team2
        const loser = winner === team1 ? team2 : team1
        winner.played += 1
        loser.played += 1
        winner.wins += 1
        loser.losses += 1
        winner.match_points += winPoints
        loser.match_points += lossPoints

        const parsed = parseTournamentMatchScore(match.score)
        if (parsed) {
          applyScore(team1, parsed, 'team1')
          applyScore(team2, parsed, 'team2')
        }
      }

      const standings = sortGroupStandings(Array.from(rows.values()), input.classificationRules)
      return {
        group,
        standings,
        qualifiers: standings.slice(0, Math.max(0, classifyPerGroup)),
      }
    })
    .sort((a, b) => (a.group.order ?? 0) - (b.group.order ?? 0))
}
