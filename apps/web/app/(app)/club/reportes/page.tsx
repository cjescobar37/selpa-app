'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { useSession } from '@/components/session/SessionProvider'
import { getClubTheme } from '@/lib/clubThemes'
import { supabase } from '@/lib/supabaseClient'

type PaymentRow = {
  amount: number | string | null
  status: string | null
}

type ReportState = {
  activePlayers: number
  tournaments: number
  registrations: number
  payments: PaymentRow[]
  paymentsAvailable: boolean
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

function toAmount(value: PaymentRow['amount']) {
  const amount = typeof value === 'number' ? value : Number(value ?? 0)
  return Number.isFinite(amount) ? amount : 0
}

function formatMoney(value: number) {
  if (value <= 0) return '—'
  return new Intl.NumberFormat('es-AR', {
    currency: 'ARS',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value)
}

function kpiValue(value: number, suffix = '') {
  return `${new Intl.NumberFormat('es-AR').format(value)}${suffix}`
}

export default function ClubReportesPage() {
  const { activeClub } = useSession()
  const [themeKey, setThemeKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [report, setReport] = useState<ReportState>({
    activePlayers: 0,
    payments: [],
    paymentsAvailable: true,
    registrations: 0,
    tournaments: 0,
  })

  const theme = useMemo(() => getClubTheme(themeKey), [themeKey])
  const themeStyle = useMemo(
    () => ({
      '--club-report-accent': theme.vars.accent,
      '--club-report-accent-2': theme.vars.accent2,
      '--club-report-soft': theme.vars.soft,
      '--club-report-glow': theme.vars.glow,
    }) as CSSProperties,
    [theme],
  )

  useEffect(() => {
    let alive = true

    async function loadReports() {
      if (!activeClub?.id) {
        setReport({
          activePlayers: 0,
          payments: [],
          paymentsAvailable: true,
          registrations: 0,
          tournaments: 0,
        })
        setLoading(false)
        return
      }

      setLoading(true)
      setError('')

      try {
        const [clubResult, playersResult, tournamentsResult, registrationsResult, paymentsResult] = await Promise.all([
          supabase.from('clubs').select('theme_key').eq('id', activeClub.id).maybeSingle(),
          supabase
            .from('club_players')
            .select('id', { count: 'exact', head: true })
            .eq('club_id', activeClub.id)
            .not('approved_at', 'is', null),
          supabase
            .from('tournaments')
            .select('id', { count: 'exact', head: true })
            .eq('club_id', activeClub.id),
          supabase
            .from('tournament_registrations')
            .select('id', { count: 'exact', head: true })
            .eq('club_id', activeClub.id),
          supabase
            .from('tournament_payments')
            .select('amount,status')
            .eq('club_id', activeClub.id)
            .limit(500),
        ])

        if (!alive) return

        if (clubResult.error) throw clubResult.error
        if (playersResult.error) throw playersResult.error
        if (tournamentsResult.error) throw tournamentsResult.error
        if (registrationsResult.error) throw registrationsResult.error

        let payments: PaymentRow[] = []
        let paymentsAvailable = true
        if (paymentsResult.error) {
          if (isMissingRelation(paymentsResult.error)) {
            paymentsAvailable = false
          } else {
            throw paymentsResult.error
          }
        } else {
          payments = (paymentsResult.data ?? []) as PaymentRow[]
        }

        setThemeKey((clubResult.data?.theme_key as string | null) ?? null)
        setReport({
          activePlayers: playersResult.count ?? 0,
          payments,
          paymentsAvailable,
          registrations: registrationsResult.count ?? 0,
          tournaments: tournamentsResult.count ?? 0,
        })
      } catch (loadError) {
        if (!alive) return
        setError(loadError instanceof Error ? loadError.message : 'No pude cargar los reportes del club.')
      } finally {
        if (alive) setLoading(false)
      }
    }

    void loadReports()
    return () => {
      alive = false
    }
  }, [activeClub?.id])

  const paymentSummary = useMemo(() => {
    return report.payments.reduce(
      (acc, payment) => {
        const status = normalizeStatus(payment.status)
        if (status === 'APPROVED' || status === 'PAID') {
          acc.approved += 1
          acc.approvedTotal += toAmount(payment.amount)
        }
        if (status === 'PENDING') acc.pending += 1
        if (status === 'REJECTED') acc.rejected += 1
        return acc
      },
      { approved: 0, approvedTotal: 0, pending: 0, rejected: 0 },
    )
  }, [report.payments])

  const conversionRate = report.tournaments > 0 ? Math.round((report.registrations / report.tournaments) * 10) / 10 : 0

  return (
    <div className="club-shell">
      <div className="club-panel club-reportPage" style={themeStyle}>
        <header className="club-reportHero">
          <div>
            <span className="club-reportKicker">Club Admin</span>
            <h1 className="club-title">Reportes</h1>
            <p className="club-sub">Resumen operativo de jugadores, torneos, inscripciones y pagos de {activeClub?.name ?? 'tu club'}.</p>
          </div>
          <Link className="club-reportSecondary" href="/club/contabilidad">
            Ver finanzas
          </Link>
        </header>

        {!activeClub?.id ? (
          <div className="club-reportEmpty">Primero seleccioná un club activo.</div>
        ) : (
          <>
            {error ? <div className="club-reportAlert">{error}</div> : null}

            <section className="club-reportStats" aria-label="Indicadores principales">
              <article>
                <span>Jugadores activos</span>
                <strong>{loading ? '...' : kpiValue(report.activePlayers)}</strong>
              </article>
              <article>
                <span>Torneos creados</span>
                <strong>{loading ? '...' : kpiValue(report.tournaments)}</strong>
              </article>
              <article>
                <span>Inscripciones</span>
                <strong>{loading ? '...' : kpiValue(report.registrations)}</strong>
              </article>
              <article>
                <span>Total aprobado</span>
                <strong>{loading ? '...' : formatMoney(paymentSummary.approvedTotal)}</strong>
              </article>
            </section>

            <section className="club-reportGrid">
              <article className="club-reportCard">
                <div className="club-reportCardHead">
                  <div>
                    <span className="club-reportKicker">Actividad</span>
                    <h2>Resumen competitivo</h2>
                  </div>
                  <small>{loading ? 'Cargando...' : 'Datos reales'}</small>
                </div>
                <div className="club-reportRows">
                  <div>
                    <span>Inscripciones por torneo</span>
                    <strong>{loading ? '...' : report.tournaments > 0 ? `${conversionRate}` : '—'}</strong>
                  </div>
                  <div>
                    <span>Pagos pendientes</span>
                    <strong>{loading ? '...' : report.paymentsAvailable ? kpiValue(paymentSummary.pending) : 'No disponible'}</strong>
                  </div>
                  <div>
                    <span>Pagos rechazados</span>
                    <strong>{loading ? '...' : report.paymentsAvailable ? kpiValue(paymentSummary.rejected) : 'No disponible'}</strong>
                  </div>
                  <div>
                    <span>Partidos registrados</span>
                    <strong>Próximamente</strong>
                  </div>
                </div>
              </article>

              <article className="club-reportCard club-reportCard--soft">
                <div className="club-reportCardHead">
                  <div>
                    <span className="club-reportKicker">Exportaciones</span>
                    <h2>Próximamente</h2>
                  </div>
                </div>
                <p>
                  En esta sección van a vivir los reportes exportables de participación, ingresos por torneo y uso de canchas.
                </p>
                <div className="club-reportExportList">
                  <span>PDF ejecutivo</span>
                  <span>Excel operativo</span>
                  <span>Resumen financiero</span>
                </div>
              </article>
            </section>

            {!loading && !error && report.activePlayers === 0 && report.tournaments === 0 && report.registrations === 0 ? (
              <div className="club-reportEmpty">
                <strong>Todavía no hay actividad para reportar.</strong>
                <p>Cuando cargues jugadores, torneos e inscripciones, este panel va a mostrar indicadores reales del club.</p>
              </div>
            ) : null}

            {!report.paymentsAvailable ? (
              <div className="club-reportNotice">
                La tabla <strong>tournament_payments</strong> todavía no está disponible en este entorno. Los reportes funcionan igual, pero sin métricas de pagos.
              </div>
            ) : null}
          </>
        )}
      </div>

      <style>{`
        .club-reportPage {
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
        .club-reportPage::before {
          background: linear-gradient(90deg, var(--club-report-accent), var(--club-report-accent-2));
          content: "";
          height: 4px;
          left: 0;
          position: absolute;
          right: 0;
          top: 0;
        }
        .club-reportHero {
          align-items: flex-start;
          background: linear-gradient(135deg, rgba(248,250,252,.98), var(--club-report-soft));
          border: 1px solid rgba(15,23,42,.07);
          border-radius: 20px;
          display: flex;
          gap: 14px;
          justify-content: space-between;
          padding: 18px;
        }
        .club-reportKicker {
          color: var(--club-report-accent);
          display: inline-block;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: .06em;
          margin-bottom: 4px;
          text-transform: uppercase;
        }
        .club-reportSecondary {
          align-items: center;
          background: #fff;
          border: 1px solid color-mix(in srgb, var(--club-report-accent) 34%, transparent);
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
        .club-reportSecondary:hover {
          border-color: color-mix(in srgb, var(--club-report-accent) 52%, transparent);
          box-shadow: 0 12px 28px var(--club-report-glow);
          transform: translateY(-1px);
        }
        .club-reportAlert,
        .club-reportNotice {
          border-radius: 16px;
          font-size: 13px;
          font-weight: 850;
          line-height: 1.4;
          padding: 12px 14px;
        }
        .club-reportAlert {
          background: #fff7ed;
          border: 1px solid rgba(251,146,60,.24);
          color: #9a3412;
        }
        .club-reportNotice {
          background: color-mix(in srgb, var(--club-report-accent) 8%, white);
          border: 1px solid color-mix(in srgb, var(--club-report-accent) 22%, transparent);
          color: #17435a;
        }
        .club-reportStats {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
        .club-reportStats article,
        .club-reportCard,
        .club-reportEmpty {
          background: rgba(255,255,255,.96);
          border: 1px solid rgba(15,23,42,.08);
          border-radius: 18px;
          box-shadow: 0 16px 38px rgba(15,23,42,.055);
          min-width: 0;
        }
        .club-reportStats article {
          display: grid;
          gap: 7px;
          padding: 15px;
        }
        .club-reportStats span,
        .club-reportRows span {
          color: #64748b;
          font-size: 12px;
          font-weight: 850;
        }
        .club-reportStats strong {
          color: #061b3a;
          font-size: clamp(24px, 3vw, 34px);
          font-weight: 950;
          letter-spacing: -.04em;
          line-height: 1;
        }
        .club-reportGrid {
          display: grid;
          gap: 12px;
          grid-template-columns: minmax(0, 1.45fr) minmax(280px, .75fr);
          min-width: 0;
        }
        .club-reportCard {
          display: grid;
          gap: 14px;
          padding: 16px;
        }
        .club-reportCard--soft {
          background: linear-gradient(135deg, #fff, var(--club-report-soft));
        }
        .club-reportCardHead {
          align-items: flex-start;
          display: flex;
          gap: 12px;
          justify-content: space-between;
        }
        .club-reportCardHead h2 {
          color: #061b3a;
          font-size: 22px;
          font-weight: 950;
          letter-spacing: -.035em;
          margin: 0;
        }
        .club-reportCardHead small {
          background: var(--club-report-soft);
          border: 1px solid color-mix(in srgb, var(--club-report-accent) 18%, transparent);
          border-radius: 999px;
          color: #475569;
          font-size: 12px;
          font-weight: 900;
          padding: 7px 9px;
          white-space: nowrap;
        }
        .club-reportRows {
          display: grid;
          gap: 10px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          min-width: 0;
        }
        .club-reportRows div {
          background: #f8fafc;
          border: 1px solid rgba(15,23,42,.07);
          border-radius: 15px;
          display: grid;
          gap: 5px;
          min-width: 0;
          padding: 12px;
        }
        .club-reportRows strong {
          color: #061b3a;
          font-size: 18px;
          font-weight: 950;
          line-height: 1.1;
        }
        .club-reportCard p {
          color: #52657d;
          font-size: 14px;
          font-weight: 700;
          line-height: 1.45;
          margin: 0;
        }
        .club-reportExportList {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .club-reportExportList span {
          background: #fff;
          border: 1px solid color-mix(in srgb, var(--club-report-accent) 24%, transparent);
          border-radius: 999px;
          color: #061b3a;
          font-size: 12px;
          font-weight: 900;
          padding: 8px 10px;
        }
        .club-reportEmpty {
          color: #64748b;
          display: grid;
          gap: 5px;
          padding: 18px;
        }
        .club-reportEmpty strong {
          color: #061b3a;
          font-weight: 950;
        }
        .club-reportEmpty p {
          margin: 0;
        }
        @media (max-width: 1080px) {
          .club-reportStats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .club-reportGrid {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 640px) {
          .club-reportPage {
            border-radius: 16px;
            gap: 10px;
            padding: 14px;
          }
          .club-reportHero {
            align-items: center;
            border-radius: 14px;
            padding: 13px;
          }
          .club-reportHero .club-title { font-size: 24px; }
          .club-reportHero .club-sub { display: none; }
          .club-reportStats {
            gap: 8px;
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .club-reportStats article {
            border-radius: 14px;
            gap: 4px;
            padding: 11px;
          }
          .club-reportStats strong { font-size: 21px; }
          .club-reportGrid { gap: 8px; }
          .club-reportCard {
            border-radius: 14px;
            gap: 10px;
            padding: 12px;
          }
          .club-reportCardHead { display: grid; }
          .club-reportCardHead h2 { font-size: 18px; }
          .club-reportRows {
            gap: 7px;
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .club-reportRows div { border-radius: 12px; padding: 10px; }
          .club-reportRows strong { font-size: 15px; overflow-wrap:anywhere; }
          .club-reportCard--soft {
            background:#fff;
          }
          .club-reportSecondary {
            min-height: 40px;
            padding: 7px 11px;
          }
        }
      `}</style>
    </div>
  )
}
