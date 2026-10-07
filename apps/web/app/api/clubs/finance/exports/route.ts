import { NextRequest, NextResponse } from 'next/server'
import { financeAccess, financeFailure, financeRangeParams } from '@/lib/clubFinanceF1FServer'
import { financeCsv, financeExportTables, financeXlsx } from '@/lib/clubFinanceF1FExport'
import type { FinanceReport } from '@/lib/clubFinanceF1F'

export const runtime = 'nodejs'
export const maxDuration = 60
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams; const clubId = q.get('clubId') ?? ''
  const access = await financeAccess(req, clubId)
  if (access.error || !access.client) return access.error
  const range = financeRangeParams(q); const format = q.get('format') ?? 'csv'; const kind = q.get('kind') ?? 'Obligaciones'
  if (!range || !['csv', 'xlsx'].includes(format) || !['Obligaciones', 'Pagos', 'Movimientos', 'Por torneo'].includes(kind))
    return NextResponse.json({ error: 'Exportación inválida.' }, { status: 400 })
  const report = await access.client.rpc('get_club_finance_report_f1f', { p_club_id: clubId, ...range })
  if (report.error) return financeFailure(report.error)
  try {
    const load = async (source: string) => {
      const rows: Record<string, unknown>[] = []; let at: string | null = null; let id: string | null = null
      for (;;) {
        if (req.signal.aborted) throw new Error('ABORTED')
        const result = await access.client!.rpc('list_club_finance_f1f', {
          p_club_id: clubId, p_kind: source, p_limit: 500, p_before_at: at, p_before_id: id,
          // Obligaciones is current complete portfolio, as in report.pending/aging.
          ...(source === 'OBLIGATIONS' ? {} : range),
        })
        if (result.error) throw new Error('EXPORT_READ_FAILED')
        const page: Record<string, unknown>[] = ((result.data ?? []) as Array<{ item: Record<string, unknown> }>).map(r => r.item)
        rows.push(...page)
        // Fail visibly, never return a silently truncated export or exhaust server memory.
        if (rows.length > 20000) throw new Error('EXPORT_TOO_LARGE')
        if (page.length < 500) break
        const last: Record<string, unknown> = page.at(-1)!
        const nextAt: string = String(last[source === 'OBLIGATIONS' ? 'created_at' : source === 'MOVEMENTS' ? 'occurred_at' : 'paid_at'])
        const nextId: string = String(last.id)
        if (nextAt === at && nextId === id) throw new Error('EXPORT_CURSOR_INVALID')
        at = nextAt; id = nextId
      }
      return rows
    }
    const [obligations, payments, movements] = await Promise.all([
      format === 'xlsx' || kind === 'Obligaciones' ? load('OBLIGATIONS') : [],
      format === 'xlsx' || kind === 'Pagos' ? load('PAYMENTS') : [],
      format === 'xlsx' || kind === 'Movimientos' ? load('MOVEMENTS') : [],
    ])
    const tables = financeExportTables(report.data as FinanceReport, obligations, payments, movements)
    const filename = `selpa-finanzas-${range.p_from}-${range.p_to}.${format}`
    const headers = { 'Cache-Control': 'private, no-store', 'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv; charset=utf-8',
      'X-Content-Type-Options': 'nosniff' }
    if (format === 'csv') return new Response(financeCsv(tables.find(t => t.name === kind)!), { headers })
    return new Response(new Uint8Array(await financeXlsx(tables)), { headers })
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error && cause.message === 'EXPORT_TOO_LARGE'
      ? 'La exportación supera 20.000 filas. Para pagos y movimientos, elegí un rango menor; para cartera, solicitá un export masivo.'
      : 'No pudimos generar el archivo. Intentá nuevamente.' }, { status: 422 })
  }
}
