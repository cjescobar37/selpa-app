'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronRight, Search } from 'lucide-react'
import RankingBoard, { type RankingBoardRow } from '@/components/ranking/RankingBoard'
import RankingPlayerAvatar from '@/components/ranking/RankingPlayerAvatar'
import PlayerStatePanel from '@/components/player/PlayerStatePanel'
import { useSession } from '@/components/session/SessionProvider'
import { getClubTheme } from '@/lib/clubThemes'
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

function splitRankingName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  return {
    first: parts.slice(0, -1).join(' ') || parts[0] || 'Jugador',
    last: parts.length > 1 ? parts[parts.length - 1] : '',
  }
}

export default function PlayerClubRankingPage() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialShowFullRanking = pathname.endsWith('/todos')
  const categoryFromUrl = searchParams.get('categoria')
  const activeCategory = categoryFromUrl && categories.includes(categoryFromUrl) ? categoryFromUrl : null
  const session = useSession()
  const [category, setCategory] = useState('all')
  const [gender, setGender] = useState('all')
  const [query, setQuery] = useState('')
  const [data, setData] = useState<RankingResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const showFullRanking = initialShowFullRanking
  const clubTheme = useMemo(() => getClubTheme(session.activeClub?.themeKey ?? null), [session.activeClub?.themeKey])

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
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        if (!token) throw new Error('AUTH_REQUIRED')

        const res = await fetch(`/api/clubs/${session.activeClub.id}/ranking`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        const json = (await res.json().catch(() => ({}))) as RankingResponse

        if (!alive) return
        if (!res.ok) throw new Error(json.error ?? 'RANKING_LOAD_FAILED')
        setData(json)
      } catch {
        if (!alive) return
        setMessage('No pudimos cargar el ranking. Revisá tu conexión e intentá nuevamente.')
        setData(null)
      } finally {
        if (alive) setLoading(false)
      }
    }

    void loadRanking()
    return () => {
      alive = false
    }
  }, [reloadKey, session.activeClub?.id, session.status])

  const filtered = useMemo(() => {
    return sortRankingRows(filterRankingRows(data?.individual ?? [], { category: activeCategory ?? category, gender, query }))
  }, [activeCategory, category, data?.individual, gender, query])

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
      } satisfies RankingBoardRow)),
    }))
  }, [columns, filtered])

  const leaderGroups = useMemo(() => {
    const grouped = new Map<number, Partial<Record<'M' | 'F', RankingRow>>>()
    const orderedPlayers = [...(data?.individual ?? [])].sort((a, b) => {
      if (b.ranking_points !== a.ranking_points) return b.ranking_points - a.ranking_points
      return a.full_name.localeCompare(b.full_name, 'es')
    })

    for (const player of orderedPlayers) {
      if (player.category == null) continue
      const branch = normalizeRankingGender(player.gender)
      if (branch !== 'M' && branch !== 'F') continue
      const leaders = grouped.get(player.category) ?? {}
      if (!leaders[branch]) leaders[branch] = player
      grouped.set(player.category, leaders)
    }

    return [...grouped.entries()]
      .sort(([categoryA], [categoryB]) => categoryA - categoryB)
      .map(([groupCategory, leaders]) => ({ category: groupCategory, leaders }))
  }, [data?.individual])

  return (
    <main
      className="playerClubRankShell"
      style={{
        ['--rank-accent' as string]: clubTheme.vars.accent,
        ['--rank-accent-2' as string]: clubTheme.vars.accent2,
        ['--rank-glow' as string]: clubTheme.vars.glow,
        ['--club-accent' as string]: clubTheme.vars.accent,
        ['--club-accent-2' as string]: clubTheme.vars.accent2,
        ['--club-glow' as string]: clubTheme.vars.glow,
      }}
    >
      <section className="playerClubRankHero">
        <div>
          <span>Ranking del club</span>
          <h1>{initialShowFullRanking ? 'Todos los rankings' : 'Ranking por categoría'}</h1>
          <p>{initialShowFullRanking ? 'Buscá posiciones por categoría y rama.' : 'Conocé a los líderes de cada categoría.'}</p>
        </div>
        <div className="playerClubRankHeroActions">
          <Link className="is-secondary" href={initialShowFullRanking ? '/player/ranking/club' : '/player/ranking'}>{initialShowFullRanking ? 'Ranking por categoría' : 'Mi ranking'}</Link>
          {!initialShowFullRanking ? <Link href="/player/ranking/club/todos">Todos los rankings</Link> : null}
        </div>
      </section>

      {!session.activeClub?.id ? (
        <PlayerStatePanel kind="empty" title="Seleccioná un club activo" message="Elegí el club cuyo ranking querés consultar." action={{ label: 'Seleccionar club', href: '/seleccionar-club' }} compact />
      ) : (
        <>
          {!initialShowFullRanking && !loading && !message && leaderGroups.length ? (
            <section className="playerClubRankLeaders clubPublicHome" aria-labelledby="club-ranking-leaders-title">
              <header>
                <div>
                  <span>Líderes del club</span>
                  <h2 id="club-ranking-leaders-title">Ranking por categoría</h2>
                  <p>Los primeros puestos de Caballeros y Damas.</p>
                </div>
                <Link className="playerClubRankViewAll" href="/player/ranking/club/todos">Todos los rankings</Link>
              </header>
              <div className="clubPublicRankingGrid playerClubRankLeaderGrid">
                {leaderGroups.map((group) => (
                  <article className="clubPublicRankingCard playerClubRankLeaderCard" key={group.category}>
                    <div className="clubPublicRankingCategoryHead">
                      <small>Categoría</small>
                      <span>{formatRankingCategory(group.category)}</span>
                    </div>
                    <div className="clubPublicRankingBranches">
                      {(['M', 'F'] as const).map((branch) => {
                        const leader = group.leaders[branch]
                        const branchLabel = branch === 'M' ? 'Caballeros' : 'Damas'
                        const tone = branch === 'M' ? 'cyan' : 'magenta'
                        if (!leader) return <div key={`${group.category}:${branch}`} className={`clubPublicRankingBranch is-${tone}`}><div className="clubPublicRankingBranchTop"><span>{branchLabel}</span><b><i>#1</i><em>—</em></b></div><div className="clubPublicRankingPlayer is-pending"><span>Sin ranking todavía</span></div></div>
                        const name = splitRankingName(leader.full_name)
                        return (
                          <div key={`${group.category}:${branch}`} className={`clubPublicRankingBranch is-${tone}`}>
                            <div className="clubPublicRankingBranchTop"><span>{branchLabel}</span><b><i>#1</i><em>{leader.ranking_points} pts</em></b></div>
                            <div className="clubPublicRankingPair">
                              <div className="clubPublicRankingPlayer">
                                <RankingPlayerAvatar className={`clubPublicRankingAvatar is-${tone} ${leader.avatar_url ? 'has-image' : ''}`} name={leader.full_name} src={leader.avatar_url} sizes="40px" />
                                <strong><span>{name.first}</span><span>{name.last}</span></strong>
                              </div>
                              <div className="clubPublicRankingPlayer is-pending">
                                <span className="clubPublicRankingAvatar is-neutral is-secondary">P2</span>
                                <span>Pareja por confirmar</span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <Link className="clubPublicRankingFooter playerClubRankLeaderCard__action" href={`/player/ranking/club/todos?categoria=${group.category}`}>
                      <span>Ver ranking completo de {formatRankingCategory(group.category)}</span><ChevronRight size={16} />
                    </Link>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {showFullRanking ? <section className="playerClubRankFilters" id="ranking-completo">
            <label>
              <span>Categoría</span>
              <select value={activeCategory ?? category} onChange={(event) => {
                setCategory(event.target.value)
                if (activeCategory) router.replace('/player/ranking/club/todos')
              }}>
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
          </section> : null}

          {loading ? <PlayerStatePanel kind="loading" title="Cargando ranking" message="Ordenando posiciones y categorías" compact /> : null}
          {message ? <PlayerStatePanel kind="error" title="No pudimos cargar el ranking" message={message} onRetry={() => setReloadKey((value) => value + 1)} compact /> : null}

          {!loading && !message && showFullRanking && filtered.length ? (
            <RankingBoard columns={rankingBoardColumns} />
          ) : null}
          {!loading && !message && showFullRanking && !filtered.length ? (
            <PlayerStatePanel kind="empty" title="Sin posiciones para mostrar" message="Probá con otra categoría, rama o búsqueda." compact />
          ) : null}
        </>
      )}

      <style>{`
        .playerClubRankShell { background: radial-gradient(circle at 8% 0%, var(--rank-glow), transparent 34%), #f3f7fb; color: #061b3a; display: grid; gap: 16px; margin: 0 auto; max-width: 1180px; padding: 18px; width: 100%; }
        .playerClubRankHero, .playerClubRankFilters, .playerClubRankColumn, .playerClubRankEmpty { background: rgba(255,255,255,.9); border: 1px solid #e2e8f0; border-radius: 22px; box-shadow: 0 18px 48px rgba(15,23,42,.07); }
        .playerClubRankHero { align-items: center; display: flex; gap: 14px; justify-content: space-between; padding: 16px 18px; }
        .playerClubRankHero span, .playerClubRankFilters span, .playerClubRankColumn header span { color: var(--rank-accent); font-size: 11px; font-weight: 950; letter-spacing: .04em; text-transform: uppercase; }
        .playerClubRankHero h1 { font-size: clamp(28px, 4vw, 42px); font-weight: 950; letter-spacing: -.04em; line-height: .98; margin: 4px 0 5px; }
        .playerClubRankHero p { color: #64748b; font-size: 13px; font-weight: 800; margin: 0; }
        .playerClubRankHeroActions { align-items:center; display:flex; flex-wrap:wrap; gap:8px; justify-content:flex-end; }
        .playerClubRankHero a { background: linear-gradient(135deg, var(--rank-accent), var(--rank-accent-2)); border-radius: 999px; color: #fff; font-size:12px; font-weight: 950; min-height: 38px; padding: 0 13px; text-decoration: none; white-space: nowrap; display: inline-flex; align-items: center; }
        .playerClubRankHero a.is-secondary { background:#fff; border:1px solid color-mix(in srgb, var(--rank-accent) 42%, #cbd5e1); color:#061b3a; }
        .playerClubRankLeaders { display: grid; gap: 12px; }
        .playerClubRankLeaders > header { align-items:start; display:flex; gap:12px; justify-content:space-between; }
        .playerClubRankLeaders > header span { color: var(--rank-accent); font-size: 11px; font-weight: 950; text-transform: uppercase; }
        .playerClubRankLeaders > header h2 { font-size: clamp(22px, 3vw, 30px); line-height: 1; margin: 3px 0 4px; }
        .playerClubRankLeaders > header p { color: #64748b; font-size: 13px; font-weight: 750; margin: 0; }
        .playerClubRankViewAll { align-items:center; background:#fff; border:1px solid color-mix(in srgb, var(--rank-accent) 42%, #cbd5e1); border-radius:999px; color:#061b3a; display:inline-flex; font-size:11px; font-weight:950; justify-content:center; min-height:36px; padding:0 12px; text-decoration:none; white-space:nowrap; }
        .playerClubRankLeaderGrid { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .playerClubRankLeaderCard { background: #fafbfc; border: 1px solid #dfe7ef; border-radius: 16px; box-shadow: 0 10px 28px rgba(15,23,42,.06); min-width: 0; overflow: hidden; }
        .playerClubRankLeaderCard__head { align-items: center; border-top: 3px solid var(--rank-accent); display: flex; justify-content: space-between; min-height: 42px; padding: 7px 10px; }
        .playerClubRankLeaderCard__head > strong { font-size: 14px; }
        .playerClubRankLeaderCard__head button { align-items: center; background: transparent; border: 0; color: #075985; cursor: pointer; display: inline-flex; font: inherit; font-size: 11px; font-weight: 900; gap: 1px; min-height: 34px; padding: 0 2px 0 8px; }
        .playerClubRankLeaderCard__rows { display: grid; }
        .playerClubRankLeader { align-items: center; border-top: 1px solid #e7edf3; color: #061b3a; display: grid; gap: 9px; grid-template-columns: 58px minmax(0, 1fr) auto; min-height: 76px; padding: 8px 10px; text-decoration: none; }
        .playerClubRankLeader__avatar { align-items: center; background: linear-gradient(135deg, var(--rank-accent), #172554); border: 3px solid #fff; border-radius: 50%; box-shadow: 0 8px 20px color-mix(in srgb, var(--rank-accent) 15%, transparent); color: #fff; display: flex; font-size: 14px; font-weight: 950; height: 58px; justify-content: center; overflow: hidden; width: 58px; }
        .playerClubRankLeader__avatar img { height: 100%; object-fit: cover; width: 100%; }
        .playerClubRankLeader__identity { display: grid; gap: 1px; min-width: 0; }
        .playerClubRankLeader__identity > span { color: var(--rank-accent); font-size: 10px; font-weight: 950; text-transform: uppercase; }
        .playerClubRankLeader__identity > strong { display: -webkit-box; font-size: 14px; line-height: 1.12; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
        .playerClubRankLeader__identity > small { color: #64748b; font-size: 10px; font-weight: 750; }
        .playerClubRankLeader__score { align-items: flex-end; display: grid; gap: 2px; text-align: right; }
        .playerClubRankLeader__score b { color: var(--rank-accent); font-size: 14px; }
        .playerClubRankLeader__score span { color: #475569; font-size: 11px; font-weight: 850; white-space: nowrap; }
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
          .playerClubRankShell { max-width:none; padding: 10px; }
          .playerClubRankHero, .playerClubRankFilters, .playerClubRankBoard { display: grid; grid-template-columns: 1fr; }
          .playerClubRankBoard.mobile-gender-M .playerClubRankColumn[data-ranking-gender="F"],
          .playerClubRankBoard.mobile-gender-F .playerClubRankColumn[data-ranking-gender="M"] { display: none; }
          .playerClubRankLabels { top: 64px; }
          .playerClubRankLeaderGrid { grid-template-columns: 1fr; }
        }
        @media (max-width: 520px) {
          .playerClubRankShell { gap: 12px; padding: 10px; }
          .playerClubRankLeaders { gap: 9px; }
          .playerClubRankLeaders > header h2 { font-size: 22px; }
          .playerClubRankLeaders > header p { font-size: 12px; }
          .playerClubRankHero { align-items:start; display:grid; grid-template-columns:1fr; }
          .playerClubRankHeroActions { justify-content:stretch; width:100%; }
          .playerClubRankHeroActions a { flex:1; justify-content:center; }
          .playerClubRankLeaderCard__head { min-height: 38px; padding: 5px 9px; }
          .playerClubRankLeader { grid-template-columns: 56px minmax(0, 1fr) auto; min-height: 72px; padding: 7px 9px; }
          .playerClubRankLeader__avatar { height: 56px; width: 56px; }
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
