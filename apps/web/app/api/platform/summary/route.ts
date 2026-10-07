import { NextRequest, NextResponse } from 'next/server'
import { assertPlatformAdmin } from '@/lib/platformApiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

/** Operational counts only. Financial totals live exclusively in the F2 read model. */
export async function GET(req: NextRequest) {
  const auth = await assertPlatformAdmin(req)
  if (auth.error) return auth.error
  try {
    const count = (table: string, column = 'id', status?: string) => {
      const query = supabaseAdmin.from(table).select(column, { count: 'exact', head: true })
      return status ? query.eq('status', status) : query
    }
    const results = await Promise.all([
      count('clubs'), count('clubs','id','ACTIVE'), count('clubs','id','PENDING_APPROVAL'),
      count('clubs','id','REJECTED'), count('clubs','id','SUSPENDED'),
      count('profiles','user_id'), count('club_memberships'), count('club_memberships','id','PENDING'), count('club_memberships','id','APPROVED'),
      count('platform_news'), count('platform_news','id','PUBLISHED'), count('platform_ad_campaigns','id','ACTIVE'), count('platform_sponsors','id','ACTIVE'),
      supabaseAdmin.from('clubs').select('id,name,city,status,created_at').order('created_at',{ascending:false}).limit(6),
    ])
    const failure = results.find(result => result.error)?.error
    if (failure) {
      console.error('[platform:summary]', { operation:'OVERVIEW', code: /^[A-Z0-9_]+$/.test(failure.code ?? '') ? failure.code : 'READ_FAILURE' })
      return NextResponse.json({ error:'No pudimos cargar el resumen de plataforma. Reintentá.' },{status:500})
    }
    const n = (index: number) => results[index].count ?? 0
    return NextResponse.json({
      clubs: { total:n(0), active:n(1), pending:n(2), rejected:n(3), suspended:n(4), recent:results[13].data ?? [] },
      users: { total_profiles:n(5), memberships_total:n(6), memberships_pending:n(7), memberships_approved:n(8) },
      content: { news_total:n(9), news_published:n(10), ads_active:n(11), sponsors_active:n(12) },
    },{headers:{'Cache-Control':'private, no-store'}})
  } catch {
    console.error('[platform:summary]', { operation:'OVERVIEW', code:'REQUEST_FAILURE' })
    return NextResponse.json({ error:'No pudimos cargar el resumen de plataforma. Reintentá.' },{status:500})
  }
}
