'use client'
import { useEffect, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { financeMethodLabels, formatFinanceMoney } from '@/lib/clubFinanceF1C'
import { agingLabels, financePeriodRange, validFinanceRange, type FinancePeriod, type FinanceReport, type FinanceRequest } from '@/lib/clubFinanceF1F'
import styles from '@/app/(app)/club/contabilidad/FinancePage.module.css'

export default function FinanceReports({ clubId, request }: { clubId: string; request: FinanceRequest }) {
  const [period, setPeriod] = useState<FinancePeriod>('month')
  const [range, setRange] = useState(() => financePeriodRange('month'))
  const [report, setReport] = useState<FinanceReport | null>(null)
  const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false); const [kind, setKind] = useState('Obligaciones')
  const [showAll, setShowAll] = useState(false)
  const exportLock = useRef(false)
  const valid = validFinanceRange(range.from, range.to)
  useEffect(() => {
    let current = true
    if (!valid) return
    // Remote loading deliberately clears the previous period's figures.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true); setReport(null); setError('')
    void request(`/api/clubs/finance/reports?${new URLSearchParams({ clubId, ...range })}`)
      .then(data => { if (current) setReport(data.report as FinanceReport) })
      .catch(cause => { if (current) setError(cause instanceof Error ? cause.message : 'No pudimos cargar el reporte.') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [clubId, request, range, valid])

  async function download(format: 'csv' | 'xlsx') {
    if (!valid || exportLock.current) return
    exportLock.current = true; setExporting(true); setError('')
    try {
      const { data } = await supabase.auth.getSession()
      if (!data.session) throw new Error('Tu sesión venció.')
      const response = await fetch(`/api/clubs/finance/exports?${new URLSearchParams({ clubId, ...range, kind, format })}`, {
        headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: 'no-store',
      })
      if (!response.ok) throw new Error((await response.json()).error ?? 'No pudimos exportar.')
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a'); link.href = url; link.download = `selpa-finanzas-${range.from}-${range.to}.${format}`
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos exportar.') }
    finally { setExporting(false); exportLock.current = false }
  }
  return <div className={`${styles.sections} ${styles.reportSections}`}>
    <section className={styles.section}>
      <div className={styles.sectionTitle}><div><span>REPORTES · ARS</span><h2>Tu actividad financiera</h2></div></div>
      <div className={styles.filters} aria-label="Período">
        {([['month', 'Este mes'], ['previous', 'Mes anterior'], ['30days', 'Últimos 30 días'], ['custom', 'Rango']] as const).map(([value, label]) =>
          <button key={value} aria-pressed={period === value} onClick={() => { setPeriod(value); if (value !== 'custom') setRange(financePeriodRange(value)) }}>{label}</button>)}
      </div>
      {period === 'custom' ? <div className={styles.dateRange}>
        <label>Desde<input type="date" value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} /></label>
        <label>Hasta<input type="date" value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} /></label>
      </div> : null}
      <p className={styles.caption}>Cobros: {range.from.split('-').reverse().join('/')} – {range.to.split('-').reverse().join('/')} · hora Argentina.</p>
      <p className={styles.caption}>Neto de pagos del período aún vigentes. Cartera y antigüedad: saldo actual de todos los cargos.</p>
      {!valid ? <p role="alert" className={styles.error}>Revisá las fechas (máximo 367 días).</p> : null}
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      {loading && valid ? <p className={styles.caption} role="status">Calculando reporte…</p> : null}
      {valid && report ? <>
        <div className={styles.reportMetrics}>
          <div><span>Cobrado neto · período</span><strong>{formatFinanceMoney(report.total_received)}</strong></div>
          <div><span>Pendiente · actual</span><strong>{formatFinanceMoney(report.total_pending)}</strong></div>
        </div>
        <p className={styles.caption}>{report.open_obligations} abiertas · {report.partial_obligations} parciales · {report.paid_obligations} pagadas</p>
        <div className={styles.exportBar}>
          <label className={styles.exportSelect}>CSV de<select aria-label="Datos a exportar en CSV" value={kind} onChange={e => setKind(e.target.value)}>
            {['Obligaciones', 'Pagos', 'Movimientos', 'Por torneo'].map(k => <option key={k}>{k}</option>)}</select></label>
          <button className={styles.smallAction} disabled={exporting} onClick={() => void download('csv')}><Download size={15} /> CSV</button>
          <button className={styles.submit} disabled={exporting} onClick={() => void download('xlsx')}><Download size={15} /> XLSX</button>
        </div>
        <p className={styles.caption}>{exporting ? 'Preparando archivo completo…' : 'XLSX: 5 hojas. Obligaciones: cartera completa; pagos y movimientos: período elegido.'}</p>
      </> : null}
    </section>
    {valid && report ? <>
      <section className={styles.section}><div className={styles.sectionTitle}><h2>Por método</h2></div>
        {report.methods.length ? report.methods.map(m => <div className={styles.compactLine} key={m.method}>
          <span>{m.method === 'MERCADO_PAGO' ? 'Mercado Pago' : financeMethodLabels[m.method as keyof typeof financeMethodLabels] ?? 'Otro'}</span><b>{formatFinanceMoney(m.amount)}</b>
        </div>) : <p className={styles.caption}>No hubo cobros netos en este período.</p>}
      </section>
      <section className={styles.section}><div className={styles.sectionTitle}><h2>Antigüedad del saldo</h2></div>
        {Object.entries(agingLabels).map(([bucket, label]) => <div className={styles.compactLine} key={bucket}><span>{label}</span><b>{formatFinanceMoney(report.aging.find(a => a.bucket === bucket)?.amount ?? 0)}</b></div>)}
        <p className={styles.caption}>Sin vencimiento no significa vencido. Las inscripciones F1B no tienen fecha de deuda.</p>
      </section>
      <section className={styles.section}><div className={styles.sectionTitle}><h2>Por torneo</h2></div>
        <div className={styles.tournamentHead}><span>Torneo</span><span>Neto · período</span><span>Saldo actual</span></div>
        {(showAll ? report.tournaments : report.tournaments.slice(0, 20)).map((t, i) => <div className={styles.tournamentRow} key={`${t.tournament_name}-${i}`}>
          <strong>{t.tournament_name}</strong><span>{formatFinanceMoney(t.received)}</span><b>{formatFinanceMoney(t.pending)}</b>
        </div>)}
        {!report.tournaments.length ? <p className={styles.caption}>Todavía no hay cargos vinculados.</p> : null}
        {report.tournaments.length > 20 ? <button className={styles.more} onClick={() => setShowAll(v => !v)}>{showAll ? 'Ver menos' : `Ver ${report.tournaments.length - 20} más`}</button> : null}
      </section>
    </> : null}
  </div>
}
