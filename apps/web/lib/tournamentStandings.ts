import {
  criterionToLegacyBreaker,
  legacyGroupTiebreakerConfig,
  normalizeGroupTiebreakerConfig,
  type GroupTiebreakerConfig,
  type GroupTiebreakerCriterion,
  type GroupTiebreakerFinal,
} from './tournamentTiebreakers'

type JsonObject = Record<string, unknown>

export type TournamentClassificationRules = {
  classify_per_group?: number
  tie_breakers?: string[]
  group_tiebreakers?: GroupTiebreakerConfig
  points_for_win?: number
  points_for_loss?: number
}

function normalizeScoringValue(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null
}

export function resolveTournamentClassificationRules(value: unknown, tournamentRules?: unknown): TournamentClassificationRules | null {
  const base = value && typeof value === 'object' && !Array.isArray(value) ? value as TournamentClassificationRules : {}
  const safeRules = tournamentRules && typeof tournamentRules === 'object' && !Array.isArray(tournamentRules)
    ? tournamentRules as Record<string, unknown>
    : {}
  const groupScoring = safeRules.group_scoring && typeof safeRules.group_scoring === 'object' && !Array.isArray(safeRules.group_scoring)
    ? safeRules.group_scoring as Record<string, unknown>
    : {}
  const winPoints = base.points_for_win ?? normalizeScoringValue(groupScoring.win_points)
  const lossPoints = base.points_for_loss ?? normalizeScoringValue(groupScoring.loss_points)

  const resolved: TournamentClassificationRules = {
    ...base,
    ...(safeRules.group_tiebreakers ? { group_tiebreakers: safeRules.group_tiebreakers as GroupTiebreakerConfig } : {}),
    ...(winPoints !== null && winPoints !== undefined ? { points_for_win: winPoints } : {}),
    ...(lossPoints !== null && lossPoints !== undefined ? { points_for_loss: lossPoints } : {}),
  }
  return Object.keys(resolved).length > 0 ? resolved : null
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
  tiebreakers?: GroupStandingTiebreakerDecision[]
}

export type GroupStandingTiebreakerDecision = {
  group_id: string
  tiedTeamIds: string[]
  tiedCriteria: Array<GroupTiebreakerCriterion>
  resolvedBy: GroupTiebreakerCriterion | GroupTiebreakerFinal
  requiresManualResolution?: boolean
}

type ParsedScore = {
  setsForTeam1: number
  setsForTeam2: number
  gamesForTeam1: number
  gamesForTeam2: number
}

type ParsedSetPair = {
  team1: number
  team2: number
  isSuperTiebreak?: boolean
}

function asNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function parseSetPair(value: unknown): ParsedSetPair | null {
  if (!value || typeof value !== 'object') return null
  const row = value as JsonObject
  const team1 = asNumber(row.team1 ?? row.team1_games ?? row.a)
  const team2 = asNumber(row.team2 ?? row.team2_games ?? row.b)
  return team1 !== null && team2 !== null
    ? {
        team1,
        team2,
        isSuperTiebreak: String(row.type ?? '').toUpperCase().includes('SUPER_TIEBREAK'),
      }
    : null
}

function parseScoreText(text: string): ParsedScore | null {
  const pairs = Array.from(text.matchAll(/(\(?)(\d{1,2})\s*[-/]\s*(\d{1,2})(\)?)/g))
    .map((match, index) => {
      const team1 = Number(match[2])
      const team2 = Number(match[3])
      const wrappedInParentheses = match[1] === '(' || match[4] === ')'
      return {
        team1,
        team2,
        isSuperTiebreak: wrappedInParentheses || (index >= 2 && Math.max(team1, team2) >= 10),
      }
    })
    .filter((set) => Number.isFinite(set.team1) && Number.isFinite(set.team2))

  if (pairs.length === 0) return null
  return summarizeSets(pairs)
}

function summarizeSets(sets: ParsedSetPair[]): ParsedScore {
  return sets.reduce<ParsedScore>(
    (acc, set) => {
      if (set.team1 > set.team2) acc.setsForTeam1 += 1
      if (set.team2 > set.team1) acc.setsForTeam2 += 1

      if (set.isSuperTiebreak) {
        acc.gamesForTeam1 += set.team1 > set.team2 ? 1 : 0
        acc.gamesForTeam2 += set.team2 > set.team1 ? 1 : 0
        return acc
      }

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
    const sets = score.sets.map(parseSetPair).filter((set): set is ParsedSetPair => Boolean(set))
    const superTiebreak = parseSetPair(score.super_tiebreak)
    if (superTiebreak) {
      sets.push({ ...superTiebreak, isSuperTiebreak: true })
    }
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

function configFromClassificationRules(rules?: TournamentClassificationRules | null) {
  if (rules?.group_tiebreakers) return normalizeGroupTiebreakerConfig(rules.group_tiebreakers)
  if (!rules?.tie_breakers?.length) return legacyGroupTiebreakerConfig

  const final: GroupTiebreakerFinal = rules.tie_breakers.some((breaker) => String(breaker).toLowerCase() === 'seed')
    ? 'SEED'
    : legacyGroupTiebreakerConfig.final

  return normalizeGroupTiebreakerConfig(
    {
      order: rules.tie_breakers,
      final,
    },
    legacyGroupTiebreakerConfig
  )
}

function getCriterionValue(row: GroupStandingRow, criterion: GroupTiebreakerCriterion) {
  if (criterion === 'POINTS') return row.match_points
  if (criterion === 'SET_DIFF') return row.set_difference
  if (criterion === 'GAME_DIFF') return row.game_difference
  return 0
}

function groupByKey<T>(items: T[], getKey: (item: T) => string) {
  const groups: T[][] = []
  let currentKey: string | null = null
  let currentGroup: T[] = []

  for (const item of items) {
    const key = getKey(item)
    if (currentKey === null || key === currentKey) {
      currentKey = key
      currentGroup.push(item)
      continue
    }

    groups.push(currentGroup)
    currentKey = key
    currentGroup = [item]
  }

  if (currentGroup.length > 0) groups.push(currentGroup)
  return groups
}

function buildHeadToHeadValues(input: {
  rows: GroupStandingRow[]
  matches: TournamentStandingMatch[]
  winPoints: number
  lossPoints: number
}) {
  const tiedTeamIds = new Set(input.rows.map((row) => row.team_id))
  const miniRows = new Map(input.rows.map((row) => [row.team_id, { ...row, played: 0, wins: 0, losses: 0, match_points: 0, sets_for: 0, sets_against: 0, set_difference: 0, games_for: 0, games_against: 0, game_difference: 0 }]))

  for (const match of input.matches) {
    if (String(match.phase ?? '').toUpperCase() !== 'GROUP' || String(match.status ?? '').toUpperCase() !== 'PLAYED') continue
    if (!match.winner_team_id || !tiedTeamIds.has(match.team1_id) || !tiedTeamIds.has(match.team2_id)) continue

    const team1 = miniRows.get(match.team1_id)
    const team2 = miniRows.get(match.team2_id)
    if (!team1 || !team2) continue

    const winner = match.winner_team_id === match.team1_id ? team1 : team2
    const loser = winner === team1 ? team2 : team1
    winner.played += 1
    loser.played += 1
    winner.wins += 1
    loser.losses += 1
    winner.match_points += input.winPoints
    loser.match_points += input.lossPoints

    const parsed = parseTournamentMatchScore(match.score)
    if (parsed) {
      applyScore(team1, parsed, 'team1')
      applyScore(team2, parsed, 'team2')
    }
  }

  return miniRows
}

function getSortTuple(input: {
  row: GroupStandingRow
  criterion: GroupTiebreakerCriterion
  rows: GroupStandingRow[]
  matches: TournamentStandingMatch[]
  winPoints: number
  lossPoints: number
  headToHeadRows?: Map<string, GroupStandingRow>
}) {
  if (input.criterion !== 'HEAD_TO_HEAD') return [getCriterionValue(input.row, input.criterion)]
  const miniRow = input.headToHeadRows?.get(input.row.team_id)
  return [miniRow?.match_points ?? 0, miniRow?.set_difference ?? 0, miniRow?.game_difference ?? 0]
}

function compareTuples(left: number[], right: number[]) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (right[index] ?? 0) - (left[index] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

function sortGroupStandingsWithDecisions(input: {
  groupId: string
  rows: GroupStandingRow[]
  matches: TournamentStandingMatch[]
  rules?: TournamentClassificationRules | null
  winPoints: number
  lossPoints: number
}) {
  const config = configFromClassificationRules(input.rules)
  const decisions: GroupStandingTiebreakerDecision[] = []

  const sortRows = (
    rows: GroupStandingRow[],
    criterionIndex: number,
    tiedCriteria: GroupTiebreakerCriterion[]
  ): GroupStandingRow[] => {
    if (rows.length <= 1) return rows

    const criterion = config.order[criterionIndex]
    if (!criterion) {
      if (config.final === 'SEED') {
        const sorted = [...rows].sort((left, right) => {
          if (left.seed !== right.seed) return left.seed - right.seed
          return left.team_id.localeCompare(right.team_id)
        })
        const seedGroups = new Set(sorted.map((row) => row.seed))
        if (tiedCriteria.length > 0 && seedGroups.size > 1) {
          decisions.push({
            group_id: input.groupId,
            tiedTeamIds: rows.map((row) => row.team_id),
            tiedCriteria,
            resolvedBy: 'SEED',
          })
        }
        return sorted
      }

      if (tiedCriteria.length > 0) {
        decisions.push({
          group_id: input.groupId,
          tiedTeamIds: rows.map((row) => row.team_id),
          tiedCriteria,
          resolvedBy: 'DRAW',
          requiresManualResolution: true,
        })
      }
      return [...rows].sort((left, right) => left.team_id.localeCompare(right.team_id))
    }

    const headToHeadRows = criterion === 'HEAD_TO_HEAD'
      ? buildHeadToHeadValues({
          rows,
          matches: input.matches,
          winPoints: input.winPoints,
          lossPoints: input.lossPoints,
        })
      : undefined
    const getTuple = (row: GroupStandingRow) =>
      getSortTuple({
        row,
        criterion,
        rows,
        matches: input.matches,
        winPoints: input.winPoints,
        lossPoints: input.lossPoints,
        headToHeadRows,
      })
    const sorted = [...rows].sort((left, right) => {
      const result = compareTuples(getTuple(left), getTuple(right))
      if (result !== 0) return result
      return left.team_id.localeCompare(right.team_id)
    })
    const tupleGroups = groupByKey(sorted, (row) => JSON.stringify(getTuple(row)))

    if (tiedCriteria.length > 0 && tupleGroups.length > 1) {
      decisions.push({
        group_id: input.groupId,
        tiedTeamIds: rows.map((row) => row.team_id),
        tiedCriteria,
        resolvedBy: criterion,
      })
    }

    return tupleGroups.flatMap((group) =>
      group.length > 1 ? sortRows(group, criterionIndex + 1, [...tiedCriteria, criterion]) : group
    )
  }

  return {
    standings: sortRows(input.rows, 0, []),
    tiebreakers: decisions,
  }
}

export function sortGroupStandings(rows: GroupStandingRow[], rules?: TournamentClassificationRules | null) {
  const config = configFromClassificationRules(rules)
  const legacyTieBreakers = [...config.order.map(criterionToLegacyBreaker), config.final === 'SEED' ? 'seed' : null]
    .filter((breaker): breaker is string => Boolean(breaker))

  return [...rows].sort((a, b) => {
    for (const breaker of legacyTieBreakers) {
      if (breaker === 'seed') {
        if (a.seed !== b.seed) return a.seed - b.seed
        continue
      }
      const aValue = asNumber(a[breaker as keyof GroupStandingRow]) ?? 0
      const bValue = asNumber(b[breaker as keyof GroupStandingRow]) ?? 0
      if (aValue !== bValue) return bValue - aValue
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

      const sorted = sortGroupStandingsWithDecisions({
        groupId: group.id,
        rows: Array.from(rows.values()),
        matches: groupMatches,
        rules: input.classificationRules,
        winPoints,
        lossPoints,
      })
      return {
        group,
        standings: sorted.standings,
        qualifiers: sorted.standings.slice(0, Math.max(0, classifyPerGroup)),
        tiebreakers: sorted.tiebreakers,
      }
    })
    .sort((a, b) => (a.group.order ?? 0) - (b.group.order ?? 0))
}
