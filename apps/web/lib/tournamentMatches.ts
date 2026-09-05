import { assertServiceRole, supabaseAdmin } from '@/lib/supabaseAdmin'
import { materializeOpenGroupDependentMatches } from '@/lib/tournamentOpenGroupDependencies'

export type MatchStatus = 'PENDING' | 'PLAYED' | 'CANCELLED'
export type MatchPhase =
  | 'GROUP'
  | 'ROUND_OF_32'
  | 'ROUND_OF_16'
  | 'EIGHTHS'
  | 'QUARTER'
  | 'SEMI'
  | 'FINAL'
  | 'THIRD_PLACE'
  | 'OTHER'
export type MatchScore = Record<string, unknown>

export type CreateMatchInput = {
  tournamentId: string
  clubId: string
  groupId?: string | null
  team1Id: string
  team2Id: string
  round?: number
  phase?: MatchPhase
  matchOrder?: number
  scheduledAt?: string | null
}

export type UpdateMatchResultInput = {
  matchId: string
  status: MatchStatus
  score?: MatchScore | null
  winnerTeamId?: string | null
}

export type ListMatchesByTournamentInput = {
  tournamentId: string
  clubId: string
}

const matchStatuses: MatchStatus[] = ['PENDING', 'PLAYED', 'CANCELLED']
const matchPhases: MatchPhase[] = [
  'GROUP',
  'ROUND_OF_32',
  'ROUND_OF_16',
  'EIGHTHS',
  'QUARTER',
  'SEMI',
  'FINAL',
  'THIRD_PLACE',
  'OTHER',
]
const playoffPhaseOrder: MatchPhase[] = ['ROUND_OF_32', 'ROUND_OF_16', 'EIGHTHS', 'QUARTER', 'SEMI', 'FINAL']

type PlayoffMatchRow = {
  id: string
  tournament_id: string
  club_id: string
  group_id: string | null
  team1_id: string
  team2_id: string
  phase: string | null
  status: string | null
  score: MatchScore | null
  winner_team_id: string | null
  round: number | null
  match_order: number | null
  created_at: string | null
}

type GeneralPlayoffPlanSlot = {
  position?: number
  pair_order?: number
  pair_slot?: number
  advances_to_match_order?: number
  is_bye_slot?: boolean
  team_id?: string | null
  global_seed?: number | null
}

type GeneralPlayoffPlanFirstRoundMatch = {
  phase?: string | null
  match_order?: number | null
  bracket_pair_order?: number | null
  slot_positions?: number[] | null
  team1_id?: string | null
  team2_id?: string | null
}

type GeneralPlayoffPlan = {
  source?: string
  bracket_size?: number
  bracket_slots?: GeneralPlayoffPlanSlot[]
  first_round_matches?: GeneralPlayoffPlanFirstRoundMatch[]
}

type GeneralPlayoffTarget = {
  nextPhase: MatchPhase
  nextMatchOrder: number
  targetSlot: 'team1_id' | 'team2_id'
  sourceBracketPairOrder: number
  siblingBracketPairOrder: number
  siblingByeTeamId: string | null
  siblingMatch: PlayoffMatchRow | null
  siblingWinnerTeamId: string | null
}

export class MatchResultUpdateError extends Error {
  code: string
  status: number

  constructor(code: string, message: string, status = 400) {
    super(message)
    this.name = 'MatchResultUpdateError'
    this.code = code
    this.status = status
  }
}

function assertUuid(value: string | null | undefined, label: string) {
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${label} inválido.`)
  }
}

function normalizePositiveInt(value: number | undefined, fallback: number, label: string) {
  const next = value ?? fallback
  if (!Number.isInteger(next) || next < 1) throw new Error(`${label} debe ser un entero positivo.`)
  return next
}

function normalizeOrder(value: number | undefined) {
  const next = value ?? 0
  if (!Number.isInteger(next) || next < 0) throw new Error('matchOrder debe ser un entero mayor o igual a 0.')
  return next
}

function normalizeIsoOrNull(value: string | null | undefined) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new Error('scheduledAt inválido.')
  return parsed.toISOString()
}

function normalizePhaseValue(value: string | null | undefined): MatchPhase | null {
  const phase = String(value ?? '').trim().toUpperCase()
  return matchPhases.includes(phase as MatchPhase) ? phase as MatchPhase : null
}

function isPlayoffPhase(value: string | null | undefined): value is MatchPhase {
  const phase = normalizePhaseValue(value)
  return Boolean(phase && playoffPhaseOrder.includes(phase))
}

function getNextPlayoffPhase(value: string | null | undefined): MatchPhase | null {
  const phase = normalizePhaseValue(value)
  if (!phase) return null
  const phaseIndex = playoffPhaseOrder.indexOf(phase)
  return phaseIndex >= 0 ? playoffPhaseOrder[phaseIndex + 1] ?? null : null
}

function getDependentMatchOrder(matchOrder: number | null | undefined) {
  const order = matchOrder ?? 0
  if (!Number.isInteger(order) || order < 1) return null
  return Math.ceil(order / 2)
}

function getDependentSlot(matchOrder: number | null | undefined): 'team1_id' | 'team2_id' | null {
  const order = matchOrder ?? 0
  if (!Number.isInteger(order) || order < 1) return null
  return order % 2 === 1 ? 'team1_id' : 'team2_id'
}

function hasScorePayload(score: MatchScore | null | undefined) {
  return Boolean(score && typeof score === 'object' && Object.keys(score).length > 0)
}

function hasStartedDependentMatch(match: Pick<PlayoffMatchRow, 'status' | 'score' | 'winner_team_id'>) {
  const status = String(match.status ?? '').toUpperCase()
  return status === 'PLAYED' || status === 'IN_PROGRESS' || Boolean(match.winner_team_id) || hasScorePayload(match.score)
}

function debugPlayoffPropagation(event: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV !== 'development') return
  console.debug('[playoff-propagation]', { event, ...payload })
}

function normalizeObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function readGeneralPlayoffPlan(rules: unknown): GeneralPlayoffPlan | null {
  const plan = normalizeObject(rules).playoff_plan
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return null
  const safePlan = plan as GeneralPlayoffPlan
  if (safePlan.source !== 'general_engine') return null
  if (!Array.isArray(safePlan.bracket_slots) || !Array.isArray(safePlan.first_round_matches)) return null
  return safePlan
}

async function readTournamentPlayoffPlan(input: { tournamentId: string; clubId: string }) {
  const { data, error } = await supabaseAdmin
    .from('tournaments')
    .select('rules_json,rules')
    .eq('id', input.tournamentId)
    .eq('club_id', input.clubId)
    .maybeSingle()

  if (error) throw new Error(`No pude leer el plan de playoff: ${error.message}`)
  return readGeneralPlayoffPlan(data?.rules_json ?? data?.rules ?? null)
}

function findPlayoffMatch(input: {
  matches: PlayoffMatchRow[]
  phase: MatchPhase | null
  matchOrder: number | null
}) {
  if (!input.phase || !input.matchOrder) return null
  return input.matches.find((match) =>
    normalizePhaseValue(match.phase) === input.phase &&
    (match.match_order ?? 0) === input.matchOrder
  ) ?? null
}

function getGeneralFirstRoundPlanMatch(plan: GeneralPlayoffPlan | null, match: PlayoffMatchRow) {
  if (!plan?.first_round_matches?.length) return null
  const sourcePhase = normalizePhaseValue(match.phase)
  if (!sourcePhase) return null

  return plan.first_round_matches.find((planMatch) =>
    normalizePhaseValue(planMatch.phase) === sourcePhase &&
    Number(planMatch.match_order ?? 0) === Number(match.match_order ?? 0)
  ) ?? null
}

function getGeneralByeTeamForPair(plan: GeneralPlayoffPlan, pairOrder: number) {
  const slots = (plan.bracket_slots ?? []).filter((slot) => Number(slot.pair_order ?? 0) === pairOrder)
  const hasByeSlot = slots.some((slot) => Boolean(slot.is_bye_slot))
  if (!hasByeSlot) return null
  return slots.find((slot) => slot.team_id)?.team_id ?? null
}

function getGeneralPlayoffTarget(input: {
  plan: GeneralPlayoffPlan | null
  match: PlayoffMatchRow
  matches: PlayoffMatchRow[]
}): GeneralPlayoffTarget | null {
  if (!input.plan || !isPlayoffPhase(input.match.phase)) return null

  const planMatch = getGeneralFirstRoundPlanMatch(input.plan, input.match)
  if (!planMatch) return null

  const sourceBracketPairOrder = Number(planMatch.bracket_pair_order ?? planMatch.match_order ?? 0)
  if (!Number.isInteger(sourceBracketPairOrder) || sourceBracketPairOrder < 1) {
    throw new MatchResultUpdateError(
      'PLAYOFF_PLAN_INVALID',
      'No se pudo resolver el orden real del partido en el plan de playoff.',
      409
    )
  }

  const nextPhase = getNextPlayoffPhase(input.match.phase)
  const nextMatchOrder = Math.ceil(sourceBracketPairOrder / 2)
  const targetSlot = sourceBracketPairOrder % 2 === 1 ? 'team1_id' : 'team2_id'
  if (!nextPhase || !nextMatchOrder) return null

  const siblingBracketPairOrder = sourceBracketPairOrder % 2 === 1
    ? sourceBracketPairOrder + 1
    : sourceBracketPairOrder - 1
  const siblingPlanMatch = (input.plan.first_round_matches ?? []).find((item) =>
    normalizePhaseValue(item.phase) === normalizePhaseValue(input.match.phase) &&
    Number(item.bracket_pair_order ?? item.match_order ?? 0) === siblingBracketPairOrder
  ) ?? null
  const siblingMatch = siblingPlanMatch
    ? findPlayoffMatch({
        matches: input.matches,
        phase: normalizePhaseValue(siblingPlanMatch.phase),
        matchOrder: Number(siblingPlanMatch.match_order ?? 0),
      })
    : null
  const siblingByeTeamId = getGeneralByeTeamForPair(input.plan, siblingBracketPairOrder)

  return {
    nextPhase,
    nextMatchOrder,
    targetSlot,
    sourceBracketPairOrder,
    siblingBracketPairOrder,
    siblingByeTeamId,
    siblingMatch,
    siblingWinnerTeamId:
      siblingMatch &&
      String(siblingMatch.status ?? '').toUpperCase() === 'PLAYED' &&
      siblingMatch.winner_team_id
        ? siblingMatch.winner_team_id
        : null,
  }
}

function assertNoStartedDependentMatch(input: {
  match: PlayoffMatchRow
  matches: PlayoffMatchRow[]
  playoffPlan?: GeneralPlayoffPlan | null
}) {
  if (!isPlayoffPhase(input.match.phase)) return

  const generalTarget = getGeneralPlayoffTarget({
    plan: input.playoffPlan ?? null,
    match: input.match,
    matches: input.matches,
  })
  let phase = generalTarget?.nextPhase ?? getNextPlayoffPhase(input.match.phase)
  let matchOrder = generalTarget?.nextMatchOrder ?? getDependentMatchOrder(input.match.match_order)

  while (phase && matchOrder) {
    const dependentMatch = findPlayoffMatch({ matches: input.matches, phase, matchOrder })
    if (!dependentMatch) return

    if (hasStartedDependentMatch(dependentMatch)) {
      throw new MatchResultUpdateError(
        'PLAYOFF_DEPENDENCY_STARTED',
        'No se puede editar este resultado porque una llave posterior dependiente ya empezó o tiene resultado cargado.',
        409
      )
    }

    phase = getNextPlayoffPhase(phase)
    matchOrder = getDependentMatchOrder(dependentMatch.match_order)
  }
}

function assertCanPropagatePlayoffWinner(input: {
  match: PlayoffMatchRow
  matches: PlayoffMatchRow[]
  winnerTeamId: string | null | undefined
  playoffPlan?: GeneralPlayoffPlan | null
}) {
  if (!input.winnerTeamId || !isPlayoffPhase(input.match.phase)) return

  const generalTarget = getGeneralPlayoffTarget({
    plan: input.playoffPlan ?? null,
    match: input.match,
    matches: input.matches,
  })
  const nextPhase = generalTarget?.nextPhase ?? getNextPlayoffPhase(input.match.phase)
  const nextMatchOrder = generalTarget?.nextMatchOrder ?? getDependentMatchOrder(input.match.match_order)
  const targetSlot = generalTarget?.targetSlot ?? getDependentSlot(input.match.match_order)
  if (!nextPhase || !nextMatchOrder || !targetSlot) return

  const existingNextMatch = findPlayoffMatch({
    matches: input.matches,
    phase: nextPhase,
    matchOrder: nextMatchOrder,
  })

  if (existingNextMatch) {
    const oppositeSlot = targetSlot === 'team1_id' ? 'team2_id' : 'team1_id'
    if (existingNextMatch[oppositeSlot] === input.winnerTeamId) {
      throw new MatchResultUpdateError(
        'PLAYOFF_DUPLICATED_DEPENDENT_TEAM',
        'No se puede propagar el ganador porque ya está cargado como rival en la llave siguiente.',
        409
      )
    }
    return
  }

  if (generalTarget?.siblingByeTeamId === input.winnerTeamId) {
    throw new MatchResultUpdateError(
      'PLAYOFF_DUPLICATED_DEPENDENT_TEAM',
      'No se puede propagar la llave porque el ganador coincide con el equipo que recibió BYE.',
      409
    )
  }

  if (generalTarget?.siblingWinnerTeamId === input.winnerTeamId) {
    throw new MatchResultUpdateError(
      'PLAYOFF_DUPLICATED_DEPENDENT_TEAM',
      'No se puede propagar la llave porque los partidos fuente tienen el mismo ganador.',
      409
    )
  }

  const firstSourceOrder = (nextMatchOrder * 2) - 1
  const secondSourceOrder = nextMatchOrder * 2
  const siblingOrder = input.match.match_order === firstSourceOrder ? secondSourceOrder : firstSourceOrder
  const siblingMatch = findPlayoffMatch({
    matches: input.matches,
    phase: input.match.phase,
    matchOrder: siblingOrder,
  })

  if (
    siblingMatch &&
    String(siblingMatch.status ?? '').toUpperCase() === 'PLAYED' &&
    siblingMatch.winner_team_id === input.winnerTeamId
  ) {
    throw new MatchResultUpdateError(
      'PLAYOFF_DUPLICATED_DEPENDENT_TEAM',
      'No se puede propagar la llave porque los partidos fuente tienen el mismo ganador.',
      409
    )
  }
}

async function readPlayoffMatches(input: { tournamentId: string; clubId: string }) {
  const { data, error } = await supabaseAdmin
    .from('tournament_matches')
    .select('id,tournament_id,club_id,group_id,team1_id,team2_id,phase,status,score,winner_team_id,round,match_order,created_at')
    .eq('tournament_id', input.tournamentId)
    .eq('club_id', input.clubId)
    .in('phase', playoffPhaseOrder)

  if (error) throw new Error(`No pude leer llaves de playoff: ${error.message}`)
  return (data ?? []) as PlayoffMatchRow[]
}

function withUpdatedPlayoffMatch(matches: PlayoffMatchRow[], updatedMatch: PlayoffMatchRow) {
  return matches.map((match) => match.id === updatedMatch.id ? updatedMatch : match)
}

function getSourceWinnersForDependentMatch(input: {
  matches: PlayoffMatchRow[]
  phase: MatchPhase
  dependentOrder: number
}) {
  const firstSourceOrder = (input.dependentOrder * 2) - 1
  const secondSourceOrder = input.dependentOrder * 2
  const sourceMatches = [firstSourceOrder, secondSourceOrder].map((matchOrder) =>
    findPlayoffMatch({ matches: input.matches, phase: input.phase, matchOrder })
  )

  if (sourceMatches.some((match) => !match)) return null
  const [firstSource, secondSource] = sourceMatches as [PlayoffMatchRow, PlayoffMatchRow]
  if (
    String(firstSource.status ?? '').toUpperCase() !== 'PLAYED' ||
    String(secondSource.status ?? '').toUpperCase() !== 'PLAYED' ||
    !firstSource.winner_team_id ||
    !secondSource.winner_team_id
  ) {
    return null
  }

  if (firstSource.winner_team_id === secondSource.winner_team_id) {
    throw new MatchResultUpdateError(
      'PLAYOFF_DUPLICATED_DEPENDENT_TEAM',
      'No se puede propagar la llave porque los partidos fuente tienen el mismo ganador.',
      409
    )
  }

  return {
    team1Id: firstSource.winner_team_id,
    team2Id: secondSource.winner_team_id,
    sourceMatches,
  }
}

async function propagatePlayoffWinner(input: {
  match: PlayoffMatchRow
  winnerTeamId: string | null | undefined
  matches: PlayoffMatchRow[]
  playoffPlan?: GeneralPlayoffPlan | null
}) {
  if (!input.winnerTeamId || !isPlayoffPhase(input.match.phase)) return null

  const generalTarget = getGeneralPlayoffTarget({
    plan: input.playoffPlan ?? null,
    match: input.match,
    matches: input.matches,
  })
  const nextPhase = generalTarget?.nextPhase ?? getNextPlayoffPhase(input.match.phase)
  const nextMatchOrder = generalTarget?.nextMatchOrder ?? getDependentMatchOrder(input.match.match_order)
  const targetSlot = generalTarget?.targetSlot ?? getDependentSlot(input.match.match_order)
  debugPlayoffPropagation('calculated-target', {
    sourceMatchId: input.match.id,
    sourcePhase: input.match.phase,
    sourceMatchOrder: input.match.match_order,
    sourceBracketPairOrder: generalTarget?.sourceBracketPairOrder ?? null,
    winnerTeamId: input.winnerTeamId,
    nextPhase,
    nextMatchOrder,
    targetSlot,
    source: generalTarget ? 'general_engine' : 'legacy',
  })
  if (!nextPhase || !nextMatchOrder || !targetSlot) return null

  const existingNextMatch = findPlayoffMatch({
    matches: input.matches,
    phase: nextPhase,
    matchOrder: nextMatchOrder,
  })
  debugPlayoffPropagation('resolved-next-match', {
    sourceMatchId: input.match.id,
    nextPhase,
    nextMatchOrder,
    targetSlot,
    existingNextMatchId: existingNextMatch?.id ?? null,
  })

  if (existingNextMatch) {
    const oppositeSlot = targetSlot === 'team1_id' ? 'team2_id' : 'team1_id'
    if (existingNextMatch[oppositeSlot] === input.winnerTeamId) {
      throw new MatchResultUpdateError(
        'PLAYOFF_DUPLICATED_DEPENDENT_TEAM',
        'No se puede propagar el ganador porque ya está cargado como rival en la llave siguiente.',
        409
      )
    }

    const { data, error } = await supabaseAdmin
      .from('tournament_matches')
      .update({ [targetSlot]: input.winnerTeamId })
      .eq('id', existingNextMatch.id)
      .select('*')
      .single()

    if (error) throw new Error(`No pude propagar el ganador a la llave siguiente: ${error.message}`)
    debugPlayoffPropagation('updated-next-match', {
      sourceMatchId: input.match.id,
      nextMatchId: existingNextMatch.id,
      nextPhase,
      nextMatchOrder,
      targetSlot,
      winnerTeamId: input.winnerTeamId,
    })
    return { mode: 'updated', match: data }
  }

  if (generalTarget) {
    const oppositeTeamId = generalTarget.siblingByeTeamId ?? generalTarget.siblingWinnerTeamId
    if (!oppositeTeamId) {
      debugPlayoffPropagation('waiting-for-sibling-winner', {
        sourceMatchId: input.match.id,
        sourcePhase: input.match.phase,
        sourceBracketPairOrder: generalTarget.sourceBracketPairOrder,
        siblingBracketPairOrder: generalTarget.siblingBracketPairOrder,
        nextPhase,
        nextMatchOrder,
        source: 'general_engine',
      })
      return null
    }

    if (oppositeTeamId === input.winnerTeamId) {
      throw new MatchResultUpdateError(
        'PLAYOFF_DUPLICATED_DEPENDENT_TEAM',
        'No se puede propagar la llave porque el ganador coincide con el rival del slot dependiente.',
        409
      )
    }

    const team1Id = targetSlot === 'team1_id' ? input.winnerTeamId : oppositeTeamId
    const team2Id = targetSlot === 'team2_id' ? input.winnerTeamId : oppositeTeamId
    const { match } = await createMatch({
      tournamentId: input.match.tournament_id,
      clubId: input.match.club_id,
      groupId: null,
      team1Id,
      team2Id,
      phase: nextPhase,
      round: (input.match.round ?? 1) + 1,
      matchOrder: nextMatchOrder,
    })

    debugPlayoffPropagation('created-next-match', {
      sourceMatchId: input.match.id,
      nextMatchId: match?.id ?? null,
      nextPhase,
      nextMatchOrder,
      team1Id,
      team2Id,
      sourceBracketPairOrder: generalTarget.sourceBracketPairOrder,
      siblingBracketPairOrder: generalTarget.siblingBracketPairOrder,
      siblingByeTeamId: generalTarget.siblingByeTeamId,
      source: 'general_engine',
    })
    return { mode: 'created', match }
  }

  const sourceWinners = getSourceWinnersForDependentMatch({
    matches: input.matches,
    phase: input.match.phase,
    dependentOrder: nextMatchOrder,
  })
  if (!sourceWinners) {
    debugPlayoffPropagation('waiting-for-sibling-winner', {
      sourceMatchId: input.match.id,
      sourcePhase: input.match.phase,
      nextPhase,
      nextMatchOrder,
    })
    return null
  }

  const { match } = await createMatch({
    tournamentId: input.match.tournament_id,
    clubId: input.match.club_id,
    groupId: null,
    team1Id: sourceWinners.team1Id,
    team2Id: sourceWinners.team2Id,
    phase: nextPhase,
    round: (input.match.round ?? 1) + 1,
    matchOrder: nextMatchOrder,
  })

  debugPlayoffPropagation('created-next-match', {
    sourceMatchId: input.match.id,
    nextMatchId: match?.id ?? null,
    nextPhase,
    nextMatchOrder,
    team1Id: sourceWinners.team1Id,
    team2Id: sourceWinners.team2Id,
  })
  return { mode: 'created', match }
}

async function ensureTournament(input: { tournamentId: string; clubId: string }) {
  const { data, error } = await supabaseAdmin
    .from('tournaments')
    .select('id,club_id,name')
    .eq('id', input.tournamentId)
    .maybeSingle()

  if (error) throw new Error(`No pude validar el torneo: ${error.message}`)
  if (!data?.id) throw new Error('Torneo no encontrado.')
  if (data.club_id !== input.clubId) throw new Error('El torneo no pertenece al club indicado.')
  return data
}

async function ensureTeams(input: { tournamentId: string; clubId: string; team1Id: string; team2Id: string; winnerTeamId?: string | null }) {
  if (input.team1Id === input.team2Id) throw new Error('team1Id y team2Id deben ser distintos.')
  if (input.winnerTeamId && input.winnerTeamId !== input.team1Id && input.winnerTeamId !== input.team2Id) {
    throw new Error('winnerTeamId debe ser uno de los equipos del partido.')
  }

  const teamIds = [input.team1Id, input.team2Id, input.winnerTeamId].filter(Boolean) as string[]
  const { data, error } = await supabaseAdmin
    .from('tournament_teams')
    .select('id,tournament_id,club_id')
    .in('id', Array.from(new Set(teamIds)))

  if (error) throw new Error(`No pude validar equipos: ${error.message}`)

  const teams = new Map((data ?? []).map((team: { id: string; tournament_id: string; club_id: string }) => [team.id, team]))
  for (const teamId of teamIds) {
    const team = teams.get(teamId)
    if (!team) throw new Error('Equipo no encontrado.')
    if (team.tournament_id !== input.tournamentId) throw new Error('Todos los equipos deben pertenecer al torneo indicado.')
    if (team.club_id !== input.clubId) throw new Error('Todos los equipos deben pertenecer al club indicado.')
  }
}

export async function createMatch(input: CreateMatchInput) {
  assertServiceRole()
  assertUuid(input.tournamentId, 'tournamentId')
  assertUuid(input.clubId, 'clubId')
  if (input.groupId) assertUuid(input.groupId, 'groupId')
  assertUuid(input.team1Id, 'team1Id')
  assertUuid(input.team2Id, 'team2Id')

  const phase = input.phase ?? 'GROUP'
  if (!matchPhases.includes(phase)) throw new Error('phase inválida.')

  const round = normalizePositiveInt(input.round, 1, 'round')
  const matchOrder = normalizeOrder(input.matchOrder)
  const scheduledAt = normalizeIsoOrNull(input.scheduledAt)

  await ensureTournament({ tournamentId: input.tournamentId, clubId: input.clubId })
  await ensureTeams({
    tournamentId: input.tournamentId,
    clubId: input.clubId,
    team1Id: input.team1Id,
    team2Id: input.team2Id,
  })

  const { data, error } = await supabaseAdmin
    .from('tournament_matches')
    .insert({
      tournament_id: input.tournamentId,
      club_id: input.clubId,
      group_id: input.groupId ?? null,
      team1_id: input.team1Id,
      team2_id: input.team2Id,
      round,
      phase,
      status: 'PENDING' satisfies MatchStatus,
      score: {},
      match_order: matchOrder,
      scheduled_at: scheduledAt,
    })
    .select('*')
    .single()

  if (error) throw new Error(`No pude crear el partido: ${error.message}`)
  return { match: data }
}

export async function updateMatchResult(input: UpdateMatchResultInput) {
  assertServiceRole()
  assertUuid(input.matchId, 'matchId')
  if (input.winnerTeamId) assertUuid(input.winnerTeamId, 'winnerTeamId')
  if (!matchStatuses.includes(input.status)) throw new Error('status inválido.')

  const { data: match, error: matchError } = await supabaseAdmin
    .from('tournament_matches')
    .select('id,tournament_id,club_id,group_id,team1_id,team2_id,phase,status,score,winner_team_id,round,match_order,created_at')
    .eq('id', input.matchId)
    .maybeSingle()

  if (matchError) throw new Error(`No pude buscar el partido: ${matchError.message}`)
  if (!match?.id) throw new Error('Partido no encontrado.')
  const currentMatch = match as PlayoffMatchRow

  await ensureTeams({
    tournamentId: currentMatch.tournament_id,
    clubId: currentMatch.club_id,
    team1Id: currentMatch.team1_id,
    team2Id: currentMatch.team2_id,
    winnerTeamId: input.winnerTeamId,
  })

  const playoffMatches = isPlayoffPhase(currentMatch.phase)
    ? await readPlayoffMatches({ tournamentId: currentMatch.tournament_id, clubId: currentMatch.club_id })
    : []
  const playoffPlan = isPlayoffPhase(currentMatch.phase)
    ? await readTournamentPlayoffPlan({ tournamentId: currentMatch.tournament_id, clubId: currentMatch.club_id })
    : null

  if (isPlayoffPhase(currentMatch.phase)) {
    assertNoStartedDependentMatch({
      match: currentMatch,
      matches: playoffMatches,
      playoffPlan,
    })
    assertCanPropagatePlayoffWinner({
      match: currentMatch,
      matches: playoffMatches,
      winnerTeamId: input.winnerTeamId,
      playoffPlan,
    })
  }

  const payload = {
    status: input.status,
    score: input.score ?? {},
    winner_team_id: input.winnerTeamId ?? null,
  }

  const { data, error } = await supabaseAdmin
    .from('tournament_matches')
    .update(payload)
    .eq('id', input.matchId)
    .select('*')
    .single()

  if (error) throw new Error(`No pude actualizar el resultado: ${error.message}`)
  const updatedPlayoffMatches = isPlayoffPhase(currentMatch.phase)
    ? withUpdatedPlayoffMatch(playoffMatches, data as PlayoffMatchRow)
    : []
  const propagation = isPlayoffPhase(currentMatch.phase)
    ? await propagatePlayoffWinner({
      match: data as PlayoffMatchRow,
      winnerTeamId: input.winnerTeamId,
      matches: updatedPlayoffMatches,
      playoffPlan,
    })
    : null

  // La carga del resultado ya fue persistida. Los cruces dependientes son un
  // paso posterior y opcional: un fallo allí nunca puede convertir un guardado
  // exitoso en un error para quien cargó el partido.
  let groupDependency: Awaited<ReturnType<typeof materializeOpenGroupDependentMatches>> | null = null
  let groupDependencyWarning: string | null = null
  const isInitialOpenGroupMatch = String(currentMatch.phase ?? '').toUpperCase() === 'GROUP'
    && Number(currentMatch.round) === 1

  if (isInitialOpenGroupMatch) {
    try {
      groupDependency = await materializeOpenGroupDependentMatches({
        tournamentId: currentMatch.tournament_id,
        clubId: currentMatch.club_id,
        groupId: currentMatch.group_id,
      })
    } catch (error) {
      console.error('No se pudieron materializar los cruces dependientes luego de guardar el resultado.', error)
      groupDependencyWarning = 'El resultado se guardó, pero no pudimos actualizar los cruces siguientes.'
    }
  }

  return { match: data, propagation, groupDependency, groupDependencyWarning }
}

export async function listMatchesByTournament(input: ListMatchesByTournamentInput) {
  assertServiceRole()
  assertUuid(input.tournamentId, 'tournamentId')
  assertUuid(input.clubId, 'clubId')

  await ensureTournament({ tournamentId: input.tournamentId, clubId: input.clubId })

  const { data, error } = await supabaseAdmin
    .from('tournament_matches')
    .select('*')
    .eq('tournament_id', input.tournamentId)
    .eq('club_id', input.clubId)
    .order('round', { ascending: true })
    .order('match_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw new Error(`No pude listar partidos: ${error.message}`)
  return { matches: data ?? [] }
}
