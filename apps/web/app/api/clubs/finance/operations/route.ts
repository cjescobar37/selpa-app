import { NextRequest, NextResponse } from 'next/server'
import { financeAccess, financeFailure, financeUuid } from '@/lib/clubFinanceF1FServer'
import { financePage } from '@/lib/clubFinanceF1C'
import { GET as coreRead } from '../core/route'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams; const clubId = q.get('clubId') ?? ''
  const access = await financeAccess(req, clubId)
  if (access.error || !access.client) return access.error
  const view = q.get('view') ?? 'dashboard'
  const filter = q.get('filter') ?? 'ALL'; const method = q.get('method') ?? 'ALL'
  const search = q.get('search')?.trim() ?? ''; const at = q.get('beforeAt'); const id = q.get('beforeId')
  if (!['dashboard', 'obligations', 'movements'].includes(view)
    || !['ALL', 'PENDING', 'PARTIAL', 'PAID', 'CANCELLED'].includes(filter)
    || !['ALL', 'CASH', 'BANK_TRANSFER', 'MERCADO_PAGO', 'REVERSED'].includes(method)
    || search.length > 120 || Boolean(at) !== Boolean(id) || (id && (!financeUuid.test(id) || !at || Number.isNaN(Date.parse(at))))) {
    return NextResponse.json({ error: 'Filtros inválidos.' }, { status: 400 })
  }
  const read = (kind: 'OBLIGATIONS' | 'MOVEMENTS') => access.client!.rpc('list_club_finance_f1f', {
    p_club_id: clubId, p_kind: kind === 'MOVEMENTS' ? 'PAYMENTS' : kind, p_filter: kind === 'OBLIGATIONS' ? filter : method,
    p_search: kind === 'OBLIGATIONS' ? search : '', p_limit: 21,
    p_before_at: view === 'dashboard' ? null : at, p_before_id: view === 'dashboard' ? null : id,
  })
  const page = (data: unknown, dateKey: string) => financePage(
    ((data ?? []) as Array<{ item: { id: string; [key: string]: unknown } }>).map(r => r.item), 20, dateKey)
  async function failureOrLegacy(error: { code?: string } | null, operation: string) {
    // A Preview may share a database where F1F is not installed yet. Keep F1C usable.
    if (error?.code !== 'PGRST202') return financeFailure(error, operation)
    const url = new URL(req.url)
    if (filter === 'CANCELLED') url.searchParams.set('filter', 'ALL')
    const fallback = await coreRead(new NextRequest(url, { headers: req.headers }))
    if (!fallback.ok) return fallback
    return NextResponse.json({ ...(await fallback.json()), f1fAvailable: false }, { headers: { 'Cache-Control': 'no-store' } })
  }
  if (view !== 'dashboard') {
    const result = await read(view === 'obligations' ? 'OBLIGATIONS' : 'MOVEMENTS')
    if (result.error) return failureOrLegacy(result.error, `list_club_finance_f1f:${view === 'obligations' ? 'OBLIGATIONS' : 'PAYMENTS'}`)
    return NextResponse.json({ [view]: page(result.data, view === 'obligations' ? 'created_at' : 'paid_at') }, { headers: { 'Cache-Control': 'no-store' } })
  }
  const [overview, obligations, movements, cases] = await Promise.all([
    access.client.rpc('get_club_finance_overview_f1c', { p_club_id: clubId }), read('OBLIGATIONS'), read('MOVEMENTS'),
    access.client.rpc('list_club_finance_f1f', { p_club_id: clubId, p_kind: 'CASES', p_filter: 'OPEN', p_limit: 1 }),
  ])
  const results = [
    ['get_club_finance_overview_f1c', overview], ['list_club_finance_f1f:OBLIGATIONS', obligations],
    ['list_club_finance_f1f:PAYMENTS', movements], ['list_club_finance_f1f:CASES', cases],
  ] as const
  const failed = results.find(([, result]) => result.error)
  if (failed) return failureOrLegacy(failed[1].error, failed[0])
  return NextResponse.json({ f1fAvailable: true, canManage: access.canManage, overview: overview.data,
    requiresReview: Boolean(cases.data?.length), obligations: page(obligations.data, 'created_at'), movements: page(movements.data, 'paid_at') },
  { headers: { 'Cache-Control': 'no-store' } })
}
