'use client'

import { useMemo, useState } from 'react'
import { ArrowLeft, Search } from 'lucide-react'
import RankingBoard, { type RankingBoardRow } from '@/components/ranking/RankingBoard'
import PublicRankingClubCard from '@/components/public/PublicRankingClubCard'
import { buildAssetProxyUrl } from '@/lib/clubAssets'
import { BRAND } from '@/lib/branding'
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

export default function PublicRankingExperience({
  players,
  clubs,
  initialClubId,
  initialCategory,
}: {
  players: PublicRankingPlayer[]
  clubs: string[]
  initialClubId?: string | null
  initialCategory?: string | null
}) {
  const initialClubName = initialClubId ? players.find((player) => player.clubId === initialClubId)?.clubName ?? null : null
  const normalizedInitialCategory = initialCategory && categories.includes(initialCategory) ? initialCategory : 'all'
  const [selectedClub, setSelectedClub] = useState<string | null>(initialClubName)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(normalizedInitialCategory)
  const [gender, setGender] = useState('all')

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
    return (
      <PublicRankingClubCard
        key={card.clubName}
        clubName={card.clubName}
        logoUrl={card.logoUrl}
        themeKey={card.themeKey}
        onSelect={() => setSelectedClub(card.clubName)}
      />
    )
  }

  return (
    <main className="publicRankingShell" style={{ ['--rank-mobile-glow' as string]: PAMP_GLOW }}>
      <section className="publicRankingHero">
        <span>Ranking público</span>
        <h1>Ranking {BRAND.name}</h1>
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
        .publicRankingHero { background: radial-gradient(circle at 18% 6%, rgba(34,211,238,.3), transparent 34%), radial-gradient(circle at 84% 18%, rgba(236,72,153,.1), transparent 28%), linear-gradient(135deg, #020617 0%, #061b3a 58%, #071426 100%); border: 1px solid rgba(103,232,249,.14); border-radius: 22px; box-shadow: 0 16px 38px rgba(2,6,23,.14); color: #fff; display: grid; align-content: center; min-height: 156px; max-width: 1056px; margin: 0 auto; overflow: hidden; padding: clamp(14px, 2vw, 20px); position: relative; width: 100%; }
        .publicRankingHero::before { content: none; display: none; }
        .publicRankingHero::after { background: linear-gradient(90deg, #22d3ee 0%, #67e8f9 40%, #8bd3ed 50%, #ec4899 100%); bottom: 0; content: ""; height: 4px; left: 0; position: absolute; right: 0; }
        .publicRankingHero span { color: #67e8f9; font-size: 12px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
        .publicRankingHero h1 { color: #fff; font-size: clamp(30px, 4vw, 46px); font-weight: 950; letter-spacing: -.075em; line-height: .9; margin: 5px 0; }
        .publicRankingHero p { color: rgba(255,255,255,.78); font-size: clamp(14px, 1.45vw, 17px); font-weight: 720; line-height: 1.35; margin: 0; max-width: 600px; }
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
          .publicRankingHero { border-radius: 18px; min-height: 150px; max-width: min(100%, calc(100vw - 47px)); padding: 14px 16px; }
          .publicRankingHero span { font-size: 10px; font-weight: 850; letter-spacing: .06em; }
          .publicRankingHero h1 { font-size: clamp(28px, 8vw, 32px); letter-spacing: -.06em; line-height: .9; margin: 5px 0; }
          .publicRankingHero p { font-size: 12px; line-height: 1.25; }
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
