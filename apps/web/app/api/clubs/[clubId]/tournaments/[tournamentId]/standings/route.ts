import { NextRequest, NextResponse } from 'next/server'
import { isClubAdmin } from '@/lib/clubMembershipServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  calculateTournamentGroupStandings,
  type TournamentClassificationRules,
  type TournamentGroup,
  type TournamentGroupTeam,
  type TournamentStandingMatch,
} from '@/lib/tournamentStandings'

type TournamentRow = {
  id: string
  club_id: string
  name: string
  format: string | null
  classification_rules: TournamentClassificationRules | null
  rules_json?: Record<string, unknown> | null
  rules?: Record<string, unknown> | null
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value)
}

async function getTokenUser(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function normalizeObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function normalizeClassificationRules(value: unknown, tournamentRules?: unknown): TournamentClassificationRules | null {
  const base = value && typeof value === 'object' && !Array.isArray(value) ? value as TournamentClassificationRules : {}
  const safeRules = normalizeObject(tournamentRules)
  const groupTiebreakers = safeRules.group_tiebreakers

  if (groupTiebreakers) {
    return {
      ...base,
      group_tiebreakers: groupTiebreakers as TournamentClassificationRules['group_tiebreakers'],
    }
  }

  return Object.keys(base).length > 0 ? base : null
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ clubId: string; tournamentId: string }> }
) {
  try {
    const user = await getTokenUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
    }

    const { clubId, tournamentId } = await context.params
    const groupId = req.nextUrl.searchParams.get('group_id')?.trim() || null

    if (groupId && !isUuid(groupId)) {
      return NextResponse.json({ error: 'group_id inválido.' }, { status: 400 })
    }

    const canManage = await isClubAdmin(user.id, clubId)
    if (!canManage) {
      return NextResponse.json({ error: 'No autorizado para ver standings.' }, { status: 403 })
    }

    const { data: tournament, error: tournamentError } = await supabaseAdmin
      .from('tournaments')
      .select('id,club_id,name,format,classification_rules,rules_json,rules')
      .eq('id', tournamentId)
      .eq('club_id', clubId)
      .maybeSingle()

    if (tournamentError) {
      return NextResponse.json({ error: tournamentError.message }, { status: 500 })
    }

    if (!tournament) {
      return NextResponse.json({ error: 'Torneo no encontrado para este club.' }, { status: 404 })
    }

    let groups: TournamentGroup[] = []
    if (groupId) {
      const { data: group, error: groupError } = await supabaseAdmin
        .from('tournament_groups')
        .select('id,tournament_id,name,size,order')
        .eq('id', groupId)
        .maybeSingle()

      if (groupError) {
        return NextResponse.json({ error: groupError.message }, { status: 500 })
      }

      if (!group) {
        return NextResponse.json({ error: 'Grupo no encontrado.' }, { status: 404 })
      }

      if (group.tournament_id !== tournamentId) {
        return NextResponse.json({ error: 'El grupo no pertenece al torneo indicado.' }, { status: 400 })
      }

      groups = [group as TournamentGroup]
    } else {
      const { data: groupRows, error: groupsError } = await supabaseAdmin
        .from('tournament_groups')
        .select('id,tournament_id,name,size,order')
        .eq('tournament_id', tournamentId)
        .order('order', { ascending: true })

      if (groupsError) {
        return NextResponse.json({ error: groupsError.message }, { status: 500 })
      }

      groups = (groupRows ?? []) as TournamentGroup[]
    }

    if (groups.length === 0) {
      const row = tournament as TournamentRow
      return NextResponse.json({
        tournament: {
          id: row.id,
          club_id: row.club_id,
          name: row.name,
          format: row.format,
          classification_rules: normalizeClassificationRules(row.classification_rules, row.rules_json ?? row.rules),
        },
        groups: [],
        meta: {
          standings_persisted: false,
          source: 'calculated',
          group_filter: groupId,
        },
      })
    }

    let groupTeamsQuery = supabaseAdmin
      .from('tournament_group_teams')
      .select('group_id,tournament_id,team_id,seed,position')
      .eq('tournament_id', tournamentId)

    if (groupId) groupTeamsQuery = groupTeamsQuery.eq('group_id', groupId)

    const { data: groupTeamRows, error: groupTeamsError } = await groupTeamsQuery
    if (groupTeamsError) {
      return NextResponse.json({ error: groupTeamsError.message }, { status: 500 })
    }

    let matchesQuery = supabaseAdmin
      .from('tournament_matches')
      .select('id,group_id,phase,status,team1_id,team2_id,winner_team_id,score')
      .eq('tournament_id', tournamentId)
      .eq('club_id', clubId)

    if (groupId) matchesQuery = matchesQuery.eq('group_id', groupId)

    const { data: matchRows, error: matchesError } = await matchesQuery
    if (matchesError) {
      return NextResponse.json({ error: matchesError.message }, { status: 500 })
    }

    const row = tournament as TournamentRow
    const classificationRules = normalizeClassificationRules(row.classification_rules, row.rules_json ?? row.rules)

    try {
      const standings = calculateTournamentGroupStandings({
        groups,
        groupTeams: (groupTeamRows ?? []) as TournamentGroupTeam[],
        matches: (matchRows ?? []) as TournamentStandingMatch[],
        classificationRules,
      })

      return NextResponse.json({
        tournament: {
          id: row.id,
          club_id: row.club_id,
          name: row.name,
          format: row.format,
          classification_rules: classificationRules,
        },
        groups: standings,
        meta: {
          standings_persisted: false,
          source: 'calculated',
          group_filter: groupId,
        },
      })
    } catch (error: unknown) {
      const message = getErrorMessage(error, 'Error calculando standings.')
      if (message.includes('head_to_head')) {
        return NextResponse.json({ error: message, code: 'UNSUPPORTED_TIE_BREAKER' }, { status: 422 })
      }
      throw error
    }
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Error leyendo standings del torneo.') }, { status: 500 })
  }
}
