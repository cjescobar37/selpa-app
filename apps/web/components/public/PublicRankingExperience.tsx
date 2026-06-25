'use client'

import { type CSSProperties, useMemo, useState } from 'react'
import { ArrowLeft, Search } from 'lucide-react'
import RankingBoard, { type RankingBoardRow } from '@/components/ranking/RankingBoard'
import { buildAssetProxyUrl, getClubInitials } from '@/lib/clubAssets'
import { getClubTheme } from '@/lib/clubThemes'
import {
  filterRankingRows,
  formatRankingCategory,
  normalizeRankingGender,
  sortRankingRows,
  withRankingPositions,
} from '@/lib/ranking'

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

type PublicRankingRow = PublicRankingPlayer & {
  full_name: string
  ranking_points: number
  email: string | null
}

const categories = ['all', '1', '2', '3', '4', '5', '6', '7']
const genders = [
  { value: 'all', label: 'Todos' },
  { value: 'M', label: 'Caballeros' },
  { value: 'F', label: 'Damas' },
]

const PAMP_GLOW = 'rgba(6, 182, 212, 0.18)'

export default function PublicRankingExperience({ players, clubs }: { players: PublicRankingPlayer[]; clubs: string[] }) {
  const [selectedClub, setSelectedClub] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [gender, setGender] = useState('all')
  const [hoveredClub, setHoveredClub] = useState<string | null>(null)

  const clubCards = useMemo(() => {
    return clubs.map((clubName) => {
      const clubPlayers = players.filter((player) => player.clubName === clubName)
      const first = clubPlayers[0]
      return {
        clubName,
        categories: Array.from(new Set(clubPlayers.map((player) => player.category).filter((item): item is number => item !== null))).sort((a, b) => a - b),
        count: clubPlayers.length,
        genders: Array.from(new Set(clubPlayers.map((player) => normalizeRankingGender(player.gender)).filter((item): item is 'M' | 'F' => item === 'M' || item === 'F'))),
        logoUrl: first?.clubLogoUrl ?? null,
        themeKey: first?.clubThemeKey ?? null,
      }
    })
  }, [clubs, players])

  const selectedClubCard = selectedClub ? clubCards.find((item) => item.clubName === selectedClub) ?? null : null

  const filtered = useMemo(() => {
    const rows: PublicRankingRow[] = players.map((player) => ({
      ...player,
      full_name: player.name,
      ranking_points: player.points,
      email: player.clubName,
    }))
    return sortRankingRows(
      filterRankingRows(
        rows.filter((player) => !selectedClub || player.clubName === selectedClub),
        { category, gender, query },
      ),
    )
  }, [category, gender, players, query, selectedClub])

  const rankingBoardColumns = useMemo(() => {
    const visibleGenders = gender === 'M' || gender === 'F' ? [gender] as const : ['M', 'F'] as const
    return visibleGenders.map((columnGender) => ({
      gender: columnGender,
      rows: withRankingPositions(filtered.filter((player) => normalizeRankingGender(player.gender) === columnGender), 'position').map((player) => ({
        id: player.id,
        name: player.name,
        avatarUrl: buildAssetProxyUrl(player.avatarUrl),
        category: player.category,
        gender: player.gender,
        points: player.points,
        position: player.position,
        isTied: player.isTied,
        href: `/club/jugadores/${player.id}`,
        subtitle: player.clubName,
      } satisfies RankingBoardRow)),
    }))
  }, [filtered, gender])

  function renderClubCard(card: (typeof clubCards)[number]) {
    const logo = buildAssetProxyUrl(card.logoUrl)
    const theme = getClubTheme(card.themeKey)
    const isHovered = hoveredClub === card.clubName
    const accentStyle = {
      ['--club-primary' as string]: theme.vars.accent,
      ['--club-secondary' as string]: theme.vars.accent2,
    } satisfies CSSProperties
    const cardStyle = {
      ...accentStyle,
      background: 'linear-gradient(135deg, rgba(255,255,255,.98), rgba(248,250,252,.94)) padding-box, linear-gradient(135deg, rgba(34,211,238,.54), rgba(236,72,153,.46)) border-box',
      border: '1px solid transparent',
      borderRadius: 28,
      boxShadow: isHovered
        ? '0 24px 54px rgba(15,23,42,.14), 0 0 0 4px color-mix(in srgb, var(--club-primary) 16%, transparent), 0 0 38px color-mix(in srgb, var(--club-secondary) 18%, transparent)'
        : '0 18px 44px rgba(15,23,42,.09), 0 0 0 1px rgba(255,255,255,.7) inset',
      color: '#020617',
      cursor: 'pointer',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      minHeight: 190,
      minWidth: 0,
      overflow: 'hidden',
      padding: 24,
      position: 'relative',
      transform: isHovered ? 'translateY(-4px) scale(1.01)' : 'translateY(0) scale(1)',
      transition: 'transform .18s ease, box-shadow .18s ease',
    } satisfies CSSProperties

    return (
      <article
        className="group relative flex min-h-[190px] cursor-pointer flex-col justify-between overflow-hidden rounded-[28px] bg-white p-6 text-slate-950 shadow-xl transition duration-200 hover:-translate-y-1 hover:shadow-2xl"
        key={card.clubName}
        role="button"
        tabIndex={0}
        onClick={() => setSelectedClub(card.clubName)}
        onBlur={() => setHoveredClub(null)}
        onFocus={() => setHoveredClub(card.clubName)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setSelectedClub(card.clubName)
          }
        }}
        onMouseEnter={() => setHoveredClub(card.clubName)}
        onMouseLeave={() => setHoveredClub(null)}
        style={cardStyle}
      >
        <span
          aria-hidden="true"
          style={{
            background: 'linear-gradient(90deg, #22d3ee, var(--club-primary), var(--club-secondary), #ec4899)',
            borderRadius: 999,
            bottom: 0,
            height: 4,
            left: isHovered ? 18 : 24,
            opacity: isHovered ? .95 : .58,
            pointerEvents: 'none',
            position: 'absolute',
            right: isHovered ? 18 : 24,
            transform: isHovered ? 'scaleX(1)' : 'scaleX(.74)',
            transformOrigin: 'left center',
            transition: 'transform .2s ease, opacity .2s ease, left .2s ease, right .2s ease',
            zIndex: 2,
          }}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background: 'radial-gradient(circle at 18% 8%, color-mix(in srgb, var(--club-primary) 18%, transparent), transparent 34%), radial-gradient(circle at 92% 8%, color-mix(in srgb, var(--club-secondary) 14%, transparent), transparent 32%)',
            opacity: isHovered ? .95 : .72,
            transform: isHovered ? 'translate3d(4px, -3px, 0) scale(1.03)' : 'translate3d(0, 0, 0) scale(1)',
            transition: 'transform .2s ease, opacity .2s ease',
          }}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-2 right-4 text-[54px] font-black lowercase leading-none tracking-[-0.08em] text-slate-950 opacity-[0.035]"
          style={{
            color: '#061b3a',
            fontSize: 96,
            fontWeight: 950,
            bottom: -14,
            lineHeight: 1,
            opacity: .04,
            pointerEvents: 'none',
            position: 'absolute',
            right: 18,
            top: 'auto',
            transform: isHovered ? 'translateX(2px) scale(1.03)' : 'translateX(0) scale(1)',
            transition: 'transform .2s ease',
            zIndex: 0,
          }}
        >
          #
        </span>
        <span
          aria-hidden="true"
          style={{
            alignItems: 'end',
            display: 'flex',
            filter: 'blur(.45px)',
            gap: 12,
            opacity: isHovered ? .10 : .06,
            pointerEvents: 'none',
            position: 'absolute',
            right: 18,
            top: 12,
            transform: isHovered ? 'translateY(-2px) translateX(2px) scale(1.02)' : 'translateY(0) translateX(0) scale(1)',
            transition: 'transform .2s ease, opacity .2s ease',
            zIndex: 0,
          }}
        >
          {[65, 105, 155].map((height) => (
            <i
              key={height}
              style={{
                background: 'linear-gradient(180deg, var(--club-primary), var(--club-secondary))',
                borderRadius: '18px 18px 4px 4px',
                display: 'block',
                height,
                width: 34,
              }}
            />
          ))}
        </span>
        <header
          className="relative z-[1] min-w-0"
          style={{ minWidth: 0, position: 'relative', zIndex: 1 }}
        >
          <h2
            className="line-clamp-2 overflow-hidden text-[23px] font-black leading-[1.04] tracking-[-0.025em] text-slate-950"
            style={{ color: '#020617', display: '-webkit-box', fontSize: 23, fontWeight: 950, letterSpacing: '-.025em', lineHeight: 1.04, margin: 0, overflow: 'hidden', overflowWrap: 'anywhere', paddingRight: 72, WebkitBoxOrient: 'vertical', WebkitLineClamp: 2 }}
          >
            {card.clubName}
          </h2>
          <span
            aria-hidden="true"
            style={{ background: 'linear-gradient(90deg, #22d3ee, var(--club-primary), var(--club-secondary), #ec4899)', borderRadius: 999, display: 'block', height: isHovered ? 4 : 3, marginTop: 10, maxWidth: isHovered ? 140 : 90, opacity: isHovered ? .94 : .68, transition: 'max-width .2s ease, opacity .2s ease, height .2s ease' }}
          />
        </header>
        <div
          className="relative z-[1] flex min-w-0 items-center gap-4"
          style={{ alignItems: 'center', display: 'flex', gap: 18, minWidth: 0, position: 'relative', transform: 'translateY(14px)', zIndex: 1 }}
        >
          <div
            className="relative flex h-[72px] w-[72px] min-w-[72px] items-center justify-center overflow-hidden rounded-[20px] bg-white p-[7px] text-sm font-black text-slate-950"
            style={{
              alignItems: 'center',
              background: logo ? '#ffffff' : 'linear-gradient(135deg, #061b3a, #12325d)',
              border: '2px solid transparent',
              borderRadius: 20,
              boxShadow: isHovered
                ? '0 0 0 11px color-mix(in srgb, var(--club-primary) 19%, transparent), 0 19px 36px rgba(15,23,42,.16)'
                : '0 0 0 7px color-mix(in srgb, var(--club-primary) 10%, transparent), 0 14px 26px rgba(15,23,42,.10)',
              color: logo ? '#020617' : '#ffffff',
              display: 'flex',
              flex: '0 0 83px',
              fontSize: 14,
              fontWeight: 950,
              height: 83,
              justifyContent: 'center',
              minWidth: 83,
              overflow: 'hidden',
              padding: 8,
              position: 'relative',
              width: 83,
              zIndex: 1,
              transition: 'box-shadow .18s ease, transform .18s ease',
              transform: isHovered ? 'scale(1.05)' : 'scale(1)',
            }}
          >
            {logo ? <img className="block h-full w-full object-contain" src={logo} alt="" loading="lazy" decoding="async" style={{ display: 'block', height: '100%', objectFit: 'contain', width: '100%' }} /> : getClubInitials(card.clubName)}
          </div>
          <p className="mt-1 text-xs font-extrabold leading-tight text-slate-500" style={{ color: '#64748b', flex: '1 1 auto', fontSize: 12, fontWeight: 850, lineHeight: 1.28, margin: 0, minWidth: 0 }}>
            Entrá al ranking oficial del club.
          </p>
        </div>
        <footer
          className="relative z-[1] flex min-w-0 items-end justify-between gap-3"
          style={{ alignItems: 'flex-end', display: 'flex', gap: 12, justifyContent: 'flex-end', minWidth: 0, position: 'relative', zIndex: 1 }}
        >
          <span
            className="flex shrink-0 items-center justify-center rounded-full bg-slate-950 font-black leading-none text-white shadow-lg transition"
            aria-hidden="true"
            style={{
              alignItems: 'center',
              background: '#020617',
              borderRadius: 999,
              boxShadow: '0 12px 24px rgba(6,27,58,.16), 0 0 0 4px color-mix(in srgb, var(--club-secondary) 10%, transparent)',
              color: '#ffffff',
              display: 'inline-flex',
              flex: '0 0 auto',
              fontSize: 11,
              fontWeight: 950,
              gap: 8,
              height: 40,
              justifyContent: 'center',
              letterSpacing: '.04em',
              lineHeight: 1,
              minWidth: 118,
              padding: '0 13px',
              textTransform: 'uppercase',
            }}
          >
            Ver ranking <b style={{ display: 'inline-block', fontSize: 18, lineHeight: 1, transform: isHovered ? 'translateX(4px)' : 'translateX(0)', transition: 'transform .18s ease' }}>→</b>
          </span>
        </footer>
      </article>
    )
  }

  return (
    <main className="publicRankingShell" style={{ ['--rank-mobile-glow' as string]: PAMP_GLOW }}>
      <section className="publicRankingHero">
        <span>Ranking público</span>
        <h1>Ranking Pamprax</h1>
        <p>Explorá rankings públicos por club. Primero elegí un club y después filtrá por categoría o rama.</p>
      </section>

      {!selectedClub ? (
        <section
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
          style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))' }}
        >
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
              <p>{selectedClubCard?.count ?? 0} jugadores · Caballeros y Damas · 2026</p>
            </div>
          </section>

          <section className="publicRankingFilters">
            <label><span>Categoría</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item} value={item}>{item === 'all' ? 'Todas' : formatRankingCategory(Number(item))}</option>)}</select></label>
            <label><span>Género</span><select value={gender} onChange={(event) => setGender(event.target.value)}>{genders.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label className="publicRankingSearch"><span>Buscar</span><div><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Jugador" /></div></label>
          </section>

          <RankingBoard columns={rankingBoardColumns} />
        </>
      )}

      <style jsx>{`
        .publicRankingShell { color: #061b3a; display: grid; gap: 16px; margin: 0 auto; max-width: 1180px; width: 100%; }
        .publicRankingHero { background: radial-gradient(circle at 10% 0%, rgba(34,211,238,.16), transparent 34%), radial-gradient(circle at 96% 6%, rgba(236,72,153,.12), transparent 30%), linear-gradient(135deg, rgba(255,255,255,.98), #f8fafc); border: 1px solid rgba(15,23,42,.08); border-radius: 22px; box-shadow: 0 22px 58px rgba(15,23,42,.08); color: #061b3a; min-height: 220px; overflow: hidden; padding: clamp(24px, 4.5vw, 42px); position: relative; }
        .publicRankingHero::before { background: linear-gradient(135deg, rgba(6,182,212,.18), rgba(236,72,153,.12)); border-radius: 999px; content: ""; height: 8px; opacity: .55; pointer-events: none; position: absolute; right: 58px; top: 58px; transform: rotate(-24deg); width: 190px; }
        .publicRankingHero::after { background: linear-gradient(90deg, #22d3ee, rgba(34,211,238,.82), rgba(236,72,153,.48)); bottom: 0; content: ""; height: 4px; left: 28px; position: absolute; right: 28px; }
        .publicRankingHero span { color: #0891b2; font-size: 12px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
        .publicRankingHero h1 { color: #061b3a; font-size: clamp(38px, 6vw, 68px); font-weight: 950; letter-spacing: -.06em; line-height: .92; margin: 8px 0; }
        .publicRankingHero p { color: #475569; font-size: 16px; font-weight: 750; margin: 0; max-width: 620px; }
        .publicRankingSelected span { color: var(--accent, #06b6d4); font-size: 11px; font-weight: 950; letter-spacing: .04em; text-transform: uppercase; }
        .publicRankingSelected p { color: #64748b; font-size: 13px; font-weight: 850; margin: 0; }
        .publicRankingSelected button { background: linear-gradient(135deg, var(--accent, #06b6d4), var(--accent2, #ec4899)); border: 0; border-radius: 999px; box-shadow: 0 12px 24px color-mix(in srgb, var(--accent, #06b6d4) 18%, transparent); color: #fff; cursor: pointer; font: inherit; font-size: 12px; font-weight: 950; padding: 11px 15px; transition: transform .16s ease, filter .16s ease; white-space: nowrap; }
        .publicRankingSelected button:hover { filter: saturate(1.08); transform: translateY(-1px); }
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
        .publicRankingColumn header { align-items: center; background: linear-gradient(135deg, color-mix(in srgb, var(--column-accent) 16%, white), rgba(255,255,255,.98)); border: 1px solid color-mix(in srgb, var(--column-accent) 32%, #e2e8f0); border-radius: 14px; border-top: 3px solid var(--column-accent); box-shadow: 0 10px 22px rgba(15,23,42,.07); display: grid; justify-content: space-between; gap: 10px; grid-template-columns: minmax(0, 1fr) auto; padding: 12px; position: relative; z-index: 2; backdrop-filter: blur(10px); }
        .publicRankingColumn header span { color: var(--column-accent); display: block; font-size: 11px; font-weight: 950; text-transform: uppercase; }
        .publicRankingColumn header strong { display: block; font-size: 22px; font-weight: 950; letter-spacing: -.035em; }
        .publicRankingColumn header small { background: rgba(255,255,255,.86); border: 1px solid color-mix(in srgb, var(--column-accent) 24%, #dbe5ef); border-radius: 999px; color: #334155; font-size: 12px; font-weight: 900; padding: 6px 9px; }
        .publicRankingLabels { background: linear-gradient(135deg, color-mix(in srgb, var(--column-accent) 10%, white), #fff); border: 1px solid color-mix(in srgb, var(--column-accent) 20%, #e2e8f0); border-radius: 12px; box-shadow: 0 10px 24px rgba(15,23,42,.08); color: #64748b; display: grid; font-size: 10px; font-weight: 950; gap: 8px; grid-template-columns: 54px minmax(0, 1fr) 78px 58px; margin: 0 2px; padding: 7px 10px; position: sticky; text-transform: uppercase; top: 76px; z-index: 40; }
        .publicRankingList { display: grid; gap: 9px; }
        .publicRankingRow, .publicRankingEmpty { background: rgba(255,255,255,.94); border: 1px solid #e2e8f0; border-radius: 18px; box-shadow: 0 14px 38px rgba(15,23,42,.06); }
        .publicRankingRow { align-items: center; background: radial-gradient(circle at 0 0, var(--soft), transparent 36%), rgba(255,255,255,.96); border-color: color-mix(in srgb, var(--accent) 18%, #e2e8f0); display: grid; gap: 14px; grid-template-columns: 64px 78px minmax(0,1fr) 92px; padding: 14px; }
        .publicRankingRow.is-top { min-height: 112px; }
        .publicRankingRow.is-compact { grid-template-columns: 54px 68px minmax(0,1fr) 86px; min-height: 92px; padding: 12px; }
        .publicRankingPlace { color: #061b3a; display: grid; justify-items: center; }
        .publicRankingPlace svg { color: #f59e0b; }
        .publicRankingPlace strong { font-size: 25px; font-weight: 950; letter-spacing: -.06em; }
        .publicRankingRow.is-compact .publicRankingPlace strong { font-size: 19px; }
        .publicRankingAvatar { align-items: center; background: linear-gradient(135deg, #e0f2fe, #fae8ff); border: 4px solid #fff; border-radius: 999px; box-shadow: 0 16px 34px rgba(2,132,199,.2), 0 0 0 1px color-mix(in srgb, var(--accent) 26%, transparent); color: #061b3a; display: flex; font-family: "Outfit", Inter, system-ui, sans-serif; font-size: 18px; font-weight: 950; height: 78px; justify-content: center; overflow: hidden; width: 78px; }
        .publicRankingAvatar.has-image { background-image: var(--avatar); background-position: center; background-size: cover; }
        .publicRankingRow.is-compact .publicRankingAvatar { height: 68px; width: 68px; }
        .publicRankingInfo { display: grid; gap: 4px; min-width: 0; }
        .publicRankingInfo > strong { font-family: "Outfit", Inter, system-ui, sans-serif; font-size: 18px; font-weight: 950; line-height: 1.08; overflow-wrap: anywhere; }
        .publicRankingInfo > span { color: #64748b; font-size: 12px; font-weight: 850; }
        .publicRankingInfo em { align-items: center; color: #475569; display: inline-flex; font-size: 11px; font-style: normal; font-weight: 900; gap: 5px; min-width: 0; }
        .publicRankingInfo i { align-items: center; background: #061b3a; border-radius: 999px; color: #fff; display: inline-flex; font-size: 7px; font-style: normal; font-weight: 950; height: 18px; justify-content: center; width: 18px; }
        .publicRankingInfo i.has-image { background-image: var(--club-logo); background-position: center; background-size: cover; }
        .publicRankingRow img { display: none !important; height: 0 !important; max-height: 0 !important; max-width: 0 !important; width: 0 !important; }
        .publicRankingPoints { align-self: stretch; background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 10%, white), rgba(255,255,255,.96)); border: 1px solid color-mix(in srgb, var(--accent) 24%, #dbe6f0); border-radius: 16px; color: #061b3a; display: grid; justify-content: center; justify-items: end; min-width: 86px; padding: 8px 10px; place-content: center end; }
        .publicRankingPoints strong { font-family: "Rajdhani", "Outfit", Inter, system-ui, sans-serif; font-size: 34px; font-weight: 950; letter-spacing: -.04em; line-height: .82; }
        .publicRankingPoints span { color: #334155; font-family: "Rajdhani", Inter, system-ui, sans-serif; font-size: 12px; font-weight: 950; letter-spacing: .04em; text-transform: uppercase; }
        .publicRankingEmpty { color: #64748b; display: grid; gap: 6px; padding: 18px; }
        .publicRankingEmpty strong { color: #061b3a; font-weight: 950; }
        .publicRankingEmpty p { margin: 0; }
        @media (max-width: 920px) {
          .publicRankingFilters, .publicRankingBoard { grid-template-columns: 1fr; }
          .publicRankingLabels { top: 64px; }
        }
        @media (max-width: 820px) {
          .publicRankingBoard.mobile-gender-M .publicRankingColumn[data-ranking-gender="F"],
          .publicRankingBoard.mobile-gender-F .publicRankingColumn[data-ranking-gender="M"] { display: none; }
        }
        @media (max-width: 640px) {
          .publicRankingHero { border-radius: 20px; min-height: 180px; padding: 24px 18px; }
          .publicRankingSelected { align-items: start; flex-direction: column; }
          .publicRankingRow,
          .publicRankingRow.is-top,
          .publicRankingRow.is-compact {
            gap: 7px;
            grid-template-columns: 22px 28px minmax(0,1fr) minmax(84px, max-content);
            min-height: 46px;
            overflow: visible;
            padding: 6px 7px;
          }
          .publicRankingAvatar,
          .publicRankingRow.is-compact .publicRankingAvatar {
            height: 28px;
            width: 28px;
          }
          .publicRankingPlace strong,
          .publicRankingRow.is-compact .publicRankingPlace strong {
            font-size: 14px;
          }
          .publicRankingInfo > strong {
            font-size: 13px;
            line-height: 1.12;
            overflow: visible;
            white-space: normal;
          }
          .publicRankingInfo em,
          .publicRankingPlace svg {
            display: none;
          }
          .publicRankingLabels {
            gap: 6px;
            grid-template-columns: 32px minmax(0, 1fr) 56px 64px;
            padding: 6px 8px;
          }
          .publicRankingPoints { grid-column: 4; grid-row: 1; justify-items: end; min-width: 84px; padding-left: 0; white-space: nowrap; }
          .publicRankingPoints strong { font-size: 15px; }
        }
      `}</style>
    </main>
  )
}
