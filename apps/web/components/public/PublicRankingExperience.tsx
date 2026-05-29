'use client'

import { useMemo, useState } from 'react'
import { ArrowLeft, Crown, Search, UsersRound } from 'lucide-react'
import { buildAssetProxyUrl, getClubInitials } from '@/lib/clubAssets'
import { getClubTheme } from '@/lib/clubThemes'

export type PublicRankingPlayer = {
  id: string
  clubId: string
  clubName: string
  clubLogoUrl: string | null
  clubThemeKey: string | null
  name: string
  avatarUrl: string | null
  category: number | null
  gender: string | null
  points: number
}

const categories = ['all', '1', '2', '3', '4', '5', '6', '7']
const genders = [
  { value: 'all', label: 'Todos' },
  { value: 'M', label: 'Masculino' },
  { value: 'F', label: 'Femenino' },
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
  return 'Sin rama'
}

function formatCategory(value?: number | null) {
  return value ? `${value}ta` : 'Sin categoría'
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'PX'
}

export default function PublicRankingExperience({ players, clubs }: { players: PublicRankingPlayer[]; clubs: string[] }) {
  const [selectedClub, setSelectedClub] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [gender, setGender] = useState('all')

  const clubCards = useMemo(() => {
    return clubs.map((clubName) => {
      const clubPlayers = players.filter((player) => player.clubName === clubName)
      const first = clubPlayers[0]
      const maleCount = clubPlayers.filter((player) => normalizeGender(player.gender) === 'M').length
      const femaleCount = clubPlayers.filter((player) => normalizeGender(player.gender) === 'F').length
      const categories = Array.from(new Set(clubPlayers.map((player) => player.category).filter(Boolean))).sort((a, b) => Number(a) - Number(b))
      return {
        clubName,
        count: clubPlayers.length,
        maleCount,
        femaleCount,
        categories,
        logoUrl: first?.clubLogoUrl ?? null,
        themeKey: first?.clubThemeKey ?? null,
      }
    })
  }, [clubs, players])

  const selectedClubCard = selectedClub ? clubCards.find((item) => item.clubName === selectedClub) ?? null : null

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase()
    return players
      .filter((player) => !selectedClub || player.clubName === selectedClub)
      .filter((player) => category === 'all' || String(player.category ?? '') === category)
      .filter((player) => gender === 'all' || normalizeGender(player.gender) === gender)
      .filter((player) => !search || `${player.name} ${player.clubName}`.toLowerCase().includes(search))
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
  }, [category, gender, players, query, selectedClub])

  const columns = useMemo(() => {
    const withPositions: Array<PublicRankingPlayer & { position: number }> = []
    filtered.forEach((player, index) => {
      const previous = withPositions[index - 1]
      const position = previous && previous.points === player.points ? previous.position : index + 1
      withPositions.push({ ...player, position })
    })
    return [
      { key: 'M', label: 'Masculino', accent: '#06b6d4', items: withPositions.filter((player) => normalizeGender(player.gender) === 'M') },
      { key: 'F', label: 'Femenino', accent: '#ec4899', items: withPositions.filter((player) => normalizeGender(player.gender) === 'F') },
    ]
  }, [filtered])

  function renderClubCard(card: (typeof clubCards)[number]) {
    const theme = getClubTheme(card.themeKey)
    const logo = buildAssetProxyUrl(card.logoUrl)
    return (
      <article
        className="publicRankingClubCard"
        key={card.clubName}
        style={{
          ['--accent' as string]: theme.vars.accent,
          ['--accent2' as string]: theme.vars.accent2,
          ['--soft' as string]: theme.vars.soft,
          ['--glow' as string]: theme.vars.glow,
          ['--club-logo' as string]: logo ? `url("${logo}")` : undefined,
        }}
      >
        <div className={`publicRankingClubLogo ${logo ? 'has-image' : ''}`}>{logo ? null : getClubInitials(card.clubName)}</div>
        <div className="publicRankingClubBody">
          <span>Ranking Anual</span>
          <h2>{card.clubName}</h2>
          <p>Masculino y Femenino · 2026</p>
          <div>
            <em><UsersRound size={12} /> {card.count} jugadores</em>
            <em>Masculino</em>
            <em>Femenino</em>
            <em>2026</em>
            {card.categories.length ? <em>{card.categories.map((item) => `${item}ta`).join(' · ')}</em> : null}
          </div>
        </div>
        <button type="button" onClick={() => setSelectedClub(card.clubName)}>Ver ranking</button>
      </article>
    )
  }

  function renderPlayer(player: PublicRankingPlayer & { position: number }, index: number) {
    const theme = getClubTheme(player.clubThemeKey)
    const top = index < 10
    const avatar = buildAssetProxyUrl(player.avatarUrl)
    const clubLogo = buildAssetProxyUrl(player.clubLogoUrl)

    return (
      <article
        className={`publicRankingRow ${top ? 'is-top' : 'is-compact'}`}
        key={player.id}
        style={{
          ['--accent' as string]: theme.vars.accent,
          ['--accent2' as string]: theme.vars.accent2,
          ['--soft' as string]: theme.vars.soft,
          ['--avatar' as string]: avatar ? `url("${avatar}")` : undefined,
          ['--club-logo' as string]: clubLogo ? `url("${clubLogo}")` : undefined,
        }}
      >
        <div className="publicRankingPlace">
          {player.position === 1 ? <Crown size={16} /> : null}
          <strong>#{player.position}</strong>
        </div>
        <div className={`publicRankingAvatar ${avatar ? 'has-image' : ''}`}>{avatar ? null : initials(player.name)}</div>
        <div className="publicRankingInfo">
          <strong>{player.name}</strong>
          <span>{formatCategory(player.category)} · {formatGender(player.gender)}</span>
          <em><i className={clubLogo ? 'has-image' : ''}>{clubLogo ? null : getClubInitials(player.clubName)}</i>{player.clubName}</em>
        </div>
        <div className="publicRankingPoints">
          <strong>{player.points}</strong>
          <span>pts</span>
        </div>
      </article>
    )
  }

  return (
    <main className="publicRankingShell">
      <section className="publicRankingHero">
        <span>Ranking público</span>
        <h1>Ranking Pamprax</h1>
        <p>Explorá rankings públicos por club. Primero elegí un club y después filtrá por categoría o rama.</p>
      </section>

      {!selectedClub ? (
        <section className="publicRankingClubGrid">
          {clubCards.length ? clubCards.map(renderClubCard) : (
            <div className="publicRankingEmpty">
              <strong>Sin rankings públicos</strong>
              <p>Todavía no hay jugadores aprobados para mostrar.</p>
            </div>
          )}
        </section>
      ) : (
        <>
          <section className="publicRankingSelected">
            <button type="button" onClick={() => setSelectedClub(null)}><ArrowLeft size={16} /> Volver a clubes</button>
            <div>
              <span>Ranking Anual</span>
              <strong>{selectedClub}</strong>
              <p>{selectedClubCard?.count ?? 0} jugadores · Masculino y Femenino · 2026</p>
            </div>
          </section>

          <section className="publicRankingFilters">
            <label><span>Categoría</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item} value={item}>{item === 'all' ? 'Todas' : `${item}ta`}</option>)}</select></label>
            <label><span>Género</span><select value={gender} onChange={(event) => setGender(event.target.value)}>{genders.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label className="publicRankingSearch"><span>Buscar</span><div><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Jugador" /></div></label>
          </section>

          <section className={`publicRankingBoard ${gender !== 'all' ? 'is-single' : ''}`}>
            {columns.filter((column) => gender === 'all' || column.key === gender).map((column) => (
              <div className="publicRankingColumn" key={column.key}>
                <header style={{ ['--column-accent' as string]: column.accent }}>
                  <div>
                    <span>Ranking</span>
                    <strong>{column.label}</strong>
                  </div>
                  <small>{column.items.length} jugadores</small>
                </header>
                <div className="publicRankingList">
                  {column.items.length ? column.items.map(renderPlayer) : (
                    <div className="publicRankingEmpty">
                      <strong>Sin jugadores</strong>
                      <p>No hay ranking para estos filtros.</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </section>
        </>
      )}

      <style jsx>{`
        .publicRankingShell { color: #061b3a; display: grid; gap: 16px; margin: 0 auto; max-width: 1180px; width: 100%; }
        .publicRankingHero { background: radial-gradient(circle at 14% 0%, rgba(34,211,238,.22), transparent 34%), radial-gradient(circle at 92% 8%, rgba(236,72,153,.08), transparent 28%), linear-gradient(135deg, #082f73 0%, #061b3a 58%, #020617 100%); border: 1px solid rgba(103,232,249,.14); border-radius: 22px; box-shadow: 0 22px 58px rgba(2,6,23,.16); color: #fff; min-height: 220px; overflow: hidden; padding: clamp(24px, 4.5vw, 42px); position: relative; }
        .publicRankingHero::before { background: linear-gradient(90deg, rgba(255,255,255,.08), transparent 32%, rgba(34,211,238,.09)); content: ""; inset: 0; pointer-events: none; position: absolute; }
        .publicRankingHero::after { background: linear-gradient(90deg, #22d3ee, rgba(34,211,238,.82), rgba(236,72,153,.42)); bottom: 0; content: ""; height: 4px; left: 28px; position: absolute; right: 28px; }
        .publicRankingHero span { color: #67e8f9; font-size: 12px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
        .publicRankingHero h1 { font-size: clamp(38px, 6vw, 68px); font-weight: 950; letter-spacing: -.06em; line-height: .92; margin: 8px 0; }
        .publicRankingHero p { color: rgba(255,255,255,.78); font-size: 16px; font-weight: 750; margin: 0; max-width: 620px; }
        .publicRankingClubGrid { display: grid; gap: 14px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .publicRankingClubCard { align-items: center; background: radial-gradient(circle at 0 0, var(--soft), transparent 32%), rgba(255,255,255,.92); border: 1px solid color-mix(in srgb, var(--accent) 24%, #e2e8f0); border-radius: 24px; box-shadow: 0 18px 44px rgba(15,23,42,.075); display: grid; gap: 14px; grid-template-columns: 64px minmax(0, 1fr) auto; overflow: hidden; padding: 16px; position: relative; transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
        .publicRankingClubCard::before { background: linear-gradient(180deg, var(--accent), var(--accent2)); bottom: 16px; content: ""; left: 0; position: absolute; top: 16px; width: 4px; }
        .publicRankingClubCard:hover { border-color: color-mix(in srgb, var(--accent) 42%, #e2e8f0); box-shadow: 0 24px 60px rgba(15,23,42,.11), 0 0 0 5px var(--glow); transform: translateY(-2px); }
        .publicRankingClubLogo { align-items: center; background: linear-gradient(135deg, #061b3a, #0f274a); border: 3px solid #fff; border-radius: 18px; box-shadow: 0 14px 30px rgba(2,132,199,.14); color: #fff; display: flex; font-size: 14px; font-weight: 950; height: 64px; justify-content: center; overflow: hidden; width: 64px; }
        .publicRankingClubLogo.has-image { background-color: #fff; background-image: var(--club-logo); background-position: center; background-repeat: no-repeat; background-size: cover; border: 1px solid color-mix(in srgb, var(--accent) 28%, #e2e8f0); }
        .publicRankingClubBody { min-width: 0; }
        .publicRankingClubBody > span, .publicRankingSelected span { color: var(--accent, #06b6d4); font-size: 11px; font-weight: 950; letter-spacing: .04em; text-transform: uppercase; }
        .publicRankingClubBody h2 { color: #061b3a; font-size: clamp(22px, 3vw, 30px); font-weight: 950; letter-spacing: -.05em; line-height: .96; margin: 4px 0; overflow-wrap: anywhere; }
        .publicRankingClubBody p, .publicRankingSelected p { color: #64748b; font-size: 13px; font-weight: 850; margin: 0 0 10px; }
        .publicRankingClubBody div { display: flex; flex-wrap: wrap; gap: 7px; }
        .publicRankingClubBody em { align-items: center; background: color-mix(in srgb, var(--accent) 8%, white); border: 1px solid color-mix(in srgb, var(--accent) 22%, white); border-radius: 999px; color: #075985; display: inline-flex; font-size: 11px; font-style: normal; font-weight: 950; gap: 5px; padding: 5px 8px; }
        .publicRankingClubCard button, .publicRankingSelected button { background: linear-gradient(135deg, var(--accent, #06b6d4), var(--accent2, #ec4899)); border: 0; border-radius: 999px; box-shadow: 0 12px 24px color-mix(in srgb, var(--accent, #06b6d4) 18%, transparent); color: #fff; cursor: pointer; font: inherit; font-size: 12px; font-weight: 950; padding: 11px 15px; transition: transform .16s ease, filter .16s ease; white-space: nowrap; }
        .publicRankingClubCard button:hover, .publicRankingSelected button:hover { filter: saturate(1.08); transform: translateY(-1px); }
        .publicRankingSelected { align-items: center; background: rgba(255,255,255,.94); border: 1px solid #e2e8f0; border-radius: 20px; box-shadow: 0 14px 34px rgba(15,23,42,.06); display: flex; gap: 14px; justify-content: space-between; padding: 14px; }
        .publicRankingSelected button { align-items: center; background: #fff; border: 1px solid #dbe6f0; color: #075985; display: inline-flex; gap: 7px; }
        .publicRankingSelected strong { display: block; font-size: 24px; font-weight: 950; letter-spacing: -.04em; }
        .publicRankingFilters { background: rgba(255,255,255,.9); border: 1px solid #e2e8f0; border-radius: 22px; box-shadow: 0 18px 48px rgba(15,23,42,.07); display: grid; gap: 12px; grid-template-columns: 140px 150px minmax(0,1fr); padding: 13px; }
        .publicRankingFilters label { display: grid; gap: 6px; min-width: 0; }
        .publicRankingFilters label > span { color: #0284c7; font-size: 11px; font-weight: 950; text-transform: uppercase; }
        .publicRankingFilters select, .publicRankingFilters input { background: #f8fafc; border: 1px solid #dbe6f0; border-radius: 12px; color: #061b3a; font: inherit; font-weight: 850; min-width: 0; padding: 10px 11px; }
        .publicRankingSearch div { align-items: center; background: #f8fafc; border: 1px solid #dbe6f0; border-radius: 12px; display: flex; gap: 8px; padding-left: 10px; }
        .publicRankingSearch input { background: transparent; border: 0; flex: 1; }
        .publicRankingBoard { align-items: start; display: grid; gap: 16px; grid-template-columns: repeat(2, minmax(0,1fr)); }
        .publicRankingBoard.is-single { grid-template-columns: minmax(0,1fr); }
        .publicRankingColumn { display: grid; gap: 10px; min-width: 0; }
        .publicRankingColumn header { align-items: center; background: rgba(255,255,255,.92); border: 1px solid color-mix(in srgb, var(--column-accent) 26%, #e2e8f0); border-radius: 18px; box-shadow: 0 12px 34px rgba(15,23,42,.06); display: flex; justify-content: space-between; gap: 10px; padding: 13px; position: sticky; top: 76px; z-index: 2; }
        .publicRankingColumn header span { color: var(--column-accent); display: block; font-size: 11px; font-weight: 950; text-transform: uppercase; }
        .publicRankingColumn header strong { display: block; font-size: 22px; font-weight: 950; letter-spacing: -.035em; }
        .publicRankingColumn header small { color: #64748b; font-size: 12px; font-weight: 900; }
        .publicRankingList { display: grid; gap: 9px; }
        .publicRankingRow, .publicRankingEmpty { background: rgba(255,255,255,.94); border: 1px solid #e2e8f0; border-radius: 18px; box-shadow: 0 14px 38px rgba(15,23,42,.06); }
        .publicRankingRow { align-items: center; background: radial-gradient(circle at 0 0, var(--soft), transparent 36%), rgba(255,255,255,.96); border-color: color-mix(in srgb, var(--accent) 18%, #e2e8f0); display: grid; gap: 11px; grid-template-columns: 62px 56px minmax(0,1fr) auto; padding: 12px; }
        .publicRankingRow.is-top { min-height: 92px; }
        .publicRankingRow.is-compact { grid-template-columns: 52px 44px minmax(0,1fr) auto; padding: 9px 10px; }
        .publicRankingPlace { color: #061b3a; display: grid; justify-items: center; }
        .publicRankingPlace svg { color: #f59e0b; }
        .publicRankingPlace strong { font-size: 25px; font-weight: 950; letter-spacing: -.06em; }
        .publicRankingRow.is-compact .publicRankingPlace strong { font-size: 19px; }
        .publicRankingAvatar { align-items: center; background: linear-gradient(135deg, #e0f2fe, #fae8ff); border: 3px solid #fff; border-radius: 999px; box-shadow: 0 12px 26px rgba(2,132,199,.16); color: #061b3a; display: flex; font-size: 14px; font-weight: 950; height: 56px; justify-content: center; overflow: hidden; width: 56px; }
        .publicRankingAvatar.has-image { background-image: var(--avatar); background-position: center; background-size: cover; }
        .publicRankingRow.is-compact .publicRankingAvatar { height: 44px; width: 44px; }
        .publicRankingInfo { display: grid; gap: 4px; min-width: 0; }
        .publicRankingInfo > strong { font-size: 16px; font-weight: 950; line-height: 1.08; overflow-wrap: anywhere; }
        .publicRankingInfo > span { color: #64748b; font-size: 12px; font-weight: 850; }
        .publicRankingInfo em { align-items: center; color: #475569; display: inline-flex; font-size: 11px; font-style: normal; font-weight: 900; gap: 5px; min-width: 0; }
        .publicRankingInfo i { align-items: center; background: #061b3a; border-radius: 999px; color: #fff; display: inline-flex; font-size: 7px; font-style: normal; font-weight: 950; height: 18px; justify-content: center; width: 18px; }
        .publicRankingInfo i.has-image { background-image: var(--club-logo); background-position: center; background-size: cover; }
        .publicRankingRow img { display: none !important; height: 0 !important; max-height: 0 !important; max-width: 0 !important; width: 0 !important; }
        .publicRankingPoints { color: #061b3a; display: grid; justify-items: end; min-width: 72px; }
        .publicRankingPoints strong { font-size: 22px; font-weight: 950; letter-spacing: -.05em; }
        .publicRankingPoints span { color: #64748b; font-size: 11px; font-weight: 900; text-transform: uppercase; }
        .publicRankingEmpty { color: #64748b; display: grid; gap: 6px; padding: 18px; }
        .publicRankingEmpty strong { color: #061b3a; font-weight: 950; }
        .publicRankingEmpty p { margin: 0; }
        @media (max-width: 920px) {
          .publicRankingClubGrid, .publicRankingFilters, .publicRankingBoard { grid-template-columns: 1fr; }
          .publicRankingColumn header { top: 64px; }
        }
        @media (max-width: 640px) {
          .publicRankingHero { border-radius: 20px; min-height: 180px; padding: 24px 18px; }
          .publicRankingClubCard { grid-template-columns: 58px minmax(0,1fr); }
          .publicRankingClubLogo { border-radius: 15px; height: 58px; width: 58px; }
          .publicRankingClubCard button { grid-column: 1 / -1; justify-self: start; }
          .publicRankingSelected { align-items: start; flex-direction: column; }
          .publicRankingRow, .publicRankingRow.is-compact { grid-template-columns: 46px 44px minmax(0,1fr); }
          .publicRankingPoints { grid-column: 2 / 4; justify-items: start; padding-left: 2px; }
        }
      `}</style>
    </main>
  )
}
