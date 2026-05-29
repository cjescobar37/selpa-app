'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Search, Trophy, UsersRound } from 'lucide-react'
import { buildAssetProxyUrl, getClubInitials } from '@/lib/clubAssets'
import { getClubTheme } from '@/lib/clubThemes'

export type PublicTournamentItem = {
  id: string
  club_id: string
  clubName: string
  clubLogoUrl: string | null
  clubThemeKey: string | null
  name: string
  status: string
  gender: string
  category: number | null
  startDate: string | null
  registrationDeadline: string | null
  maxPairs: number | null
  pricePerPlayer: number | null
}

const categories = ['all', '1', '2', '3', '4', '5', '6', '7']
const genders = [
  { value: 'all', label: 'Todos' },
  { value: 'M', label: 'Masculino' },
  { value: 'F', label: 'Femenino' },
  { value: 'MIXED', label: 'Mixto' },
]

function normalizeGender(value?: string | null) {
  const normalized = String(value ?? '').toUpperCase()
  if (normalized === 'MALE') return 'M'
  if (normalized === 'FEMALE') return 'F'
  return normalized || 'UNKNOWN'
}

function formatGender(value?: string | null) {
  const normalized = normalizeGender(value)
  if (normalized === 'M') return 'Masculino'
  if (normalized === 'F') return 'Femenino'
  if (normalized === 'MIXED' || normalized === 'MIXTO') return 'Mixto'
  return 'Sin rama'
}

function formatCategory(value?: number | null) {
  return value ? `${value}ta` : 'Sin categoría'
}

function statusLabel(value?: string | null) {
  const status = String(value ?? '').toUpperCase()
  if (status === 'OPEN' || status === 'PUBLISHED' || status === 'REGISTRATION_OPEN') return 'Inscripción abierta'
  if (['IN_PROGRESS', 'ACTIVE', 'LIVE', 'PLAYING', 'GROUPS', 'PLAYOFF', 'STARTED'].includes(status)) return 'En juego'
  if (status === 'FINISHED' || status === 'COMPLETED' || status === 'CLOSED') return 'Finalizado'
  return value || 'Por definirse'
}

function tournamentBucket(tournament: PublicTournamentItem) {
  const status = String(tournament.status ?? '').toUpperCase()
  if (['FINISHED', 'COMPLETED', 'CLOSED'].includes(status)) return 'finished'
  if (['IN_PROGRESS', 'ACTIVE', 'LIVE', 'PLAYING', 'GROUPS', 'PLAYOFF', 'STARTED'].includes(status)) return 'live'
  return 'open'
}

function isRegistrationOpen(tournament: PublicTournamentItem) {
  const status = String(tournament.status ?? '').toUpperCase()
  if (!['OPEN', 'PUBLISHED', 'REGISTRATION_OPEN'].includes(status)) return false
  if (!tournament.registrationDeadline) return true
  return tournament.registrationDeadline >= new Date().toISOString().slice(0, 10)
}

function formatMoney(value?: number | null) {
  if (!value) return null
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value)
}

function dateParts(value?: string | null) {
  if (!value) return { day: '--', month: 'Fecha', year: 'a definir' }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { day: '--', month: 'Fecha', year: 'a definir' }
  return {
    day: new Intl.DateTimeFormat('es-AR', { day: '2-digit' }).format(date),
    month: new Intl.DateTimeFormat('es-AR', { month: 'short' }).format(date).replace('.', ''),
    year: new Intl.DateTimeFormat('es-AR', { year: 'numeric' }).format(date),
  }
}

export default function PublicTournamentsExperience({ tournaments, clubs }: { tournaments: PublicTournamentItem[]; clubs: string[] }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [gender, setGender] = useState('all')
  const [club, setClub] = useState('all')

  const visible = useMemo(() => {
    const search = query.trim().toLowerCase()
    return tournaments
      .filter((item) => category === 'all' || String(item.category ?? '') === category)
      .filter((item) => gender === 'all' || normalizeGender(item.gender) === gender)
      .filter((item) => club === 'all' || item.clubName === club)
      .filter((item) => !search || `${item.name} ${item.clubName}`.toLowerCase().includes(search))
      .sort((a, b) => new Date(a.startDate ?? '2999-12-31').getTime() - new Date(b.startDate ?? '2999-12-31').getTime())
  }, [category, club, gender, query, tournaments])

  const sections = useMemo(() => {
    const live: PublicTournamentItem[] = []
    const open: PublicTournamentItem[] = []
    const finished: PublicTournamentItem[] = []
    for (const item of visible) {
      const bucket = tournamentBucket(item)
      if (bucket === 'live') live.push(item)
      else if (bucket === 'finished') finished.push(item)
      else open.push(item)
    }
    return [
      { key: 'live', title: 'En juego', subtitle: 'Torneos jugándose ahora', items: live },
      { key: 'open', title: 'Inscripción abierta', subtitle: 'Próximos eventos públicos', items: open },
      { key: 'finished', title: 'Finalizados', subtitle: 'Historial reciente', items: finished },
    ] as const
  }, [visible])

  function renderCard(tournament: PublicTournamentItem) {
    const theme = getClubTheme(tournament.clubThemeKey)
    const parts = dateParts(tournament.startDate)
    const logo = buildAssetProxyUrl(tournament.clubLogoUrl)
    const bucket = tournamentBucket(tournament)
    const money = formatMoney(tournament.pricePerPlayer)
    const canRegister = isRegistrationOpen(tournament)

    return (
      <article
        className="publicTournamentCard"
        key={tournament.id}
        style={{
          ['--accent' as string]: theme.vars.accent,
          ['--accent2' as string]: theme.vars.accent2,
          ['--soft' as string]: theme.vars.soft,
          ['--glow' as string]: theme.vars.glow,
        }}
      >
        <div className="publicTournamentDate">
          <strong>{parts.day}</strong>
          <span>{parts.month}</span>
          <small>{parts.year}</small>
        </div>
        <div className="publicTournamentBody">
          <div className="publicTournamentClub">
            <span
              className={`publicTournamentClubLogo ${logo ? 'has-image' : ''}`}
              style={logo ? { ['--club-logo' as string]: `url("${logo}")` } : undefined}
            >
              {logo ? null : getClubInitials(tournament.clubName)}
            </span>
            <b>{tournament.clubName}</b>
          </div>
          <h3>{tournament.name}</h3>
          <p>{formatCategory(tournament.category)} · {formatGender(tournament.gender)}</p>
          <div className="publicTournamentMeta">
            <em className={`is-${bucket}`}>{statusLabel(tournament.status)}</em>
            {money ? <em>{money}</em> : null}
            {tournament.maxPairs ? <em><UsersRound size={12} /> Hasta {tournament.maxPairs} parejas</em> : null}
          </div>
        </div>
        <div className="publicTournamentActions">
          <Link href={`/torneos/${tournament.id}`}>Ver torneo</Link>
          {canRegister ? <Link href={`/torneos/${tournament.id}/inscripcion`}>Inscribirme</Link> : null}
        </div>
      </article>
    )
  }

  return (
    <main className="publicTournamentShell">
      <section className="publicTournamentHero">
        <span>Calendario público</span>
        <h1>Torneos Pamprax</h1>
        <p>Explorá eventos abiertos, torneos en juego y resultados recientes de clubes Pamprax.</p>
      </section>

      <section className="publicTournamentFilters">
        <label><span>Categoría</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item} value={item}>{item === 'all' ? 'Todas' : `${item}ta`}</option>)}</select></label>
        <label><span>Género</span><select value={gender} onChange={(event) => setGender(event.target.value)}>{genders.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label><span>Club</span><select value={club} onChange={(event) => setClub(event.target.value)}><option value="all">Todos</option>{clubs.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label className="publicTournamentSearch"><span>Buscar</span><div><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Torneo o club" /></div></label>
      </section>

      <section className="publicTournamentSections">
        {sections.map((section) => (
          <div className="publicTournamentSection" key={section.key}>
            <header>
              <div>
                <span>{section.title}</span>
                <strong>{section.subtitle}</strong>
              </div>
              <small>{section.items.length} {section.items.length === 1 ? 'torneo' : 'torneos'}</small>
            </header>
            {section.items.length ? (
              <div className="publicTournamentList">{section.items.map(renderCard)}</div>
            ) : (
              <div className="publicTournamentEmpty"><Trophy size={18} /><strong>Sin torneos</strong><p>No hay eventos en esta sección con los filtros actuales.</p></div>
            )}
          </div>
        ))}
      </section>

      <style jsx>{`
        .publicTournamentShell { color: #061b3a; display: grid; gap: 16px; margin: 0 auto; max-width: 1180px; width: 100%; }
        .publicTournamentHero { background: radial-gradient(circle at 12% 0%, rgba(34,211,238,.24), transparent 36%), radial-gradient(circle at 86% 10%, rgba(236,72,153,.18), transparent 34%), linear-gradient(135deg, #071a36, #0f274a 58%, #431039); border-radius: 22px; color: #fff; overflow: hidden; padding: clamp(24px, 4.5vw, 42px); position: relative; }
        .publicTournamentHero::after { background: linear-gradient(90deg, #22d3ee, #ec4899); bottom: 0; content: ""; height: 4px; left: 28px; position: absolute; right: 28px; }
        .publicTournamentHero span { color: #67e8f9; font-size: 12px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
        .publicTournamentHero h1 { font-size: clamp(38px, 6vw, 68px); font-weight: 950; letter-spacing: -.06em; line-height: .92; margin: 8px 0; }
        .publicTournamentHero p { color: rgba(255,255,255,.78); font-size: 16px; font-weight: 750; margin: 0; max-width: 620px; }
        .publicTournamentFilters { background: rgba(255,255,255,.9); border: 1px solid #e2e8f0; border-radius: 22px; box-shadow: 0 18px 48px rgba(15,23,42,.07); display: grid; gap: 12px; grid-template-columns: 140px 150px 190px minmax(0,1fr); padding: 13px; }
        .publicTournamentFilters label { display: grid; gap: 6px; min-width: 0; }
        .publicTournamentFilters label > span { color: #0284c7; font-size: 11px; font-weight: 950; text-transform: uppercase; }
        .publicTournamentFilters select, .publicTournamentFilters input { background: #f8fafc; border: 1px solid #dbe6f0; border-radius: 12px; color: #061b3a; font: inherit; font-weight: 850; min-width: 0; padding: 10px 11px; }
        .publicTournamentSearch div { align-items: center; background: #f8fafc; border: 1px solid #dbe6f0; border-radius: 12px; display: flex; gap: 8px; padding-left: 10px; }
        .publicTournamentSearch input { background: transparent; border: 0; flex: 1; }
        .publicTournamentSections { display: grid; gap: 20px; }
        .publicTournamentSection { display: grid; gap: 10px; }
        .publicTournamentSection > header { align-items: end; display: flex; gap: 12px; justify-content: space-between; }
        .publicTournamentSection > header span { display: block; font-size: 22px; font-weight: 950; letter-spacing: -.03em; }
        .publicTournamentSection > header strong { color: #64748b; display: block; font-size: 12px; font-weight: 850; }
        .publicTournamentSection > header small { background: #fff; border: 1px solid #e2e8f0; border-radius: 999px; color: #64748b; flex: 0 0 auto; font-size: 11px; font-weight: 950; padding: 6px 9px; }
        .publicTournamentList { display: grid; gap: 12px; }
        .publicTournamentCard, .publicTournamentEmpty { background: rgba(255,255,255,.94); border: 1px solid #e2e8f0; border-radius: 18px; box-shadow: 0 14px 34px rgba(15,23,42,.06); }
        .publicTournamentCard { align-items: center; background: radial-gradient(circle at 0 0, var(--soft), transparent 30%), rgba(255,255,255,.96); border-color: color-mix(in srgb, var(--accent) 18%, #e2e8f0); display: grid; gap: 14px; grid-template-columns: 92px minmax(0,1fr) 176px; min-height: 118px; overflow: hidden; padding: 12px 14px; position: relative; transition: transform .18s ease, box-shadow .18s ease; width: 100%; }
        .publicTournamentCard::before { background: linear-gradient(180deg, var(--accent), var(--accent2)); bottom: 12px; content: ""; left: 0; position: absolute; top: 12px; width: 4px; }
        .publicTournamentCard:hover { box-shadow: 0 20px 44px rgba(15,23,42,.09), 0 0 0 4px var(--glow); transform: translateY(-1px); }
        .publicTournamentDate { align-content: center; background: linear-gradient(180deg, #fff, #f8fbff); border: 1px solid color-mix(in srgb, var(--accent) 24%, #e2e8f0); border-radius: 16px; display: grid; justify-items: center; min-height: 92px; padding: 9px; }
        .publicTournamentDate strong { font-size: 31px; font-weight: 950; letter-spacing: -.06em; line-height: .9; }
        .publicTournamentDate span { color: var(--accent); font-size: 13px; font-weight: 950; text-transform: uppercase; }
        .publicTournamentDate small { color: #64748b; font-size: 11px; font-weight: 900; }
        .publicTournamentBody { min-width: 0; }
        .publicTournamentClub { align-items: center; display: flex; gap: 8px; margin-bottom: 5px; min-width: 0; }
        .publicTournamentClubLogo { align-items: center; background: #061b3a; border-radius: 12px; color: #fff; display: inline-flex; flex: 0 0 42px; font-size: 10px; font-weight: 950; height: 42px; justify-content: center; max-height: 42px; max-width: 42px; overflow: hidden; width: 42px; }
        .publicTournamentClubLogo.has-image { background-color: #fff; background-image: var(--club-logo); background-position: center; background-repeat: no-repeat; background-size: cover; border: 1px solid color-mix(in srgb, var(--accent) 28%, #e2e8f0); }
        .publicTournamentCard img { display: none !important; height: 0 !important; max-height: 0 !important; max-width: 0 !important; width: 0 !important; }
        .publicTournamentClub b { color: #475569; font-size: 12px; font-weight: 950; overflow: hidden; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
        .publicTournamentBody h3 { font-size: clamp(19px, 2vw, 24px); font-weight: 950; letter-spacing: -.035em; line-height: 1.04; margin: 0; overflow-wrap: anywhere; }
        .publicTournamentBody p { color: #64748b; font-size: 13px; font-weight: 850; margin: 5px 0 8px; }
        .publicTournamentMeta { display: flex; flex-wrap: wrap; gap: 7px; }
        .publicTournamentMeta em { align-items: center; background: color-mix(in srgb, var(--accent) 8%, white); border: 1px solid color-mix(in srgb, var(--accent) 22%, white); border-radius: 999px; color: #075985; display: inline-flex; font-size: 11px; font-style: normal; font-weight: 950; gap: 5px; padding: 5px 8px; }
        .publicTournamentMeta .is-live { background: rgba(34,197,94,.12); border-color: rgba(34,197,94,.28); color: #047857; }
        .publicTournamentMeta .is-finished { background: #f1f5f9; border-color: #e2e8f0; color: #64748b; }
        .publicTournamentActions { align-content: center; display: grid; gap: 8px; justify-items: stretch; min-width: 0; }
        .publicTournamentActions a { background: linear-gradient(135deg, var(--accent), var(--accent2)); border-radius: 999px; color: #fff; font-size: 12px; font-weight: 950; padding: 10px 13px; text-align: center; text-decoration: none; white-space: nowrap; width: 100%; }
        .publicTournamentActions a:first-child { background: #fff; border: 1px solid color-mix(in srgb, var(--accent) 34%, #e2e8f0); color: #075985; }
        .publicTournamentEmpty { color: #64748b; display: grid; gap: 6px; justify-items: start; padding: 18px; }
        .publicTournamentEmpty strong { color: #061b3a; font-weight: 950; }
        .publicTournamentEmpty p { margin: 0; }
        @media (max-width: 900px) {
          .publicTournamentFilters { grid-template-columns: 1fr; }
          .publicTournamentCard { align-items: stretch; grid-template-columns: 82px minmax(0,1fr); }
          .publicTournamentActions { display: flex; flex-wrap: wrap; grid-column: 1 / -1; justify-items: start; }
          .publicTournamentActions a { width: auto; }
        }
        @media (max-width: 560px) {
          .publicTournamentShell { gap: 14px; }
          .publicTournamentHero { border-radius: 20px; padding: 24px 18px; }
          .publicTournamentSection > header { align-items: start; flex-direction: column; }
          .publicTournamentCard { grid-template-columns: 1fr; padding: 12px; }
          .publicTournamentDate { align-items: center; display: flex; gap: 8px; justify-content: flex-start; min-height: 0; }
          .publicTournamentDate strong { font-size: 26px; }
        }
      `}</style>
    </main>
  )
}
