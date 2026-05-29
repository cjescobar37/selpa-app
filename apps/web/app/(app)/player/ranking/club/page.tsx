'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Search, Trophy } from 'lucide-react'
import { useSession } from '@/components/session/SessionProvider'
import { getClubInitials } from '@/lib/clubAssets'
import { getClubTheme } from '@/lib/clubThemes'
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

function PlayerAvatar({ name, src }: { name: string; src?: string | null }) {
  return (
    <span className="playerClubRankAvatar">
      {src ? <Image src={src} alt="" fill sizes="46px" /> : getClubInitials(name)}
    </span>
  )
}

function withVisualPositions(rows: RankingRow[]) {
  let lastPoints: number | null = null
  let lastPosition = 0
  return rows.map((row, index) => {
    const position = lastPoints === row.ranking_points ? lastPosition : index + 1
    lastPoints = row.ranking_points
    lastPosition = position
    return { ...row, visualPosition: position, isTied: rows.filter((item) => item.ranking_points === row.ranking_points).length > 1 }
  })
}

export default function PlayerClubRankingPage() {
  const session = useSession()
  const [category, setCategory] = useState('all')
  const [gender, setGender] = useState('all')
  const [query, setQuery] = useState('')
  const [data, setData] = useState<RankingResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [themeKey, setThemeKey] = useState<string | null>(null)
  const theme = getClubTheme(themeKey)

  useEffect(() => {
    let alive = true

    async function loadTheme() {
      if (!session.activeClub?.id) {
        setThemeKey(null)
        return
      }
      const { data: club } = await supabase
        .from('clubs')
        .select('theme_key')
        .eq('id', session.activeClub.id)
        .maybeSingle()
      if (alive) setThemeKey((club?.theme_key as string | null) ?? null)
    }

    void loadTheme()
    return () => {
      alive = false
    }
  }, [session.activeClub?.id])

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
    const search = query.trim().toLowerCase()
    return (data?.individual ?? [])
      .filter((row) => category === 'all' || String(row.category ?? '') === category)
      .filter((row) => gender === 'all' || normalizeGender(row.gender) === gender)
      .filter((row) => !search || `${row.full_name} ${row.email ?? ''}`.toLowerCase().includes(search))
      .sort((a, b) => b.ranking_points - a.ranking_points || a.full_name.localeCompare(b.full_name))
  }, [category, data?.individual, gender, query])

  const columns = useMemo(() => {
    if (gender === 'M') return ['M'] as const
    if (gender === 'F') return ['F'] as const
    return ['M', 'F'] as const
  }, [gender])

  function renderRow(player: ReturnType<typeof withVisualPositions>[number]) {
    return (
      <Link className={`playerClubRankRow ${player.visualPosition <= 10 ? 'is-top' : ''}`} href={`/club/jugadores/${player.player_id}`} key={player.player_id}>
        <strong className="playerClubRankPos">#{player.visualPosition}</strong>
        <PlayerAvatar name={player.full_name} src={player.avatar_url} />
        <div className="playerClubRankName">
          <b>{player.full_name}</b>
          <span>{player.category ? `${player.category}ta` : 'Sin categoría'} · {formatGender(player.gender)}{player.isTied ? ' · Empate' : ''}</span>
        </div>
        <div className="playerClubRankPts"><b>{player.ranking_points}</b><span>pts</span></div>
      </Link>
    )
  }

  return (
    <main
      className="playerClubRankShell"
      style={{
        ['--rank-accent' as string]: theme.vars.accent,
        ['--rank-accent-2' as string]: theme.vars.accent2,
        ['--rank-glow' as string]: theme.vars.glow,
      }}
    >
      <section className="playerClubRankHero">
        <div>
          <span>Ranking del club</span>
          <h1>{session.activeClub?.name ?? 'Club activo'}</h1>
          <p>Masculino y femenino viven como filtros y columnas dentro de esta vista.</p>
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
                {categories.map((item) => <option key={item} value={item}>{item === 'all' ? 'Todas' : `${item}ta`}</option>)}
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
            <section className={`playerClubRankBoard ${columns.length === 1 ? 'is-single' : ''}`}>
              {columns.map((column) => {
                const rows = withVisualPositions(filtered.filter((row) => normalizeGender(row.gender) === column))
                return (
                  <article className={`playerClubRankColumn playerClubRankColumn--${column === 'M' ? 'cyan' : 'magenta'}`} key={column}>
                    <header>
                      <div><span>Ranking</span><strong>{column === 'M' ? 'Masculino' : 'Femenino'}</strong></div>
                      <em>{rows.length} jugadores</em>
                    </header>
                    <div>
                      {rows.length ? rows.map(renderRow) : (
                        <div className="playerClubRankEmpty playerClubRankEmpty--small"><Trophy size={17} /> Sin jugadores para estos filtros.</div>
                      )}
                    </div>
                  </article>
                )
              })}
            </section>
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
        .playerClubRankColumn header { align-items: center; background: rgba(248,250,252,.96); border-radius: 16px; display: flex; justify-content: space-between; padding: 12px; position: sticky; top: 76px; z-index: 2; backdrop-filter: blur(10px); }
        .playerClubRankColumn--cyan header { border-top: 3px solid #06b6d4; }
        .playerClubRankColumn--magenta header { border-top: 3px solid #ec4899; }
        .playerClubRankColumn header strong { display: block; font-size: 20px; font-weight: 950; }
        .playerClubRankColumn header em { color: #64748b; font-size: 12px; font-style: normal; font-weight: 850; }
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
          .playerClubRankColumn header { top: 64px; }
        }
        @media (max-width: 520px) {
          .playerClubRankRow, .playerClubRankRow.is-top { grid-template-columns: 42px 42px minmax(0, 1fr); }
          .playerClubRankPts { grid-column: 2 / -1; text-align: left; }
        }
      `}</style>
    </main>
  )
}
