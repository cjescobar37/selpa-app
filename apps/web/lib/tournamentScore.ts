export type TournamentScorePhase =
  | 'GROUP'
  | 'ROUND_OF_16'
  | 'QUARTER'
  | 'SEMI'
  | 'FINAL'
  | 'THIRD_PLACE'
  | 'OTHER'
  | string

export type ScoreSide = 'team1' | 'team2'

export type StructuredScoreSet = {
  team1: number
  team2: number
  type?: 'SET' | 'SUPER_TIEBREAK_10'
}

export type StructuredMatchScore = {
  version?: 1
  source?: 'structured_sets'
  sets: StructuredScoreSet[]
  super_tiebreak?: StructuredScoreSet | null
  text?: string
}

export type NormalizedStructuredMatchScore = {
  version: 1
  source: 'structured_sets'
  sets: StructuredScoreSet[]
  super_tiebreak?: StructuredScoreSet
  text: string
}

export type ScoreValidationCode =
  | 'INVALID_SCORE'
  | 'INVALID_SET'
  | 'INVALID_SUPER_TIEBREAK'
  | 'INVALID_SET_COUNT'
  | 'THIRD_PARTIAL_NOT_ALLOWED'
  | 'THIRD_PARTIAL_REQUIRED'
  | 'WINNER_NOT_CLEAR'

export type ScoreValidationResult =
  | {
      ok: true
      score: NormalizedStructuredMatchScore
      winnerSide: ScoreSide
    }
  | {
      ok: false
      code: ScoreValidationCode
      error: string
    }

function isWholeNonNegative(value: number) {
  return Number.isInteger(value) && value >= 0
}

function normalizePhase(phase: TournamentScorePhase) {
  return String(phase || '').trim().toUpperCase()
}

function isGroupPhase(phase: TournamentScorePhase) {
  return normalizePhase(phase) === 'GROUP'
}

function getSetWinner(set: StructuredScoreSet): ScoreSide | null {
  if (set.team1 === set.team2) return null
  return set.team1 > set.team2 ? 'team1' : 'team2'
}

function countSetWins(sets: StructuredScoreSet[]) {
  return sets.reduce(
    (acc, set) => {
      const winner = getSetWinner(set)
      if (winner) acc[winner] += 1
      return acc
    },
    { team1: 0, team2: 0 }
  )
}

function formatPair(set: StructuredScoreSet) {
  return `${set.team1}-${set.team2}`
}

function normalizeSet(set: StructuredScoreSet, type: StructuredScoreSet['type'] = 'SET'): StructuredScoreSet {
  return {
    team1: set.team1,
    team2: set.team2,
    type,
  }
}

export function isValidNormalSet(team1: number, team2: number) {
  if (!isWholeNonNegative(team1) || !isWholeNonNegative(team2)) return false
  if (team1 === team2) return false

  const winner = Math.max(team1, team2)
  const loser = Math.min(team1, team2)

  if (winner === 6) return loser >= 0 && loser <= 4
  if (winner === 7) return loser === 5 || loser === 6
  return false
}

export function isValidSuperTiebreak(team1: number, team2: number) {
  if (!isWholeNonNegative(team1) || !isWholeNonNegative(team2)) return false
  if (team1 === team2) return false

  const winner = Math.max(team1, team2)
  const loser = Math.min(team1, team2)
  if (winner < 10) return false

  if (loser <= 8) {
    return winner === 10
  }

  return winner === loser + 2
}

export function buildScoreText(score: Pick<StructuredMatchScore, 'sets' | 'super_tiebreak'>) {
  const setText = score.sets.map(formatPair).join(' ')
  const superText = score.super_tiebreak ? ` (${formatPair(score.super_tiebreak)})` : ''
  return `${setText}${superText}`.trim()
}

export function deriveWinnerSide(score: Pick<StructuredMatchScore, 'sets' | 'super_tiebreak'>): ScoreSide | null {
  const wins = countSetWins(score.sets)

  if (score.super_tiebreak) {
    const superWinner = getSetWinner(score.super_tiebreak)
    if (superWinner) wins[superWinner] += 1
  }

  if (wins.team1 === wins.team2) return null
  return wins.team1 > wins.team2 ? 'team1' : 'team2'
}

export function validateStructuredMatchScore(
  score: unknown,
  phase: TournamentScorePhase
): ScoreValidationResult {
  if (!score || typeof score !== 'object' || Array.isArray(score)) {
    return { ok: false, code: 'INVALID_SCORE', error: 'El score debe tener una estructura válida.' }
  }

  const input = score as Partial<StructuredMatchScore>
  const sets = Array.isArray(input.sets) ? input.sets : []
  const groupPhase = isGroupPhase(phase)

  if (sets.length < 2 || sets.length > 3) {
    return { ok: false, code: 'INVALID_SET_COUNT', error: 'El partido debe tener 2 sets y un tercer parcial solo si corresponde.' }
  }

  const normalSets = sets.map((set) => normalizeSet(set, 'SET'))
  for (const set of normalSets) {
    if (!isValidNormalSet(set.team1, set.team2)) {
      return { ok: false, code: 'INVALID_SET', error: 'Hay un set con resultado inválido.' }
    }
  }

  const firstTwoWins = countSetWins(normalSets.slice(0, 2))
  const splitAfterTwo = firstTwoWins.team1 === 1 && firstTwoWins.team2 === 1

  if (!splitAfterTwo && (normalSets.length > 2 || input.super_tiebreak)) {
    return { ok: false, code: 'THIRD_PARTIAL_NOT_ALLOWED', error: 'El tercer parcial solo se carga si el partido queda 1 a 1 en sets.' }
  }

  if (!splitAfterTwo) {
    const normalizedScore = {
      version: 1,
      source: 'structured_sets',
      sets: normalSets.slice(0, 2),
      text: buildScoreText({ sets: normalSets.slice(0, 2) }),
    } satisfies NormalizedStructuredMatchScore

    const winnerSide = deriveWinnerSide(normalizedScore)
    if (!winnerSide) {
      return { ok: false, code: 'WINNER_NOT_CLEAR', error: 'No hay un ganador claro para el partido.' }
    }

    return { ok: true, score: normalizedScore, winnerSide }
  }

  if (groupPhase) {
    if (normalSets.length > 2) {
      return { ok: false, code: 'THIRD_PARTIAL_NOT_ALLOWED', error: 'En grupos el tercer parcial debe cargarse como super tie-break.' }
    }

    const superTiebreak = input.super_tiebreak ? normalizeSet(input.super_tiebreak, 'SUPER_TIEBREAK_10') : null
    if (!superTiebreak) {
      return { ok: false, code: 'THIRD_PARTIAL_REQUIRED', error: 'Cargá el super tie-break para definir el partido.' }
    }

    if (!isValidSuperTiebreak(superTiebreak.team1, superTiebreak.team2)) {
      return { ok: false, code: 'INVALID_SUPER_TIEBREAK', error: 'El super tie-break debe ganarse desde 10 puntos y por diferencia de 2.' }
    }

    const normalizedScore = {
      version: 1,
      source: 'structured_sets',
      sets: normalSets.slice(0, 2),
      super_tiebreak: superTiebreak,
      text: buildScoreText({ sets: normalSets.slice(0, 2), super_tiebreak: superTiebreak }),
    } satisfies NormalizedStructuredMatchScore

    const winnerSide = deriveWinnerSide(normalizedScore)
    if (!winnerSide) {
      return { ok: false, code: 'WINNER_NOT_CLEAR', error: 'No hay un ganador claro para el partido.' }
    }

    return { ok: true, score: normalizedScore, winnerSide }
  }

  if (input.super_tiebreak) {
    return { ok: false, code: 'THIRD_PARTIAL_NOT_ALLOWED', error: 'En playoff el tercer parcial mínimo se carga como set completo.' }
  }

  if (normalSets.length !== 3) {
    return { ok: false, code: 'THIRD_PARTIAL_REQUIRED', error: 'Cargá el tercer set para definir el partido.' }
  }

  const normalizedScore = {
    version: 1,
    source: 'structured_sets',
    sets: normalSets,
    text: buildScoreText({ sets: normalSets }),
  } satisfies NormalizedStructuredMatchScore

  const winnerSide = deriveWinnerSide(normalizedScore)
  if (!winnerSide) {
    return { ok: false, code: 'WINNER_NOT_CLEAR', error: 'No hay un ganador claro para el partido.' }
  }

  return { ok: true, score: normalizedScore, winnerSide }
}
