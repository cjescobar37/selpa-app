'use client'

import Link from 'next/link'
import type { CSSProperties } from 'react'
import { ArrowRight, CalendarDays } from 'lucide-react'
import { buildAssetProxyUrl, getClubInitials } from '@/lib/clubAssets'
import { getClubTheme } from '@/lib/clubThemes'
import { getTournamentDisplayStatus } from '@/lib/tournamentDisplayStatus'
import { BRAND } from '@/lib/branding'
import { getTournamentFlyerUrl } from '@/lib/tournamentFlyers'
import { formatCategoryLabel, formatGenderLabel, formatSegmentLabel } from '@/lib/tournamentLabels'

export type TournamentPublicCardData = {
  id: string
  name: string
  status: string
  type?: string | null
  tournament_type?: string | null
  gender: string
  segment?: string | null
  category: number | null
  startDate: string | null
  endDate?: string | null
  registrationDeadline?: string | null
  pricePerPlayer?: number | null
  maxPairs?: number | null
  registeredPairs?: number | null
  clubName?: string | null
  clubLogoUrl?: string | null
  clubThemeKey?: string | null
  flyerUrl?: string | null
  rules?: Record<string, unknown> | null
}

function dateParts(value?: string | null) {
  if (!value) return { day: '--', month: 'Fecha', year: 'A definir' }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { day: '--', month: 'Fecha', year: 'A definir' }
  return {
    day: new Intl.DateTimeFormat('es-AR', { day: '2-digit' }).format(date),
    month: new Intl.DateTimeFormat('es-AR', { month: 'short' }).format(date).replace('.', ''),
    year: new Intl.DateTimeFormat('es-AR', { year: 'numeric' }).format(date),
  }
}

function formatMoney(value?: number | null) {
  if (!value) return null
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value)
}

function resolveFlyerUrl(rawUrl?: string | null) {
  if (!rawUrl) return null
  if (rawUrl.startsWith('/')) return rawUrl
  return buildAssetProxyUrl(rawUrl)
}

function getTournamentType(value: TournamentPublicCardData) {
  const raw = value.tournament_type ?? value.type ?? value.rules?.tournament_type ?? value.rules?.type ?? 'OPEN'
  const normalized = String(raw ?? '').trim().toUpperCase()
  if (normalized === 'CHALLENGER' || normalized === 'MASTER' || normalized === 'MASTER_FINAL') return normalized
  return 'OPEN'
}

function formatCompactDate(value?: string | null) {
  if (!value) return 'A definir'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'A definir'
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: '2-digit' }).format(date).replace('.', '')
}

function isManualFlyer(value: TournamentPublicCardData) {
  const mode = String(value.rules?.flyer_mode ?? '').trim().toUpperCase()
  const manualUrl = String(value.rules?.flyer_manual_url ?? '').trim()
  return mode === 'MANUAL' && Boolean(manualUrl || value.flyerUrl)
}

function formatTournamentType(value: string) {
  if (value === 'MASTER_FINAL') return 'Master Final'
  if (value === 'CHALLENGER') return 'Challenger'
  if (value === 'MASTER') return 'Master'
  return 'Open'
}

export default function TournamentPublicCard({
  tournament,
  showClub = false,
}: {
  tournament: TournamentPublicCardData
  showClub?: boolean
  showRegisterAction?: boolean
}) {
  const theme = getClubTheme(tournament.clubThemeKey)
  const parts = dateParts(tournament.startDate)
  const displayStatus = getTournamentDisplayStatus(tournament)
  const flyer = resolveFlyerUrl(tournament.flyerUrl ?? getTournamentFlyerUrl(tournament))
  const manualFlyer = isManualFlyer(tournament)
  const logo = buildAssetProxyUrl(tournament.clubLogoUrl)
  const price = formatMoney(tournament.pricePerPlayer)
  const categoryLabel = formatCategoryLabel(tournament.category)
  const genderLabel = formatGenderLabel(tournament.gender)
  const segmentLabel = formatSegmentLabel(tournament.segment ?? tournament.rules?.segment_type ?? tournament.rules?.segment)
  const tournamentType = getTournamentType(tournament)
  const endDate = tournament.endDate && tournament.endDate !== tournament.startDate ? tournament.endDate : null
  const style = {
    ['--tournament-card-accent' as string]: theme.vars.accent,
    ['--tournament-card-accent-2' as string]: theme.vars.accent2,
    ['--tournament-card-soft' as string]: theme.vars.soft,
    ['--tournament-card-glow' as string]: theme.vars.glow,
    ['--tournament-card-height' as string]: '326px',
    minHeight: 'var(--tournament-card-height)',
  } as CSSProperties

  return (
    <article className={`TournamentPublicCard ${flyer ? 'has-flyer' : ''}${manualFlyer ? ' is-manual-flyer' : ''}`} style={style}>
      <Link className="TournamentPublicCard__hitArea" href={`/torneos/${tournament.id}`} aria-label={`Entrar al torneo ${tournament.name}`} />
      <div className="TournamentPublicCard__poster">
        {flyer ? <img src={flyer} alt="" /> : null}
        {!manualFlyer ? (
          <div className="TournamentPublicCard__posterMeta">
            <small>{formatTournamentType(tournamentType).toUpperCase()}</small>
            <div>
              <strong>{categoryLabel}</strong>
              <em>{genderLabel}</em>
              <i>{segmentLabel}</i>
            </div>
            {price ? <b>Valor: {price}</b> : null}
          </div>
        ) : null}
      </div>
      <div className="TournamentPublicCard__body">
        <div className="TournamentPublicCard__top">
          <div className="TournamentPublicCard__date">
            <strong>{parts.day}</strong>
            <span>{parts.month}</span>
            <small>{parts.year}</small>
          </div>
          <em className={`TournamentPublicCard__status ${displayStatus.className}`}>{displayStatus.label}</em>
        </div>
        {showClub ? (
          <div className="TournamentPublicCard__club">
            <span
              className={`TournamentPublicCard__clubLogo ${logo ? 'has-image' : ''}`}
              style={logo ? { ['--club-logo' as string]: `url("${logo}")` } : undefined}
            >
              {logo ? null : getClubInitials(tournament.clubName || 'SELPA')}
            </span>
            <b>{tournament.clubName || `Club ${BRAND.name}`}</b>
          </div>
        ) : null}
        <h3>{tournament.name}</h3>
        <div className="TournamentPublicCard__dates">
          <div className="TournamentPublicCard__dateRange">
            <p className="TournamentPublicCard__period">
              <CalendarDays size={13} />
              <span><small>Inicio</small><strong>{formatCompactDate(tournament.startDate)}</strong></span>
              <i aria-hidden="true">—</i>
              <span><small>Fin</small><strong>{formatCompactDate(endDate ?? tournament.endDate ?? tournament.startDate)}</strong></span>
            </p>
          </div>
          {tournament.registrationDeadline ? <p className="TournamentPublicCard__deadline"><CalendarDays size={13} /><span><small>Cierre</small><strong>{formatCompactDate(tournament.registrationDeadline)}</strong></span></p> : null}
        </div>
        <div className="TournamentPublicCard__actions">
          <Link href={`/torneos/${tournament.id}`}>ENTRAR <ArrowRight className="TournamentPublicCard__actionIcon" size={14} /></Link>
        </div>
      </div>
    </article>
  )
}
