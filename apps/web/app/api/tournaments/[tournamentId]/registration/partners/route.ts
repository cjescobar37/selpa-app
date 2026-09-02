import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { TOURNAMENT_SELECT, toTournamentView } from '@/lib/tournamentHelpers'
import { getTournamentDisplayStatus } from '@/lib/tournamentDisplayStatus'
import { getTournamentRegistrationIneligibility } from '@/lib/tournamentRegistrationEligibility'

type PartnerSearchContext = {
  params: Promise<{ tournamentId: string }>
}

type ProfileRow = {
  user_id: string
  display_name: string | null
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  status: string | null
  birth_date?: string | null
}

function getBearerToken(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  return auth.startsWith('Bearer ') ? auth.slice(7) : ''
}

function fullName(profile?: ProfileRow | null, fallback?: string | null) {
  return (
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() ||
    profile?.display_name ||
    fallback ||
    'Jugador'
  )
}

async function getTokenUser(req: NextRequest) {
  const token = getBearerToken(req)
  if (!token) return null
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

export async function GET(req: NextRequest, context: PartnerSearchContext) {
  const { tournamentId } = await context.params
  const user = await getTokenUser(req)
  if (!user) return NextResponse.json({ error: 'Iniciá sesión para buscar compañero.' }, { status: 401 })

  const { data: tournamentRow, error: tournamentError } = await supabaseAdmin
    .from('tournaments')
    .select(TOURNAMENT_SELECT)
    .eq('id', tournamentId)
    .maybeSingle()

  if (tournamentError) return NextResponse.json({ error: tournamentError.message }, { status: 500 })
  const tournament = toTournamentView(tournamentRow as Parameters<typeof toTournamentView>[0])
  if (!tournament) return NextResponse.json({ error: 'Torneo no encontrado.' }, { status: 404 })

  const displayStatus = getTournamentDisplayStatus({
    status: tournament.status,
    startDate: tournament.startDate,
    endDate: tournament.endDate,
    registrationDeadline: tournament.registrationDeadline,
  })
  if (['registration_closed', 'live', 'finished', 'paused', 'cancelled', 'draft'].includes(displayStatus.key)) {
    return NextResponse.json({ partners: [], emptyMessage: 'No hay inscripciones disponibles para este torneo.' })
  }

  const { data: me } = await supabaseAdmin
    .from('club_players')
    .select('id,user_id,approved_at,operational_status')
    .eq('club_id', tournament.club_id)
    .eq('user_id', user.id)
    .maybeSingle()

  const { data: myMembership } = await supabaseAdmin
    .from('club_memberships')
    .select('status,approved_at')
    .eq('club_id', tournament.club_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (
    !me?.id ||
    !me.approved_at ||
    String(me.operational_status ?? 'ACTIVE').toUpperCase() !== 'ACTIVE' ||
    String(myMembership?.status ?? '').toUpperCase() !== 'APPROVED' ||
    !myMembership?.approved_at
  ) {
    return NextResponse.json({ error: 'Tu perfil no está habilitado para inscribirse en este club.' }, { status: 403 })
  }

  const query = String(req.nextUrl.searchParams.get('q') ?? '').trim()
  if (query.length < 1) return NextResponse.json({ partners: [] })

  const ageCategoryResult = tournament.ageCategoryId
    ? await supabaseAdmin
        .from('competition_age_categories')
        .select('min_age,max_age,age_reference_rule,age_reference_config')
        .eq('id', tournament.ageCategoryId)
        .eq('club_id', tournament.club_id)
        .maybeSingle()
    : { data: null, error: null }

  if (ageCategoryResult.error) return NextResponse.json({ error: 'No pudimos validar la categoría de edad del torneo.' }, { status: 500 })

  const { data: players, error: playersError } = await supabaseAdmin
    .from('club_players')
    .select('id,user_id,display_name,category,gender,approved_at,operational_status')
    .eq('club_id', tournament.club_id)
    .neq('user_id', user.id)
    .not('user_id', 'is', null)
    .not('approved_at', 'is', null)
    .eq('operational_status', 'ACTIVE')
    .limit(30)

  if (playersError) return NextResponse.json({ error: playersError.message }, { status: 500 })

  const userIds = Array.from(new Set((players ?? []).map((player) => String(player.user_id)).filter(Boolean)))
  const profilesResult = userIds.length
    ? await supabaseAdmin
        .from('profiles')
        .select('user_id,display_name,first_name,last_name,avatar_url,status,birth_date')
        .in('user_id', userIds)
    : { data: [] as ProfileRow[], error: null }
  const membershipsResult = userIds.length
    ? await supabaseAdmin
        .from('club_memberships')
        .select('user_id,status,approved_at')
        .eq('club_id', tournament.club_id)
        .in('user_id', userIds)
    : { data: [], error: null }
  const teamsResult = userIds.length
    ? await supabaseAdmin
        .from('tournament_teams')
        .select('player1_user_id,player2_user_id')
        .eq('club_id', tournament.club_id)
        .eq('tournament_id', tournament.id)
    : { data: [], error: null }

  if (profilesResult.error || membershipsResult.error || teamsResult.error) {
    return NextResponse.json({ error: 'No pudimos verificar quiénes pueden inscribirse ahora.' }, { status: 500 })
  }

  const profiles = profilesResult.data
  const memberships = membershipsResult.data
  const teams = teamsResult.data

  const profilesByUserId = new Map((profiles ?? []).map((profile) => [String(profile.user_id), profile as ProfileRow]))
  const eligibleMemberships = new Set(
    (memberships ?? [])
      .filter(
        (membership) =>
          String(membership.status ?? '').toUpperCase() === 'APPROVED' && Boolean(membership.approved_at),
      )
      .map((membership) => String(membership.user_id)),
  )
  const enrolledUserIds = new Set(
    (teams ?? []).flatMap((team) => [team.player1_user_id, team.player2_user_id]).filter(Boolean).map(String),
  )
  const q = query.toLowerCase()
  const ageCategory = ageCategoryResult.data
    ? {
        minAge: ageCategoryResult.data.min_age,
        maxAge: ageCategoryResult.data.max_age,
        referenceRule: ageCategoryResult.data.age_reference_rule,
        referenceConfig: ageCategoryResult.data.age_reference_config as Record<string, unknown> | null,
      }
    : null
  const membershipsByUserId = new Map((memberships ?? []).map((membership) => [String(membership.user_id), membership]))
  const partners = (players ?? [])
    .map((player) => {
      const profile = profilesByUserId.get(String(player.user_id))
      const name = fullName(profile, player.display_name)
      return {
        clubPlayerId: player.id,
        userId: player.user_id,
        name,
        avatarUrl: profile?.avatar_url ?? null,
        category: player.category ?? null,
        gender: player.gender ?? null,
        approved: Boolean(player.approved_at),
      }
    })
    .filter((partner) => {
      const profile = profilesByUserId.get(String(partner.userId))
      const membership = membershipsByUserId.get(String(partner.userId))
      const source = (players ?? []).find((player) => String(player.user_id) === String(partner.userId))
      const ineligibility = getTournamentRegistrationIneligibility(
        {
          category: tournament.category,
          gender: tournament.gender,
          startDate: tournament.startDate,
          endDate: tournament.endDate,
        },
        {
          userId: partner.userId,
          category: partner.category,
          gender: partner.gender,
          approvedAt: source?.approved_at ?? null,
          operationalStatus: source?.operational_status ?? null,
          membershipStatus: membership?.status ?? null,
          membershipApprovedAt: membership?.approved_at ?? null,
          profileStatus: profile?.status ?? null,
          birthDate: profile?.birth_date ?? null,
          alreadyRegistered: enrolledUserIds.has(String(partner.userId)),
        },
        ageCategory,
      )
      return !ineligibility && eligibleMemberships.has(String(partner.userId)) && partner.name.toLowerCase().includes(q)
    })
    .slice(0, 12)

  return NextResponse.json({ partners })
}
