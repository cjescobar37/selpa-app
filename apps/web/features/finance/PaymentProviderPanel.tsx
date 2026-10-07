'use client'
import { useCallback, useEffect, useState } from 'react'
import styles from './PaymentProviderPanel.module.css'
import { formatFinanceMoney } from '@/lib/clubFinanceF1C'

export type ProviderPanelData = { enabled: boolean; status: string; reconciliation_required: number;
  issues?: Array<{ concept: string; amount: number; created_at: string }> }
const statusLabels: Record<string, string> = { NOT_CONNECTED: 'No conectado', CONNECTING: 'Conectando', CONNECTED: 'Conectado',
  RECONNECT_REQUIRED: 'Requiere reconexión', DISCONNECTED: 'No conectado' }

export function ProviderPanelView({ data, canManage, busy, error, note, onConnect, onDisconnect, onRefresh }: {
  data: ProviderPanelData | null; canManage: boolean; busy: boolean; error: string; note: string;
  onConnect: () => void; onDisconnect: () => void; onRefresh: () => void;
}) {
  return <section className={styles.panel}>
    {data && data.reconciliation_required > 0 ? <p className={styles.warning} role="alert">
      <strong>{data.reconciliation_required} {data.reconciliation_required === 1 ? 'pago necesita' : 'pagos necesitan'} revisión</strong>
      <span>Hay cobros online pendientes de conciliación. Revisá con el responsable financiero antes de registrar otro cobro.</span>
    </p> : null}
    {data?.issues?.length ? <details className={styles.issues}><summary>Ver pagos a revisar</summary><ul>
      {data.issues.map((issue, index) => <li key={`${issue.created_at}-${index}`}><span>{issue.concept}</span><b>{formatFinanceMoney(issue.amount)}</b></li>)}
    </ul></details> : null}
    <details>
      <summary><span>Configuración · Mercado Pago</span><b>{data ? !data.enabled ? 'No disponible' : statusLabels[data.status] ?? 'Requiere revisión' : 'Cargando…'}</b></summary>
      <div className={styles.content}>
        <p>Los jugadores pagan en Mercado Pago y el club recibe el dinero en su propia cuenta.</p>
        {data && !data.enabled ? <p className={styles.muted}>Los pagos online todavía no están habilitados.</p> : null}
        {note ? <p role="status">{note}</p> : null}
        {error ? <p role="alert">{error}</p> : null}
        {canManage ? data?.enabled ? <div className={styles.actions}>
          <button type="button" disabled={busy || !data?.enabled} onClick={onConnect}>
            {busy ? 'Procesando…' : ['CONNECTED', 'RECONNECT_REQUIRED'].includes(data?.status ?? '') ? 'Reconectar Mercado Pago' : 'Conectar Mercado Pago'}
          </button>
          {data?.enabled && ['CONNECTED', 'RECONNECT_REQUIRED'].includes(data.status) ? <button type="button" className={styles.secondary} disabled={busy} onClick={onDisconnect}>Desconectar</button> : null}
        </div> : null : <p className={styles.muted}>La conexión la gestiona un administrador con permiso de Finanzas.</p>}
        {error ? <button type="button" className={styles.refresh} onClick={onRefresh} disabled={busy}>Reintentar</button> : null}
      </div>
    </details>
  </section>
}

export default function PaymentProviderPanel({ clubId, canManage, request }: {
  clubId: string; canManage: boolean; request: (url: string, init?: RequestInit) => Promise<ProviderPanelData & { authorizationUrl?: string }>
}) {
  const [data, setData] = useState<ProviderPanelData | null>(null), [busy, setBusy] = useState(false)
  const [error, setError] = useState(''), [note, setNote] = useState('')
  const refresh = useCallback(async () => {
    try { setData(await request(`/api/clubs/finance/provider?clubId=${encodeURIComponent(clubId)}`)); setError('') }
    catch { setError('No pudimos cargar la conexión de pagos.') }
  }, [clubId, request])
  useEffect(() => {
    let cancelled = false
    const status = new URLSearchParams(window.location.search).get('provider')
    const sourceClub = new URLSearchParams(window.location.search).get('providerClub')
    request(`/api/clubs/finance/provider?clubId=${encodeURIComponent(clubId)}`)
      .then(value => { if (!cancelled) {
        setData(value)
        if (status) { setNote(sourceClub && sourceClub !== clubId ? 'La conexión se guardó en el club desde el que la iniciaste. Cambiá a ese club para verla.' : value.status === 'CONNECTED' ? 'Mercado Pago conectado.' : 'No pudimos conectar la cuenta. Volvé a intentarlo.'); window.history.replaceState(null, '', window.location.pathname) }
      } }).catch(() => { if (!cancelled) setError('No pudimos cargar la conexión de pagos.') })
    return () => { cancelled = true }
  }, [clubId, request])
  async function connect() {
    if (busy || !data?.enabled) return
    setBusy(true); setError('')
    try {
      const result = await request('/api/payments/mercado-pago/oauth/start', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clubId }) })
      const url = new URL(result.authorizationUrl ?? '')
      if (url.protocol !== 'https:' || url.hostname !== 'auth.mercadopago.com') throw new Error('PAYMENT_OAUTH_URL_INVALID')
      window.location.assign(url.toString())
    } catch { setError('No pudimos iniciar la conexión. Probá nuevamente.') }
    finally { setBusy(false) }
  }
  async function disconnect() {
    if (busy) return
    setBusy(true); setError('')
    try { await request(`/api/clubs/finance/provider?clubId=${encodeURIComponent(clubId)}`, { method: 'DELETE' }); await refresh(); setNote('La cuenta quedó desconectada para nuevos pagos.') }
    catch { setError('No pudimos desconectar la cuenta.') }
    finally { setBusy(false) }
  }
  return <ProviderPanelView data={data} canManage={canManage} busy={busy} error={error} note={note}
    onConnect={() => void connect()} onDisconnect={() => void disconnect()} onRefresh={() => void refresh()} />
}
