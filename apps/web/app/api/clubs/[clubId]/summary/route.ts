import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { userHasClubCapability } from '@/lib/clubMembershipServer'

type ClubStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED'

type TournamentRow = {
  id: string
  name: string
  status: string | null
  starts_on: string | null
  start_date: string | null
  registration_deadline: string | null
  signup_deadline: string | null
}

async function getTokenUser(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

function getTournamentDate(row: TournamentRow) {
  return row.starts_on ?? row.start_date ?? null
}

function isActiveOrUpcomingTournament(row: TournamentRow, today: string) {
  const status = String(row.status ?? '').toUpperCase()
  if (['CANCELLED', 'CANCELED', 'ARCHIVED', 'FINISHED', 'COMPLETED'].includes(status)) {
    return false
  }

  if (['ACTIVE', 'OPEN', 'PUBLISHED', 'REGISTRATION_OPEN', 'IN_PROGRESS'].includes(status)) {
    return true
  }

  const date = getTournamentDate(row)
  return Boolean(date && date >= today && status !== 'DRAFT')
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export async function GET(req: NextRequest, context: { params: Promise<{ clubId: string }> }) {
  try {
    const user = await getTokenUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
    }

    const { clubId } = await context.params
    const canManage = await userHasClubCapability(user.id, clubId, 'dashboard:view')
    if (!canManage) {
      return NextResponse.json({ error: 'No autorizado para ver el resumen del club.' }, { status: 403 })
    }

    const [
      clubRes,
      playersRes,
      pendingMembershipsRes,
      tournamentsRes,
    ] = await Promise.all([
      supabaseAdmin
        .from('clubs')
        .select('id,name,status,city,province,country,logo_url,rules_pdf_url,rejected_at,rejection_reason,correction_requested_at,correction_reason,suspended_at,suspension_reason')
        .eq('id', clubId)
        .maybeSingle(),
      supabaseAdmin
        .from('club_players')
        .select('id', { count: 'exact', head: true })
        .eq('club_id', clubId)
        .not('approved_at', 'is', null),
      supabaseAdmin
        .from('club_memberships')
        .select('id', { count: 'exact', head: true })
        .eq('club_id', clubId)
        .eq('role', 'PLAYER')
        .eq('status', 'PENDING'),
      supabaseAdmin
        .from('tournaments')
        .select('id,name,status,starts_on,start_date,registration_deadline,signup_deadline')
        .eq('club_id', clubId)
        .order('start_date', { ascending: true })
        .limit(30),
    ])

    if (clubRes.error) return NextResponse.json({ error: clubRes.error.message }, { status: 500 })
    if (playersRes.error) return NextResponse.json({ error: playersRes.error.message }, { status: 500 })
    if (pendingMembershipsRes.error) return NextResponse.json({ error: pendingMembershipsRes.error.message }, { status: 500 })
    if (tournamentsRes.error) return NextResponse.json({ error: tournamentsRes.error.message }, { status: 500 })

    if (!clubRes.data) {
      return NextResponse.json({ error: 'Club no encontrado.' }, { status: 404 })
    }

    let operativeRoleSupported = true
    let staffRes = await supabaseAdmin
      .from('club_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('club_id', clubId)
      .eq('status', 'APPROVED')
      .not('approved_at', 'is', null)
      .in('role', ['OWNER', 'ADMIN', 'PLANILLERO', 'OPERATIVO'])

    if (staffRes.error && /OPERATIVO|club_role|invalid input value/i.test(staffRes.error.message)) {
      operativeRoleSupported = false
      staffRes = await supabaseAdmin
        .from('club_memberships')
        .select('id', { count: 'exact', head: true })
        .eq('club_id', clubId)
        .eq('status', 'APPROVED')
        .not('approved_at', 'is', null)
        .in('role', ['OWNER', 'ADMIN', 'PLANILLERO'])
    }

    if (staffRes.error) return NextResponse.json({ error: staffRes.error.message }, { status: 500 })

    const today = new Date().toISOString().slice(0, 10)
    const activeOrUpcomingTournaments = ((tournamentsRes.data ?? []) as TournamentRow[])
      .filter((row) => isActiveOrUpcomingTournament(row, today))
      .sort((a, b) => String(getTournamentDate(a) ?? '9999-12-31').localeCompare(String(getTournamentDate(b) ?? '9999-12-31')))
      .slice(0, 5)

    const club = clubRes.data as {
      id: string
      name: string
      status: ClubStatus
      city: string | null
      province: string | null
      country: string | null
      logo_url: string | null
      rules_pdf_url: string | null
      rejected_at: string | null
      rejection_reason: string | null
      correction_requested_at: string | null
      correction_reason: string | null
      suspended_at: string | null
      suspension_reason: string | null
    }

    return NextResponse.json({
      club,
      counts: {
        active_players: playersRes.count ?? 0,
        pending_player_requests: pendingMembershipsRes.count ?? 0,
        internal_staff: staffRes.count ?? 0,
        active_or_upcoming_tournaments: activeOrUpcomingTournaments.length,
      },
      schema: {
        operative_role_supported: operativeRoleSupported,
      },
      tournaments: activeOrUpcomingTournaments.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        date: getTournamentDate(row),
        registration_deadline: row.registration_deadline ?? row.signup_deadline,
      })),
    })
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Error leyendo resumen del club.') }, { status: 500 })
  }
}
