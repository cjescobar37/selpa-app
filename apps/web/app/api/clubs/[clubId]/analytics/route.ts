import { NextRequest, NextResponse } from 'next/server'
import { getTokenUser } from '@/lib/platformApiAuth'
import { userHasClubCapability } from '@/lib/clubMembershipServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type AmountByCurrency = Record<string, { income: number; expenses: number; adjustments: number; net: number }>
type QueryError = { message?: string; code?: string } | null

function validDate(value: string | null, fallback: Date) {
  if (!value) return fallback
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : date
}
function missingRelation(error: QueryError) {
  const message = String(error?.message ?? '').toLowerCase()
  return error?.code === '42P01' || error?.code === 'PGRST205' || message.includes('schema cache') || message.includes('does not exist')
}
function number(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}
function percentage(current: number, previous: number) {
  if (previous === 0) return { value: null, label: current > 0 ? 'Primera actividad registrada' : 'Sin período anterior comparable' }
  const value = Math.round(((current - previous) / previous) * 1000) / 10
  return { value, label: `${value > 0 ? '+' : ''}${value}% vs. período anterior` }
}

export async function GET(req: NextRequest, context: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await context.params
  const user = await getTokenUser(req)
  if (!user) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })

  const [canView, canFinance, canContent, canAds] = await Promise.all([
    userHasClubCapability(user.id, clubId, 'reports:operational_view'),
    userHasClubCapability(user.id, clubId, 'finance:view'),
    userHasClubCapability(user.id, clubId, 'content:view'),
    userHasClubCapability(user.id, clubId, 'ads:manage'),
  ])
  if (!canView) return NextResponse.json({ error: 'No tenés acceso a las estadísticas del club.' }, { status: 403 })

  const now = new Date()
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1)
  const from = validDate(req.nextUrl.searchParams.get('from'), defaultFrom)
  const to = validDate(req.nextUrl.searchParams.get('to'), now)
  to.setHours(23, 59, 59, 999)
  if (from > to || to.getTime() - from.getTime() > 732 * 86400000) {
    return NextResponse.json({ error: 'El rango temporal no es válido.' }, { status: 400 })
  }
  const duration = to.getTime() - from.getTime()
  const previousTo = new Date(from.getTime() - 1)
  const previousFrom = new Date(previousTo.getTime() - duration)
  const fromIso = from.toISOString()
  const toIso = to.toISOString()
  const previousFromIso = previousFrom.toISOString()
  const previousToIso = previousTo.toISOString()
  const warnings: string[] = []

  const [
    playersResult, newPlayersResult, previousPlayersResult, pendingResult,
    tournamentsResult, previousTournamentsResult, registrationsResult, previousRegistrationsResult,
    matchesResult, teamsResult,
  ] = await Promise.all([
    supabaseAdmin.from('club_players').select('id,user_id,display_name,category,gender,approved_at,operational_status').eq('club_id', clubId).eq('operational_status', 'ACTIVE').not('approved_at', 'is', null),
    supabaseAdmin.from('club_players').select('id', { count: 'exact', head: true }).eq('club_id', clubId).eq('operational_status', 'ACTIVE').gte('approved_at', fromIso).lte('approved_at', toIso),
    supabaseAdmin.from('club_players').select('id', { count: 'exact', head: true }).eq('club_id', clubId).eq('operational_status', 'ACTIVE').gte('approved_at', previousFromIso).lte('approved_at', previousToIso),
    supabaseAdmin.from('club_memberships').select('id', { count: 'exact', head: true }).eq('club_id', clubId).eq('status', 'PENDING'),
    supabaseAdmin.from('tournaments').select('id,name,status,type,tournament_type,gender,category,max_pairs,price_per_player,starts_on,start_date,created_at').eq('club_id', clubId).gte('created_at', fromIso).lte('created_at', toIso),
    supabaseAdmin.from('tournaments').select('id', { count: 'exact', head: true }).eq('club_id', clubId).gte('created_at', previousFromIso).lte('created_at', previousToIso),
    supabaseAdmin.from('tournament_registrations').select('id,tournament_id,team_id,status,created_at').eq('club_id', clubId).gte('created_at', fromIso).lte('created_at', toIso),
    supabaseAdmin.from('tournament_registrations').select('id', { count: 'exact', head: true }).eq('club_id', clubId).gte('created_at', previousFromIso).lte('created_at', previousToIso),
    supabaseAdmin.from('tournament_matches').select('id,tournament_id,team1_id,team2_id,status,score,scheduled_at,created_at').eq('club_id', clubId).gte('created_at', fromIso).lte('created_at', toIso),
    supabaseAdmin.from('tournament_teams').select('id,tournament_id,player1_user_id,player2_user_id,created_at').eq('club_id', clubId),
  ])
  const coreError = [playersResult.error, tournamentsResult.error, registrationsResult.error].find(Boolean)
  if (coreError) return NextResponse.json({ error: 'No pudimos cargar las estadísticas del club.', code: 'CLUB_ANALYTICS_LOAD_FAILED' }, { status: 500 })
  if (matchesResult.error) warnings.push('La actividad de partidos no está disponible en este entorno.')

  const players = playersResult.data ?? []
  const tournaments = tournamentsResult.data ?? []
  const registrations = registrationsResult.data ?? []
  const matches = matchesResult.error ? [] : matchesResult.data ?? []
  const teams = teamsResult.error ? [] : teamsResult.data ?? []
  const tournamentIds = new Set(tournaments.map((row) => row.id))
  const registrationsByTournament = new Map<string, number>()
  for (const row of registrations) {
    if (String(row.status).toUpperCase() === 'CANCELLED') continue
    registrationsByTournament.set(row.tournament_id, (registrationsByTournament.get(row.tournament_id) ?? 0) + 1)
  }
  const playedMatches = matches.filter((row) => String(row.status).toUpperCase() === 'PLAYED')
  const pendingMatches = matches.filter((row) => String(row.status).toUpperCase() === 'PENDING')
  const cancelledMatches = matches.filter((row) => String(row.status).toUpperCase() === 'CANCELLED')
  const completedStatuses = new Set(['COMPLETED', 'FINISHED', 'ENDED'])
  const cancelledStatuses = new Set(['CANCELLED', 'ARCHIVED'])
  const occupied = [...registrationsByTournament.values()].reduce((sum, value) => sum + value, 0)
  const capacity = tournaments.reduce((sum, row) => sum + number(row.max_pairs), 0)
  const occupancyRate = capacity > 0 ? Math.round((occupied / capacity) * 1000) / 10 : null

  const categories = new Map<string, number>()
  const genders = new Map<string, number>()
  for (const player of players) {
    const category = player.category ? String(player.category) : 'Sin categoría'
    categories.set(category, (categories.get(category) ?? 0) + 1)
    const gender = player.gender || 'Sin datos'
    genders.set(gender, (genders.get(gender) ?? 0) + 1)
  }
  const teamById = new Map(teams.map((team) => [team.id, team]))
  const activityByUser = new Map<string, { tournaments: Set<string>; matches: number }>()
  for (const team of teams.filter((team) => tournamentIds.has(team.tournament_id))) {
    for (const userId of [team.player1_user_id, team.player2_user_id]) {
      const row = activityByUser.get(userId) ?? { tournaments: new Set<string>(), matches: 0 }
      row.tournaments.add(team.tournament_id)
      activityByUser.set(userId, row)
    }
  }
  for (const match of playedMatches) {
    for (const teamId of [match.team1_id, match.team2_id]) {
      const team = teamById.get(teamId)
      if (!team) continue
      for (const userId of [team.player1_user_id, team.player2_user_id]) {
        const row = activityByUser.get(userId) ?? { tournaments: new Set<string>(), matches: 0 }
        row.matches += 1
        activityByUser.set(userId, row)
      }
    }
  }
  const topPlayers = players.map((player) => {
    const activity = activityByUser.get(player.user_id)
    return { playerId: player.id, name: player.display_name || 'Jugador', category: player.category, tournaments: activity?.tournaments.size ?? 0, matches: activity?.matches ?? 0 }
  }).filter((row) => row.tournaments || row.matches).sort((a, b) => b.matches - a.matches || b.tournaments - a.tournaments).slice(0, 8)

  const dayActivity = Array.from({ length: 7 }, (_, day) => ({ day, count: 0 }))
  const hourActivity = Array.from({ length: 4 }, (_, band) => ({ band, count: 0 }))
  for (const match of matches) {
    const date = new Date(match.scheduled_at ?? match.created_at)
    dayActivity[date.getDay()].count += 1
    hourActivity[Math.min(3, Math.floor(date.getHours() / 6))].count += 1
  }

  let finance: { available: boolean; currencies: AmountByCurrency; receivables: Record<string, { pending: number; overdue: number }>; closuresPending: boolean } | null = null
  if (canFinance) {
    const [transactionsResult, receivablesResult, closuresResult] = await Promise.all([
      supabaseAdmin.from('club_financial_transactions').select('transaction_type,amount,currency_code,status,occurred_at').eq('club_id', clubId).eq('status', 'POSTED').gte('occurred_at', fromIso).lte('occurred_at', toIso),
      supabaseAdmin.from('club_receivables').select('total_amount,paid_amount,waived_amount,currency_code,status,due_date').eq('club_id', clubId).neq('status', 'VOIDED'),
      supabaseAdmin.from('club_financial_closures').select('id,status,period_end').eq('club_id', clubId).order('period_end', { ascending: false }).limit(1),
    ])
    if (transactionsResult.error && missingRelation(transactionsResult.error)) {
      finance = { available: false, currencies: {}, receivables: {}, closuresPending: false }
      warnings.push('Las métricas financieras todavía no están disponibles.')
    } else if (transactionsResult.error || receivablesResult.error) {
      warnings.push('Las métricas financieras no pudieron cargarse.')
    } else {
      const currencies: AmountByCurrency = {}
      for (const row of transactionsResult.data ?? []) {
        const currency = row.currency_code || 'ARS'
        const entry = currencies[currency] ?? { income: 0, expenses: 0, adjustments: 0, net: 0 }
        if (row.transaction_type === 'INCOME') entry.income += number(row.amount)
        else if (row.transaction_type === 'EXPENSE') entry.expenses += number(row.amount)
        else entry.adjustments += number(row.amount)
        entry.net = entry.income - entry.expenses + entry.adjustments
        currencies[currency] = entry
      }
      const receivables: Record<string, { pending: number; overdue: number }> = {}
      for (const row of receivablesResult.data ?? []) {
        const currency = row.currency_code || 'ARS'
        const entry = receivables[currency] ?? { pending: 0, overdue: 0 }
        const balance = number(row.total_amount) - number(row.paid_amount) - number(row.waived_amount)
        entry.pending += balance
        if (row.status === 'OVERDUE' || (row.due_date && row.due_date < now.toISOString().slice(0, 10))) entry.overdue += balance
        receivables[currency] = entry
      }
      finance = { available: true, currencies, receivables, closuresPending: !(closuresResult.data?.[0]?.status === 'CLOSED') }
    }
  }

  let content: Record<string, unknown> | null = null
  if (canContent || canAds) {
    const [newsResult, sponsorsResult, campaignsResult, eventsResult] = await Promise.all([
      supabaseAdmin.from('platform_news').select('id', { count: 'exact', head: true }).eq('club_id', clubId).eq('status', 'PUBLISHED').gte('published_at', fromIso).lte('published_at', toIso),
      supabaseAdmin.from('club_sponsors').select('id,name,status,ends_on').eq('club_id', clubId),
      supabaseAdmin.from('club_ad_campaigns').select('id,title,sponsor_id,status,starts_at,ends_at,sponsor:club_sponsors(name)').eq('club_id', clubId),
      supabaseAdmin.from('club_ad_events').select('campaign_id,event_type,occurred_at').eq('club_id', clubId).gte('occurred_at', fromIso).lte('occurred_at', toIso),
    ])
    if ([sponsorsResult.error, campaignsResult.error, eventsResult.error].some((error) => error && missingRelation(error))) {
      warnings.push('Las métricas de contenido comercial todavía no están disponibles.')
    } else {
      const eventMap = new Map<string, { impressions: number; clicks: number }>()
      for (const event of eventsResult.data ?? []) {
        const entry = eventMap.get(event.campaign_id) ?? { impressions: 0, clicks: 0 }
        if (event.event_type === 'impression') entry.impressions += 1
        else if (event.event_type === 'click') entry.clicks += 1
        eventMap.set(event.campaign_id, entry)
      }
      const today = now.toISOString().slice(0, 10)
      const inThirtyDays = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10)
      const campaignPerformance = (campaignsResult.data ?? []).map((campaign) => {
        const metric = eventMap.get(campaign.id) ?? { impressions: 0, clicks: 0 }
        const sponsor = Array.isArray(campaign.sponsor) ? campaign.sponsor[0] : campaign.sponsor
        return { id: campaign.id, name: campaign.title, sponsor: sponsor?.name ?? 'Institucional', ...metric, ctr: metric.impressions ? Math.round((metric.clicks / metric.impressions) * 1000) / 10 : 0, endsAt: campaign.ends_at }
      }).sort((a, b) => b.ctr - a.ctr || b.clicks - a.clicks).slice(0, 8)
      content = {
        newsPublished: newsResult.error ? null : newsResult.count ?? 0,
        activeSponsors: (sponsorsResult.data ?? []).filter((row) => row.status === 'active' && (!row.ends_on || row.ends_on >= today)).length,
        expiringSponsors: (sponsorsResult.data ?? []).filter((row) => row.status === 'active' && row.ends_on && row.ends_on >= today && row.ends_on <= inThirtyDays).length,
        activeCampaigns: (campaignsResult.data ?? []).filter((row) => ['active', 'scheduled'].includes(row.status) && (!row.ends_at || row.ends_at >= now.toISOString())).length,
        impressions: [...eventMap.values()].reduce((sum, row) => sum + row.impressions, 0),
        clicks: [...eventMap.values()].reduce((sum, row) => sum + row.clicks, 0),
        campaignPerformance,
      }
    }
  }

  const tournamentPerformance = tournaments.map((tournament) => {
    const registrationsCount = registrationsByTournament.get(tournament.id) ?? 0
    const maxPairs = number(tournament.max_pairs)
    return {
      id: tournament.id, name: tournament.name, date: tournament.starts_on ?? tournament.start_date,
      status: tournament.status, registrations: registrationsCount, capacity: maxPairs,
      occupancy: maxPairs ? Math.round((registrationsCount / maxPairs) * 1000) / 10 : null,
      projectedRevenue: number(tournament.price_per_player) * registrationsCount * 2,
    }
  }).sort((a, b) => (b.occupancy ?? -1) - (a.occupancy ?? -1))

  const comparisons = {
    newPlayers: percentage(newPlayersResult.count ?? 0, previousPlayersResult.count ?? 0),
    tournaments: percentage(tournaments.length, previousTournamentsResult.count ?? 0),
    registrations: percentage(registrations.length, previousRegistrationsResult.count ?? 0),
  }
  const insights: Array<{ tone: string; title: string; detail: string; section: string }> = []
  if (comparisons.registrations.value !== null && comparisons.registrations.value >= 10) insights.push({ tone: 'positive', title: 'Crecieron las inscripciones', detail: comparisons.registrations.label, section: 'tournaments' })
  if (comparisons.registrations.value !== null && comparisons.registrations.value <= -15) insights.push({ tone: 'attention', title: 'Bajaron las inscripciones', detail: comparisons.registrations.label, section: 'tournaments' })
  const nearlyFull = tournamentPerformance.filter((row) => row.occupancy !== null && row.occupancy >= 90).length
  if (nearlyFull) insights.push({ tone: 'positive', title: 'Alta ocupación', detail: `${nearlyFull} torneo${nearlyFull === 1 ? '' : 's'} superaron el 90% de ocupación.`, section: 'tournaments' })
  if (finance?.available && Object.values(finance.currencies).some((row) => row.expenses > row.income)) insights.push({ tone: 'critical', title: 'Gastos por encima de ingresos', detail: 'Revisá el detalle por moneda en Finanzas.', section: 'finance' })
  if (content && number(content.expiringSponsors) > 0) insights.push({ tone: 'attention', title: 'Sponsors próximos a vencer', detail: `${content.expiringSponsors} acuerdo(s) vencen dentro de 30 días.`, section: 'content' })

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    period: { from: fromIso, to: toIso, previousFrom: previousFromIso, previousTo: previousToIso, timezone: 'America/Argentina/Buenos_Aires', timezoneSource: 'fallback' },
    permissions: { finance: canFinance, content: canContent || canAds },
    summary: {
      activePlayers: players.length, newPlayers: newPlayersResult.count ?? 0, pendingRequests: pendingResult.count ?? 0,
      tournaments: tournaments.length, completedTournaments: tournaments.filter((row) => completedStatuses.has(String(row.status).toUpperCase())).length,
      cancelledTournaments: tournaments.filter((row) => cancelledStatuses.has(String(row.status).toUpperCase())).length,
      registrations: registrations.length, occupancyRate, playedMatches: playedMatches.length,
      comparisons,
    },
    players: {
      active: players.length, new: newPlayersResult.count ?? 0, pending: pendingResult.count ?? 0,
      competitive: activityByUser.size, inactive: Math.max(0, players.length - activityByUser.size),
      categories: [...categories].map(([label, value]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label)),
      genders: [...genders].map(([label, value]) => ({ label, value })),
      averageTournaments: players.length ? Math.round(([...activityByUser.values()].reduce((sum, row) => sum + row.tournaments.size, 0) / players.length) * 10) / 10 : 0,
      top: topPlayers,
    },
    tournaments: {
      created: tournaments.length, published: tournaments.filter((row) => String(row.status).toUpperCase() === 'PUBLISHED').length,
      completed: tournaments.filter((row) => completedStatuses.has(String(row.status).toUpperCase())).length,
      cancelled: tournaments.filter((row) => cancelledStatuses.has(String(row.status).toUpperCase())).length,
      registrations: registrations.length, cancelledRegistrations: registrations.filter((row) => String(row.status).toUpperCase() === 'CANCELLED').length,
      occupied, capacity, occupancyRate, performance: tournamentPerformance,
    },
    activity: { played: playedMatches.length, pending: pendingMatches.length, cancelled: cancelledMatches.length, byDay: dayActivity, byHourBand: hourActivity },
    finance,
    content,
    insights: insights.slice(0, 5),
    warnings,
  })
}
