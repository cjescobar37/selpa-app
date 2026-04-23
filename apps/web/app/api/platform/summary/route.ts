import { NextRequest, NextResponse } from 'next/server'
import { assertPlatformAdmin } from '@/lib/platformApiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

function isMissingRelation(error?: { message?: string } | null) {
  const msg = String(error?.message || '').toLowerCase()
  return msg.includes('could not find the table') || (msg.includes('relation') && msg.includes('does not exist'))
}

function sumAmount(rows: Array<Record<string, any>>, key: string) {
  return rows.reduce((acc, row) => acc + Number(row?.[key] ?? 0), 0)
}

export async function GET(req: NextRequest) {
  const auth = await assertPlatformAdmin(req)
  if (auth.error) return auth.error

  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const [
      clubsRes,
      recentClubsRes,
      membershipsRes,
      profilesRes,
      newsRes,
      adsRes,
      sponsorsRes,
      paymentsRes,
      commissionsRes,
      settlementsRes,
    ] = await Promise.all([
      supabaseAdmin.from('clubs').select('id,status'),
      supabaseAdmin.from('clubs').select('id,name,city,status,created_at').order('created_at', { ascending: false }).limit(6),
      supabaseAdmin.from('club_memberships').select('id,status,user_id'),
      supabaseAdmin.from('profiles').select('user_id'),
      supabaseAdmin.from('platform_news').select('id,status'),
      supabaseAdmin.from('platform_ad_campaigns').select('id,status'),
      supabaseAdmin.from('platform_sponsors').select('id,status'),
      supabaseAdmin.from('payments').select('id,status,amount,currency,created_at,paid_at,club_id,user_id,tournament_id').gte('created_at', since).order('created_at', { ascending: false }).limit(8),
      supabaseAdmin.from('commissions').select('id,status,commission_amount,currency,created_at').gte('created_at', since),
      supabaseAdmin.from('settlements').select('id,status,net_amount,currency,created_at'),
    ])

    const hardError = [
      clubsRes.error,
      recentClubsRes.error,
      membershipsRes.error,
      profilesRes.error,
      newsRes.error,
      adsRes.error,
      sponsorsRes.error,
    ].find(Boolean)

    if (hardError) return NextResponse.json({ error: hardError.message }, { status: 500 })

    const financeAvailable = !paymentsRes.error && !commissionsRes.error && !settlementsRes.error
    if (!financeAvailable) {
      const financeError = [paymentsRes.error, commissionsRes.error, settlementsRes.error].find(Boolean)
      if (financeError && !isMissingRelation(financeError)) {
        return NextResponse.json({ error: financeError.message }, { status: 500 })
      }
    }

    const clubs = clubsRes.data ?? []
    const recentClubs = recentClubsRes.data ?? []
    const memberships = membershipsRes.data ?? []
    const profiles = profilesRes.data ?? []
    const news = newsRes.data ?? []
    const ads = adsRes.data ?? []
    const sponsors = sponsorsRes.data ?? []
    const payments = financeAvailable ? paymentsRes.data ?? [] : []
    const commissions = financeAvailable ? commissionsRes.data ?? [] : []
    const settlements = financeAvailable ? settlementsRes.data ?? [] : []

    return NextResponse.json({
      clubs: {
        total: clubs.length,
        active: clubs.filter((club: any) => club.status === 'ACTIVE').length,
        pending: clubs.filter((club: any) => club.status === 'PENDING_APPROVAL').length,
        rejected: clubs.filter((club: any) => club.status === 'REJECTED').length,
        suspended: clubs.filter((club: any) => club.status === 'SUSPENDED').length,
        recent: recentClubs,
      },
      users: {
        total_profiles: profiles.length,
        memberships_total: memberships.length,
        memberships_pending: memberships.filter((row: any) => row.status === 'PENDING').length,
        memberships_approved: memberships.filter((row: any) => row.status === 'APPROVED').length,
      },
      content: {
        news_total: news.length,
        news_published: news.filter((row: any) => row.status === 'PUBLISHED').length,
        ads_active: ads.filter((row: any) => row.status === 'ACTIVE').length,
        sponsors_active: sponsors.filter((row: any) => row.status === 'ACTIVE').length,
      },
      finance: {
        available: financeAvailable,
        recent_payments: payments,
        payments_paid_count: payments.filter((row: any) => row.status === 'paid').length,
        payments_total_collected: sumAmount(payments.filter((row: any) => row.status === 'paid'), 'amount'),
        commissions_total: sumAmount(commissions, 'commission_amount'),
        settlements_pending: settlements.filter((row: any) => row.status === 'pending').length,
        settlements_approved: settlements.filter((row: any) => row.status === 'approved').length,
        settlements_paid: settlements.filter((row: any) => row.status === 'paid').length,
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'No pude cargar el resumen de plataforma.' }, { status: 500 })
  }
}
