export type TournamentOperationalNoticeType = 'info' | 'warning' | 'success'

export type TournamentOperationalNoticeScope = 'groups' | 'group' | 'playoff' | 'registrations' | 'general'

export type TournamentOperationalNotice = {
  id: string
  type: TournamentOperationalNoticeType
  title: string
  message: string
  scope: TournamentOperationalNoticeScope
  groupId?: string
  groupName?: string
}

type NoticeStandingRow = {
  team_id: string
  played: number
  match_points: number
  set_difference: number
  game_difference: number
  seed: number
}

type NoticeGroupStandings = {
  group: {
    id: string
    name: string
  }
  standings: NoticeStandingRow[]
  tiebreakers?: Array<{
    tiedTeamIds?: string[]
    tiedCriteria: string[]
    resolvedBy: string
    requiresManualResolution?: boolean
  }>
}

type NoticeRegistration = {
  id: string
  status?: string | null
  admission_status?: string | null
}

type NoticeMatch = {
  id: string
  phase?: string | null
  status?: string | null
  score?: Record<string, unknown> | null
  team1_id?: string | null
  team2_id?: string | null
}

type NoticePlayoffRound = {
  phase: string
  label: string
  slots: Array<{
    kind: 'match' | 'placeholder' | 'bye'
  }>
}

export type BuildTournamentOperationalNoticesInput = {
  standings?: NoticeGroupStandings[]
  registrations?: NoticeRegistration[]
  matches?: NoticeMatch[]
  playoffRounds?: NoticePlayoffRound[]
  scheduleWarnings?: Array<{ code?: string | null; message?: string | null }>
}

const tiebreakerLabels: Record<string, string> = {
  POINTS: 'puntos',
  HEAD_TO_HEAD: 'resultado entre empatados / mini-tabla',
  SET_DIFF: 'diferencia de sets',
  GAME_DIFF: 'diferencia de games',
  SEED: 'seed/preclasificación',
  DRAW: 'sorteo/manual',
  match_points: 'puntos',
  head_to_head: 'resultado entre empatados / mini-tabla',
  set_difference: 'diferencia de sets',
  game_difference: 'diferencia de games',
  seed: 'seed/preclasificación',
}

const tiebreakerCompactLabels: Record<string, string> = {
  POINTS: 'puntos',
  HEAD_TO_HEAD: 'mini-tabla',
  SET_DIFF: 'sets',
  GAME_DIFF: 'games',
  SEED: 'seed',
  DRAW: 'sorteo/manual',
  match_points: 'puntos',
  head_to_head: 'mini-tabla',
  set_difference: 'sets',
  game_difference: 'games',
  seed: 'seed',
}

const tiebreakerResolvedLabels: Record<string, string> = {
  POINTS: 'puntos',
  HEAD_TO_HEAD: 'mini-tabla',
  SET_DIFF: 'diferencia de sets',
  GAME_DIFF: 'diferencia de games',
  SEED: 'seed',
  DRAW: 'sorteo/manual',
  match_points: 'puntos',
  head_to_head: 'mini-tabla',
  set_difference: 'diferencia de sets',
  game_difference: 'diferencia de games',
  seed: 'seed',
}

const tiedCriteriaByBreaker: Record<string, string[]> = {
  set_difference: ['POINTS'],
  game_difference: ['POINTS', 'SET_DIFF'],
  seed: ['POINTS', 'SET_DIFF', 'GAME_DIFF'],
}

function normalizeNoticeMessage(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function addNoticeOnce(notices: TournamentOperationalNotice[], notice: TournamentOperationalNotice) {
  if (notices.some((item) => item.id === notice.id)) return
  const dedupeKey = `${notice.scope}:${notice.groupId ?? 'all'}:${normalizeNoticeMessage(notice.message)}`
  if (notices.some((item) => `${item.scope}:${item.groupId ?? 'all'}:${normalizeNoticeMessage(item.message)}` === dedupeKey)) return
  notices.push(notice)
}

function isWalkoverMatch(match: NoticeMatch) {
  const score = match.score ?? {}
  const text = typeof score.text === 'string' ? score.text.toUpperCase() : ''
  const type = typeof score.type === 'string' ? score.type.toUpperCase() : ''
  const status = String(match.status ?? '').toUpperCase()

  return score.walkover === true || type === 'WALKOVER' || status === 'WALKOVER' || /\bWO\b|WALKOVER/.test(text)
}

function getMatchScope(match: NoticeMatch): TournamentOperationalNoticeScope {
  const phase = String(match.phase ?? '').toUpperCase()
  if (phase === 'GROUP') return 'groups'
  if (phase) return 'playoff'
  return 'general'
}

function findAppliedTiebreaker(rows: NoticeStandingRow[]) {
  const tiedRows = rows.filter((row) => row.played > 0)
  if (tiedRows.length < 2) return null

  const uniquePoints = new Set(tiedRows.map((row) => row.match_points))
  if (uniquePoints.size !== 1) return null

  for (const breaker of ['set_difference', 'game_difference', 'seed'] as const) {
    const values = new Set(tiedRows.map((row) => row[breaker]))
    if (values.size > 1) return breaker
  }

  return null
}

function formatTiebreakerMessage(breaker: string) {
  const tiedCriteria = tiedCriteriaByBreaker[breaker] ?? ['puntos']
  const tiedText = formatCompactList(tiedCriteria.map((criterion) => tiebreakerCompactLabels[criterion] ?? criterion))
  const resolvedBy = tiebreakerResolvedLabels[breaker] ?? tiebreakerLabels[breaker] ?? breaker

  return tiedCriteria.length > 0
    ? `Desempate aplicado entre parejas igualadas en ${tiedText}. Se resolvió por ${resolvedBy}.`
    : `Desempate aplicado entre parejas igualadas. Se resolvió por ${resolvedBy}.`
}

function formatTiebreakerSubject(positions: number[]) {
  if (positions.length < 2) return 'entre parejas igualadas'
  const sortedPositions = [...positions].sort((left, right) => left - right)
  return `entre posiciones ${formatCompactList(sortedPositions.map(String))}`
}

function findDecisionPositions(
  decision: NonNullable<NoticeGroupStandings['tiebreakers']>[number],
  rows: NoticeStandingRow[]
) {
  if (!decision.tiedTeamIds?.length) return []
  const tiedTeamIds = new Set(decision.tiedTeamIds)
  return rows
    .map((row, index) => tiedTeamIds.has(row.team_id) ? index + 1 : null)
    .filter((position): position is number => position !== null)
}

function formatDecisionMessage(
  decision: NonNullable<NoticeGroupStandings['tiebreakers']>[number],
  rows: NoticeStandingRow[]
) {
  const criteria = decision.tiedCriteria.map((criterion) => tiebreakerCompactLabels[criterion] ?? criterion.toLowerCase())
  const tiedText = formatCompactList(criteria)
  const subject = formatTiebreakerSubject(findDecisionPositions(decision, rows))

  if (decision.resolvedBy === 'DRAW' || decision.requiresManualResolution) {
    return tiedText
      ? `Desempate aplicado ${subject}: igualdad en ${tiedText}; requiere sorteo o resolución manual.`
      : `Desempate aplicado ${subject}: requiere sorteo o resolución manual.`
  }

  const resolvedBy = tiebreakerResolvedLabels[decision.resolvedBy] ?? tiebreakerLabels[decision.resolvedBy] ?? decision.resolvedBy
  return tiedText
    ? `Desempate aplicado ${subject} en ${tiedText}. Se resolvió por ${resolvedBy}.`
    : `Desempate aplicado ${subject}. Se resolvió por ${resolvedBy}.`
}

function formatCompactList(values: string[]) {
  const cleanValues = values.map((value) => value.trim()).filter(Boolean)
  if (cleanValues.length <= 1) return cleanValues[0] ?? ''
  return `${cleanValues.slice(0, -1).join(', ')} y ${cleanValues.at(-1)}`
}

function collectTiebreakerNotices(notices: TournamentOperationalNotice[], standings: NoticeGroupStandings[]) {
  for (const groupBlock of standings) {
    if (groupBlock.tiebreakers?.length) {
      for (const [index, decision] of groupBlock.tiebreakers.entries()) {
        addNoticeOnce(notices, {
          id: `groups-tiebreak-${groupBlock.group.id}-${index}-${decision.resolvedBy}`,
          type: decision.requiresManualResolution ? 'warning' : 'info',
          title: decision.requiresManualResolution
            ? 'Desempate pendiente'
            : 'Desempate aplicado',
          message: formatDecisionMessage(decision, groupBlock.standings),
          scope: 'group',
          groupId: groupBlock.group.id,
          groupName: groupBlock.group.name,
        })
      }
      continue
    }

    const rowsByPoints = new Map<number, NoticeStandingRow[]>()

    for (const row of groupBlock.standings) {
      if (row.played <= 0) continue
      const current = rowsByPoints.get(row.match_points) ?? []
      current.push(row)
      rowsByPoints.set(row.match_points, current)
    }

    for (const rows of rowsByPoints.values()) {
      const breaker = findAppliedTiebreaker(rows)
      if (!breaker) continue

      addNoticeOnce(notices, {
        id: `groups-tiebreak-${groupBlock.group.id}-${rows[0]?.match_points ?? 0}`,
        type: 'info',
        title: 'Desempate aplicado',
        message: formatTiebreakerMessage(breaker),
        scope: 'group',
        groupId: groupBlock.group.id,
        groupName: groupBlock.group.name,
      })
    }
  }
}

function collectWalkoverNotices(notices: TournamentOperationalNotice[], matches: NoticeMatch[]) {
  const counts = matches.filter(isWalkoverMatch).reduce<Record<TournamentOperationalNoticeScope, number>>((acc, match) => {
    const scope = getMatchScope(match)
    acc[scope] = (acc[scope] ?? 0) + 1
    return acc
  }, {
    groups: 0,
    group: 0,
    playoff: 0,
    registrations: 0,
    general: 0,
  })

  for (const scope of ['groups', 'playoff', 'general'] as const) {
    const count = counts[scope]
    if (!count) continue

    addNoticeOnce(notices, {
      id: `${scope}-walkovers`,
      type: 'warning',
      title: 'Partidos definidos por WO',
      message: `${count} partido${count === 1 ? '' : 's'} ${count === 1 ? 'fue definido' : 'fueron definidos'} por WO / walkover.`,
      scope,
    })
  }
}

function collectRegistrationNotices(notices: TournamentOperationalNotice[], registrations: NoticeRegistration[]) {
  const cancelled = registrations.filter((registration) => String(registration.status ?? '').toUpperCase() === 'CANCELLED').length
  const blocked = registrations.filter((registration) => String(registration.admission_status ?? '').toUpperCase() === 'BLOCKED').length

  if (cancelled > 0) {
    addNoticeOnce(notices, {
      id: 'registrations-cancelled',
      type: 'warning',
      title: 'Parejas dadas de baja',
      message: `${cancelled} pareja${cancelled === 1 ? '' : 's'} figura${cancelled === 1 ? '' : 'n'} cancelada${cancelled === 1 ? '' : 's'} y no debería${cancelled === 1 ? '' : 'n'} considerarse para la operación competitiva.`,
      scope: 'registrations',
    })
  }

  if (blocked > 0) {
    addNoticeOnce(notices, {
      id: 'registrations-blocked',
      type: 'warning',
      title: 'Parejas bloqueadas',
      message: `${blocked} pareja${blocked === 1 ? '' : 's'} tiene${blocked === 1 ? '' : 'n'} admisión bloqueada. Revisá la condición antes de avanzar con el armado competitivo.`,
      scope: 'registrations',
    })
  }
}

function collectPlayoffNotices(notices: TournamentOperationalNotice[], playoffRounds: NoticePlayoffRound[]) {
  const pendingSlots = playoffRounds.reduce((acc, round) => acc + round.slots.filter((slot) => slot.kind === 'placeholder').length, 0)
  if (pendingSlots > 0) {
    addNoticeOnce(notices, {
      id: 'playoff-pending-winners',
      type: 'info',
      title: 'Llaves pendientes por ganadores',
      message: `${pendingSlots} espacio${pendingSlots === 1 ? '' : 's'} del bracket depende${pendingSlots === 1 ? '' : 'n'} de ganadores de rondas anteriores. No se crean partidos placeholder en la base.`,
      scope: 'playoff',
    })
  }

  const firstRound = playoffRounds[0]
  if (!firstRound) return

  const realMatches = firstRound.slots.filter((slot) => slot.kind === 'match').length
  const expectedMatches = firstRound.slots.length
  if (realMatches > 0 && realMatches < expectedMatches) {
    addNoticeOnce(notices, {
      id: 'playoff-byes',
      type: 'info',
      title: 'Playoff generado con byes',
      message: `La primera ronda tiene ${realMatches}/${expectedMatches} partidos reales. Los espacios restantes quedan visualmente reservados hasta que avance la llave.`,
      scope: 'playoff',
    })
  }
}

function collectScheduleWarnings(notices: TournamentOperationalNotice[], scheduleWarnings: BuildTournamentOperationalNoticesInput['scheduleWarnings']) {
  for (const [index, warning] of (scheduleWarnings ?? []).entries()) {
    const message = warning.message?.trim()
    if (!message) continue

    addNoticeOnce(notices, {
      id: `schedule-warning-${warning.code ?? index}`,
      type: 'warning',
      title: 'Aviso de planificación',
      message,
      scope: 'general',
    })
  }
}

export function buildTournamentOperationalNotices(input: BuildTournamentOperationalNoticesInput): TournamentOperationalNotice[] {
  const notices: TournamentOperationalNotice[] = []

  collectTiebreakerNotices(notices, input.standings ?? [])
  collectWalkoverNotices(notices, input.matches ?? [])
  collectRegistrationNotices(notices, input.registrations ?? [])
  collectPlayoffNotices(notices, input.playoffRounds ?? [])
  collectScheduleWarnings(notices, input.scheduleWarnings)

  return notices
}
