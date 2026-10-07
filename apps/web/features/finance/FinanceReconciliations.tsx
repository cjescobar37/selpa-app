'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { financeStatusLabels, formatFinanceMoney, type FinanceStatus } from '@/lib/clubFinanceF1C'
import type { FinancePage } from '@/lib/clubFinanceF1C'
import { financeCaseAmount, reconciliationReason, type FinanceCase, type FinanceCaseDetail, type FinanceRequest } from '@/lib/clubFinanceF1F'
import styles from '@/app/(app)/club/contabilidad/FinancePage.module.css'
const when = (s: string) => new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(s))
export default function FinanceReconciliations({ clubId, request, canManage, onChanged }: {
  clubId: string; request: FinanceRequest; canManage: boolean; onChanged: () => void
}) {
  const [filter, setFilter] = useState('OPEN'); const [page, setPage] = useState<FinancePage<FinanceCase>>({ items: [], nextCursor: null })
  const [detail, setDetail] = useState<FinanceCaseDetail | null>(null)
  const [note, setNote] = useState(''); const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false); const [error, setError] = useState('')
  const generation = useRef(0); const saveLock = useRef(false)
  const attempt = useRef<{ key: string; fingerprint: string } | null>(null)
  const load = useCallback(async (more = false) => {
    const version = more ? generation.current : ++generation.current
    setLoading(true); setError('')
    try {
      const q = new URLSearchParams({ clubId, filter })
      if (more && page.nextCursor) { q.set('beforeAt', page.nextCursor.at); q.set('beforeId', page.nextCursor.id) }
      const data = await request(`/api/clubs/finance/reconciliations?${q}`)
      if (version !== generation.current) return
      const next = data.cases as FinancePage<FinanceCase>
      setPage(old => ({ ...next, items: more ? [...old.items, ...next.items.filter(x => !old.items.some(y => y.id === x.id))] : next.items }))
    } catch (cause) { if (version === generation.current) setError(cause instanceof Error ? cause.message : 'No pudimos cargar los casos.') }
    finally { if (version === generation.current) setLoading(false) }
  }, [clubId, request, filter, page.nextCursor])
  useEffect(() => {
    // Changing a remote filter intentionally resets the case list.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    return () => { generation.current += 1 }
    // Cursor changes must not reload the first page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId, request, filter])
  const detailGeneration = useRef(0)
  async function open(row: FinanceCase) {
    const version = ++detailGeneration.current
    setError(''); setNote('')
    try {
      const data = await request(`/api/clubs/finance/reconciliations?${new URLSearchParams({ clubId, kind: row.kind, id: row.id })}`)
      if (version === detailGeneration.current) setDetail(data as unknown as FinanceCaseDetail)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos abrir el caso.') }
  }
  function close() { detailGeneration.current += 1; setDetail(null); setNote('') }
  useEffect(() => {
    if (!detail) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const dialog = document.querySelector<HTMLElement>('[aria-labelledby="review-title"]')
    dialog?.querySelector<HTMLElement>('button')?.focus()
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saveLock.current) close()
      if (event.key !== 'Tab' || !dialog) return
      const elements = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled),textarea,summary,a[href]'))
      const first = elements[0]; const last = elements.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    window.addEventListener('keydown', escape)
    return () => { window.removeEventListener('keydown', escape); previouslyFocused?.focus() }
  }, [detail])
  async function save(action: 'NOTE' | 'REVIEWED' | 'RESOLVED') {
    if (!detail || !canManage || saveLock.current || note.trim().length < 3) return
    saveLock.current = true; setSaving(true); setError('')
    const row = detail.case
    const fingerprint = `${row.id}|${row.source_version}|${action}|${note.trim()}`
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() }
    try {
      await request('/api/clubs/finance/reconciliations', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clubId, kind: row.kind, id: row.id, sourceVersion: row.source_version,
          action, note: note.trim(), idempotencyKey: attempt.current.key }) })
      await open(row); await load(); onChanged()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos guardar la revisión.') }
    finally { saveLock.current = false; setSaving(false) }
  }
  return <section className={styles.section}>
    <div className={styles.sectionTitle}><div><span>OPERACIÓN</span><h2>Conciliaciones</h2></div></div>
    <p className={styles.caption}>Revisar o resolver no registra cobros ni devuelve dinero.</p>
    <div className={styles.filters} aria-label="Estado de conciliación">
      {[['OPEN', 'Por revisar'], ['RESOLVED', 'Resueltas'], ['ALL', 'Todas']].map(([v, label]) => <button key={v} aria-pressed={filter === v} onClick={() => { close(); setFilter(v) }}>{label}</button>)}
    </div>
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    {loading ? <p role="status" className={styles.caption}>Cargando conciliaciones…</p> : null}
    {!loading && !page.items.length ? <div className={styles.empty}><strong>{filter === 'OPEN' ? 'No hay casos por revisar.' : 'No hay casos en este filtro.'}</strong></div> : null}
    {page.items.map(row => <article className={styles.row} key={`${row.kind}-${row.id}`}>
      <div className={styles.rowBody}><span className={styles.date}>{when(row.occurred_at)} · Mercado Pago</span>
        <strong>{row.debtor_name ?? row.player_name}</strong><span>{row.tournament_name ?? 'Sin torneo identificado'}</span>
        <span>{reconciliationReason(row.reason)}</span><span className={styles.rowMeta}>{row.review_status === 'RESOLVED' ? 'Resuelto' : row.review_status === 'REVIEWED' ? 'Revisado · pendiente de resolución' : 'Por revisar'}</span></div>
      <div className={styles.rowSide}><b>{financeCaseAmount(row)}</b>
        {canManage ? <button className={styles.smallAction} onClick={() => void open(row)}>Ver detalle</button> : null}</div>
    </article>)}
    {page.nextCursor ? <button className={styles.more} disabled={loading} onClick={() => void load(true)}>Ver más</button> : null}
    {detail ? <div className={styles.backdrop} onMouseDown={e => { if (e.target === e.currentTarget && !saving) close() }}>
      <section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="review-title">
        <header><div><span>CONCILIACIÓN</span><h2 id="review-title">Revisión del cobro</h2></div><button disabled={saving} aria-label="Cerrar detalle" onClick={close}><X size={20} /></button></header>
        <p className={styles.sheetContext}>{detail.case.debtor_name ?? detail.case.player_name} · {detail.case.tournament_name ?? 'Sin torneo identificado'}</p>
        <p className={styles.sheetWarning}>{reconciliationReason(detail.case.reason)}</p>
        <div className={styles.compactLine}><span>Importe de referencia</span><b>{financeCaseAmount(detail.case)}</b></div>
        <div className={styles.compactLine}><span>Saldo actual · {financeStatusLabels[detail.case.financial_status as FinanceStatus] ?? 'Sin obligación'}</span><b>{detail.case.balance == null ? '—' : formatFinanceMoney(detail.case.balance)}</b></div>
        <p className={styles.caption}>{when(detail.case.occurred_at)} · Mercado Pago</p>
        <details className={styles.technical}><summary>Referencia técnica</summary><p>{detail.case.reason ?? 'Sin código'} · {detail.case.kind} · {detail.case.id}</p></details>
        <h3 className={styles.historyTitle}>Historial administrativo</h3>
        {detail.history.map(h => <div className={styles.historyEntry} key={h.id}><span>{when(h.created_at)} · {h.actor_name} · {h.action === 'NOTE' ? 'Nota' : h.action === 'REVIEWED' ? 'Revisado' : 'Resuelto'}</span><p>{h.note}</p></div>)}
        {!detail.history.length ? <p className={styles.caption}>Sin revisiones registradas.</p> : null}
        {canManage ? <div className={styles.form}><label>Nota operativa<textarea rows={3} maxLength={2000} minLength={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Qué verificaste y cómo se resolvió" /></label>
          <p className={styles.caption}>Sólo resolución administrativa. La evidencia y el ledger permanecen intactos.</p>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <div className={styles.reviewActions}>
            <button className={styles.cancel} disabled={saving || note.trim().length < 3} onClick={() => void save('NOTE')}>Guardar nota</button>
            <button className={styles.smallAction} disabled={saving || note.trim().length < 3 || detail.case.review_status === 'RESOLVED'} onClick={() => void save('REVIEWED')}>Revisado</button>
            <button className={styles.submit} disabled={saving || note.trim().length < 3 || detail.case.review_status === 'RESOLVED'} onClick={() => void save('RESOLVED')}>{saving ? 'Guardando…' : 'Resolver'}</button>
          </div></div> : null}
      </section>
    </div> : null}
  </section>
}
