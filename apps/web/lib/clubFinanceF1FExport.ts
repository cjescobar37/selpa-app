import writeXlsxFile, { type SheetData, type Cell } from 'write-excel-file/node'
import { financeMethodLabels, financeStatusLabels } from './clubFinanceF1C'
import type { FinanceReport } from './clubFinanceF1F'

type ExportRow = Record<string, unknown>
type ExportValue = string | number | Date | null
type ExportTable = { name: string; headers: string[]; rows: ExportValue[][] }
const money = (v: unknown) => Number(v ?? 0)
const text = (v: unknown) => v == null ? '' : String(v)
// Excel dates represent local wall time, not an implicit UTC-to-local shift.
function date(value: unknown): Date | null {
  if (!value) return null
  const raw = text(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(`${raw}T00:00:00Z`)
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(new Date(raw)).replace(' ', 'T')
  return new Date(`${parts}Z`)
}
function method(row: ExportRow) {
  return row.provider === 'MERCADO_PAGO' ? 'Mercado Pago' : financeMethodLabels[row.method as keyof typeof financeMethodLabels] ?? text(row.method)
}
export function financeExportTables(report: FinanceReport, obligations: ExportRow[], payments: ExportRow[], movements: ExportRow[]): ExportTable[] {
  return [
    { name: 'Resumen', headers: ['Indicador', 'Valor', 'Moneda / alcance'], rows: [
      ['Desde', date(report.from), 'Fecha del cobro'], ['Hasta', date(report.to), 'Inclusive · Argentina'],
      ['Generado', date(report.generated_at), 'Cartera actual; no reconstrucción histórica'],
      ['Cobrado neto', money(report.total_received), 'ARS · pagos del período que siguen POSTED'],
      ['Pendiente', money(report.total_pending), 'ARS · cartera actual completa'],
      ['Abiertas', money(report.open_obligations), 'Saldo neto > 0'], ['Pagadas', money(report.paid_obligations), 'Cartera actual'],
      ['Parciales', money(report.partial_obligations), 'Cartera actual'], ['Requiere revisión', money(report.reconciliation_open), 'Casos abiertos'],
    ] },
    { name: 'Obligaciones', headers: ['Creación', 'Jugador / pareja', 'Torneo', 'Concepto', 'Estado', 'Importe', 'Cobrado neto', 'Pendiente', 'Vencimiento', 'Moneda'],
      rows: obligations.map(o => [date(o.created_at), text(o.debtor_name), text(o.tournament_name), text(o.concept),
        financeStatusLabels[o.financial_status as keyof typeof financeStatusLabels] ?? text(o.financial_status),
        money(o.original_amount), money(o.allocated_net), money(o.balance), date(o.due_date), 'ARS']) },
    { name: 'Pagos', headers: ['Fecha del cobro', 'Jugador / pareja', 'Torneo', 'Concepto', 'Método', 'Estado', 'Importe', 'Referencia', 'Moneda'],
      rows: payments.map(p => [date(p.paid_at), text(p.debtor_name), text(p.tournament_name), text(p.concept), method(p),
        p.status === 'REVERSED' ? 'Revertido' : 'Cobrado', money(p.amount), text(p.reference), 'ARS']) },
    { name: 'Movimientos', headers: ['Fecha', 'Jugador / pareja', 'Torneo', 'Concepto', 'Método', 'Movimiento', 'Importe neto', 'Referencia', 'Moneda'],
      rows: movements.map(m => [date(m.occurred_at), text(m.debtor_name), text(m.tournament_name), text(m.concept), method(m),
        m.event_type === 'PAYMENT_REVERSED' ? 'Reversión' : 'Cobro', money(m.amount), text(m.reference), 'ARS']) },
    { name: 'Por torneo', headers: ['Torneo', 'Cobrado neto del período', 'Pendiente actual', 'Moneda'],
      rows: report.tournaments.map(t => [t.tournament_name, money(t.received), money(t.pending), 'ARS']) },
  ]
}
export function financeCsv(table: ExportTable) {
  function cell(v: ExportValue) {
    if (typeof v === 'number') return String(v).replace('.', ',')
    if (v instanceof Date) return `${v.getUTCDate().toString().padStart(2, '0')}/${(v.getUTCMonth() + 1).toString().padStart(2, '0')}/${v.getUTCFullYear()} ${v.toISOString().slice(11, 16)}`
    // Spreadsheet formula injection protection applies only to text, not negative money.
    const raw = v ?? ''; const safe = /^[\s]*[=+@-]|^[\t\r\n]/.test(raw) ? `'${raw}` : raw
    return `"${safe.replaceAll('"', '""')}"`
  }
  return '\uFEFF' + [table.headers, ...table.rows].map(row => row.map(cell).join(';')).join('\r\n') + '\r\n'
}
export async function financeXlsx(tables: ExportTable[]) {
  return writeXlsxFile(tables.map(table => ({
    sheet: table.name,
    columns: table.headers.map(h => ({ width: /Jugador|Concepto|Torneo|alcance/.test(h) ? 36 : /Fecha|Creación|Vencimiento|Generado/.test(h) ? 21 : 23 })),
    stickyRowsCount: 1,
    data: [table.headers.map(value => ({ value, fontWeight: 'bold', backgroundColor: '#071E3D', textColor: '#FFFFFF', wrap: true } as Cell)),
      ...table.rows.map((row, rowIndex) => row.map((value, columnIndex) => value == null ? null : value instanceof Date
        ? { value, type: Date, format: table.headers[columnIndex] === 'Vencimiento' || (table.name === 'Resumen' && rowIndex < 2) ? 'dd/mm/yyyy' : 'dd/mm/yyyy hh:mm' } : typeof value === 'number'
          ? { value, type: Number, format: table.name === 'Resumen' && rowIndex > 4 ? '0' : '"ARS" #,##0.00;[Red]("ARS" #,##0.00)' }
          : { value, type: String, wrap: true }))] as SheetData,
  }))).toBuffer()
}
