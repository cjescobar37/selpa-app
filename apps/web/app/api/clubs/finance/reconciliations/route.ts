import { NextRequest, NextResponse } from 'next/server'
import { financeAccess, financeFailure, financeUuid } from '@/lib/clubFinanceF1FServer'
import { financePage } from '@/lib/clubFinanceF1C'
import type { FinanceCase } from '@/lib/clubFinanceF1F'
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams; const clubId = q.get('clubId') ?? ''
  const access = await financeAccess(req, clubId, q.has('id'))
  if (access.error || !access.client) return access.error
  if (q.has('id')) {
    if (!financeUuid.test(q.get('id') ?? '') || !['INTENT', 'EVENT'].includes(q.get('kind') ?? ''))
      return NextResponse.json({ error: 'Caso inválido.' }, { status: 400 })
    const result = await access.client.rpc('get_club_finance_case_f1f', { p_club_id: clubId, p_kind: q.get('kind'), p_id: q.get('id') })
    if (result.error) return financeFailure(result.error)
    return NextResponse.json(result.data, { headers: { 'Cache-Control': 'no-store' } })
  }
  const filter = q.get('filter') ?? 'OPEN'; const at = q.get('beforeAt'); const id = q.get('beforeId')
  if (!['OPEN', 'RESOLVED', 'ALL'].includes(filter) || Boolean(at) !== Boolean(id)
    || (id && (!financeUuid.test(id) || !at || Number.isNaN(Date.parse(at))))) return NextResponse.json({ error: 'Filtros inválidos.' }, { status: 400 })
  const result = await access.client.rpc('list_club_finance_f1f', { p_club_id: clubId, p_kind: 'CASES', p_filter: filter,
    p_limit: 21, p_before_at: at, p_before_id: id })
  if (result.error) return financeFailure(result.error)
  return NextResponse.json({ cases: financePage(((result.data ?? []) as Array<{ item: FinanceCase }>).map(r => r.item), 20, 'occurred_at') },
    { headers: { 'Cache-Control': 'no-store' } })
}
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})); const clubId = String(body.clubId ?? '')
  const access = await financeAccess(req, clubId, true)
  if (access.error || !access.client) return access.error
  if (!financeUuid.test(body.id ?? '') || !financeUuid.test(body.idempotencyKey ?? '')
    || !['INTENT', 'EVENT'].includes(body.kind) || !['NOTE', 'REVIEWED', 'RESOLVED'].includes(body.action)
    || typeof body.sourceVersion !== 'string' || body.sourceVersion.length > 100
    || typeof body.note !== 'string' || body.note.trim().length < 3 || body.note.length > 2000)
    return NextResponse.json({ error: 'Ingresá una nota de entre 3 y 2000 caracteres.' }, { status: 400 })
  const result = await access.client.rpc('record_club_finance_review_f1f', {
    p_club_id: clubId, p_kind: body.kind, p_id: body.id, p_source_version: body.sourceVersion,
    p_action: body.action, p_note: body.note, p_idempotency_key: body.idempotencyKey,
  })
  if (result.error) return financeFailure(result.error)
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
