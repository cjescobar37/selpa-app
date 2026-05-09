'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useSession } from '@/components/session/SessionProvider'
import { isValidNormalSet, validateStructuredMatchScore, type ScoreValidationResult, type StructuredMatchScore } from '@/lib/tournamentScore'
import type { StandingGroup } from './StandingsCard'

type Tournament = {
  id: string
  name: string
  status: string
  type?: string | null
  tournament_type?: string | null
  format?: string | null
  start_date: string | null
  category_name: string | null
}

type Match = {
  id: string
  group_id?: string | null
  team1_id: string
  team2_id: string
  winner_team_id: string | null
  round: number | null
  phase: string | null
  status: string | null
  scheduled_at?: string | null
  score: Record<string, unknown> | null
  team1_name: string | null
  team2_name: string | null
}

type Team = {
  id: string
  name: string
  player1_user_id: string
  player2_user_id: string
}

type MatchesResponse = {
  tournament: {
    id: string
    name: string
    status: string
    start_date?: string | null
    starts_on?: string | null
  }
  teams?: Team[]
  matches: Match[]
  meta?: {
    matches_available?: boolean
    reason?: string
  }
}

type StandingsResponse = {
  groups: StandingGroup[]
  error?: string
  code?: string
}

type GenerateOpenResponse = {
  error?: string
  code?: string
  phase?: string
  createdCount?: number
  count?: number
  blockedCount?: number
  blockedRegistrationIds?: string[]
  meta?: {
    byeCount?: number
    assignedByes?: number
    conflictScore?: number
    warnings?: Array<{
      code?: string
      message?: string
    }>
  }
}

type ResultSetInput = {
  team1: string
  team2: string
}

type ResultForm = {
  matchId: string
  sets: [ResultSetInput, ResultSetInput, ResultSetInput]
  superTiebreak: ResultSetInput
}

type MatchSection = {
  key: string
  title: string
  subtitle?: string
  matches: Match[]
  standingGroup?: StandingGroup
  kind: 'group' | 'playoff'
}

function formatDate(value?: string | null) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(value))
}

function statusLabel(status?: string | null) {
  if (!status) return 'Sin estado'
  const map: Record<string, string> = {
    DRAFT: 'Borrador',
    SCHEDULED: 'Programado',
    IN_PROGRESS: 'En juego',
    FINISHED: 'Finalizado',
    CANCELLED: 'Cancelado',
    PENDING: 'Pendiente',
    PLAYED: 'Jugado',
  }
  return map[status.toUpperCase()] ?? status
}

function formatScore(score?: Record<string, unknown> | null) {
  if (!score || Object.keys(score).length === 0) return 'Sin resultado'
  if (typeof score.text === 'string' && score.text.trim()) return score.text.trim()
  if (Array.isArray(score.sets)) {
    const sets = score.sets
      .map((set) => {
        if (!set || typeof set !== 'object') return ''
        const row = set as Record<string, unknown>
        const team1 = row.team1 ?? row.team1_games ?? row.a
        const team2 = row.team2 ?? row.team2_games ?? row.b
        return team1 !== undefined && team2 !== undefined ? `${team1}-${team2}` : ''
      })
      .filter(Boolean)
    if (sets.length > 0) return sets.join(' ')
  }
  return 'Resultado cargado'
}

function isGroupMatch(match: Match) {
  return (match.phase ?? '').toUpperCase() === 'GROUP'
}

function isOpenCompatibleTournament(tournament?: Tournament | null) {
  if (!tournament) return false
  const format = String(tournament.format ?? '').toUpperCase()
  const type = String(tournament.type ?? tournament.tournament_type ?? '').toUpperCase()
  return type === 'OPEN' && ['ZONE_PLAYOFF', 'GROUPS_ELIMINATION', 'GROUPS_ELIM'].includes(format)
}

function emptyResultSet(): ResultSetInput {
  return { team1: '', team2: '' }
}

function toScoreNumber(value: string) {
  if (value.trim() === '') return Number.NaN
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : Number.NaN
}

function hasAnyScoreValue(set: ResultSetInput) {
  return set.team1.trim() !== '' || set.team2.trim() !== ''
}

function toStructuredSet(set: ResultSetInput) {
  return {
    team1: toScoreNumber(set.team1),
    team2: toScoreNumber(set.team2),
    type: 'SET' as const,
  }
}

function toSuperTiebreak(set: ResultSetInput) {
  return {
    team1: toScoreNumber(set.team1),
    team2: toScoreNumber(set.team2),
    type: 'SUPER_TIEBREAK_10' as const,
  }
}

function getThirdPartialState(form: ResultForm) {
  const first = toStructuredSet(form.sets[0])
  const second = toStructuredSet(form.sets[1])
  if (!isValidNormalSet(first.team1, first.team2) || !isValidNormalSet(second.team1, second.team2)) {
    return { enabled: false, split: false }
  }

  const firstWinner = first.team1 > first.team2 ? 'team1' : 'team2'
  const secondWinner = second.team1 > second.team2 ? 'team1' : 'team2'
  const split = firstWinner !== secondWinner
  return { enabled: split, split }
}

function buildStructuredScore(form: ResultForm, phase?: string | null): StructuredMatchScore {
  const group = String(phase ?? '').toUpperCase() === 'GROUP'
  const score: StructuredMatchScore = {
    sets: [toStructuredSet(form.sets[0]), toStructuredSet(form.sets[1])],
  }
  const thirdState = getThirdPartialState(form)

  if (thirdState.enabled && group) {
    if (hasAnyScoreValue(form.superTiebreak)) score.super_tiebreak = toSuperTiebreak(form.superTiebreak)
  } else if (thirdState.enabled) {
    if (hasAnyScoreValue(form.sets[2])) score.sets.push(toStructuredSet(form.sets[2]))
  } else {
    if (hasAnyScoreValue(form.superTiebreak)) score.super_tiebreak = toSuperTiebreak(form.superTiebreak)
    if (hasAnyScoreValue(form.sets[2])) score.sets.push(toStructuredSet(form.sets[2]))
  }

  return score
}

function isStructuredScore(score?: Record<string, unknown> | null) {
  return Boolean(score && Array.isArray(score.sets))
}

function getScoreSetValue(scoreSet: unknown, side: 'team1' | 'team2') {
  if (!scoreSet || typeof scoreSet !== 'object') return ''
  const row = scoreSet as Record<string, unknown>
  const value = row[side]
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

function buildResultFormFromScore(match: Match): ResultForm {
  const form: ResultForm = {
    matchId: match.id,
    sets: [emptyResultSet(), emptyResultSet(), emptyResultSet()],
    superTiebreak: emptyResultSet(),
  }

  if (!isStructuredScore(match.score)) return form

  const sets = Array.isArray(match.score?.sets) ? match.score.sets : []
  for (const index of [0, 1, 2] as const) {
    form.sets[index] = {
      team1: getScoreSetValue(sets[index], 'team1'),
      team2: getScoreSetValue(sets[index], 'team2'),
    }
  }

  if (match.score?.super_tiebreak) {
    form.superTiebreak = {
      team1: getScoreSetValue(match.score.super_tiebreak, 'team1'),
      team2: getScoreSetValue(match.score.super_tiebreak, 'team2'),
    }
  }

  return form
}

export default function ClubPartidosPage() {
  const { activeClub } = useSession()
  const searchParams = useSearchParams()
  const requestedTournamentId = searchParams.get('tournamentId') ?? ''
  const [loadingTournaments, setLoadingTournaments] = useState(true)
  const [loadingMatches, setLoadingMatches] = useState(false)
  const [loadingStandings, setLoadingStandings] = useState(false)
  const [savingResult, setSavingResult] = useState(false)
  const [savingMatch, setSavingMatch] = useState(false)
  const [generatingPlayoff, setGeneratingPlayoff] = useState(false)
  const [generatingOpenPlayoff, setGeneratingOpenPlayoff] = useState(false)
  const [generatingFinal, setGeneratingFinal] = useState(false)
  const [message, setMessage] = useState('')
  const [standingsError, setStandingsError] = useState('')
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [selectedTournamentId, setSelectedTournamentId] = useState('')
  const [teams, setTeams] = useState<Team[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [standingGroups, setStandingGroups] = useState<StandingGroup[]>([])
  const [matchesAvailable, setMatchesAvailable] = useState(true)
  const [resultForm, setResultForm] = useState<ResultForm | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set())
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ team1Id: '', team2Id: '', round: '1', phase: 'GROUP' })

  const selectedTournament = useMemo(
    () => tournaments.find((tournament) => tournament.id === selectedTournamentId) ?? null,
    [selectedTournamentId, tournaments]
  )

  const teamNames = useMemo(
    () => new Map(teams.map((team) => [team.id, team.name])),
    [teams]
  )

  const playoffState = useMemo(() => {
    const playoffMatches = matches.filter((match) => (match.phase ?? '').toUpperCase() !== 'GROUP')
    const semifinalMatches = matches.filter((match) => (match.phase ?? '').toUpperCase() === 'SEMI')
    const completedSemifinals = semifinalMatches.filter(
      (match) => match.status === 'PLAYED' && Boolean(match.winner_team_id) && Boolean(match.team1_id) && Boolean(match.team2_id)
    )
    const finalExists = matches.some((match) => (match.phase ?? '').toUpperCase() === 'FINAL')

    const playoffDisabledReason = !selectedTournamentId
      ? 'Seleccioná un torneo.'
      : playoffMatches.length > 0
        ? 'El playoff ya fue generado o iniciado.'
        : ''

    const finalDisabledReason = !selectedTournamentId
      ? 'Seleccioná un torneo.'
      : finalExists
        ? 'La final ya fue generada.'
        : semifinalMatches.length !== 2
          ? 'Necesitás exactamente 2 semifinales.'
          : completedSemifinals.length !== 2
            ? 'Las semifinales deben estar jugadas y tener ganador.'
            : ''

    return {
      canGeneratePlayoff: Boolean(selectedTournamentId) && playoffMatches.length === 0,
      canGenerateFinal: Boolean(selectedTournamentId) && !finalExists && semifinalMatches.length === 2 && completedSemifinals.length === 2,
      playoffDisabledReason,
      finalDisabledReason,
    }
  }, [matches, selectedTournamentId])

  const champion = useMemo(() => {
    const finalMatch = matches.find(
      (match) => (match.phase ?? '').toUpperCase() === 'FINAL' && match.status === 'PLAYED' && Boolean(match.winner_team_id)
    )
    if (!finalMatch?.winner_team_id) return null

    const winnerName =
      teamNames.get(finalMatch.winner_team_id) ??
      (finalMatch.winner_team_id === finalMatch.team1_id ? finalMatch.team1_name : finalMatch.team2_name) ??
      'Equipo campeón'

    return {
      name: winnerName,
      score: formatScore(finalMatch.score),
    }
  }, [matches, teamNames])

  const tournamentFinished = Boolean(champion)

  const groupOperationState = useMemo(() => {
    const groupMatches = matches.filter(isGroupMatch)
    const playedGroupMatches = groupMatches.filter((match) => (match.status ?? '').toUpperCase() === 'PLAYED')
    const pendingGroupMatches = groupMatches.filter((match) => (match.status ?? '').toUpperCase() !== 'PLAYED')

    return {
      total: groupMatches.length,
      played: playedGroupMatches.length,
      pending: pendingGroupMatches.length,
      complete: groupMatches.length > 0 && pendingGroupMatches.length === 0,
    }
  }, [matches])

  const openPlayoffState = useMemo(() => {
    const compatible = isOpenCompatibleTournament(selectedTournament)
    const playoffMatches = matches.filter((match) => (match.phase ?? '').toUpperCase() !== 'GROUP')
    const groupsAvailable = standingGroups.length > 0
    const disabledReason = !selectedTournamentId
      ? 'Seleccioná un torneo.'
      : !compatible
        ? 'Disponible solo para torneos OPEN por grupos.'
        : playoffMatches.length > 0
          ? 'El playoff ya fue generado o iniciado.'
          : !groupsAvailable
            ? 'El torneo todavía no tiene grupos.'
            : groupOperationState.total === 0
              ? 'El torneo tiene grupos, pero todavía no tiene partidos de grupo.'
              : groupOperationState.pending > 0
                ? `Faltan ${groupOperationState.pending} partidos de grupo por jugar.`
                : tournamentFinished
                  ? 'El torneo ya tiene campeón.'
                  : ''

    return {
      compatible,
      canGenerate: Boolean(selectedTournamentId) && compatible && playoffMatches.length === 0 && groupsAvailable && groupOperationState.complete && !tournamentFinished,
      disabledReason,
    }
  }, [groupOperationState.complete, groupOperationState.pending, groupOperationState.total, matches, selectedTournament, selectedTournamentId, standingGroups.length, tournamentFinished])

  const hasPlayoffMatches = matches.some((match) => !isGroupMatch(match))

  const resultMatch = useMemo(
    () => resultForm ? matches.find((match) => match.id === resultForm.matchId) ?? null : null,
    [matches, resultForm]
  )

  const matchSections = useMemo<MatchSection[]>(() => {
    const sections: MatchSection[] = []
    const groupedMatches = matches.filter(isGroupMatch)
    const playoffMatches = matches.filter((match) => !isGroupMatch(match))
    const usedGroupIds = new Set<string>()

    for (const standingGroup of standingGroups) {
      const rows = groupedMatches.filter((match) => match.group_id === standingGroup.group.id)
      usedGroupIds.add(standingGroup.group.id)
      if (rows.length === 0) continue

      sections.push({
        key: standingGroup.group.id,
        title: `Grupo ${standingGroup.group.name}`,
        subtitle: `${rows.length} partidos`,
        matches: rows,
        standingGroup,
        kind: 'group',
      })
    }

    const groupNames = new Map(standingGroups.map((group) => [group.group.id, group.group.name]))
    const orphanGroups = new Map<string, Match[]>()
    const unassignedGroupMatches: Match[] = []

    for (const match of groupedMatches) {
      if (!match.group_id) {
        unassignedGroupMatches.push(match)
        continue
      }
      if (usedGroupIds.has(match.group_id)) continue
      orphanGroups.set(match.group_id, [...(orphanGroups.get(match.group_id) ?? []), match])
    }

    Array.from(orphanGroups.entries()).forEach(([groupId, rows], index) => {
      sections.push({
        key: groupId,
        title: `Grupo ${groupNames.get(groupId) ?? index + 1}`,
        subtitle: `${rows.length} partidos`,
        matches: rows,
        kind: 'group',
      })
    })

    if (unassignedGroupMatches.length > 0) {
      sections.push({
        key: 'group-unassigned',
        title: 'Grupo sin asignar',
        subtitle: `${unassignedGroupMatches.length} partidos`,
        matches: unassignedGroupMatches,
        kind: 'group',
      })
    }

    if (playoffMatches.length > 0) {
      sections.push({
        key: 'playoff',
        title: 'Playoff',
        subtitle: `${playoffMatches.length} partidos`,
        matches: playoffMatches,
        kind: 'playoff',
      })
    }

    return sections
  }, [matches, standingGroups])

  function getWinnerName(match: Match) {
    if (!match.winner_team_id) return null
    if (match.winner_team_id === match.team1_id) return match.team1_name ?? teamNames.get(match.team1_id) ?? 'Equipo 1'
    if (match.winner_team_id === match.team2_id) return match.team2_name ?? teamNames.get(match.team2_id) ?? 'Equipo 2'
    return 'Ganador'
  }

  function getResultValidation(match: Match): ScoreValidationResult | null {
    if (!resultForm || resultForm.matchId !== match.id) return null
    return validateStructuredMatchScore(buildStructuredScore(resultForm, match.phase), match.phase ?? 'GROUP')
  }

  function updateResultSet(index: 0 | 1 | 2, side: 'team1' | 'team2', value: string) {
    setResultForm((current) => {
      if (!current) return current
      const sets = current.sets.map((set) => ({ ...set })) as ResultForm['sets']
      sets[index] = { ...sets[index], [side]: value }
      if (index === 0 || index === 1) {
        const nextForm = { ...current, sets }
        const thirdState = getThirdPartialState(nextForm)
        if (!thirdState.enabled) {
          sets[2] = emptyResultSet()
          return { ...nextForm, sets, superTiebreak: emptyResultSet() }
        }
      }
      return { ...current, sets }
    })
  }

  function updateSuperTiebreak(side: 'team1' | 'team2', value: string) {
    setResultForm((current) => current ? { ...current, superTiebreak: { ...current.superTiebreak, [side]: value } } : current)
  }

  function toggleGroup(sectionKey: string) {
    setExpandedGroups((current) => {
      const next = new Set(current)
      if (next.has(sectionKey)) next.delete(sectionKey)
      else next.add(sectionKey)
      return next
    })
  }

  async function getToken() {
    const { data } = await supabase.auth.getSession()
    return data?.session?.access_token ?? null
  }

  async function loadTournaments() {
    if (!activeClub?.id) {
      setTournaments([])
      setSelectedTournamentId('')
      setLoadingTournaments(false)
      return
    }

    setLoadingTournaments(true)
    setMessage('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setLoadingTournaments(false)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const json = await res.json().catch(() => ({}))

    if (!res.ok) {
      setMessage(json?.error ?? 'No pude cargar torneos.')
      setLoadingTournaments(false)
      return
    }

      const rows = (json?.tournaments ?? []) as Tournament[]
      setTournaments(rows)
      setSelectedTournamentId((current) => {
        if (current && rows.some((tournament) => tournament.id === current)) return current
        if (requestedTournamentId && rows.some((tournament) => tournament.id === requestedTournamentId)) {
          return requestedTournamentId
        }
        return rows[0]?.id || ''
      })
      setLoadingTournaments(false)
    }

  async function loadMatches(tournamentId: string) {
    if (!activeClub?.id || !tournamentId) {
      setMatches([])
      setTeams([])
      return
    }

    setLoadingMatches(true)
    setMessage('')
    setMatchesAvailable(true)

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setLoadingMatches(false)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments/${tournamentId}/matches`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const json = await res.json().catch(() => ({})) as Partial<MatchesResponse> & { error?: string }

    if (!res.ok) {
      setMessage(json?.error ?? 'No pude cargar partidos.')
      setMatches([])
      setTeams([])
      setLoadingMatches(false)
      return
    }

    setMatches((json?.matches ?? []) as Match[])
    setTeams((json?.teams ?? []) as Team[])
    setMatchesAvailable(Boolean(json?.meta?.matches_available ?? true))
    setLoadingMatches(false)
  }

  async function loadStandings(tournamentId: string) {
    if (!activeClub?.id || !tournamentId) {
      setStandingGroups([])
      setStandingsError('')
      return
    }

    setLoadingStandings(true)
    setStandingsError('')

    const token = await getToken()
    if (!token) {
      setStandingsError('Sesión inválida.')
      setLoadingStandings(false)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments/${tournamentId}/standings`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const json = await res.json().catch(() => ({})) as StandingsResponse

    if (!res.ok) {
      const unsupportedTieBreaker = res.status === 422 && json?.code === 'UNSUPPORTED_TIE_BREAKER'
      setStandingsError(unsupportedTieBreaker ? 'El criterio de desempate configurado no está disponible para calcular standings.' : json?.error ?? 'No pude cargar standings.')
      setStandingGroups([])
      setLoadingStandings(false)
      return
    }

    setStandingGroups((json?.groups ?? []) as StandingGroup[])
    setLoadingStandings(false)
  }

  function openCreateForm() {
    setCreateForm({
      team1Id: teams[0]?.id ?? '',
      team2Id: teams[1]?.id ?? '',
      round: '1',
      phase: 'GROUP',
    })
    setCreateOpen(true)
    setResultForm(null)
  }

  async function submitMatch() {
    if (!activeClub?.id || !selectedTournamentId) return

    if (!createForm.team1Id || !createForm.team2Id) {
      setMessage('Seleccioná ambos equipos.')
      return
    }

    if (createForm.team1Id === createForm.team2Id) {
      setMessage('Los equipos deben ser distintos.')
      return
    }

    setSavingMatch(true)
    setMessage('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setSavingMatch(false)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments/${selectedTournamentId}/matches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        team1_id: createForm.team1Id,
        team2_id: createForm.team2Id,
        round: Number(createForm.round),
        phase: createForm.phase,
      }),
    })
    const json = await res.json().catch(() => ({}))

    if (!res.ok) {
      setMessage(json?.error ?? 'No pude crear el partido.')
      setSavingMatch(false)
      return
    }

    setCreateOpen(false)
    setSavingMatch(false)
    setMessage('Partido creado correctamente.')
    await loadMatches(selectedTournamentId)
  }

  async function generatePlayoff() {
    if (!activeClub?.id || !selectedTournamentId) return

    setGeneratingPlayoff(true)
    setMessage('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setGeneratingPlayoff(false)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments/${selectedTournamentId}/playoff/generate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = await res.json().catch(() => ({})) as { error?: string; code?: string }

    if (!res.ok) {
      const messages: Record<string, string> = {
        UNSUPPORTED_PLAYOFF_SHAPE: 'Para generar semifinales necesitás exactamente 2 grupos con 2 clasificados cada uno.',
        PLAYOFF_ALREADY_EXISTS_OR_STARTED: 'El playoff ya fue generado o ya tiene partidos iniciados.',
        UNSUPPORTED_TIE_BREAKER: 'No se puede generar playoff con el criterio de desempate configurado.',
        UNSUPPORTED_TOURNAMENT_FORMAT: 'El playoff automático solo está disponible para torneos por grupos con eliminación.',
      }
      setMessage(json?.code ? messages[json.code] ?? json?.error ?? 'No pude generar el playoff.' : json?.error ?? 'No pude generar el playoff.')
      setGeneratingPlayoff(false)
      return
    }

    setMessage('Semifinales generadas correctamente.')
    setGeneratingPlayoff(false)
    await loadMatches(selectedTournamentId)
    await loadStandings(selectedTournamentId)
  }

  async function generateOpenPlayoff() {
    if (!activeClub?.id || !selectedTournamentId) return

    setGeneratingOpenPlayoff(true)
    setMessage('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setGeneratingOpenPlayoff(false)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments/${selectedTournamentId}/playoff/generate-open`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = await res.json().catch(() => ({})) as GenerateOpenResponse

    if (!res.ok) {
      const messages: Record<string, string> = {
        GROUP_NOT_COMPLETE: 'Completá todos los partidos de grupos antes de generar el playoff OPEN.',
        PLAYOFF_ALREADY_EXISTS_OR_STARTED: 'El playoff ya fue generado o ya tiene partidos iniciados.',
        OPEN_REQUIRES_MANUAL_RESOLUTION: 'El playoff OPEN requiere una resolución manual antes de generar partidos.',
        REGISTRATION_ELIGIBILITY_BLOCKED: `Hay ${json.count ?? json.blockedCount ?? 0} parejas que no pueden competir todavía. Revisá /club/inscripciones para resolver pagos, excepciones o bloqueos.`,
        UNSUPPORTED_TOURNAMENT_FORMAT: 'Disponible solo para torneos OPEN por grupos.',
        UNAUTHORIZED: 'No tenés permisos para generar el playoff OPEN.',
        OPEN_GENERATION_ROLLED_BACK: 'Falló la generación OPEN y se revirtieron los partidos creados.',
      }
      setMessage(json?.code ? messages[json.code] ?? json?.error ?? 'No pude generar el playoff OPEN.' : json?.error ?? 'No pude generar el playoff OPEN.')
      setGeneratingOpenPlayoff(false)
      return
    }

    const warning = json.meta?.warnings?.find((item) => item.code === 'SAME_GROUP_CONFLICTS')
    const details = [
      json.phase ? `Fase: ${json.phase}` : null,
      typeof json.createdCount === 'number' ? `${json.createdCount} partidos` : null,
      json.meta?.assignedByes ? `${json.meta.assignedByes} byes` : null,
    ].filter(Boolean).join(' · ')

    setMessage(
      `Playoff OPEN generado correctamente${details ? ` (${details})` : ''}.` +
      (warning ? ' Se generó el playoff, pero quedaron cruces entre equipos del mismo grupo.' : '')
    )
    setGeneratingOpenPlayoff(false)
    await loadMatches(selectedTournamentId)
    await loadStandings(selectedTournamentId)
  }

  async function generateFinal() {
    if (!activeClub?.id || !selectedTournamentId) return

    setGeneratingFinal(true)
    setMessage('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setGeneratingFinal(false)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments/${selectedTournamentId}/playoff/generate-final`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = await res.json().catch(() => ({})) as { error?: string; code?: string }

    if (!res.ok) {
      const messages: Record<string, string> = {
        SEMIFINALS_NOT_FOUND: 'Para generar la final deben existir exactamente 2 semifinales.',
        SEMIFINALS_NOT_COMPLETED: 'Las dos semifinales deben estar jugadas y tener ganador.',
        FINAL_ALREADY_EXISTS: 'La final ya fue generada para este torneo.',
        INVALID_FINAL_TEAMS: 'Los ganadores de semifinales deben ser dos equipos distintos.',
        TOURNAMENT_NOT_FOUND: 'Torneo no encontrado para este club.',
        UNSUPPORTED_TOURNAMENT_FORMAT: 'La final automática solo está disponible para torneos por grupos con eliminación.',
      }
      setMessage(json?.code ? messages[json.code] ?? json?.error ?? 'No pude generar la final.' : json?.error ?? 'No pude generar la final.')
      setGeneratingFinal(false)
      return
    }

    setMessage('Final generada correctamente.')
    setGeneratingFinal(false)
    await loadMatches(selectedTournamentId)
  }

  function openResultForm(match: Match) {
    setResultForm(buildResultFormFromScore(match))
  }

  async function submitResult(match: Match) {
    if (!activeClub?.id || !selectedTournamentId || !resultForm || resultForm.matchId !== match.id) return

    const validation = getResultValidation(match)
    if (!validation?.ok) {
      setMessage(validation?.error ?? 'Cargá un resultado válido.')
      return
    }

    setSavingResult(true)
    setMessage('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setSavingResult(false)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments/${selectedTournamentId}/matches/${match.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        score: validation.score,
      }),
    })
    const json = await res.json().catch(() => ({}))

    if (!res.ok) {
      setMessage(json?.error ?? 'No pude cargar el resultado.')
      setSavingResult(false)
      return
    }

    setResultForm(null)
    setSavingResult(false)
    setMessage('Resultado cargado correctamente.')
    await loadMatches(selectedTournamentId)
    await loadStandings(selectedTournamentId)
  }

  function renderGroupStandings(group: StandingGroup) {
    const qualifierIds = new Set(group.qualifiers.map((row) => row.team_id))

    return (
      <div className="club-groupStandings" role="table" aria-label={`Standings ${group.group.name}`}>
        <div className="club-groupStandingRow club-groupStandingRow--head" role="row">
          <span role="columnheader">#</span>
          <span role="columnheader">Equipo</span>
          <span role="columnheader">PJ</span>
          <span role="columnheader">G</span>
          <span role="columnheader">P</span>
          <span role="columnheader">Pts</span>
          <span role="columnheader">DS</span>
          <span role="columnheader">DG</span>
        </div>
        {group.standings.map((row, index) => (
          <div key={row.team_id} className="club-groupStandingRow" role="row">
            <span role="cell">{index + 1}</span>
            <span className="club-groupStandingTeam" role="cell">
              <span>{teamNames.get(row.team_id) ?? `Equipo ${row.seed}`}</span>
              {qualifierIds.has(row.team_id) ? <b>Clasifica</b> : null}
            </span>
            <span role="cell">{row.played}</span>
            <span role="cell">{row.wins}</span>
            <span role="cell">{row.losses}</span>
            <span role="cell">{row.match_points}</span>
            <span
              role="cell"
              title={`Sets: ${row.sets_for} a favor / ${row.sets_against} en contra`}
            >
              {row.set_difference}
            </span>
            <span
              role="cell"
              title={`Games: ${row.games_for} a favor / ${row.games_against} en contra`}
            >
              {row.game_difference}
            </span>
          </div>
        ))}
      </div>
    )
  }

  function renderResultForm(match: Match) {
    if (!resultForm || resultForm.matchId !== match.id) return null

    const validation = getResultValidation(match)
    const thirdState = getThirdPartialState(resultForm)
    const group = isGroupMatch(match)
    const legacyScore = match.status === 'PLAYED' && !isStructuredScore(match.score) && typeof match.score?.text === 'string' && match.score.text.trim()
    const winnerName = validation?.ok
      ? validation.winnerSide === 'team1'
        ? match.team1_name ?? 'Equipo 1'
        : match.team2_name ?? 'Equipo 2'
      : null

    return (
      <div className="club-resultForm">
        {legacyScore ? (
          <div className="club-legacyScoreNotice">
            Resultado anterior: <b>{match.score?.text as string}</b>. Para editarlo, recargalo con sets estructurados.
          </div>
        ) : null}

        <div className="club-scoreGrid">
          <span className="club-scoreHead">Parcial</span>
          <span className="club-scoreHead">{match.team1_name ?? 'Equipo 1'}</span>
          <span className="club-scoreHead">{match.team2_name ?? 'Equipo 2'}</span>

          {[0, 1].map((index) => (
            <div className="club-scoreRow" key={index}>
              <span>Set {index + 1}</span>
              <input
                className="px-input club-scoreInput"
                inputMode="numeric"
                min="0"
                step="1"
                type="number"
                value={resultForm.sets[index as 0 | 1].team1}
                onChange={(event) => updateResultSet(index as 0 | 1, 'team1', event.target.value)}
              />
              <input
                className="px-input club-scoreInput"
                inputMode="numeric"
                min="0"
                step="1"
                type="number"
                value={resultForm.sets[index as 0 | 1].team2}
                onChange={(event) => updateResultSet(index as 0 | 1, 'team2', event.target.value)}
              />
            </div>
          ))}

          {group ? (
            <div className="club-scoreRow">
              <span>Super TB</span>
              <input
                className="px-input club-scoreInput"
                disabled={!thirdState.enabled}
                inputMode="numeric"
                min="0"
                step="1"
                type="number"
                value={resultForm.superTiebreak.team1}
                onChange={(event) => updateSuperTiebreak('team1', event.target.value)}
              />
              <input
                className="px-input club-scoreInput"
                disabled={!thirdState.enabled}
                inputMode="numeric"
                min="0"
                step="1"
                type="number"
                value={resultForm.superTiebreak.team2}
                onChange={(event) => updateSuperTiebreak('team2', event.target.value)}
              />
            </div>
          ) : (
            <div className="club-scoreRow">
              <span>Set 3</span>
              <input
                className="px-input club-scoreInput"
                disabled={!thirdState.enabled}
                inputMode="numeric"
                min="0"
                step="1"
                type="number"
                value={resultForm.sets[2].team1}
                onChange={(event) => updateResultSet(2, 'team1', event.target.value)}
              />
              <input
                className="px-input club-scoreInput"
                disabled={!thirdState.enabled}
                inputMode="numeric"
                min="0"
                step="1"
                type="number"
                value={resultForm.sets[2].team2}
                onChange={(event) => updateResultSet(2, 'team2', event.target.value)}
              />
            </div>
          )}
        </div>

        <div className="club-resultSummary">
          {winnerName ? <span>Ganador calculado: <b>{winnerName}</b></span> : <span>{validation?.ok === false ? validation.error : 'Completá los sets para calcular el ganador.'}</span>}
        </div>

        <div className="club-resultActions">
          <button type="button" className="club-actionBtn club-actionBtn--primary" disabled={savingResult || !validation?.ok} onClick={() => submitResult(match)}>
            {savingResult ? 'Guardando...' : 'Guardar'}
          </button>
          <button type="button" className="club-actionBtn" disabled={savingResult} onClick={() => setResultForm(null)}>
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  function renderMatchSchedule(match: Match) {
    if (!match.scheduled_at) {
      return (
        <>
          <strong>Sin fecha</strong>
          <span>Hora sin asignar</span>
          <span>Cancha sin asignar</span>
        </>
      )
    }

    const date = new Date(match.scheduled_at)
    return (
      <>
        <strong>{formatDate(match.scheduled_at)}</strong>
        <span>{Number.isNaN(date.getTime()) ? 'Hora sin asignar' : new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(date)}</span>
        <span>Cancha sin asignar</span>
      </>
    )
  }

  function renderMatchResult(match: Match) {
    if (match.status !== 'PLAYED') {
      return <strong className="club-result club-result--muted">Sin resultado</strong>
    }

    const sets = Array.isArray(match.score?.sets) ? match.score.sets : []
    const structuredSets = [
      ...sets,
      match.score?.super_tiebreak,
    ]
      .map((set) => {
        if (!set || typeof set !== 'object') return null
        const row = set as Record<string, unknown>
        const team1 = row.team1
        const team2 = row.team2
        return typeof team1 === 'number' && typeof team2 === 'number' ? { team1, team2 } : null
      })
      .filter((set): set is { team1: number; team2: number } => Boolean(set))

    if (structuredSets.length > 0) {
      return (
        <div className="club-scoreBoard" aria-label={formatScore(match.score)}>
          <div>
            {structuredSets.map((set, index) => (
              <span className="club-scoreColumn" key={`team1-${index}`}>
                <small>Set {index + 1}</small>
                <span className={`club-scoreSet ${set.team1 > set.team2 ? 'club-scoreSet--won' : 'club-scoreSet--lost'}`}>{set.team1}</span>
              </span>
            ))}
          </div>
          <span aria-hidden="true" />
          <div>
            {structuredSets.map((set, index) => (
              <span className="club-scoreColumn" key={`team2-${index}`}>
                <span className={`club-scoreSet ${set.team2 > set.team1 ? 'club-scoreSet--won' : 'club-scoreSet--lost'}`}>{set.team2}</span>
              </span>
            ))}
          </div>
        </div>
      )
    }

    return <strong className="club-result">{formatScore(match.score)}</strong>
  }

  function renderMatchRow(match: Match) {
    const finalWinnerName =
      (match.phase ?? '').toUpperCase() === 'FINAL' && match.status === 'PLAYED'
        ? getWinnerName(match)
        : null
    const played = match.status === 'PLAYED'
    const team1Winner = played && match.winner_team_id === match.team1_id
    const team2Winner = played && match.winner_team_id === match.team2_id
    const actionButton = (
      <button
        type="button"
        className="club-actionBtn"
        disabled={tournamentFinished}
        title={tournamentFinished ? 'El torneo ya tiene campeón.' : undefined}
        onClick={() => openResultForm(match)}
      >
        {played ? 'Editar resultado' : 'Cargar'}
      </button>
    )

    return (
      <div key={match.id} className="club-matchTableRow" role="row">
        <div className="club-matchInfoCell" role="cell">
          {renderMatchSchedule(match)}
        </div>
        <div className="club-matchPairCell" role="cell">
          <div className="club-matchTeams" title={`${match.team1_name ?? 'Equipo 1'} vs ${match.team2_name ?? 'Equipo 2'}`}>
            <strong className={team1Winner ? 'club-matchTeamWinner' : undefined}>
              {match.team1_name ?? 'Equipo 1'}
            </strong>
            <span aria-hidden="true" />
            <strong className={team2Winner ? 'club-matchTeamWinner' : undefined}>
              {match.team2_name ?? 'Equipo 2'}
            </strong>
          </div>
          {finalWinnerName ? <span className="club-winnerHint">Campeón: {finalWinnerName}</span> : null}
        </div>
        <div className="club-matchResultCell" role="cell">
          {renderMatchResult(match)}
        </div>
        <div className="club-matchActionCell" role="cell">
          <span className={`club-statusBadge club-statusBadge--${(match.status ?? 'PENDING').toLowerCase()}`}>{statusLabel(match.status)}</span>
          {actionButton}
        </div>
      </div>
    )
  }

  function renderMatchTable(section: MatchSection) {
    return (
      <div className="club-matchTable" role="table" aria-label={`Partidos de ${section.title}`}>
        <div className="club-matchTableHead" role="row">
          <span role="columnheader">Info</span>
          <span role="columnheader">Partido</span>
          <span role="columnheader">Resultado</span>
          <span role="columnheader">Acciones</span>
        </div>
        {section.matches.map((match) => renderMatchRow(match))}
      </div>
    )
  }

  useEffect(() => {
    void Promise.resolve().then(() => loadTournaments())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClub?.id, requestedTournamentId])

  useEffect(() => {
    void Promise.resolve().then(() => {
      setExpandedGroups(new Set())
      setResultForm(null)
      void loadMatches(selectedTournamentId)
      void loadStandings(selectedTournamentId)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTournamentId])

  return (
    <div className="px-wrap">
      <div className="club-panel club-matches">
        <div className="club-detailTopbar">
          {selectedTournamentId ? (
            <Link href={`/club/torneos/${selectedTournamentId}`} className="club-backBtn">
              Volver al torneo
            </Link>
          ) : (
            <span />
          )}
          <div className="club-topbarActions">
            <button
              className="club-editBtn"
              type="button"
              disabled={!selectedTournamentId || loadingMatches || loadingStandings}
              onClick={() => {
                if (!selectedTournamentId) return
                void loadMatches(selectedTournamentId)
                void loadStandings(selectedTournamentId)
              }}
            >
              {loadingMatches || loadingStandings ? 'Actualizando...' : 'Actualizar'}
            </button>
          </div>
        </div>

        <div className="club-matchesHead">
          <div>
            <h1 className="club-title">Partidos</h1>
            <p className="club-sub">Consulta básica de partidos por torneo de {activeClub?.name ?? 'tu club'}.</p>
          </div>
        </div>

        {message ? <div className="club-message">{message}</div> : null}

        {!activeClub?.id ? (
          <div className="px-empty">Primero seleccioná un club activo.</div>
        ) : loadingTournaments ? (
          <div className="px-empty">Cargando torneos...</div>
        ) : tournaments.length === 0 ? (
          <div className="px-empty">Todavía no hay torneos para consultar partidos.</div>
        ) : (
          <>
            <section className="club-toolbar">
              <label className="club-selectLabel">
                <span>Torneo</span>
                <select className="px-input" value={selectedTournamentId} onChange={(event) => setSelectedTournamentId(event.target.value)}>
                  {tournaments.map((tournament) => (
                    <option key={tournament.id} value={tournament.id}>
                      {tournament.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="club-toolbarSide">
                <div className="club-counts">
                  <span><b>{matches.length}</b> partidos</span>
                  <span><b>{teams.length}</b> equipos</span>
                  {groupOperationState.total > 0 ? (
                    <span title={groupOperationState.complete ? 'Fase de grupos completa.' : `Faltan ${groupOperationState.pending} partidos de grupo por jugar.`}>
                      <b>{groupOperationState.played}/{groupOperationState.total}</b> grupos jugados
                    </span>
                  ) : null}
                </div>
                <div className="club-toolbarActions">
                  <button
                    type="button"
                    className="club-actionBtn"
                    disabled={!playoffState.canGeneratePlayoff || generatingPlayoff || tournamentFinished}
                    title={tournamentFinished ? 'El torneo ya tiene campeón.' : !playoffState.canGeneratePlayoff ? playoffState.playoffDisabledReason : undefined}
                    onClick={generatePlayoff}
                  >
                    {generatingPlayoff ? 'Generando...' : 'Generar playoff'}
                  </button>
                  {openPlayoffState.compatible ? (
                    <button
                      type="button"
                      className="club-actionBtn"
                      disabled={!openPlayoffState.canGenerate || generatingOpenPlayoff}
                      title={!openPlayoffState.canGenerate ? openPlayoffState.disabledReason : undefined}
                      onClick={generateOpenPlayoff}
                    >
                      {generatingOpenPlayoff ? 'Generando...' : 'Generar playoff OPEN'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="club-actionBtn"
                    disabled={!hasPlayoffMatches}
                    title={hasPlayoffMatches ? 'Ver partidos de playoff.' : 'El playoff todavía no fue generado.'}
                    onClick={() => document.getElementById('club-playoff-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  >
                    PLAYOFF
                  </button>
                  <button
                    type="button"
                    className="club-actionBtn"
                    disabled={!playoffState.canGenerateFinal || generatingFinal || tournamentFinished}
                    title={tournamentFinished ? 'El torneo ya tiene campeón.' : !playoffState.canGenerateFinal ? playoffState.finalDisabledReason : undefined}
                    onClick={generateFinal}
                  >
                    {generatingFinal ? 'Generando...' : 'Generar final'}
                  </button>
                  <button
                    type="button"
                    className="club-actionBtn club-actionBtn--primary"
                    disabled={teams.length < 2 || tournamentFinished}
                    title={tournamentFinished ? 'El torneo ya tiene campeón.' : undefined}
                    onClick={openCreateForm}
                  >
                    Crear partido
                  </button>
                </div>
              </div>
            </section>

            {champion ? (
              <div className="club-championBanner">
                <span className="club-championBadge">Campeón</span>
                <div className="club-championText">
                  <strong>{champion.name}</strong>
                  <span>Final: {champion.score}</span>
                </div>
              </div>
            ) : null}

            <section className="club-card">
              <div className="club-cardHead">
                <div>
                  <span className="club-kicker">Torneo seleccionado</span>
                  <h2>{selectedTournament?.name ?? 'Sin torneo'}</h2>
                  <p>{selectedTournament ? `${formatDate(selectedTournament.start_date)} · ${selectedTournament.category_name ?? 'Sin categoría'}` : ''}</p>
                </div>
              </div>

              {loadingMatches ? (
                <div className="px-empty">Cargando partidos...</div>
              ) : !matchesAvailable ? (
                <div className="px-empty">Todavía no hay estructura de fixtures/partidos en la base. Cuando se cree el schema de partidos, esta pantalla ya tiene el endpoint preparado.</div>
              ) : matches.length === 0 ? (
                <div className="px-empty">Este torneo todavía no tiene partidos cargados.</div>
              ) : (
                <div className="club-matchList">
                  {matchSections.map((section) => (
                    <section key={section.key} id={section.key === 'playoff' ? 'club-playoff-section' : undefined} className="club-matchSection">
                      <div className="club-matchSectionHead">
                        <div>
                          <strong>{section.title}</strong>
                          {section.subtitle ? <span>{section.subtitle}</span> : null}
                        </div>
                        {section.kind === 'group' ? (
                          <button type="button" className="club-showMatchesBtn" onClick={() => toggleGroup(section.key)}>
                            {expandedGroups.has(section.key) ? 'Ocultar partidos' : 'Mostrar partidos'}
                          </button>
                        ) : null}
                      </div>
                      {section.standingGroup ? renderGroupStandings(section.standingGroup) : loadingStandings ? (
                        <div className="club-inlineNote">Cargando standings...</div>
                      ) : standingsError ? (
                        <div className="club-inlineNote club-inlineNote--warn">{standingsError}</div>
                      ) : null}
                      {section.kind === 'playoff' || expandedGroups.has(section.key) ? (
                        <div className="club-matchSectionRows">
                          {renderMatchTable(section)}
                        </div>
                      ) : null}
                    </section>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {createOpen ? (
        <div className="club-modalBackdrop" role="presentation" onMouseDown={() => !savingMatch && setCreateOpen(false)}>
          <section className="club-modal" role="dialog" aria-modal="true" aria-labelledby="create-match-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="club-modalHead">
              <div>
                <span className="club-kicker">Fixture manual</span>
                <h2 id="create-match-title">Crear partido</h2>
              </div>
              <button type="button" className="club-actionBtn" disabled={savingMatch} onClick={() => setCreateOpen(false)}>
                Cerrar
              </button>
            </div>

            <div className="club-createGrid">
              <label>
                <span>Equipo 1</span>
                <select className="px-input" value={createForm.team1Id} onChange={(event) => setCreateForm((current) => ({ ...current, team1Id: event.target.value }))}>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>{team.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Equipo 2</span>
                <select className="px-input" value={createForm.team2Id} onChange={(event) => setCreateForm((current) => ({ ...current, team2Id: event.target.value }))}>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>{team.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Ronda</span>
                <input className="px-input" min="1" type="number" value={createForm.round} onChange={(event) => setCreateForm((current) => ({ ...current, round: event.target.value }))} />
              </label>
              <label>
                <span>Fase</span>
                <select className="px-input" value={createForm.phase} onChange={(event) => setCreateForm((current) => ({ ...current, phase: event.target.value }))}>
                  <option value="GROUP">Grupo</option>
                  <option value="ROUND_OF_16">Octavos</option>
                  <option value="QUARTER">Cuartos</option>
                  <option value="SEMI">Semi</option>
                  <option value="FINAL">Final</option>
                  <option value="THIRD_PLACE">Tercer puesto</option>
                  <option value="OTHER">Otra fase</option>
                </select>
              </label>
            </div>

            <div className="club-modalActions">
              <button type="button" className="club-actionBtn" disabled={savingMatch} onClick={() => setCreateOpen(false)}>
                Cancelar
              </button>
              <button type="button" className="club-actionBtn club-actionBtn--primary" disabled={savingMatch || teams.length < 2} onClick={submitMatch}>
                {savingMatch ? 'Creando...' : 'Crear partido'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {resultForm && resultMatch ? (
        <div className="club-modalBackdrop" role="presentation" onMouseDown={() => !savingResult && setResultForm(null)}>
          <section className="club-modal club-resultModal" role="dialog" aria-modal="true" aria-labelledby="result-match-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="club-modalHead">
              <div>
                <span className="club-kicker">{resultMatch.status === 'PLAYED' ? 'Editar resultado' : 'Cargar resultado'}</span>
                <h2 id="result-match-title">{resultMatch.team1_name ?? 'Equipo 1'} vs {resultMatch.team2_name ?? 'Equipo 2'}</h2>
              </div>
              <button type="button" className="club-actionBtn" disabled={savingResult} onClick={() => setResultForm(null)}>
                Cerrar
              </button>
            </div>
            {renderResultForm(resultMatch)}
          </section>
        </div>
      ) : null}

      <style>{`
        .club-matches { overflow: hidden; }
        .club-detailTopbar { align-items: center; display: flex; gap: 10px; justify-content: space-between; margin-bottom: 12px; }
        .club-topbarActions { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
        .club-backBtn { align-items: center; background: #fff1f7; border: 1px solid rgba(190,24,93,.34); border-radius: 8px; color: #be185d; cursor: pointer; display: inline-flex; font-size: 13px; font-weight: 950; justify-content: center; min-height: 36px; padding: 8px 12px; text-decoration: none; transition: background .18s ease, border-color .18s ease, box-shadow .18s ease, transform .18s ease; white-space: nowrap; }
        .club-backBtn:hover { background: #ffe4f1; border-color: rgba(190,24,93,.52); box-shadow: 0 8px 18px rgba(190,24,93,.14); transform: translateY(-1px); }
        .club-editBtn { align-items: center; background: #f0fcff; border: 1px solid rgba(83,199,217,.40); border-radius: 8px; color: #0f8ea0; cursor: pointer; display: inline-flex; font-size: 13px; font-weight: 950; justify-content: center; min-height: 36px; padding: 8px 12px; text-decoration: none; transition: background .18s ease, border-color .18s ease, box-shadow .18s ease, transform .18s ease; white-space: nowrap; }
        .club-editBtn:hover { background: #d9f8ff; border-color: rgba(15,142,160,.56); box-shadow: 0 8px 18px rgba(15,142,160,.12); transform: translateY(-1px); }
        .club-editBtn:disabled { cursor: not-allowed; opacity: .58; }
        .club-editBtn:disabled:hover { background: #f0fcff; border-color: rgba(83,199,217,.40); box-shadow: none; transform: none; }
        .club-matchesHead { align-items: flex-start; display: flex; gap: 14px; justify-content: space-between; min-width: 0; }
        .club-backTournamentBtn { align-items: center; background: #fff1f8; border: 1px solid rgba(190,24,93,.22); border-radius: 8px; color: #be185d; cursor: pointer; display: inline-flex; flex: 0 0 auto; font-size: 12px; font-weight: 950; justify-content: center; min-height: 36px; padding: 8px 12px; text-decoration: none; transition: background .16s ease, border-color .16s ease, box-shadow .16s ease, transform .16s ease; white-space: nowrap; }
        .club-backTournamentBtn:hover { background: #ffe4f1; border-color: rgba(190,24,93,.38); box-shadow: 0 10px 22px rgba(15,23,42,.08); transform: translateY(-1px); }
        .club-message { background: #eef8ff; border: 1px solid #b8dff1; border-radius: 10px; color: #164e63; font-size: 13px; font-weight: 850; margin-top: 10px; padding: 9px 11px; }
        .club-toolbar { align-items: end; background: #f8fafc; border: 1px solid rgba(15,23,42,.07); border-radius: 12px; display: grid; gap: 10px; grid-template-columns: minmax(240px, 1fr) minmax(0, auto); margin-top: 12px; min-width: 0; padding: 10px; }
        .club-selectLabel { color: #17253f; display: grid; font-size: 12px; font-weight: 950; gap: 5px; min-width: 0; }
        .club-toolbarSide { align-items: end; display: grid; gap: 7px; justify-items: end; min-width: 0; }
        .club-counts { align-items: center; display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; min-width: 0; }
        .club-counts span { align-items: center; background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 999px; color: #475569; display: inline-flex; font-size: 12px; font-weight: 850; min-height: 32px; padding: 6px 9px; white-space: nowrap; }
        .club-counts b { color: #17253f; }
        .club-toolbarActions { align-items: center; display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; min-width: 0; }
        .club-championBanner { align-items: center; background: linear-gradient(90deg, #ecfeff, #f0fdfa); border: 1px solid rgba(20,184,166,.28); border-radius: 12px; box-shadow: 0 10px 24px rgba(15,118,110,.07); display: flex; gap: 10px; margin-top: 12px; min-width: 0; padding: 9px 11px; }
        .club-championBadge { background: #22d3ee; border: 1px solid rgba(8,51,68,.08); border-radius: 999px; color: #083344; flex: 0 0 auto; font-size: 10px; font-weight: 950; padding: 5px 8px; text-transform: uppercase; white-space: nowrap; }
        .club-championText { display: grid; gap: 1px; min-width: 0; }
        .club-championText strong { color: #17253f; font-size: 14px; font-weight: 950; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-championText span { color: #0f766e; font-size: 12px; font-weight: 900; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-card { background: rgba(255,255,255,.96); border: 1px solid rgba(15,23,42,.08); border-radius: 14px; display: grid; gap: 10px; margin-top: 12px; min-width: 0; padding: 12px; }
        .club-cardHead h2 { color: #17253f; font-size: 18px; line-height: 1.15; margin: 2px 0 0; }
        .club-cardHead p { color: #64748b; font-size: 13px; margin: 5px 0 0; }
        .club-kicker { color: #64748b; font-size: 11px; font-weight: 950; letter-spacing: 0; text-transform: uppercase; }
        .club-matchList { display: grid; gap: 12px; min-width: 0; }
        .club-matchSection { background: #fff; border: 1px solid rgba(15,23,42,.07); border-radius: 12px; display: grid; gap: 9px; min-width: 0; padding: 10px; }
        .club-matchSectionHead { align-items: center; display: flex; gap: 8px; justify-content: space-between; min-width: 0; }
        .club-matchSectionHead > div { display: grid; gap: 2px; min-width: 0; }
        .club-matchSectionHead strong { color: #17253f; font-size: 14px; font-weight: 950; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-matchSectionHead span { color: #64748b; font-size: 12px; font-weight: 850; }
        .club-showMatchesBtn { background: #ecfeff; border: 1px solid rgba(6,182,212,.28); border-radius: 8px; color: #0e7490; cursor: pointer; flex: 0 0 auto; font-size: 12px; font-weight: 950; min-height: 32px; padding: 7px 10px; white-space: nowrap; }
        .club-showMatchesBtn:hover { background: #cffafe; }
        .club-matchSectionRows { display: grid; min-width: 0; }
        .club-groupStandings { background: #f8fafc; border: 1px solid rgba(15,23,42,.06); border-radius: 10px; display: grid; justify-self: center; max-width: 760px; min-width: 0; overflow: hidden; width: min(100%, 760px); }
        .club-groupStandingRow { align-items: center; border-bottom: 1px solid rgba(15,23,42,.06); display: grid; gap: 4px; grid-template-columns: 24px minmax(250px, 1fr) repeat(6, 30px); min-width: 0; padding: 6px 8px; }
        .club-groupStandingRow:last-child { border-bottom: 0; }
        .club-groupStandingRow span { color: #334155; font-size: 12px; font-weight: 850; min-width: 0; overflow: hidden; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
        .club-groupStandingRow span:nth-child(2) { text-align: left; }
        .club-groupStandingRow--head { background: #fff; }
        .club-groupStandingRow--head span { color: #64748b; font-size: 11px; font-weight: 950; text-transform: uppercase; }
        .club-groupStandingTeam { align-items: center; display: flex; gap: 4px; }
        .club-groupStandingTeam > span { text-align: left; }
        .club-groupStandingTeam b { background: #ecfdf3; border-radius: 999px; color: #166534; flex: 0 0 auto; font-size: 10px; font-weight: 950; padding: 3px 6px; white-space: nowrap; }
        .club-inlineNote { background: #f8fafc; border: 1px solid rgba(15,23,42,.07); border-radius: 9px; color: #64748b; font-size: 12px; font-weight: 850; padding: 8px 9px; }
        .club-inlineNote--warn { background: #fff7df; border-color: rgba(202,138,4,.22); color: #854d0e; }
        .club-matchTable { background: #fff; border: 1px solid rgba(15,23,42,.07); border-radius: 11px; display: grid; justify-self: center; max-width: 760px; min-width: 0; overflow: hidden; width: min(100%, 760px); }
        .club-matchTableHead, .club-matchTableRow { align-items: center; display: grid; gap: 6px; grid-template-columns: minmax(120px, .78fr) minmax(180px, 1.15fr) minmax(110px, .58fr) minmax(136px, .68fr); min-width: 0; }
        .club-matchTableHead { background: #f8fafc; border-bottom: 1px solid rgba(15,23,42,.07); padding: 6px 8px; text-align: center; }
        .club-matchTableHead span { color: #64748b; font-size: 11px; font-weight: 950; overflow: hidden; text-align: center; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
        .club-matchTableRow { border-bottom: 1px solid rgba(15,23,42,.06); padding: 5px 8px; }
        .club-matchTableRow:last-child { border-bottom: 0; }
        .club-matchInfoCell, .club-matchPairCell, .club-matchResultCell, .club-matchActionCell { min-width: 0; }
        .club-matchInfoCell { display: grid; gap: 1px; justify-items: center; text-align: center; }
        .club-matchInfoCell strong { color: #17253f; font-size: 12px; font-weight: 950; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-matchInfoCell span { color: #64748b; font-size: 11px; font-weight: 850; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-matchPairCell { display: grid; gap: 2px; justify-items: center; text-align: center; }
        .club-matchTeams { align-items: center; display: grid; gap: 2px; grid-template-rows: 10px 24px 1px 24px; justify-items: center; min-width: 0; width: 100%; }
        .club-matchTeams::before { content: ''; display: block; height: 10px; }
        .club-matchTeams strong { align-items: center; color: #17253f; display: inline-flex; font-size: 12px; font-weight: 950; gap: 5px; justify-content: center; line-height: 1.15; max-width: 100%; min-width: 0; overflow: hidden; padding: 3px 7px; text-overflow: ellipsis; white-space: nowrap; }
        .club-matchTeams strong:first-child, .club-matchTeams strong:last-child { margin: 0; }
        .club-matchTeams strong.club-matchTeamWinner { background: #ecfdf3; border: 1px solid rgba(22,101,52,.16); border-radius: 8px; color: #17253f; }
        .club-matchTeams span { background: linear-gradient(90deg, transparent, rgba(6,182,212,.42), transparent); display: block; height: 1px; width: min(150px, 78%); }
        .club-matchTitleLine { align-items: center; display: flex; gap: 7px; min-width: 0; }
        .club-matchTitleLine strong, .club-result { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-matchTitleLine strong { color: #17253f; font-size: 13px; font-weight: 950; min-width: 0; }
        .club-result { color: #17253f; font-size: 12px; font-weight: 950; }
        .club-matchResultCell { align-items: center; display: grid; justify-items: center; text-align: center; }
        .club-matchActionCell { align-content: center; align-items: center; display: grid; gap: 6px; justify-items: center; min-height: 100%; text-align: center; }
        .club-matchActionCell .club-actionBtn { font-size: 11px; min-height: 28px; padding: 5px 8px; }
        .club-matchActionCell .club-statusBadge { justify-self: center; }
        .club-scoreBoard { color: #17253f; display: grid; font-size: 13px; font-weight: 950; gap: 2px; grid-template-rows: 34px 1px 24px; justify-items: center; line-height: 1.1; min-width: 0; width: 100%; }
        .club-scoreBoard div:first-child { margin-bottom: 0; }
        .club-scoreBoard div { align-items: end; display: inline-flex; gap: 5px; justify-content: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-scoreBoard span { background: linear-gradient(90deg, transparent, rgba(15,23,42,.2), transparent); display: block; height: 1px; width: min(86px, 58%); }
        .club-scoreBoard .club-scoreColumn { align-items: center; background: transparent; display: inline-grid; gap: 2px; height: auto; justify-items: center; min-width: 30px; width: auto; }
        .club-scoreColumn small { color: #94a3b8; font-size: 8px; font-weight: 950; line-height: 1; text-transform: uppercase; }
        .club-scoreBoard .club-scoreSet { align-items: center; background: #f8fafc; border: 1px solid rgba(15,23,42,.08); border-radius: 7px; color: #17253f; display: inline-flex; font-weight: 650; height: 24px; justify-content: center; min-width: 28px; padding: 0 8px; width: auto; }
        .club-scoreBoard .club-scoreSet--won { border-color: rgba(15,23,42,.1); color: #17253f; font-weight: 950; }
        .club-scoreBoard .club-scoreSet--lost { border-color: rgba(15,23,42,.08); color: #64748b; font-weight: 500; }
        .club-winnerHint { color: #0f766e !important; font-weight: 950; }
        .club-statusBadge { background: #fff7df; border-radius: 999px; color: #854d0e; flex: 0 0 auto; font-size: 11px; font-weight: 950; justify-self: start; padding: 5px 8px; white-space: nowrap; }
        .club-statusBadge--played { background: #dcfce7; color: #166534; }
        .club-statusBadge--cancelled { background: #ffe4ec; color: #9f1239; }
        .club-result--muted { color: #94a3b8; }
        .club-actionBtn { align-items: center; background: #fff; border: 1px solid rgba(6,182,212,.35); border-radius: 8px; color: #0891b2; cursor: pointer; display: inline-flex; font-size: 12px; font-weight: 950; justify-content: center; min-height: 32px; padding: 7px 10px; transition: background .16s ease, border-color .16s ease, color .16s ease, opacity .16s ease; white-space: nowrap; }
        .club-actionBtn:hover:not(:disabled) { background: #ecfeff; border-color: rgba(6,182,212,.55); color: #0e7490; }
        .club-actionBtn:disabled { background: #f8fafc; border-color: rgba(148,163,184,.28); color: #94a3b8; cursor: not-allowed; opacity: 1; }
        .club-actionBtn--primary { background: #22d3ee; border-color: #22d3ee; color: #083344; }
        .club-actionBtn--primary:hover:not(:disabled) { background: #67e8f9; border-color: #67e8f9; color: #083344; }
        .club-resultForm { background: #f8fafc; border: 1px solid rgba(15,23,42,.07); border-radius: 12px; display: grid; gap: 10px; min-width: 0; padding: 10px; }
        .club-legacyScoreNotice { background: #fff7df; border: 1px solid rgba(202,138,4,.22); border-radius: 9px; color: #854d0e; font-size: 12px; font-weight: 850; padding: 8px 9px; }
        .club-legacyScoreNotice b { color: #713f12; }
        .club-scoreGrid { display: grid; gap: 6px; grid-template-columns: minmax(86px, .5fr) minmax(0, 1fr) minmax(0, 1fr); min-width: 0; }
        .club-scoreHead { color: #64748b; font-size: 11px; font-weight: 950; overflow: hidden; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
        .club-scoreRow { display: contents; }
        .club-scoreRow > span { align-self: center; color: #17253f; font-size: 12px; font-weight: 950; }
        .club-scoreInput { min-height: 34px; min-width: 0; }
        .club-resultSummary { background: #fff; border: 1px solid rgba(15,23,42,.06); border-radius: 9px; color: #64748b; font-size: 12px; font-weight: 850; padding: 8px 9px; }
        .club-resultSummary b { color: #0f766e; }
        .club-resultActions { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; }
        .club-modalBackdrop { align-items: center; background: rgba(15,23,42,.42); display: flex; inset: 0; justify-content: center; padding: 18px; position: fixed; z-index: 80; }
        .club-modal { background: #fff; border: 1px solid rgba(15,23,42,.1); border-radius: 14px; box-shadow: 0 24px 70px rgba(15,23,42,.24); display: grid; gap: 14px; max-height: calc(100vh - 36px); max-width: 760px; min-width: 0; overflow-y: auto; padding: 14px; width: min(760px, 100%); }
        .club-resultModal { max-width: 680px; width: min(680px, 100%); }
        .club-modalHead { align-items: center; display: flex; gap: 12px; justify-content: space-between; min-width: 0; }
        .club-modalHead h2 { color: #17253f; font-size: 18px; line-height: 1.1; margin: 2px 0 0; }
        .club-createGrid { display: grid; gap: 10px; min-width: 0; }
        .club-createGrid label { color: #17253f; display: grid; font-size: 12px; font-weight: 900; gap: 5px; min-width: 0; }
        .club-modalActions { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
        @media (min-width: 940px) {
          .club-createGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 780px) {
          .club-detailTopbar { align-items: flex-start; flex-direction: column; }
          .club-topbarActions { justify-content: flex-start; }
          .club-toolbar { grid-template-columns: 1fr; }
          .club-toolbarSide { justify-items: stretch; }
          .club-counts, .club-toolbarActions { justify-content: flex-start; }
          .club-counts span, .club-actionBtn { min-height: 30px; }
          .club-matchesHead { display: grid; }
          .club-backTournamentBtn { justify-self: start; }
          .club-championBanner { align-items: flex-start; flex-direction: column; }
          .club-matchSectionHead { align-items: flex-start; flex-direction: column; }
          .club-showMatchesBtn { width: 100%; }
          .club-matchTableHead { display: none; }
          .club-matchTableRow { align-items: start; gap: 6px; grid-template-columns: 1fr; padding: 7px; }
          .club-matchTableHead { display: none; }
          .club-matchInfoCell { background: #f8fafc; border-radius: 8px; grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 7px; }
          .club-matchInfoCell strong { grid-column: 1 / -1; }
          .club-matchTeams strong, .club-matchTitleLine strong, .club-result { white-space: normal; }
          .club-matchResultCell, .club-matchActionCell { justify-items: center; }
          .club-groupStandings { width: 100%; }
          .club-groupStandingRow { gap: 2px; grid-template-columns: 20px minmax(112px, 1fr) repeat(6, 23px); padding: 6px 5px; }
          .club-groupStandingRow span { font-size: 11px; }
          .club-groupStandingTeam b { display: none; }
        }
      `}</style>
    </div>
  )
}
