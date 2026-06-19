'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import RankingBoard, { type RankingBoardRow } from '@/components/ranking/RankingBoard'
import { useSession } from '@/components/session/SessionProvider'
import {
  filterRankingRows,
  formatRankingCategory,
  normalizeRankingGender,
  sortRankingRows,
  withRankingPositions,
} from '@/lib/ranking'
import { supabase } from '@/lib/supabaseClient'

type RankingRow = {
  position: number
  player_id: string
  user_id: string
  full_name: string
  email: string | null
  avatar_url: string | null
  category: number | null
  gender: string | null
  ranking_points: number
}

type RankingResponse = {
  individual?: RankingRow[]
  meta?: { generatedAt?: string }
  error?: string
}

const categories = ['all', '1', '2', '3', '4', '5', '6', '7']
const genders = [
  { value: 'all', label: 'Todos' },
  { value: 'M', label: 'Caballeros' },
  { value: 'F', label: 'Damas' },
  { value: 'MIXED', label: 'Mixto' },
]

const PAMP_CYAN = '#06b6d4'
const PAMP_MAGENTA = '#ec4899'
const PAMP_GLOW = 'rgba(6, 182, 212, 0.18)'

export default function PlayerClubRankingPage() {
  const session = useSession()
  const [category, setCategory] = useState('all')
  const [gender, setGender] = useState('all')
  const [query, setQuery] = useState('')
  const [data, setData] = useState<RankingResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let alive = true

    async function loadRanking() {
      if (session.status === 'loading') return
      if (!session.activeClub?.id) {
        setLoading(false)
        return
      }

      setLoading(true)
      setMessage('')
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        setMessage('Sesión inválida.')
        setLoading(false)
        return
      }

      const res = await fetch(`/api/clubs/${session.activeClub.id}/ranking`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const json = (await res.json().catch(() => ({}))) as RankingResponse

      if (!alive) return
      if (!res.ok) {
        setMessage(json.error ?? 'No pude cargar el ranking del club.')
        setData(null)
      } else {
        setData(json)
      }
      setLoading(false)
    }

    void loadRanking()
    return () => {
      alive = false
    }
  }, [session.activeClub?.id, session.status])

  const filtered = useMemo(() => {
    return sortRankingRows(filterRankingRows(data?.individual ?? [], { category, gender, query }))
  }, [category, data?.individual, gender, query])

  const columns = useMemo(() => {
    if (gender === 'M') return ['M'] as const
    if (gender === 'F') return ['F'] as const
    return ['M', 'F'] as const
  }, [gender])

  const rankingBoardColumns = useMemo(() => {
    return columns.map((column) => ({
      gender: column,
      rows: withRankingPositions(filtered.filter((row) => normalizeRankingGender(row.gender) === column), 'visualPosition').map((player) => ({
        id: player.player_id,
        name: player.full_name,
        avatarUrl: player.avatar_url,
        category: player.category,
        gender: player.gender,
        points: player.ranking_points,
        position: player.visualPosition,
        isTied: player.isTied,
        href: `/club/jugadores/${player.player_id}`,
      } satisfies RankingBoardRow)),
    }))
  }, [columns, filtered])

  return (
    <main
      className="playerClubRankShell"
      style={{
        ['--rank-accent' as string]: PAMP_CYAN,
        ['--rank-accent-2' as string]: PAMP_MAGENTA,
        ['--rank-glow' as string]: PAMP_GLOW,
        ['--rank-mobile-glow' as string]: PAMP_GLOW,
      }}
    >
      <section className="playerClubRankHero">
        <div>
          <span>Ranking del club</span>
          <h1>{session.activeClub?.name ?? 'Club activo'}</h1>
          <p>Caballeros y Damas viven como filtros y columnas dentro de esta vista.</p>
        </div>
        <Link href="/player/ranking">Mi ranking</Link>
      </section>

      {!session.activeClub?.id ? (
        <div className="playerClubRankEmpty">Seleccioná un club activo para ver el ranking.</div>
      ) : (
        <>
          <section className="playerClubRankFilters">
            <label>
              <span>Categoría</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                {categories.map((item) => <option key={item} value={item}>{item === 'all' ? 'Todas' : formatRankingCategory(Number(item))}</option>)}
              </select>
            </label>
            <label>
              <span>Género</span>
              <select value={gender} onChange={(event) => setGender(event.target.value)}>
                {genders.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="playerClubRankSearch">
              <span>Búsqueda</span>
              <div><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Jugador" /></div>
            </label>
          </section>

          {loading ? <div className="playerClubRankEmpty">Cargando ranking...</div> : null}
          {message ? <div className="playerClubRankEmpty playerClubRankEmpty--danger">{message}</div> : null}

          {!loading && !message ? (
            <RankingBoard columns={rankingBoardColumns} />
          ) : null}
        </>
      )}

      <style>{`
        .playerClubRankShell { background: radial-gradient(circle at 8% 0%, var(--rank-glow), transparent 34%), #f3f7fb; color: #061b3a; display: grid; gap: 16px; margin: 0 auto; max-width: 1180px; padding: 18px; width: 100%; }
        .playerClubRankHero, .playerClubRankFilters, .playerClubRankColumn, .playerClubRankEmpty { background: rgba(255,255,255,.9); border: 1px solid #e2e8f0; border-radius: 22px; box-shadow: 0 18px 48px rgba(15,23,42,.07); }
        .playerClubRankHero { align-items: center; display: flex; gap: 16px; justify-content: space-between; padding: 22px; }
        .playerClubRankHero span, .playerClubRankFilters span, .playerClubRankColumn header span { color: var(--rank-accent); font-size: 11px; font-weight: 950; letter-spacing: .04em; text-transform: uppercase; }
        .playerClubRankHero h1 { font-size: clamp(32px, 5vw, 54px); font-weight: 950; letter-spacing: -.04em; line-height: .98; margin: 5px 0 7px; }
        .playerClubRankHero p { color: #64748b; font-weight: 800; margin: 0; }
        .playerClubRankHero a { background: linear-gradient(135deg, var(--rank-accent), var(--rank-accent-2)); border-radius: 999px; color: #fff; font-weight: 950; padding: 10px 13px; text-decoration: none; white-space: nowrap; }
        .playerClubRankFilters { display: grid; gap: 12px; grid-template-columns: 160px 160px minmax(0, 1fr); padding: 13px; }
        .playerClubRankFilters label { display: grid; gap: 6px; }
        .playerClubRankFilters select, .playerClubRankFilters input { background: #f8fafc; border: 1px solid #dbe6f0; border-radius: 12px; color: #061b3a; font: inherit; font-weight: 850; min-width: 0; padding: 10px 11px; }
        .playerClubRankSearch div { align-items: center; background: #f8fafc; border: 1px solid #dbe6f0; border-radius: 12px; display: flex; gap: 8px; padding-left: 10px; }
        .playerClubRankSearch input { background: transparent; border: 0; flex: 1; }
        .playerClubRankBoard { align-items: start; display: grid; gap: 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .playerClubRankBoard.is-single { grid-template-columns: 1fr; }
        .playerClubRankColumn { align-content: start; align-self: start; display: grid; gap: 10px; min-height: 0; overflow: visible; padding: 12px; }
        .playerClubRankColumn header { align-items: center; background: linear-gradient(135deg, color-mix(in srgb, var(--rank-accent) 16%, white), rgba(255,255,255,.98)); border: 1px solid color-mix(in srgb, var(--rank-accent) 32%, #e2e8f0); border-radius: 14px; border-top: 3px solid var(--rank-accent); box-shadow: 0 10px 22px rgba(15,23,42,.07); display: grid; gap: 10px; grid-template-columns: minmax(0, 1fr) auto; justify-content: space-between; padding: 12px; position: relative; z-index: 2; backdrop-filter: blur(10px); }
        .playerClubRankColumn--secondary header { background: linear-gradient(135deg, color-mix(in srgb, var(--rank-accent-2) 16%, white), rgba(255,255,255,.98)); border-color: color-mix(in srgb, var(--rank-accent-2) 32%, #e2e8f0); border-top-color: var(--rank-accent-2); }
        .playerClubRankColumn header strong { display: block; font-size: 20px; font-weight: 950; }
        .playerClubRankColumn header em { background: rgba(255,255,255,.86); border: 1px solid color-mix(in srgb, var(--rank-accent) 24%, #dbe5ef); border-radius: 999px; color: #334155; font-size: 12px; font-style: normal; font-weight: 850; padding: 6px 9px; }
        .playerClubRankColumn--secondary header em { border-color: color-mix(in srgb, var(--rank-accent-2) 24%, #dbe5ef); }
        .playerClubRankLabels { background: linear-gradient(135deg, color-mix(in srgb, var(--rank-accent) 10%, white), #fff); border: 1px solid color-mix(in srgb, var(--rank-accent) 20%, #e2e8f0); border-radius: 12px; box-shadow: 0 10px 24px rgba(15,23,42,.08); color: #64748b; display: grid; font-size: 10px; font-weight: 950; gap: 8px; grid-template-columns: 42px minmax(0, 1fr) 72px 56px; margin: 0 2px; padding: 7px 9px; position: sticky; text-transform: uppercase; top: 76px; z-index: 40; }
        .playerClubRankColumn--secondary .playerClubRankLabels { background: linear-gradient(135deg, color-mix(in srgb, var(--rank-accent-2) 10%, white), #fff); border-color: color-mix(in srgb, var(--rank-accent-2) 20%, #e2e8f0); }
        .playerClubRankColumn > div { align-content: start; display: grid; gap: 8px; min-height: 0; }
        .playerClubRankRow { align-items: center; background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; color: #061b3a; display: grid; gap: 9px; grid-template-columns: 42px 40px minmax(0, 1fr) auto; min-width: 0; padding: 8px 10px; text-decoration: none; transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease; }
        .playerClubRankRow:hover { border-color: color-mix(in srgb, var(--rank-accent) 30%, #e2e8f0); transform: translateY(-1px); }
        .playerClubRankRow.is-top { background:
          radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--rank-accent) 14%, transparent), transparent 42%),
          linear-gradient(135deg, #fff, #f8fbff);
          border-color: color-mix(in srgb, var(--rank-accent) 32%, #e2e8f0);
          border-radius: 17px;
          box-shadow: 0 14px 34px color-mix(in srgb, var(--rank-accent) 10%, transparent);
          grid-template-columns: 56px 54px minmax(0, 1fr) auto;
          min-height: 74px;
          padding: 12px;
        }
        .playerClubRankPos { color: var(--rank-accent); font-size: 16px; font-weight: 950; text-align: center; }
        .playerClubRankRow.is-top .playerClubRankPos { font-size: 24px; letter-spacing: -.04em; }
        .playerClubRankAvatar { align-items: center; background: linear-gradient(135deg, var(--rank-accent), #172554); border-radius: 999px; color: #fff; display: flex; font-size: 12px; font-weight: 950; height: 40px; justify-content: center; overflow: hidden; position: relative; width: 40px; }
        .playerClubRankRow.is-top .playerClubRankAvatar { border: 3px solid #fff; box-shadow: 0 10px 24px color-mix(in srgb, var(--rank-accent) 16%, transparent); font-size: 14px; height: 54px; width: 54px; }
        .playerClubRankAvatar img { object-fit: cover; }
        .playerClubRankName { min-width: 0; }
        .playerClubRankName b { display: block; font-size: 13px; font-weight: 950; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .playerClubRankRow.is-top .playerClubRankName b { font-size: 15px; }
        .playerClubRankName span { color: #64748b; font-size: 11px; font-weight: 800; }
        .playerClubRankRow.is-top .playerClubRankName span { font-size: 12px; }
        .playerClubRankPts { text-align: right; }
        .playerClubRankPts b { display: block; font-size: 17px; font-weight: 950; }
        .playerClubRankRow.is-top .playerClubRankPts b { font-size: 22px; }
        .playerClubRankPts span { color: #64748b; font-size: 11px; font-weight: 900; }
        .playerClubRankEmpty { color: #64748b; font-weight: 850; padding: 18px; }
        .playerClubRankEmpty--danger { color: #be123c; }
        .playerClubRankEmpty--small { align-items: center; box-shadow: none; display: flex; gap: 8px; justify-content: flex-start; padding: 14px 12px; }
        @media (max-width: 820px) {
          .playerClubRankShell { padding: 12px; }
          .playerClubRankHero, .playerClubRankFilters, .playerClubRankBoard { display: grid; grid-template-columns: 1fr; }
          .playerClubRankBoard.mobile-gender-M .playerClubRankColumn[data-ranking-gender="F"],
          .playerClubRankBoard.mobile-gender-F .playerClubRankColumn[data-ranking-gender="M"] { display: none; }
          .playerClubRankLabels { top: 64px; }
        }
        @media (max-width: 520px) {
          .playerClubRankColumn { padding: 10px; }
          .playerClubRankLabels { gap: 6px; grid-template-columns: 32px minmax(0, 1fr) 54px 64px; padding: 6px 8px; }
          .playerClubRankRow, .playerClubRankRow.is-top {
            border-radius: 13px;
            gap: 7px;
            grid-template-columns: 22px 28px minmax(0, 1fr) minmax(84px, max-content);
            min-height: 46px;
            overflow: visible;
            padding: 6px 7px;
          }
          .playerClubRankAvatar,
          .playerClubRankRow.is-top .playerClubRankAvatar {
            border-width: 2px;
            height: 28px;
            width: 28px;
          }
          .playerClubRankRow.is-top .playerClubRankPos,
          .playerClubRankPos { font-size: 14px; }
          .playerClubRankRow.is-top .playerClubRankName b,
          .playerClubRankName b { font-size: 13px; overflow: visible; text-overflow: clip; white-space: normal; }
          .playerClubRankRow.is-top .playerClubRankName span,
          .playerClubRankName span { font-size: 11px; }
          .playerClubRankPts { grid-column: 4; grid-row: 1; min-width: 84px; text-align: right; white-space: nowrap; }
          .playerClubRankPts b,
          .playerClubRankRow.is-top .playerClubRankPts b { font-size: 14px; }
        }
      `}</style>
    </main>
  )
}
