import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getTournamentDisplayStatus } from '@/lib/tournamentDisplayStatus'
import { getTournamentFlyerUrl } from '@/lib/tournamentFlyers'
import { TOURNAMENT_SELECT, toTournamentView } from '@/lib/tournamentHelpers'
import { formatCategoryLabel, formatGenderLabel, formatSegmentLabel } from '@/lib/tournamentLabels'
import {
  groupTiebreakerCriterionOptions,
  groupTiebreakerFinalOptions,
  normalizeGroupTiebreakerConfig,
} from '@/lib/tournamentTiebreakers'

type PublicDetailContext = {
  params: Promise<{ tournamentId: string }>
}

function getBearerToken(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  return auth.startsWith('Bearer ') ? auth.slice(7) : ''
}

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'string' && value.trim()) {
    try {
      return asObject(JSON.parse(value))
    } catch {
      return {}
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function mergeObjects(base: Record<string, unknown>, override: Record<string, unknown>) {
  const merged: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(override)) {
    const baseValue = merged[key]
    if (
      baseValue &&
      value &&
      typeof baseValue === 'object' &&
      typeof value === 'object' &&
      !Array.isArray(baseValue) &&
      !Array.isArray(value)
    ) {
      merged[key] = mergeObjects(baseValue as Record<string, unknown>, value as Record<string, unknown>)
    } else if (value !== undefined && value !== null && value !== '') {
      merged[key] = value
    }
  }
  return merged
}

function asText(value: unknown) {
  if (value && typeof value === 'object') return null
  const text = String(value ?? '').trim()
  return text || null
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = asText(value)
    if (text) return text
  }
  return null
}

function formatTournamentType(value?: string | null) {
  const normalized = String(value ?? '').trim().toUpperCase()
  if (normalized === 'MASTER_FINAL') return 'Master Final'
  if (normalized === 'MASTER') return 'Master'
  if (normalized === 'CHALLENGER') return 'Challenger'
  return 'Open'
}

function formatGroupTiebreaker(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const config = normalizeGroupTiebreakerConfig(value)
  const criterionLabels = new Map(groupTiebreakerCriterionOptions.map((option) => [option.value, option.label]))
  const finalLabels = new Map(groupTiebreakerFinalOptions.map((option) => [option.value, option.label]))
  const order = config.order.map((criterion) => criterionLabels.get(criterion) ?? criterion).join(' → ')
  const final = finalLabels.get(config.final) ?? config.final
  return `${order}. Si persiste el empate: ${final}.`
}

function firstObject(...values: unknown[]) {
  for (const value of values) {
    const object = asObject(value)
    if (Object.keys(object).length) return object
  }
  return {}
}

function isMissingSchemaObjectError(error: { code?: string; message?: string } | null | undefined) {
  const message = String(error?.message ?? '').toLowerCase()
  return error?.code === '42703' || error?.code === '42P01' || error?.code === 'PGRST205' || message.includes('does not exist') || message.includes('schema cache')
}

// Keep older deployments usable while the refund metadata migration reaches Supabase.
function isMissingRefundColumnError(error: { code?: string; message?: string } | null | undefined) {
  const message = String(error?.message ?? '').toLowerCase()
  return error?.code === '42703' || error?.code === 'PGRST204' || message.includes('refund_')
}

function pointValue(sources: Array<Record<string, unknown>>, ...keys: string[]) {
  for (const source of sources) {
    for (const key of keys) {
      const value = Number(source[key] ?? 0)
      if (Number.isFinite(value) && value > 0) return value
    }
  }
  return 0
}

function getFullName(profile?: Record<string, any> | null, fallback?: string | null) {
  const displayName = asText(profile?.display_name)
  if (displayName) return displayName
  const fullName = [profile?.first_name, profile?.last_name].map(asText).filter(Boolean).join(' ')
  return fullName || fallback || 'Jugador'
}

function buildRulesSummary(primaryRulesInput: unknown, secondaryRulesInput?: unknown) {
  const primaryRules = asObject(primaryRulesInput)
  const secondaryRules = asObject(secondaryRulesInput)
  const rules = mergeObjects(secondaryRules, primaryRules)
  const schedule = asObject(rules.schedule_config)
  const pointSources = [
    asObject(primaryRules.points_config),
    asObject(secondaryRules.points_config),
    asObject(rules.points_config),
  ]
  const nestedRules = asObject(rules.rules)
  const groupTiebreakers = firstObject(primaryRules.group_tiebreakers, secondaryRules.group_tiebreakers, rules.group_tiebreakers)
  const groupTiebreakersText = formatGroupTiebreaker(groupTiebreakers)
  const tieBreakRules = asObject(rules.tie_break_rules)
  const courts = Array.isArray(rules.tournament_courts) ? rules.tournament_courts : []

  return {
    description: asText(rules.public_description) ?? asText(rules.description),
    competitionSystem: asText(rules.competition_system) ?? asText(rules.format),
    venueName: asText(rules.venue_name),
    tiebreaker: firstText(
      rules.tiebreaker,
      rules.tie_breaker,
      rules.tie_break_rules,
      nestedRules.tiebreaker,
      nestedRules.tie_breaker,
      nestedRules.tie_break_rules,
      groupTiebreakersText,
      tieBreakRules.description,
      tieBreakRules.mode
    ),
    courtsCount: courts.length || null,
    courts: courts.map((court) => {
      if (typeof court === 'string') return court
      const courtObj = asObject(court)
      return firstText(courtObj.name, courtObj.label, courtObj.court_name)
    }).filter(Boolean),
    scheduleMode: asText(schedule.mode),
    pointsMode: firstText(...pointSources.map((points) => points.mode)),
    pointsConfig: {
      champion: pointValue(pointSources, 'champion', 'winner', 'ganador'),
      finalist: pointValue(pointSources, 'finalist', 'runner_up', 'subcampeon'),
      semifinalist: pointValue(pointSources, 'semifinalist', 'semifinal', 'semiFinalist'),
      quarterfinalist: pointValue(pointSources, 'quarterfinalist', 'quarterfinal', 'quarters', 'cuartos'),
      round_of_16: pointValue(pointSources, 'round_of_16', 'octavos', 'last_16', 'eighthFinalist', 'eighthfinalist'),
      zone: pointValue(pointSources, 'zone', 'group', 'zona'),
      participation: pointValue(pointSources, 'participation', 'participacion'),
    },
  }
}

async function getTokenUser(req: NextRequest) {
  const token = getBearerToken(req)
  if (!token) return null

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

async function getRegisteredTeamsCount(tournamentId: string, clubId: string) {
  const { data, error } = await supabaseAdmin
    .from('tournament_registrations')
    .select('team_id,status')
    .eq('tournament_id', tournamentId)
    .eq('club_id', clubId)

  if (error) {
    console.warn('[public-detail] registrations count failed', error.message)
    return 0
  }

  const activeTeamIds = new Set<string>()
  for (const row of data ?? []) {
    const status = String(row.status ?? '').toUpperCase()
    if (status === 'CANCELLED' || status === 'REJECTED') continue
    if (row.team_id) activeTeamIds.add(String(row.team_id))
  }

  return activeTeamIds.size
}

async function getProfilesByUserId(userIds: string[]) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)))
  if (!uniqueUserIds.length) return new Map<string, Record<string, any>>()

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('user_id,display_name,first_name,last_name,avatar_url')
    .in('user_id', uniqueUserIds)

  if (error) {
    console.warn('[public-detail] profiles lookup failed', error.message)
    return new Map<string, Record<string, any>>()
  }

  return new Map((data ?? []).map((profile) => [String(profile.user_id), profile as Record<string, any>]))
}

async function getViewerContext(tournamentId: string, clubId: string, req: NextRequest) {
  const user = await getTokenUser(req)
  if (!user) {
    return {
      isAuthenticated: false,
      isPlayerInClub: false,
      isRegisteredInTournament: false,
      myTeam: null,
      activePartnership: null,
    }
  }

  const { data: clubPlayer } = await supabaseAdmin
    .from('club_players')
    .select('id,user_id,display_name,category,gender,approved_at')
    .eq('club_id', clubId)
    .eq('user_id', user.id)
    .maybeSingle()

  const isPlayerInClub = Boolean(clubPlayer?.id && clubPlayer?.approved_at)
  const ownProfileMap = await getProfilesByUserId([user.id])
  const ownProfile = ownProfileMap.get(user.id)

  const { data: teams } = await supabaseAdmin
    .from('tournament_teams')
    .select('id,player1_user_id,player2_user_id,created_at')
    .eq('tournament_id', tournamentId)
    .eq('club_id', clubId)
    .or(`player1_user_id.eq.${user.id},player2_user_id.eq.${user.id}`)

  const teamIds = (teams ?? []).map((team) => String(team.id))
  let registrations: any[] = []
  let registrationsError: { code?: string; message?: string } | null = null

  if (teamIds.length) {
    const registrationLookup = await supabaseAdmin
      .from('tournament_registrations')
      .select('id,team_id,status,preferred_slots,availability_score,flexibility_level,created_at')
      .eq('tournament_id', tournamentId)
      .eq('club_id', clubId)
      .in('team_id', teamIds)

    registrations = registrationLookup.data ?? []
    registrationsError = registrationLookup.error

    if (registrationsError && isMissingSchemaObjectError(registrationsError)) {
      const fallbackLookup = await supabaseAdmin
        .from('tournament_registrations')
        .select('id,team_id,status,created_at')
        .eq('tournament_id', tournamentId)
        .eq('club_id', clubId)
        .in('team_id', teamIds)

      registrations = fallbackLookup.data ?? []
      registrationsError = fallbackLookup.error
    }
  }

  if (registrationsError) {
    console.warn('[public-detail] viewer registrations lookup failed', registrationsError.message)
  }

  const registrationByTeam = new Map((registrations ?? []).map((registration) => [String(registration.team_id), registration]))
  const team = (teams ?? []).find((candidate) => registrationByTeam.has(String(candidate.id))) ?? teams?.[0] ?? null
  const registration = team ? registrationByTeam.get(String(team.id)) ?? null : null

  const profileMap = team
    ? await getProfilesByUserId([String(team.player1_user_id ?? ''), String(team.player2_user_id ?? '')])
    : new Map<string, Record<string, any>>()

  let payment: Record<string, any> | null = null
  let paymentLookupUnavailable = false
  let changeRequest: Record<string, any> | null = null

  if (registration?.id) {
    const { data: paymentRow, error: paymentError } = await supabaseAdmin
      .from('tournament_payments')
      .select('id,status,method,requested_at,approved_at,paid_at')
      .eq('tournament_id', tournamentId)
      .or(`registration_id.eq.${registration.id},team_id.eq.${registration.team_id}`)
      .neq('status', 'CANCELLED')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!paymentError) {
      payment = paymentRow
    } else if (isMissingSchemaObjectError(paymentError)) {
      paymentLookupUnavailable = true
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[public-detail] payment infra unavailable; returning payment as not registered', paymentError.message)
      }
    } else {
      console.warn('[public-detail] payment lookup failed', paymentError.message)
    }

    let changeRequestResult: any = await supabaseAdmin
      .from('tournament_registration_change_requests')
      .select('id,type,status,reason,refund_percent,refund_policy_label,refund_metadata,created_at,resolved_at')
      .eq('tournament_id', tournamentId)
      .eq('registration_id', registration.id)
      .eq('requested_by', user.id)
      .eq('type', 'CANCEL_REGISTRATION')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (changeRequestResult.error && isMissingRefundColumnError(changeRequestResult.error)) {
      changeRequestResult = await supabaseAdmin
        .from('tournament_registration_change_requests')
        .select('id,type,status,reason,created_at,resolved_at')
        .eq('tournament_id', tournamentId)
        .eq('registration_id', registration.id)
        .eq('requested_by', user.id)
        .eq('type', 'CANCEL_REGISTRATION')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    }

    if (!changeRequestResult.error) {
      const changeRequestData = changeRequestResult.data as Record<string, unknown> | null
      changeRequest = changeRequestData
        ? {
            ...changeRequestData,
            refund_percent: changeRequestData.refund_percent ?? null,
            refund_policy_label: changeRequestData.refund_policy_label ?? 'A confirmar',
            refund_metadata: changeRequestData.refund_metadata ?? null,
          }
        : null
    } else if (isMissingSchemaObjectError(changeRequestResult.error)) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[public-detail] change request infra unavailable', changeRequestResult.error.message)
      }
    } else {
      console.warn('[public-detail] change request lookup failed', changeRequestResult.error.message)
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    console.info('[public-detail] viewer registration audit', {
      tournamentId,
      userId: user.id,
      teamFound: team ? { id: team.id, player1_user_id: team.player1_user_id, player2_user_id: team.player2_user_id } : null,
      registrationFound: registration ? { id: registration.id, team_id: registration.team_id, status: registration.status } : null,
      paymentFound: payment ? { id: payment.id, status: payment.status, method: payment.method } : null,
      paymentLookupUnavailable,
    })
  }

  const myTeam = team
    ? {
        id: team.id,
        registrationId: registration?.id ?? null,
        registrationStatus: registration?.status ?? null,
        availability: registration
          ? {
              preferredSlots: Array.isArray(registration.preferred_slots) ? registration.preferred_slots : [],
              availabilityScore: registration.availability_score ?? null,
              flexibilityLevel: registration.flexibility_level ?? null,
            }
          : null,
        paymentStatus: payment?.status ?? null,
        paymentMethod: payment?.method ?? null,
        paymentRequestedAt: payment?.requested_at ?? null,
        paymentApprovedAt: payment?.approved_at ?? null,
        registrationChangeRequest: changeRequest
          ? {
              id: changeRequest.id,
              type: changeRequest.type,
              status: changeRequest.status,
              reason: changeRequest.reason ?? null,
              refundPercent: changeRequest.refund_percent ?? null,
              refundPolicyLabel: changeRequest.refund_policy_label ?? null,
              refundMetadata: changeRequest.refund_metadata ?? null,
              createdAt: changeRequest.created_at ?? null,
              resolvedAt: changeRequest.resolved_at ?? null,
            }
          : null,
        players: [team.player1_user_id, team.player2_user_id].filter(Boolean).map((playerUserId) => {
          const userId = String(playerUserId)
          const profile = profileMap.get(userId)
          return {
            userId,
            name: getFullName(profile),
            avatarUrl: profile?.avatar_url ?? null,
          }
        }),
      }
    : null

  let activePartnership = null

  if (clubPlayer?.id) {
    const { data: partnership } = await supabaseAdmin
      .from('player_active_partnerships')
      .select('id,player1_club_player_id,player2_club_player_id,status,accepted_at,created_at')
      .eq('club_id', clubId)
      .eq('status', 'ACTIVE')
      .or(`player1_club_player_id.eq.${clubPlayer.id},player2_club_player_id.eq.${clubPlayer.id}`)
      .maybeSingle()

    if (partnership) {
      const partnerClubPlayerId =
        String(partnership.player1_club_player_id) === String(clubPlayer.id)
          ? String(partnership.player2_club_player_id)
          : String(partnership.player1_club_player_id)

      const { data: partnerPlayer } = await supabaseAdmin
        .from('club_players')
        .select('id,user_id,display_name')
        .eq('id', partnerClubPlayerId)
        .maybeSingle()

      const partnerProfiles = partnerPlayer?.user_id ? await getProfilesByUserId([String(partnerPlayer.user_id)]) : new Map()
      const partnerProfile = partnerPlayer?.user_id ? partnerProfiles.get(String(partnerPlayer.user_id)) : null

      activePartnership = {
        id: partnership.id,
        status: partnership.status,
        acceptedAt: partnership.accepted_at ?? null,
        createdAt: partnership.created_at ?? null,
        partner: partnerPlayer
          ? {
              clubPlayerId: partnerPlayer.id,
              userId: partnerPlayer.user_id ?? null,
              name: getFullName(partnerProfile, partnerPlayer.display_name),
              avatarUrl: partnerProfile?.avatar_url ?? null,
            }
          : null,
      }
    }
  }

  return {
    isAuthenticated: true,
    isPlayerInClub,
    clubPlayer: clubPlayer
      ? {
          id: clubPlayer.id,
          userId: clubPlayer.user_id,
          name: getFullName(ownProfile, clubPlayer.display_name),
          category: clubPlayer.category ?? null,
          gender: clubPlayer.gender ?? null,
          approved: Boolean(clubPlayer.approved_at),
        }
      : null,
    isRegisteredInTournament: Boolean(registration && String(registration.status ?? '').toUpperCase() !== 'CANCELLED'),
    myTeam,
    activePartnership,
  }
}

export async function GET(req: NextRequest, context: PublicDetailContext) {
  const { tournamentId } = await context.params
  if (!tournamentId) return NextResponse.json({ error: 'Falta tournamentId' }, { status: 400 })

  const { data: tournamentRow, error: tournamentError } = await supabaseAdmin
    .from('tournaments')
    .select(TOURNAMENT_SELECT)
    .eq('id', tournamentId)
    .maybeSingle()

  if (tournamentError) {
    return NextResponse.json({ error: tournamentError.message }, { status: 500 })
  }

  const tournament = toTournamentView(tournamentRow as any)
  if (!tournament) return NextResponse.json({ error: 'Torneo no encontrado' }, { status: 404 })

  const { data: clubRow, error: clubError } = await supabaseAdmin
    .from('clubs')
    .select('id,name,logo_url,city,province,address,theme_key')
    .eq('id', tournament.club_id)
    .maybeSingle()

  if (clubError) {
    return NextResponse.json({ error: clubError.message }, { status: 500 })
  }

  const registeredTeamsCount = await getRegisteredTeamsCount(tournament.id, tournament.club_id)
  const viewer = await getViewerContext(tournament.id, tournament.club_id, req)
  const status = getTournamentDisplayStatus(tournament)

  return NextResponse.json({
    tournament: {
      id: tournament.id,
      clubId: tournament.club_id,
      name: tournament.name,
      status: tournament.status,
      type: tournament.type,
      format: tournament.format,
      gender: tournament.gender,
      segment: tournament.segment,
      category: tournament.category,
      startDate: tournament.startDate,
      endDate: tournament.endDate,
      registrationDeadline: tournament.registrationDeadline,
      minPairs: tournament.minPairs,
      maxPairs: tournament.maxPairs,
      pricePerPlayer: tournament.pricePerPlayer,
      pointsTotal: tournament.pointsTotal,
      createdAt: tournament.createdAt,
      updatedAt: tournament.updatedAt,
      rulesSummary: buildRulesSummary(
        (tournamentRow as unknown as Record<string, unknown>).rules_json,
        (tournamentRow as unknown as Record<string, unknown>).rules
      ),
    },
    club: clubRow
      ? {
          id: clubRow.id,
          name: clubRow.name,
          logoUrl: clubRow.logo_url ?? null,
          city: clubRow.city ?? null,
          province: clubRow.province ?? null,
          address: clubRow.address ?? null,
          themeKey: clubRow.theme_key ?? null,
        }
      : null,
    status,
    flyerUrl: getTournamentFlyerUrl(tournament),
    labels: {
      category: formatCategoryLabel(tournament.category),
      gender: formatGenderLabel(tournament.gender),
      segment: formatSegmentLabel(tournament.segment),
      tournamentType: formatTournamentType(tournament.type),
    },
    dates: {
      startDate: tournament.startDate,
      endDate: tournament.endDate,
      registrationDeadline: tournament.registrationDeadline,
    },
    price: {
      pricePerPlayer: tournament.pricePerPlayer,
    },
    capacity: {
      registeredTeamsCount,
      maxPairs: tournament.maxPairs,
      spotsLeft:
        typeof tournament.maxPairs === 'number' ? Math.max(tournament.maxPairs - registeredTeamsCount, 0) : null,
    },
    viewer,
  })
}
