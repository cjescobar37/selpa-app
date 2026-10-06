import { Building2, CheckCircle2, ReceiptText, RotateCcw, UsersRound } from 'lucide-react'
import { financeMethodLabels, financeStatusLabels, formatFinanceMoney } from '@/lib/clubFinanceF1C'
import {
  groupPlayerObligations, playerBalanceLabel, playerMovementDate, playerMovementLabel,
  type PlayerFinanceData, type PlayerFinanceFilter, type PlayerFinanceTab,
} from '@/lib/playerFinanceF1D'
import styles from './PlayerFinance.module.css'

type Props = {
  data: PlayerFinanceData
  tab: PlayerFinanceTab
  filter: PlayerFinanceFilter
  busy: boolean
  error: string
  onTab: (tab: PlayerFinanceTab) => void
  onFilter: (filter: PlayerFinanceFilter) => void
  onMore: () => void
  onRetry: () => void
}

export default function PlayerFinanceContent({ data, tab, filter, busy, error, onTab, onFilter, onMore, onRetry }: Props) {
  const groups = groupPlayerObligations(data.obligations.items)
  const currentPage = tab === 'obligations' ? data.obligations : data.movements
  return <>
    <section className={styles.summary} aria-label="Resumen de tus pagos">
      <div><span>Pendiente</span><strong>{formatFinanceMoney(data.overview.total_pending)}</strong></div>
      <div><span>Pagado</span><strong>{formatFinanceMoney(data.overview.total_paid)}</strong></div>
    </section>
    <p className={styles.note}><UsersRound size={16} aria-hidden="true" />Los importes de pareja se muestran completos, sin dividirlos.</p>
    <div className={styles.tabs} role="group" aria-label="Ver cargos o movimientos">
      <button type="button" aria-pressed={tab === 'obligations'} onClick={() => onTab('obligations')}>Cargos</button>
      <button type="button" aria-pressed={tab === 'movements'} onClick={() => onTab('movements')}>Movimientos</button>
    </div>
    {tab === 'obligations' ? <div className={styles.filters} role="group" aria-label="Filtrar cargos">
      {([['ALL', 'Todos'], ['PENDING', 'Pendientes'], ['PAID', 'Pagados']] as const).map(([value, label]) =>
        <button key={value} type="button" aria-pressed={filter === value} onClick={() => onFilter(value)}>{label}</button>)}
    </div> : null}
    <div aria-busy={busy} className={styles.list}>
      {error ? <section className={styles.empty} role="alert"><strong>No pudimos cargar esta lista</strong><p>{error}</p><button type="button" onClick={onRetry} disabled={busy}>Reintentar</button></section>
        : busy && currentPage.items.length === 0 ? <p className={styles.feedback} role="status">Cargando…</p>
        : tab === 'obligations' ? groups.length ? groups.map(group => <section key={group.id} className={styles.clubGroup}>
          <h2><Building2 size={15} aria-hidden="true" />{group.name}</h2>
          {group.rows.map(row => <article className={styles.obligation} key={row.id}>
            <div className={styles.cardHeading}>
              <h3>{row.tournament_name || row.concept}</h3>
              <span className={`${styles.badge} ${styles[row.financial_status.toLowerCase()]}`}>{financeStatusLabels[row.financial_status]}</span>
            </div>
            <p className={styles.debtor}>{row.debtor_name}</p>
            {row.financial_status === 'CANCELLED' ? <p className={styles.cancelledCopy}>Cargo cancelado · sin saldo pendiente</p>
              : <div className={styles.balance}>
                <span>{playerBalanceLabel(row)}</span>
                <strong>{formatFinanceMoney(row.financial_status === 'PAID' ? row.allocated_net : row.balance)}</strong>
              </div>}
            <div className={styles.amounts}>
              <span>Total <b>{formatFinanceMoney(row.original_amount)}</b></span>
              {row.financial_status !== 'PAID' ? <span>Pagado <b>{formatFinanceMoney(row.allocated_net)}</b></span> : null}
            </div>
          </article>)}
        </section>) : <section className={styles.empty}>
          <CheckCircle2 size={25} aria-hidden="true" />
          <strong>{filter === 'PAID' ? 'Todavía no hay cargos pagados.' : data.overview.open_obligations === 0 ? 'No tenés pagos pendientes.' : 'No hay cargos en esta lista.'}</strong>
          <p>{filter === 'PAID' ? 'Los pagos que registre el club aparecerán acá.' : 'Las inscripciones con cargo aparecerán acá cuando el club las confirme.'}</p>
        </section>
        : data.movements.items.length ? data.movements.items.map(row => <article className={styles.movement} key={row.id}>
          <div className={styles.movementIcon} aria-hidden="true">{row.status === 'REVERSED' ? <RotateCcw size={17} /> : <ReceiptText size={17} />}</div>
          <div className={styles.movementBody}>
            <time dateTime={row.paid_at}>{playerMovementDate(row.paid_at)}</time>
            <h3>{row.tournament_name || row.concept}</h3>
            <p>{row.club_name} · {financeMethodLabels[row.method]}</p>
            <span className={row.status === 'REVERSED' ? styles.reversedCopy : styles.recordedCopy}>{playerMovementLabel(row.status)}</span>
          </div>
          <strong className={styles.movementAmount}>{formatFinanceMoney(row.amount)}</strong>
        </article>) : <section className={styles.empty}><ReceiptText size={25} aria-hidden="true" /><strong>Todavía no hay movimientos.</strong><p>Los cobros que registre el club aparecerán acá.</p></section>}
    </div>
    {busy && currentPage.items.length > 0 ? <p className={styles.feedback} role="status">Cargando…</p> : null}
    {!error && currentPage.nextCursor ? <button className={styles.more} type="button" disabled={busy} onClick={onMore}>{busy ? 'Cargando…' : 'Ver más'}</button> : null}
  </>
}
