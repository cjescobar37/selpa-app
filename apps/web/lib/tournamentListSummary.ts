import { deriveTournamentOperationalStage } from './competitionTournamentState'

export type TournamentListSourceRow = {
  id: string
  status: string | null
}

export type TournamentListRegistrationRow = {
  tournament_id: string
  status: string | null
}

export type TournamentListGroupRow = {
  id: string
  tournament_id: string
}

export type TournamentListMatchRow = {
  id: string
  tournament_id: string
  phase: string | null
  status: string | null
  winner_team_id: string | null
  round: number | null
  match_order: number | null
  created_at: string | null
}

export type TournamentListSummary = {
  operationalStage: ReturnType<typeof deriveTournamentOperationalStage>
  currentPlayoffPhase: string | null
  counts: {
    registrations: {
      confirmed: number
    }
    groups: number
    groupMatches: {
      total: number
    }
    playoffMatches: number
  }
  final: {
    status: string | null
  } | null
  champion: {
    team_id: string
  } | null
}

const playoffPhaseOrder = ['ROUND_OF_32', 'ROUND_OF_16', 'EIGHTHS', 'QUARTER', 'SEMI', 'FINAL'] as const

function getPlayoffPhaseIndex(phase?: string | null) {
  const cleanPhase = String(phase ?? '').trim().toUpperCase()
  const foundIndex = playoffPhaseOrder.indexOf(cleanPhase as (typeof playoffPhaseOrder)[number])
  return foundIndex >= 0 ? foundIndex : Number.MAX_SAFE_INTEGER
}

function compareMatches(left: TournamentListMatchRow, right: TournamentListMatchRow) {
  const phaseDiff = getPlayoffPhaseIndex(left.phase) - getPlayoffPhaseIndex(right.phase)
  if (phaseDiff !== 0) return phaseDiff
  const roundDiff = (left.round ?? 0) - (right.round ?? 0)
  if (roundDiff !== 0) return roundDiff
  const orderDiff = (left.match_order ?? 0) - (right.match_order ?? 0)
  if (orderDiff !== 0) return orderDiff
  return String(left.created_at ?? '').localeCompare(String(right.created_at ?? ''))
}

function deriveCurrentPlayoffPhase(matches: TournamentListMatchRow[]) {
  const playoffMatches = matches
    .filter((match) => String(match.phase ?? '').toUpperCase() !== 'GROUP')
    .filter((match) => getPlayoffPhaseIndex(match.phase) !== Number.MAX_SAFE_INTEGER)
    .sort(compareMatches)

  if (playoffMatches.length === 0) return null
  const pendingMatch = playoffMatches.find((match) => String(match.status ?? '').toUpperCase() !== 'PLAYED')
  return String((pendingMatch ?? playoffMatches.at(-1))?.phase ?? '').toUpperCase() || null
}

function appendByTournamentId<T extends { tournament_id: string }>(target: Map<string, T[]>, row: T) {
  const current = target.get(row.tournament_id) ?? []
  current.push(row)
  target.set(row.tournament_id, current)
}

export function buildTournamentListSummaries(input: {
  tournaments: TournamentListSourceRow[]
  registrations: TournamentListRegistrationRow[]
  groups: TournamentListGroupRow[]
  matches: TournamentListMatchRow[]
}) {
  const registrationsByTournamentId = new Map<string, TournamentListRegistrationRow[]>()
  const groupsByTournamentId = new Map<string, TournamentListGroupRow[]>()
  const matchesByTournamentId = new Map<string, TournamentListMatchRow[]>()

  input.registrations.forEach((row) => appendByTournamentId(registrationsByTournamentId, row))
  input.groups.forEach((row) => appendByTournamentId(groupsByTournamentId, row))
  input.matches.forEach((row) => appendByTournamentId(matchesByTournamentId, row))

  return Object.fromEntries(input.tournaments.map((tournament) => {
    const registrations = registrationsByTournamentId.get(tournament.id) ?? []
    const groups = groupsByTournamentId.get(tournament.id) ?? []
    const matches = matchesByTournamentId.get(tournament.id) ?? []
    const groupMatches = matches.filter((match) => String(match.phase ?? '').toUpperCase() === 'GROUP')
    const playoffMatches = matches.filter((match) => String(match.phase ?? '').toUpperCase() !== 'GROUP')
    const finalMatch = playoffMatches
      .filter((match) => String(match.phase ?? '').toUpperCase() === 'FINAL')
      .sort(compareMatches)
      .at(-1) ?? null
    const championTeamId = finalMatch?.status === 'PLAYED' && finalMatch.winner_team_id
      ? finalMatch.winner_team_id
      : null
    const status = String(tournament.status ?? 'DRAFT').toUpperCase()

    const summary: TournamentListSummary = {
      operationalStage: deriveTournamentOperationalStage({
        status,
        groupCount: groups.length,
        groupMatchesTotal: groupMatches.length,
        playoffMatchesCount: playoffMatches.length,
      }),
      currentPlayoffPhase: deriveCurrentPlayoffPhase(matches),
      counts: {
        registrations: {
          confirmed: registrations.filter((registration) => registration.status === 'CONFIRMED').length,
        },
        groups: groups.length,
        groupMatches: {
          total: groupMatches.length,
        },
        playoffMatches: playoffMatches.length,
      },
      final: finalMatch ? { status: finalMatch.status } : null,
      champion: championTeamId ? { team_id: championTeamId } : null,
    }

    return [tournament.id, summary]
  })) as Record<string, TournamentListSummary>
}
