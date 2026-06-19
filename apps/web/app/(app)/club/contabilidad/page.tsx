'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { useSession } from '@/components/session/SessionProvider'
import { getClubTheme } from '@/lib/clubThemes'

type PaymentRow = {
  id: string
  tournament_id: string
  team_id: string | null
  registration_id: string | null
  user_id: string
  amount: number | string | null
  currency: string | null
  method: string | null
  status: string | null
  requested_at: string | null
  paid_at: string | null
  approved_at: string | null
  created_at: string | null
}

type TournamentRow = {
  id: string
  name: string
}

type TeamRow = {
  id: string
  player1_user_id: string | null
  player2_user_id: string | null
}

type ProfileRow = {
  user_id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  display_name: string | null
}

const methodLabels: Record<string, string> = {
  MERCADO_PAGO: 'Mercado Pago',
  BANK_TRANSFER: 'Transferencia',
  CASH_ON_SITE_REQUEST: 'Pago en club',
}

const statusLabels: Record<string, string> = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobado',
  PAID: 'Pagado',
  REJECTED: 'Rechazado',
  CANCELLED: 'Cancelado',
}

function isMissingRelation(error?: { code?: string; message?: string } | null) {
  const message = String(error?.message ?? '').toLowerCase()
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('could not find the table')
  )
}

function normalizeStatus(value?: string | null) {
  return String(value ?? '').trim().toUpperCase()
}

function isPending(status: string) {
  return status === 'PENDING'
}

function isApproved(status: string) {
  return status === 'APPROVED' || status === 'PAID'
}

function isRejected(status: string) {
  return status === 'REJECTED'
}

function isNegativeStatus(status: string) {
  return status === 'REJECTED' || status === 'CANCELLED'
}

function toAmount(value: PaymentRow['amount']) {
  const amount = typeof value === 'number' ? value : Number(value ?? 0)
  return Number.isFinite(amount) ? amount : 0
}

function formatMoney(value: PaymentRow['amount'], currency = 'ARS') {
  const amount = toAmount(value)
  if (amount <= 0) return 'Sin importe'
  return new Intl.NumberFormat('es-AR', {
    currency,
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(amount)
}

function formatDate(value?: string | null) {
  if (!value) return 'Sin fecha'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date).replace('.', '')
}

function profileName(profile?: ProfileRow | null) {
  return (
    profile?.display_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() ||
    profile?.email ||
    'Jugador'
  )
}

function buildTeamName(payment: PaymentRow, teams: Map<string, TeamRow>, profiles: Map<string, ProfileRow>) {
  const team = payment.team_id ? teams.get(payment.team_id) : null
  const playerIds = team ? [team.player1_user_id, team.player2_user_id].filter((id): id is string => Boolean(id)) : []
  if (!playerIds.length) return profileName(profiles.get(payment.user_id))
  return playerIds.map((userId) => profileName(profiles.get(userId))).join(' / ')
}

export default function ClubContabilidadPage() {
  const { activeClub } = useSession()
  const [themeKey, setThemeKey] = useState<string | null>(null)
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [tournaments, setTournaments] = useState<Map<string, TournamentRow>>(new Map())
  const [teams, setTeams] = useState<Map<string, TeamRow>>(new Map())
  const [profiles, setProfiles] = useState<Map<string, ProfileRow>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const theme = useMemo(() => getClubTheme(themeKey), [themeKey])
  const themeStyle = useMemo(
    () => ({
      '--club-finance-accent': theme.vars.accent,
      '--club-finance-accent-2': theme.vars.accent2,
      '--club-finance-soft': theme.vars.soft,
      '--club-finance-glow': theme.vars.glow,
    }) as CSSProperties,
    [theme],
  )

  useEffect(() => {
    let alive = true

    async function loadFinance() {
      if (!activeClub?.id) {
        setPayments([])
        setLoading(false)
        return
      }

      setLoading(true)
      setError('')

      try {
        const [clubResult, paymentsResult] = await Promise.all([
          supabase.from('clubs').select('theme_key').eq('id', activeClub.id).maybeSingle(),
          supabase
            .from('tournament_payments')
            .select('id,tournament_id,team_id,registration_id,user_id,amount,currency,method,status,requested_at,paid_at,approved_at,created_at')
            .eq('club_id', activeClub.id)
            .order('created_at', { ascending: false })
            .limit(60),
        ])

        if (!alive) return
        setThemeKey((clubResult.data?.theme_key as string | null) ?? null)

        if (paymentsResult.error) {
          if (isMissingRelation(paymentsResult.error)) {
            setPayments([])
            setError('Falta aplicar la migración tournament_payments para mostrar finanzas reales.')
            return
          }
          throw paymentsResult.error
        }

        const paymentRows = (paymentsResult.data ?? []) as PaymentRow[]
        setPayments(paymentRows)

        const tournamentIds = Array.from(new Set(paymentRows.map((row) => row.tournament_id).filter(Boolean)))
        const teamIds = Array.from(new Set(paymentRows.map((row) => row.team_id).filter((id): id is string => Boolean(id))))
        const userIds = new Set(paymentRows.map((row) => row.user_id).filter(Boolean))

        if (teamIds.length) {
          const { data: teamRows, error: teamsError } = await supabase
            .from('tournament_teams')
            .select('id,player1_user_id,player2_user_id')
            .in('id', teamIds)
          if (teamsError) throw teamsError
          const nextTeams = new Map(((teamRows ?? []) as TeamRow[]).map((row) => {
            if (row.player1_user_id) userIds.add(row.player1_user_id)
            if (row.player2_user_id) userIds.add(row.player2_user_id)
            return [row.id, row] as const
          }))
          if (alive) setTeams(nextTeams)
        } else if (alive) {
          setTeams(new Map())
        }

        if (tournamentIds.length) {
          const { data: tournamentRows, error: tournamentsError } = await supabase
            .from('tournaments')
            .select('id,name')
            .in('id', tournamentIds)
          if (tournamentsError) throw tournamentsError
          if (alive) setTournaments(new Map(((tournamentRows ?? []) as TournamentRow[]).map((row) => [row.id, row])))
        } else if (alive) {
          setTournaments(new Map())
        }

        const profileIds = Array.from(userIds)
        if (profileIds.length) {
          const { data: profileRows, error: profilesError } = await supabase
            .from('profiles')
            .select('user_id,email,first_name,last_name,display_name')
            .in('user_id', profileIds)
          if (profilesError) throw profilesError
          if (alive) setProfiles(new Map(((profileRows ?? []) as ProfileRow[]).map((row) => [row.user_id, row])))
        } else if (alive) {
          setProfiles(new Map())
        }
      } catch (loadError) {
        if (!alive) return
        setError(loadError instanceof Error ? loadError.message : 'No pude cargar los pagos del club.')
      } finally {
        if (alive) setLoading(false)
      }
    }

    loadFinance()
    return () => {
      alive = false
    }
  }, [activeClub?.id])

  const summary = useMemo(() => {
    return payments.reduce(
      (acc, payment) => {
        const status = normalizeStatus(payment.status)
        if (isPending(status)) acc.pending += 1
        if (isApproved(status)) {
          acc.approved += 1
          acc.approvedTotal += toAmount(payment.amount)
        }
        if (isRejected(status)) acc.rejected += 1
        return acc
      },
      { approved: 0, approvedTotal: 0, pending: 0, rejected: 0 },
    )
  }, [payments])

  return (
    <div className="club-shell">
      <div className="club-panel club-financePage" style={themeStyle}>
        <header className="club-financeHero">
          <div>
            <span className="club-financeKicker">Club Admin</span>
            <h1 className="club-title">Finanzas</h1>
            <p className="club-sub">Pagos de torneos registrados para {activeClub?.name ?? 'tu club'}.</p>
          </div>
          <Link className="club-financeSecondary" href="/club/inscripciones">
            Ver inscripciones
          </Link>
        </header>

        {error ? <div className="club-financeAlert">{error}</div> : null}

        <section className="club-financeStats" aria-label="Resumen de pagos">
          <article>
            <span>Pagos pendientes</span>
            <strong>{summary.pending}</strong>
          </article>
          <article>
            <span>Pagos aprobados</span>
            <strong>{summary.approved}</strong>
          </article>
          <article>
            <span>Pagos rechazados</span>
            <strong>{summary.rejected}</strong>
          </article>
          <article>
            <span>Total aprobado</span>
            <strong>{summary.approvedTotal > 0 ? formatMoney(summary.approvedTotal) : '—'}</strong>
          </article>
        </section>

        <section className="club-financeCard">
          <div className="club-financeCardHead">
            <div>
              <span className="club-financeKicker">Últimos movimientos</span>
              <h2>Últimos pagos</h2>
            </div>
            <small>{loading ? 'Cargando...' : `${payments.length} registro${payments.length === 1 ? '' : 's'}`}</small>
          </div>

          {loading ? (
            <div className="club-financeEmpty">Cargando pagos...</div>
          ) : payments.length ? (
            <div className="club-financeList" role="list">
              {payments.map((payment) => {
                const status = normalizeStatus(payment.status)
                const tournament = tournaments.get(payment.tournament_id)
                const statusClass = isApproved(status) ? 'is-approved' : isNegativeStatus(status) ? 'is-rejected' : 'is-pending'
                return (
                  <article className="club-financeRow" key={payment.id} role="listitem">
                    <div className="club-financeTeam">
                      <strong>{buildTeamName(payment, teams, profiles)}</strong>
                      <span>{tournament?.name ?? 'Torneo sin datos'}</span>
                    </div>
                    <div>
                      <span>Método</span>
                      <strong>{methodLabels[normalizeStatus(payment.method)] ?? payment.method ?? 'Sin método'}</strong>
                    </div>
                    <div>
                      <span>Estado</span>
                      <strong className={`club-financeStatus ${statusClass}`}>{statusLabels[status] ?? (status || 'Sin estado')}</strong>
                    </div>
                    <div>
                      <span>Importe</span>
                      <strong>{formatMoney(payment.amount, payment.currency ?? 'ARS')}</strong>
                    </div>
                    <div>
                      <span>Fecha</span>
                      <strong>{formatDate(payment.requested_at ?? payment.created_at)}</strong>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="club-financeEmpty">
              <strong>Todavía no hay pagos registrados.</strong>
              <p>Cuando los jugadores soliciten pago en club o se registren pagos de torneo, van a aparecer acá.</p>
            </div>
          )}
        </section>
      </div>

      <style>{`
        .club-financePage {
          background: #fff;
          border: 1px solid rgba(15,23,42,.08);
          border-radius: 24px;
          box-shadow: 0 24px 64px rgba(15,23,42,.09);
          display: grid;
          gap: 16px;
          min-width: 0;
          overflow: hidden;
          padding: 22px;
          position: relative;
        }
        .club-financePage::before {
          background: linear-gradient(90deg, var(--club-finance-accent), var(--club-finance-accent-2));
          content: "";
          height: 4px;
          left: 0;
          position: absolute;
          right: 0;
          top: 0;
        }
        .club-financeHero {
          align-items: flex-start;
          background: linear-gradient(135deg, rgba(248,250,252,.98), var(--club-finance-soft));
          border: 1px solid rgba(15,23,42,.07);
          border-radius: 20px;
          display: flex;
          gap: 14px;
          justify-content: space-between;
          padding: 18px;
        }
        .club-financeKicker {
          color: var(--club-finance-accent);
          display: inline-block;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: .06em;
          margin-bottom: 4px;
          text-transform: uppercase;
        }
        .club-financeSecondary {
          align-items: center;
          background: #fff;
          border: 1px solid color-mix(in srgb, var(--club-finance-accent) 34%, transparent);
          border-radius: 999px;
          color: #061b3a;
          display: inline-flex;
          font-size: 13px;
          font-weight: 950;
          min-height: 38px;
          padding: 8px 13px;
          text-decoration: none;
          transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease;
          white-space: nowrap;
        }
        .club-financeSecondary:hover {
          border-color: color-mix(in srgb, var(--club-finance-accent) 52%, transparent);
          box-shadow: 0 12px 28px var(--club-finance-glow);
          transform: translateY(-1px);
        }
        .club-financeAlert {
          background: #fff7ed;
          border: 1px solid rgba(251,146,60,.24);
          border-radius: 16px;
          color: #9a3412;
          font-size: 13px;
          font-weight: 850;
          padding: 12px 14px;
        }
        .club-financeStats {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
        .club-financeStats article {
          background: rgba(255,255,255,.96);
          border: 1px solid rgba(15,23,42,.08);
          border-radius: 18px;
          box-shadow: 0 16px 38px rgba(15,23,42,.055);
          display: grid;
          gap: 7px;
          min-width: 0;
          padding: 15px;
        }
        .club-financeStats span,
        .club-financeRow span {
          color: #64748b;
          font-size: 12px;
          font-weight: 850;
        }
        .club-financeStats strong {
          color: #061b3a;
          font-size: clamp(24px, 3vw, 34px);
          font-weight: 950;
          letter-spacing: -.04em;
          line-height: 1;
        }
        .club-financeCard {
          background: rgba(255,255,255,.96);
          border: 1px solid rgba(15,23,42,.08);
          border-radius: 20px;
          box-shadow: 0 18px 46px rgba(15,23,42,.06);
          display: grid;
          gap: 12px;
          min-width: 0;
          padding: 16px;
        }
        .club-financeCardHead {
          align-items: flex-start;
          display: flex;
          gap: 12px;
          justify-content: space-between;
        }
        .club-financeCardHead h2 {
          color: #061b3a;
          font-size: 22px;
          font-weight: 950;
          letter-spacing: -.035em;
          margin: 0;
        }
        .club-financeCardHead small {
          background: var(--club-finance-soft);
          border: 1px solid color-mix(in srgb, var(--club-finance-accent) 18%, transparent);
          border-radius: 999px;
          color: #475569;
          font-size: 12px;
          font-weight: 900;
          padding: 7px 9px;
          white-space: nowrap;
        }
        .club-financeList {
          display: grid;
          gap: 10px;
          min-width: 0;
        }
        .club-financeRow {
          align-items: center;
          background: #f8fafc;
          border: 1px solid rgba(15,23,42,.07);
          border-radius: 16px;
          display: grid;
          gap: 12px;
          grid-template-columns: minmax(220px, 1.4fr) repeat(4, minmax(108px, .7fr));
          min-width: 0;
          padding: 12px;
        }
        .club-financeRow > div {
          display: grid;
          gap: 4px;
          min-width: 0;
        }
        .club-financeRow strong {
          color: #061b3a;
          font-size: 13px;
          font-weight: 950;
          min-width: 0;
        }
        .club-financeTeam strong,
        .club-financeTeam span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .club-financeTeam span {
          color: #64748b;
          font-size: 12px;
          font-weight: 780;
        }
        .club-financeStatus {
          align-items: center;
          border-radius: 999px;
          display: inline-flex;
          justify-self: start;
          line-height: 1;
          padding: 7px 9px;
        }
        .club-financeStatus.is-approved {
          background: rgba(16,185,129,.12);
          border: 1px solid rgba(16,185,129,.24);
          color: #047857;
        }
        .club-financeStatus.is-pending {
          background: rgba(245,158,11,.14);
          border: 1px solid rgba(245,158,11,.28);
          color: #92400e;
        }
        .club-financeStatus.is-rejected {
          background: rgba(244,63,94,.11);
          border: 1px solid rgba(244,63,94,.22);
          color: #be123c;
        }
        .club-financeEmpty {
          background: #f8fafc;
          border: 1px dashed #cbd5e1;
          border-radius: 16px;
          color: #64748b;
          display: grid;
          gap: 5px;
          padding: 18px;
        }
        .club-financeEmpty strong {
          color: #061b3a;
          font-weight: 950;
        }
        .club-financeEmpty p {
          margin: 0;
        }
        @media (max-width: 1080px) {
          .club-financeStats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .club-financeRow {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .club-financeTeam {
            grid-column: 1 / -1;
          }
        }
        @media (max-width: 640px) {
          .club-financePage {
            padding: 16px;
          }
          .club-financeHero,
          .club-financeCardHead {
            display: grid;
          }
          .club-financeStats,
          .club-financeRow {
            grid-template-columns: 1fr;
          }
          .club-financeSecondary {
            justify-content: center;
            width: 100%;
          }
        }
      `}</style>
    </div>
  )
}
