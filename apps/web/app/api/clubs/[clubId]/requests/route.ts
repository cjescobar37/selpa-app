import { NextRequest, NextResponse } from 'next/server'

import { userHasClubCapability } from '@/lib/clubMembershipServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type Context = { params: Promise<{ clubId: string }> }

function isMissingSchemaObjectError(error: { code?: string; message?: string } | null | undefined) {
  const message = String(error?.message ?? '').toLowerCase()
  return error?.code === '42P01' || error?.code === 'PGRST205' || message.includes('does not exist') || message.includes('schema cache')
}

function fullName(profile?: Record<string, unknown> | null) {
  const value = [profile?.first_name, profile?.last_name].filter((part): part is string => typeof part === 'string' && part.trim().length > 0).join(' ').trim()
  return value || String(profile?.display_name ?? profile?.email ?? 'Jugador')
}

export async function GET(req: NextRequest, context: Context) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !authData.user) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })

  const { clubId } = await context.params
  const [canViewMemberships, canManageRegistrations] = await Promise.all([
    userHasClubCapability(authData.user.id, clubId, 'memberships:view'),
    userHasClubCapability(authData.user.id, clubId, 'registrations:manage'),
  ])
  if (!canViewMemberships && !canManageRegistrations) return NextResponse.json({ error: 'No tenés permisos para ver solicitudes.' }, { status: 403 })

  const [{ data: tournamentRows, error: tournamentsError }, { data: registrationRows, error: registrationsError }] = await Promise.all([
    supabaseAdmin.from('tournaments').select('id,name,start_date').eq('club_id', clubId),
    supabaseAdmin.from('tournament_registrations').select('id,tournament_id,team_id').eq('club_id', clubId),
  ])
  if (tournamentsError || registrationsError) return NextResponse.json({ error: tournamentsError?.message ?? registrationsError?.message ?? 'No pudimos cargar las solicitudes.' }, { status: 500 })

  const tournaments = new Map((tournamentRows ?? []).map((row: any) => [row.id, row]))
  const registrations = new Map((registrationRows ?? []).map((row: any) => [row.id, row]))
  const registrationIds = Array.from(registrations.keys())
  const teamIds = Array.from(new Set(Array.from(registrations.values()).map((row: any) => row.team_id).filter(Boolean)))

  const { data: teamRows, error: teamsError } = teamIds.length
    ? await supabaseAdmin.from('tournament_teams').select('id,player1_user_id,player2_user_id').in('id', teamIds)
    : { data: [], error: null }
  if (teamsError) return NextResponse.json({ error: teamsError.message }, { status: 500 })
  const teams = new Map((teamRows ?? []).map((row: any) => [row.id, row]))
  const playerIds = Array.from(new Set((teamRows ?? []).flatMap((row: any) => [row.player1_user_id, row.player2_user_id]).filter(Boolean)))
  const { data: profileRows, error: profilesError } = playerIds.length
    ? await supabaseAdmin.from('profiles').select('user_id,first_name,last_name,display_name,email').in('user_id', playerIds)
    : { data: [], error: null }
  if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500 })
  const profiles = new Map((profileRows ?? []).map((row: any) => [row.user_id, row]))
  const teamLabel = (registrationId: string | null) => {
    const registration = registrationId ? registrations.get(registrationId) : null
    const team = registration ? teams.get(registration.team_id) : null
    if (!team) return 'Pareja sin datos'
    return [fullName(profiles.get(team.player1_user_id)), fullName(profiles.get(team.player2_user_id))].join(' / ')
  }

  let membershipRequests: Array<Record<string, unknown>> = []
  if (canViewMemberships) {
    const { data, error } = await supabaseAdmin
      .from('club_memberships')
      .select('id,user_id,role,status,created_at')
      .eq('club_id', clubId)
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const userIds = (data ?? []).map((row: any) => row.user_id)
    const { data: membersProfiles } = userIds.length
      ? await supabaseAdmin.from('profiles').select('user_id,first_name,last_name,display_name,email').in('user_id', userIds)
      : { data: [] }
    const membershipProfiles = new Map((membersProfiles ?? []).map((row: any) => [row.user_id, row]))
    membershipRequests = (data ?? []).map((row: any) => ({ id: row.id, name: fullName(membershipProfiles.get(row.user_id)), email: membershipProfiles.get(row.user_id)?.email ?? null, created_at: row.created_at }))
  }

  let cancellationRequests: Array<Record<string, unknown>> = []
  let paymentRequests: Array<Record<string, unknown>> = []
  if (canManageRegistrations && registrationIds.length) {
    const [changesResult, paymentsResult] = await Promise.all([
      supabaseAdmin.from('tournament_registration_change_requests').select('id,tournament_id,registration_id,reason,refund_percent,refund_policy_label,created_at').eq('club_id', clubId).eq('type', 'CANCEL_REGISTRATION').eq('status', 'PENDING').order('created_at', { ascending: false }),
      supabaseAdmin.from('tournament_payments').select('id,registration_id,amount,method,requested_at,created_at').in('registration_id', registrationIds).eq('status', 'PENDING').order('created_at', { ascending: false }),
    ])
    if (changesResult.error && !isMissingSchemaObjectError(changesResult.error)) return NextResponse.json({ error: changesResult.error.message }, { status: 500 })
    if (paymentsResult.error && !isMissingSchemaObjectError(paymentsResult.error)) return NextResponse.json({ error: paymentsResult.error.message }, { status: 500 })
    cancellationRequests = (changesResult.data ?? []).map((row: any) => ({ ...row, team_name: teamLabel(row.registration_id), tournament_name: tournaments.get(row.tournament_id)?.name ?? 'Torneo' }))
    paymentRequests = (paymentsResult.data ?? []).map((row: any) => {
      const registration = registrations.get(row.registration_id)
      return { ...row, team_name: teamLabel(row.registration_id), tournament_id: registration?.tournament_id ?? null, tournament_name: registration ? tournaments.get(registration.tournament_id)?.name ?? 'Torneo' : 'Torneo' }
    })
  }

  return NextResponse.json({ memberships: membershipRequests, cancellations: cancellationRequests, payments: paymentRequests })
}
