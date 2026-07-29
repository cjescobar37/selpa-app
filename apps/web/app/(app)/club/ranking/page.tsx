'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { UserRound, UsersRound } from 'lucide-react'
import RankingBoard, { type RankingBoardRow } from '@/components/ranking/RankingBoard'
import RankingGenderTabs from '@/components/ranking/RankingGenderTabs'
import PairRankingBoard, { type PairRankingRow } from '@/components/ranking/PairRankingBoard'
import { supabase } from '@/lib/supabaseClient'
import { useSession } from '@/components/session/SessionProvider'
import { getClubTheme } from '@/lib/clubThemes'
import {
  filterRankingRows,
  normalizeRankingGender,
  sortRankingRows,
  withRankingPositions,
} from '@/lib/ranking'

type IndividualRankingRow = {
  position: number
  player_id: string
  user_id: string
  full_name: string
  email: string | null
  avatar_url: string | null
  category: number | null
  gender: string | null
  ranking_points: number
  tournaments_played: number
  matches_played: number
  wins: number
  losses: number
  titles: number
  finals: number
}

type PairRankingApiRow = {
  partnership_id: string
  pair_key: string
  player1_user_id: string
  player2_user_id: string
  player1_name: string
  player2_name: string
  player1_avatar_url: string | null
  player2_avatar_url: string | null
  player1_points: number
  player2_points: number
  category: number | null
  gender: string | null
  combined_points: number
}

type ClubRankingCategory = { id: number; name: string }

type RankingResponse = {
  meta?: {
    source: string
    individualSource: string
    pairSource: string
    generatedAt: string
    warnings: string[]
  }
  individual?: IndividualRankingRow[]
  pairs?: PairRankingApiRow[]
  categories?: ClubRankingCategory[]
  error?: string
}

const PAMP_CYAN = '#06b6d4'
const PAMP_MAGENTA = '#ec4899'
const PAMP_SOFT = 'rgba(6, 182, 212, 0.12)'
const PAMP_GLOW = 'rgba(6, 182, 212, 0.18)'
function formatUpdatedAt(value?: string | null) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function applyPairPositions(rows: PairRankingApiRow[]): PairRankingRow[] {
  return rows.map((pair) => ({
    ...pair,
    position: rows.findIndex((candidate) => candidate.combined_points === pair.combined_points) + 1,
  }))
}

export default function ClubRankingPage() {
  const { activeClub } = useSession()
  const [view, setView] = useState<'pairs' | 'individual'>('pairs')
  const [category, setCategory] = useState('')
  const [gender, setGender] = useState<'M' | 'F'>('M')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [data, setData] = useState<RankingResponse | null>(null)
  const categoryScrollerRef = useRef<HTMLDivElement>(null)
  const [themeKey, setThemeKey] = useState<string | null>(null)
  const theme = getClubTheme(themeKey)

  async function getToken() {
    const { data: sessionData } = await supabase.auth.getSession()
    return sessionData?.session?.access_token ?? null
  }

  async function loadRanking() {
    if (!activeClub?.id) {
      setData(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setMessage('')
    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setLoading(false)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/ranking`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const json = (await res.json().catch(() => ({}))) as RankingResponse

    if (!res.ok) {
      setMessage(json?.error ?? 'No pude cargar el ranking.')
      setData(null)
      setLoading(false)
      return
    }

    setData(json)
    setLoading(false)
  }

  useEffect(() => {
    void Promise.resolve().then(() => loadRanking())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClub?.id])

  useEffect(() => {
    let alive = true
    async function loadTheme() {
      if (!activeClub?.id) {
        setThemeKey(null)
        return
      }
      const { data: club } = await supabase
        .from('clubs')
        .select('theme_key')
        .eq('id', activeClub.id)
        .maybeSingle()
      if (alive) setThemeKey((club?.theme_key as string | null) ?? null)
    }
    void loadTheme()
    return () => {
      alive = false
    }
  }, [activeClub?.id])

  const availableCategories = useMemo(() => {
    const sourceRows = view === 'pairs' ? (data?.pairs ?? []) : (data?.individual ?? [])
    const used = new Set(sourceRows
      .filter((row) => normalizeRankingGender(row.gender) === gender)
      .map((row) => row.category)
      .filter((value): value is number => typeof value === 'number'))
    const configuredById = new Map((data?.categories ?? []).map((item) => [Number(item.id), item]))
    return Array.from(used)
      .sort((current, next) => current - next)
      .map((id) => configuredById.get(id) ?? { id, name: `${id}°` })
  }, [data?.categories, data?.individual, data?.pairs, gender, view])

  const selectedCategory = availableCategories.some((item) => String(item.id) === category)
    ? category
    : String(availableCategories[0]?.id ?? '')

  const filteredIndividual = useMemo(() => {
    const rows = data?.individual ?? []
    return filterRankingRows(rows, { category: selectedCategory || 'all', gender: 'all', query })
  }, [data?.individual, query, selectedCategory])

  const rankingsByGender = useMemo(() => {
    return {
      M: filteredIndividual
        .filter((player) => normalizeRankingGender(player.gender) === 'M'),
      F: filteredIndividual
        .filter((player) => normalizeRankingGender(player.gender) === 'F'),
    } satisfies Record<'M' | 'F', IndividualRankingRow[]>
  }, [filteredIndividual])

  const sortedRankingsByGender = useMemo(() => {
    return {
      M: sortRankingRows(rankingsByGender.M),
      F: sortRankingRows(rankingsByGender.F),
    }
  }, [rankingsByGender])

  const rankingBoardColumns = useMemo(() => {
    return [{
      gender,
      rows: withRankingPositions(sortedRankingsByGender[gender], 'genderPosition').map((player) => ({
        id: player.user_id,
        name: player.full_name,
        avatarUrl: player.avatar_url,
        category: player.category,
        gender: player.gender,
        points: player.ranking_points,
        position: player.genderPosition,
        isTied: player.isTied,
        href: `/club/jugadores/${player.user_id}`,
      } satisfies RankingBoardRow)),
    }]
  }, [gender, sortedRankingsByGender])

  const pairRows = useMemo<PairRankingRow[]>(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('es-AR')
    const rows = (data?.pairs ?? [])
      .filter((pair) => normalizeRankingGender(pair.gender) === gender)
      .filter((pair) => !selectedCategory || String(pair.category ?? '') === selectedCategory)
      .filter((pair) => !normalizedQuery || `${pair.player1_name} ${pair.player2_name}`.toLocaleLowerCase('es-AR').includes(normalizedQuery))
      .sort((current, next) => next.combined_points - current.combined_points || current.pair_key.localeCompare(next.pair_key))

    return applyPairPositions(rows)
  }, [data?.pairs, gender, query, selectedCategory])

  const individualCount = sortedRankingsByGender[gender].length

  return (
    <div className="px-wrap">
      <div
        className={`club-panel club-rankingPage ranking-gender-${gender}`}
        style={{
          ['--club-ranking-accent' as string]: PAMP_CYAN,
          ['--club-ranking-accent-2' as string]: PAMP_MAGENTA,
          ['--club-ranking-soft' as string]: PAMP_SOFT,
          ['--club-ranking-glow' as string]: PAMP_GLOW,
          ['--rank-mobile-glow' as string]: PAMP_GLOW,
          ['--club-theme-accent' as string]: theme.vars.accent,
          ['--club-theme-accent-2' as string]: theme.vars.accent2,
          ['--club-theme-soft' as string]: theme.vars.soft,
          ['--club-theme-glow' as string]: theme.vars.glow,
          ['--club-admin-accent' as string]: theme.vars.accent,
          ['--club-admin-soft' as string]: theme.vars.soft,
        }}
      >
        {!activeClub?.id ? (
          <div className="px-empty">Primero seleccioná un club activo.</div>
        ) : (
          <>
            {message ? <div className="club-rankingAlert club-rankingAlert--danger">{message}</div> : null}

            <header className="club-rankingContentHead">
              <div>
                <span className="club-rankingContentKicker">Competencia del club</span>
                <h2>Ranking del club</h2>
                <p>{activeClub?.name ?? 'Club'} · Actualizado {formatUpdatedAt(data?.meta?.generatedAt)}</p>
              </div>
              <button type="button" className="club-rankingRefresh" onClick={loadRanking} disabled={loading || !activeClub?.id}>
                {loading ? 'Actualizando...' : 'Actualizar'}
              </button>
            </header>

            <div className="club-rankingViewTabs" role="tablist" aria-label="Tipo de ranking">
              <button type="button" role="tab" aria-selected={view === 'pairs'} className={view === 'pairs' ? 'is-active' : ''} onClick={() => setView('pairs')}><UsersRound size={16} aria-hidden="true" />Parejas</button>
              <button type="button" role="tab" aria-selected={view === 'individual'} className={view === 'individual' ? 'is-active' : ''} onClick={() => setView('individual')}><UserRound size={16} aria-hidden="true" />Individual</button>
            </div>

            <RankingGenderTabs
              active={gender}
              counts={view === 'pairs' ? {
                M: (data?.pairs ?? []).filter((pair) => normalizeRankingGender(pair.gender) === 'M').length,
                F: (data?.pairs ?? []).filter((pair) => normalizeRankingGender(pair.gender) === 'F').length,
              } : { M: sortedRankingsByGender.M.length, F: sortedRankingsByGender.F.length }}
              onChange={setGender}
            />

            <section className="club-rankingCategorySection" aria-label="Categorías activas">
              <span className="club-rankingCategoryLabel">Categoría</span>
              {availableCategories.length ? (
                <div className="club-rankingCategoryScroller" id="club-ranking-categories" ref={categoryScrollerRef}>
                  {availableCategories.map((item) => (
                    <button key={item.id} type="button" className={selectedCategory === String(item.id) ? 'is-active' : ''} onClick={() => setCategory(String(item.id))}>
                      {item.id}ª
                    </button>
                  ))}
                </div>
              ) : <p>No hay categorías disponibles para {gender === 'M' ? 'Caballeros' : 'Damas'}.</p>}
            </section>

            {availableCategories.length ? <section className="club-rankingSearchBar">
              <input aria-label={view === 'pairs' ? 'Buscar pareja' : 'Buscar jugador'} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={view === 'pairs' ? 'Buscar pareja...' : 'Buscar jugador...'} />
              <button type="button" aria-controls="club-ranking-categories" onClick={() => {
                const selected = categoryScrollerRef.current?.querySelector<HTMLButtonElement>('button.is-active')
                ;(selected ?? categoryScrollerRef.current?.querySelector<HTMLButtonElement>('button'))?.focus()
              }}>Filtros</button>
            </section> : null}

            {!loading && availableCategories.length ? (
              <div className="club-rankingResultHead">
                <strong>{view === 'pairs' ? `${pairRows.length} parejas` : `${individualCount} jugadores`}</strong>
              </div>
            ) : null}

            {loading ? (
              <div className="px-empty">Cargando ranking...</div>
            ) : !availableCategories.length ? null : view === 'pairs' ? (
              pairRows.length ? <>
                <PairRankingBoard rows={pairRows} />
                <p className="club-rankingPairNote">Los puntos de la pareja corresponden a la suma de los puntos individuales de ambos jugadores.</p>
              </> : <div className="px-empty">{query ? 'No encontramos parejas con esa búsqueda.' : 'No hay parejas activas en esta categoría.'}</div>
            ) : individualCount ? (
              <RankingBoard columns={rankingBoardColumns} className="clubAdminRankingBoard" mobileGender={gender} showMobileTabs={false} showColumnHeader={false} showMetadata={false} />
            ) : <div className="px-empty">{query ? 'No encontramos jugadores con esa búsqueda.' : 'No hay jugadores en esta categoría.'}</div>}

          </>
        )}
      </div>

      <style>{`
        .club-rankingPage {
          display: grid;
          gap: 16px;
          background: rgba(255,255,255,.96);
          border: 1px solid rgba(15,23,42,.08);
          border-radius: 22px;
          box-shadow: 0 22px 60px rgba(15,23,42,.08);
          overflow: visible;
          position: relative;
        }

        .club-rankingPage::before {
          background: linear-gradient(90deg, var(--club-theme-accent), var(--club-theme-accent-2));
          content: "";
          height: 5px;
          inset: 0 0 auto;
          position: absolute;
          z-index: 1;
        }

        .club-rankingHero {
          align-items: flex-start;
          background: linear-gradient(135deg, rgba(248,250,252,.98), var(--club-theme-soft));
          border: 1px solid rgba(15,23,42,.06);
          border-radius: 18px;
          display: flex;
          gap: 16px;
          justify-content: space-between;
          margin-top: 6px;
          padding: 18px;
        }

        .club-rankingHero .club-kicker {
          color: var(--club-theme-accent);
        }

        .club-rankingRefresh {
          background: #061b3a;
          border: 1px solid color-mix(in srgb, var(--club-theme-accent) 42%, transparent);
          border-radius: 999px;
          box-shadow: 0 12px 28px var(--club-theme-glow);
          color: #fff;
          cursor: pointer;
          font: inherit;
          font-size: 0.86rem;
          font-weight: 950;
          min-height: 40px;
          padding: 0 15px;
          transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease;
        }

        .club-rankingRefresh:hover:not(:disabled) {
          border-color: var(--club-theme-accent);
          box-shadow: 0 16px 34px var(--club-theme-glow);
          transform: translateY(-1px);
        }

        .club-rankingRefresh:disabled {
          cursor: not-allowed;
          opacity: 0.62;
        }

        .club-rankingHeroNote {
          color: #64748b;
          font-size: 0.82rem;
          font-weight: 700;
          line-height: 1.35;
          margin: 6px 0 0;
        }

        .club-rankingAlert {
          background: color-mix(in srgb, var(--club-ranking-accent) 8%, white);
          border: 1px solid color-mix(in srgb, var(--club-ranking-accent) 22%, transparent);
          border-radius: 12px;
          color: #17435a;
          display: grid;
          gap: 4px;
          padding: 10px 12px;
        }

        .club-rankingAlert p {
          font-size: 0.82rem;
          font-weight: 650;
          line-height: 1.35;
          margin: 0;
        }

        .club-rankingAlert--danger {
          background: #fff1f2;
          border-color: #fecdd3;
          color: #9f1239;
          font-size: 0.86rem;
          font-weight: 800;
        }

        .club-rankingStats {
          display: grid;
          gap: 10px;
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .club-rankingStats article,
        .club-rankingToolbar,
        .club-rankingCard,
        .club-rankingFootnote {
          background: #ffffff;
          border: 1px solid rgba(15,23,42,.08);
          border-radius: 16px;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.05);
        }

        .club-rankingStats article {
          display: grid;
          gap: 5px;
          padding: 13px;
          position: relative;
          overflow: hidden;
        }

        .club-rankingStats article::before {
          background: linear-gradient(180deg, var(--club-ranking-accent), var(--club-ranking-accent-2));
          border-radius: 999px;
          content: "";
          inset: 12px auto 12px 0;
          position: absolute;
          width: 4px;
        }

        .club-rankingStats span {
          color: #64748b;
          font-size: 0.76rem;
          font-weight: 800;
        }

        .club-rankingStats strong {
          color: #061b3a;
          font-size: 1.45rem;
          font-weight: 950;
          line-height: 1;
        }

        .club-rankingToolbar {
          align-items: end;
          display: grid;
          gap: 14px;
          grid-template-columns: 1fr;
          padding: 12px;
        }

        .club-rankingTabs {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          display: flex;
          gap: 4px;
          padding: 4px;
        }

        .club-rankingTabs button {
          background: transparent;
          border: 0;
          border-radius: 9px;
          color: #64748b;
          cursor: pointer;
          font: inherit;
          font-size: 0.84rem;
          font-weight: 850;
          padding: 8px 11px;
        }

        .club-rankingTabs button.is-active {
          background: #d7f9ff;
          color: #063449;
          box-shadow: inset 0 0 0 1px #7dd9e8;
        }

        .club-rankingFilters {
          display: grid;
          gap: 9px;
          grid-template-columns: 130px minmax(180px, 1fr);
        }

        .club-rankingContentHead {
          align-items: center;
          background: linear-gradient(135deg, #fff, var(--club-theme-soft));
          border: 1px solid color-mix(in srgb, var(--club-theme-accent) 18%, #e2e8f0);
          border-radius: 14px;
          display: flex;
          gap: 12px;
          justify-content: space-between;
          padding: 11px 12px;
          position: relative;
          overflow: hidden;
        }

        .club-rankingContentHead::before {
          background: var(--club-theme-accent);
          content: "";
          inset: 9px auto 9px 0;
          position: absolute;
          width: 3px;
        }

        .club-rankingContentKicker {
          color: var(--club-theme-accent);
          display: block;
          font-size: 9px;
          font-weight: 950;
          letter-spacing: .05em;
          line-height: 1;
          margin-bottom: 4px;
          text-transform: uppercase;
        }

        .club-rankingContentHead h2 {
          color: #17253f;
          font-size: 19px;
          line-height: 1.05;
          margin: 0;
        }

        .club-rankingContentHead p {
          color: #64748b;
          font-size: 11px;
          font-weight: 700;
          margin: 3px 0 0;
        }

        .club-rankingViewTabs,
        .club-rankingPage .rankingGenderTabs {
          background: #f8fafc;
          border: 1px solid #dbe6f0;
          border-radius: 999px;
          box-sizing: border-box;
          display: flex;
          gap: 4px;
          padding: 4px;
          width: 100%;
        }

        .club-rankingViewTabs button {
          align-items: center;
          background: transparent;
          border: 0;
          border-radius: 999px;
          color: #64748b;
          cursor: pointer;
          flex: 1;
          font: inherit;
          font-size: 12px;
          font-weight: 950;
          min-height: 40px;
          padding: 7px 10px;
          display: inline-flex;
          gap: 6px;
          justify-content: center;
        }

        .club-rankingViewTabs button.is-active {
          background: #061b3a;
          box-shadow: 0 10px 22px var(--rank-mobile-glow);
          color: #fff;
        }

        .club-rankingCategorySection {
          display: grid;
          gap: 5px;
          min-width: 0;
          width: 100%;
        }

        .club-rankingCategoryLabel {
          color: #64748b;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: .04em;
          line-height: 1;
          text-transform: uppercase;
        }

        .club-rankingCategoryScroller {
          display: flex;
          gap: 7px;
          max-width: 100%;
          overflow-x: auto;
          overscroll-behavior-inline: contain;
          padding: 1px 1px 5px;
          scrollbar-width: none;
        }

        .club-rankingCategoryScroller::-webkit-scrollbar { display: none; }

        .club-rankingCategoryScroller button {
          background: #fff;
          border: 1px solid #dbe5ef;
          border-radius: 13px;
          color: #475569;
          cursor: pointer;
          flex: 0 0 auto;
          font: inherit;
          font-size: 13px;
          font-weight: 950;
          min-height: 40px;
          min-width: 58px;
          padding-inline: 13px;
        }

        .club-rankingCategoryScroller button.is-active {
          background: #f8fafc;
          color: #061b3a;
        }

        .ranking-gender-M .club-rankingCategoryScroller button.is-active {
          border-color: #06b6d4;
          box-shadow: inset 0 -2px 0 #06b6d4;
        }

        .ranking-gender-F .club-rankingCategoryScroller button.is-active {
          border-color: #ec4899;
          box-shadow: inset 0 -2px 0 #ec4899;
        }

        .club-rankingCategorySection > p {
          color: #64748b;
          font-size: 13px;
          font-weight: 750;
          margin: 0;
          padding: 8px 2px;
        }

        .club-rankingSearchBar {
          display: grid;
          gap: 8px;
          grid-template-columns: minmax(0, 1fr);
        }

        .club-rankingSearchBar input {
          background: #fff;
          border: 1px solid #dbe5ef;
          border-radius: 12px;
          box-sizing: border-box;
          color: #061b3a;
          font: inherit;
          font-size: 16px;
          min-height: 44px;
          padding: 9px 12px;
          width: 100%;
        }

        .club-rankingSearchBar button {
          background: #fff;
          border: 1px solid color-mix(in srgb, var(--club-theme-accent) 30%, #dbe5ef);
          border-radius: 12px;
          color: #061b3a;
          cursor: pointer;
          display: none;
          font: inherit;
          font-size: 12px;
          font-weight: 900;
          min-height: 44px;
          padding-inline: 12px;
        }

        .club-rankingResultHead {
          align-items: center;
          display: flex;
          justify-content: flex-end;
          min-height: 20px;
        }

        .club-rankingResultHead strong {
          color: #64748b;
          font-size: 11px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .club-rankingPairNote {
          color: #64748b;
          font-size: 12px;
          line-height: 1.4;
          margin: 2px auto 0;
          max-width: 920px;
          width: 100%;
        }

        .club-rankingMobileFilters,
        .club-rankingFilterBackdrop {
          display: none;
        }

        .club-rankingFilters label {
          display: grid;
          gap: 5px;
        }

        .club-rankingFilters span {
          color: #64748b;
          font-size: 0.7rem;
          font-weight: 850;
          text-transform: uppercase;
        }

        .club-rankingFilters select,
        .club-rankingFilters input {
          background: #ffffff;
          border: 1px solid #dbe5ef;
          border-radius: 10px;
          color: #061b3a;
          font: inherit;
          font-size: 0.86rem;
          font-weight: 650;
          min-width: 0;
          padding: 9px 10px;
        }

        .club-rankingFilters select:focus,
        .club-rankingFilters input:focus {
          border-color: color-mix(in srgb, var(--club-ranking-accent) 45%, transparent);
          box-shadow: 0 0 0 3px var(--club-ranking-soft);
          outline: none;
        }

        .club-rankingList {
          display: grid;
          gap: 12px;
        }

        .club-rankingBoard {
          display: grid;
          gap: 16px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .club-rankingBoard.is-single {
          grid-template-columns: minmax(0, 1fr);
        }

        .club-rankingColumn {
          background: #ffffff;
          border: 1px solid rgba(15,23,42,.08);
          border-radius: 18px;
          box-shadow: 0 18px 42px rgba(15, 23, 42, 0.07);
          display: grid;
          gap: 10px;
          min-width: 0;
          overflow: visible;
          padding: 12px;
          position: relative;
        }

        .club-rankingColumn::before {
          display: none;
        }

        .club-rankingColumn--cyan::before {
          background: linear-gradient(90deg, var(--club-ranking-accent), var(--club-ranking-accent-2));
        }

        .club-rankingColumn--pink::before {
          background: linear-gradient(90deg, var(--club-ranking-accent-2), var(--club-ranking-accent));
        }

        .club-rankingColumnHeader {
          align-items: center;
          background: linear-gradient(135deg, color-mix(in srgb, var(--club-ranking-accent) 16%, white), rgba(255, 255, 255, 0.98));
          border: 1px solid color-mix(in srgb, var(--club-ranking-accent) 32%, #e2e8f0);
          border-top: 3px solid var(--club-ranking-accent);
          border-radius: 14px;
          box-shadow: 0 10px 22px rgba(15, 23, 42, 0.07);
          display: grid;
          gap: 12px;
          grid-template-columns: minmax(0, 1fr) auto;
          justify-content: space-between;
          padding: 14px;
          position: relative;
          z-index: 2;
          backdrop-filter: blur(12px);
        }

        .club-rankingColumn--pink .club-rankingColumnHeader {
          background: linear-gradient(135deg, color-mix(in srgb, var(--club-ranking-accent-2) 16%, white), rgba(255, 255, 255, 0.98));
          border-color: color-mix(in srgb, var(--club-ranking-accent-2) 32%, #e2e8f0);
          border-top-color: var(--club-ranking-accent-2);
        }

        .club-rankingColumnLabels {
          background: linear-gradient(135deg, color-mix(in srgb, var(--club-ranking-accent) 10%, white), #fff);
          border: 1px solid color-mix(in srgb, var(--club-ranking-accent) 20%, #e2e8f0);
          border-radius: 12px;
          color: #64748b;
          display: grid;
          font-size: 0.66rem;
          font-weight: 950;
          gap: 8px;
          grid-template-columns: 48px minmax(0, 1fr) 82px 64px;
          margin: 0;
          padding: 7px 10px;
          position: sticky;
          top: 76px;
          text-transform: uppercase;
          z-index: 40;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
        }

        .club-rankingColumn--pink .club-rankingColumnLabels {
          background: linear-gradient(135deg, color-mix(in srgb, var(--club-ranking-accent-2) 10%, white), #fff);
          border-color: color-mix(in srgb, var(--club-ranking-accent-2) 20%, #e2e8f0);
        }

        .club-rankingColumnHeader span {
          color: #64748b;
          display: block;
          font-size: 0.7rem;
          font-weight: 900;
          letter-spacing: 0.04em;
          margin-bottom: 2px;
          text-transform: uppercase;
        }

        .club-rankingColumnHeader strong {
          color: #061b3a;
          font-size: 1.2rem;
          font-weight: 900;
          line-height: 1;
        }

        .club-rankingColumnHeader em {
          background: rgba(255,255,255,.86);
          border: 1px solid color-mix(in srgb, var(--club-ranking-accent) 24%, #dbe5ef);
          border-radius: 999px;
          color: #334155;
          font-size: 0.72rem;
          font-style: normal;
          font-weight: 850;
          padding: 7px 9px;
          white-space: nowrap;
        }

        .club-rankingColumn--pink .club-rankingColumnHeader em {
          border-color: color-mix(in srgb, var(--club-ranking-accent-2) 24%, #dbe5ef);
        }

        .club-rankingColumnList {
          display: grid;
          gap: 9px;
          padding: 0;
        }

        .club-rankingColumnList .px-empty {
          align-items: center;
          background: rgba(255,255,255,.94);
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          color: #64748b;
          display: flex;
          font-weight: 850;
          min-height: 64px;
          padding: 14px 12px;
        }

        .club-rankingPlayerRow {
          align-items: center;
          background: #ffffff;
          border: 1px solid #e5edf4;
          border-radius: 15px;
          color: inherit;
          display: grid;
          gap: 11px;
          grid-template-columns: 54px 58px minmax(0, 1fr) 76px;
          min-width: 0;
          overflow: hidden;
          padding: 11px;
          position: relative;
          text-decoration: none;
          transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
        }

        .club-rankingPlayerRow.is-top10 {
          min-height: 88px;
        }

        .club-rankingPlayerRow.is-compact {
          border-radius: 12px;
          gap: 9px;
          grid-template-columns: 46px 42px minmax(0, 1fr) 72px;
          min-height: 58px;
          padding: 8px 10px;
        }

        .club-rankingPlayerRow.is-compact .club-rankingAvatar {
          border-radius: 12px;
          flex-basis: 42px;
          font-size: 0.72rem;
          height: 42px;
          width: 42px;
        }

        .club-rankingPlayerRow.is-compact .club-rankingPlace strong {
          font-size: 1.1rem;
        }

        .club-rankingPlayerRow.is-compact .club-rankingPlace span {
          font-size: 0.66rem;
          min-width: 26px;
          padding: 2px 6px;
        }

        .club-rankingPlayerRow.is-compact .club-rankingPlayerTitle strong {
          font-size: 0.88rem;
        }

        .club-rankingPlayerRow.is-compact .club-rankingPlayerMeta span:not(:first-child),
        .club-rankingPlayerRow.is-compact .club-rankingTopBadge,
        .club-rankingPlayerRow.is-compact .club-rankingTieBadge {
          display: none;
        }

        .club-rankingPlayerRow.is-compact .club-rankingPoints strong {
          font-size: 0.96rem;
        }

        .club-rankingPlayerRow:hover {
          border-color: color-mix(in srgb, var(--club-ranking-accent) 36%, #e2e8f0);
          box-shadow: 0 16px 34px var(--club-ranking-glow);
          transform: translateY(-1px);
        }

        .club-rankingPlayerRow--pink:hover {
          border-color: color-mix(in srgb, var(--club-ranking-accent-2) 36%, #e2e8f0);
        }

        .club-rankingPlayerRow.is-podium {
          border-color: color-mix(in srgb, var(--club-ranking-accent) 42%, #e2e8f0);
          background:
            radial-gradient(circle at 0 0, var(--club-ranking-soft), transparent 42%),
            #fff;
        }

        .club-rankingPlayerRow--pink.is-podium {
          border-color: color-mix(in srgb, var(--club-ranking-accent-2) 42%, #e2e8f0);
        }

        .club-rankingPlayerRow.is-leader {
          background: #fbfeff;
          box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--club-ranking-accent) 34%, transparent), 0 16px 38px var(--club-ranking-glow);
        }

        .club-rankingPlayerRow--pink.is-leader {
          background: #fffafd;
          box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--club-ranking-accent-2) 34%, transparent), 0 16px 38px var(--club-ranking-glow);
        }

        .club-rankingPairRail {
          background: #35d3e4;
          border-radius: 999px;
          bottom: 9px;
          left: 4px;
          position: absolute;
          top: 9px;
          width: 3px;
        }

        .club-rankingPlayerRow--pink .club-rankingPairRail {
          background: #f05aa9;
        }

        .club-rankingPlace {
          align-items: center;
          display: grid;
          gap: 4px;
          justify-items: center;
        }

        .club-rankingPlace strong {
          color: #061b3a;
          font-size: 1.5rem;
          font-weight: 900;
          line-height: 1;
        }

        .club-rankingPlace span {
          background: #f1f5f9;
          border-radius: 999px;
          color: #64748b;
          font-size: 0.75rem;
          font-weight: 900;
          min-width: 30px;
          padding: 3px 7px;
          text-align: center;
        }

        .club-rankingPlayerMain {
          display: grid;
          gap: 6px;
          min-width: 0;
        }

        .club-rankingPlayerTitle {
          align-items: center;
          display: flex;
          gap: 7px;
          min-width: 0;
        }

        .club-rankingPlayerTitle strong {
          color: #061b3a;
          font-size: 0.98rem;
          font-weight: 900;
          line-height: 1.12;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .club-rankingCrown,
        .club-rankingTopBadge,
        .club-rankingTieBadge {
          border-radius: 999px;
          flex: 0 0 auto;
          font-size: 0.66rem;
          font-weight: 900;
          padding: 4px 7px;
        }

        .club-rankingCrown {
          background: #fff3c4;
          color: #8a5200;
        }

        .club-rankingTopBadge {
          background: color-mix(in srgb, var(--club-ranking-accent) 10%, white);
          color: var(--club-ranking-accent);
        }

        .club-rankingTieBadge {
          background: #f8fafc;
          border: 1px solid #dbe5ef;
          color: #64748b;
        }

        .club-rankingPlayerRow--pink .club-rankingTopBadge {
          background: color-mix(in srgb, var(--club-ranking-accent-2) 10%, white);
          color: var(--club-ranking-accent-2);
        }

        .club-rankingPlayerMeta {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }

        .club-rankingPlayerMeta span {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 999px;
          color: #475569;
          font-size: 0.68rem;
          font-weight: 850;
          line-height: 1;
          max-width: 100%;
          overflow: hidden;
          padding: 6px 7px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .club-rankingPairBadge {
          background: #ecfeff !important;
          border-color: #bae6fd !important;
          color: #0e7490 !important;
        }

        .club-rankingPlayerRow--pink .club-rankingPairBadge {
          background: #fff0f7 !important;
          border-color: #fbcfe8 !important;
          color: #be185d !important;
        }

        .club-rankingPoints {
          display: grid;
          justify-items: end;
          min-width: 70px;
          text-align: right;
        }

        .club-rankingPoints strong {
          color: #061b3a;
          font-size: 1.1rem;
          font-weight: 900;
          line-height: 1;
          white-space: nowrap;
        }

        .club-rankingPoints span {
          color: #64748b;
          font-size: 0.68rem;
          font-weight: 900;
          text-transform: uppercase;
        }

        .club-rankingCard {
          align-items: stretch;
          border-color: #dbe7ef;
          display: grid;
          gap: 14px;
          grid-template-columns: 90px minmax(260px, 1.35fr) 142px minmax(300px, 1fr);
          overflow: hidden;
          padding: 14px;
          position: relative;
          transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
        }

        .club-rankingCard::before {
          background: #65dce8;
          content: "";
          inset: 0 auto 0 0;
          position: absolute;
          width: 4px;
        }

        .club-rankingCard:hover {
          border-color: #9ee7f0;
          box-shadow: 0 18px 42px rgba(15, 23, 42, 0.11);
          transform: translateY(-1px);
        }

        .club-rankingCard--pair::before {
          background: #0f172a;
        }

        .club-rankingRank {
          align-items: flex-start;
          background: #0f172a;
          border-radius: 12px;
          color: #0f172a;
          display: grid;
          gap: 5px;
          justify-items: start;
          padding: 12px;
        }

        .club-rankingRank span {
          color: rgba(255, 255, 255, 0.66);
          font-size: 0.66rem;
          font-weight: 850;
          text-transform: uppercase;
        }

        .club-rankingRank strong {
          color: #ffffff;
          font-size: 1.85rem;
          font-weight: 900;
          letter-spacing: 0;
          line-height: 0.95;
        }

        .club-rankingRank em {
          background: #d7f9ff;
          border-radius: 999px;
          color: #063449;
          font-size: 0.68rem;
          font-style: normal;
          font-weight: 900;
          padding: 5px 7px;
        }

        .club-rankingIdentity {
          align-items: center;
          display: flex;
          gap: 12px;
          min-width: 0;
        }

        .club-rankingAvatar {
          align-items: center;
          background: #0f172a;
          border: 2px solid #ffffff;
          border-radius: 16px;
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.16);
          color: #ffffff;
          display: inline-flex;
          flex: 0 0 54px;
          font-size: 0.9rem;
          font-weight: 900;
          height: 54px;
          justify-content: center;
          overflow: hidden;
          position: relative;
          width: 54px;
        }

        .club-rankingAvatar img {
          object-fit: cover;
        }

        .club-rankingPairAvatars {
          display: flex;
          flex: 0 0 auto;
        }

        .club-rankingPairAvatars .club-rankingAvatar + .club-rankingAvatar {
          margin-left: -15px;
        }

        .club-rankingIdentity > div:last-child {
          display: grid;
          gap: 6px;
          min-width: 0;
        }

        .club-rankingNameLine {
          align-items: center;
          display: flex;
          gap: 8px;
          min-width: 0;
        }

        .club-rankingNameLine strong,
        .club-rankingPairNames strong {
          color: #061b3a;
          font-size: 1.04rem;
          font-weight: 900;
          line-height: 1.15;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .club-rankingStatus {
          background: #ecfdf5;
          border: 1px solid #bbf7d0;
          border-radius: 999px;
          color: #047857;
          flex: 0 0 auto;
          font-size: 0.67rem;
          font-weight: 900;
          padding: 4px 7px;
          text-transform: uppercase;
        }

        .club-rankingIdentity > div:last-child > span {
          color: #64748b;
          font-size: 0.76rem;
          font-weight: 650;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .club-rankingPairNames {
          display: grid;
          gap: 2px;
        }

        .club-rankingChips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .club-rankingChips span {
          background: #f7fbfd;
          border: 1px solid #dceaf1;
          border-radius: 999px;
          color: #2f4b63;
          font-size: 0.72rem;
          font-weight: 850;
          padding: 6px 8px;
        }

        .club-rankingScoreBlock {
          align-content: center;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 13px;
          display: grid;
          gap: 3px;
          padding: 11px;
        }

        .club-rankingScoreBlock span,
        .club-rankingScoreBlock small {
          color: #64748b;
          font-size: 0.68rem;
          font-weight: 850;
          text-transform: uppercase;
        }

        .club-rankingScoreBlock strong {
          color: #061b3a;
          font-size: 1.55rem;
          font-weight: 900;
          line-height: 1;
        }

        .club-rankingScoreBlock small {
          text-transform: none;
        }

        .club-rankingPerformance {
          align-items: stretch;
          display: grid;
          gap: 8px;
          grid-template-columns: repeat(5, minmax(0, 1fr));
        }

        .club-rankingCard--pair .club-rankingPerformance {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .club-rankingPerformance div {
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          display: grid;
          gap: 3px;
          justify-items: center;
          min-width: 0;
          padding: 10px 8px;
          text-align: center;
        }

        .club-rankingPerformance strong {
          color: #061b3a;
          font-size: 0.95rem;
          font-weight: 900;
          line-height: 1;
        }

        .club-rankingPerformance span {
          color: #475569;
          font-size: 0.66rem;
          font-weight: 800;
          text-transform: uppercase;
        }

        .club-rankingFootnote {
          color: #64748b;
          font-size: 0.82rem;
          font-weight: 650;
          line-height: 1.4;
          padding: 12px;
        }

        @media (max-width: 1020px) {
          .club-rankingHero,
          .club-rankingToolbar {
            align-items: stretch;
            display: flex;
            flex-direction: column;
          }

          .club-rankingStats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .club-rankingFilters {
            grid-template-columns: 1fr;
          }

          .club-rankingBoard,
          .club-rankingBoard.is-single {
            grid-template-columns: 1fr;
          }

          .club-rankingCard,
          .club-rankingCard--pair {
            grid-template-columns: 84px 1fr;
          }

          .club-rankingScoreBlock,
          .club-rankingPerformance {
            grid-column: 2;
          }

          .club-rankingPerformance,
          .club-rankingCard--pair .club-rankingPerformance {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 820px) {
          .club-rankingBoard.mobile-gender-M .club-rankingColumn[data-ranking-gender="F"],
          .club-rankingBoard.mobile-gender-F .club-rankingColumn[data-ranking-gender="M"] {
            display: none;
          }
        }

        @media (max-width: 560px) {
          .club-rankingPage {
            background: transparent;
            border: 0;
            border-radius: 0;
            box-shadow: none;
            gap: 7px;
            grid-template-columns: minmax(0, 1fr);
            padding: 0;
          }

          .club-rankingPage::before {
            display: none;
          }

          .club-rankingHero {
            align-items: center;
            border-radius: 14px;
            flex-direction: row;
            gap: 10px;
            margin-top: 0;
            padding: 11px 12px;
          }

          .club-rankingContentHead {
            min-height: 48px;
            padding: 6px 9px;
          }

          .club-rankingContentHead > div {
            flex: 1 1 auto;
            min-width: 0;
          }

          .club-rankingContentHead h2 { font-size: 17px; }
          .club-rankingContentHead p {
            max-width: 190px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .club-rankingHero .club-title {
            font-size: 22px;
            white-space: nowrap;
          }

          .club-rankingHero .club-sub,
          .club-rankingHeroNote {
            display: none;
          }

          .club-rankingRefresh {
            flex: 0 0 auto;
            font-size: 0.76rem;
            min-height: 40px;
            padding: 0 10px;
          }

          .club-rankingViewTabs {
            padding: 3px;
          }

          .club-rankingViewTabs button {
            min-height: 38px;
            padding-block: 5px;
          }

          .club-rankingPage .rankingGenderTabs {
            background: transparent;
            border: 0;
            border-radius: 0;
            gap: 6px;
            padding: 0;
          }

          .club-rankingPage .rankingGenderTabs button {
            background: transparent;
            border: 1px solid #dbe5ef;
            border-bottom-width: 2px;
            box-shadow: none;
            color: #64748b;
            min-height: 38px;
            padding: 5px 9px;
          }

          .club-rankingPage .rankingGenderTabs button.is-active {
            background: #fff;
            color: #061b3a;
          }

          .club-rankingPage .rankingGenderTabs button:first-child.is-active {
            border-color: #06b6d4;
            box-shadow: inset 0 -2px 0 #06b6d4;
          }

          .club-rankingPage .rankingGenderTabs button:last-child.is-active {
            border-color: #ec4899;
            box-shadow: inset 0 -2px 0 #ec4899;
          }

          .club-rankingPage .rankingGenderTabs button small {
            background: rgba(255, 255, 255, .72);
            color: #475569;
            font-size: 9px;
            padding: 3px 5px;
          }

          .club-rankingPage .rankingGenderTabs button:first-child.is-active small {
            background: rgba(6, 182, 212, .1);
            color: #0e7490;
          }

          .club-rankingPage .rankingGenderTabs button:last-child.is-active small {
            background: rgba(236, 72, 153, .1);
            color: #be185d;
          }

          .club-rankingCategoryScroller {
            gap: 6px;
            padding-bottom: 2px;
          }

          .club-rankingCategoryScroller button {
            flex-basis: auto;
            min-height: 38px;
            min-width: 58px;
          }

          .club-rankingCategorySection > p {
            font-size: 11px;
            padding: 3px 2px;
          }

          .club-rankingSearchBar {
            grid-template-columns: minmax(0, 1fr) auto;
          }

          .club-rankingSearchBar button {
            display: block;
          }

          .club-rankingResultHead {
            min-height: 16px;
          }

          .club-rankingStats {
            gap: 5px;
          }

          .club-rankingStats article {
            border-radius: 12px;
            gap: 3px;
            padding: 9px 10px;
          }

          .club-rankingStats article::before {
            inset-block: 9px;
          }

          .club-rankingStats strong {
            font-size: 1.2rem;
          }

          .club-rankingStats {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .club-rankingStats span {
            font-size: .62rem;
            line-height: 1.05;
          }

          .club-rankingToolbar {
            background: transparent;
            border: 0;
            border-radius: 0;
            box-sizing: border-box;
            box-shadow: none;
            min-width: 0;
            padding: 0;
            width: 100%;
          }

          .club-rankingFilters {
            display: none;
          }

          .club-rankingMobileFilters {
            display: grid;
            gap: 8px;
            grid-template-columns: minmax(0, 1fr) auto;
            min-width: 0;
            width: 100%;
          }

          .club-rankingMobileFilters input {
            background: #fff;
            border: 1px solid #dbe5ef;
            border-radius: 12px;
            box-sizing: border-box;
            color: #061b3a;
            font: inherit;
            font-size: 16px;
            height: 44px;
            min-width: 0;
            padding: 9px 11px;
            width: 100%;
          }

          .club-rankingMobileFilters button {
            align-items: center;
            background: #fff;
            border: 1px solid color-mix(in srgb, var(--club-theme-accent) 30%, #dbe5ef);
            border-radius: 12px;
            color: #061b3a;
            display: inline-flex;
            font: inherit;
            font-size: 13px;
            font-weight: 900;
            gap: 6px;
            min-height: 44px;
            padding: 8px 12px;
          }

          .club-rankingMobileFilters button span {
            align-items: center;
            background: var(--club-theme-soft);
            border-radius: 999px;
            display: inline-flex;
            font-size: 10px;
            height: 20px;
            justify-content: center;
            min-width: 20px;
          }

          .club-rankingFilterBackdrop {
            align-items: end;
            background: rgba(2, 8, 23, .42);
            display: flex;
            inset: 0;
            position: fixed;
            z-index: 80;
          }

          .club-rankingFilterSheet {
            background: #fff;
            border-radius: 20px 20px 0 0;
            box-shadow: 0 -20px 50px rgba(2, 8, 23, .18);
            box-sizing: border-box;
            display: grid;
            gap: 14px;
            padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
            width: 100%;
          }

          .club-rankingFilterSheetHead {
            align-items: center;
            display: flex;
            justify-content: space-between;
          }

          .club-rankingFilterSheetHead h2 {
            color: #17253f;
            font-size: 22px;
            margin: 0;
          }

          .club-rankingFilterSheetHead button {
            align-items: center;
            background: #f1f5f9;
            border: 0;
            border-radius: 999px;
            color: #17253f;
            display: flex;
            font-size: 24px;
            height: 40px;
            justify-content: center;
            width: 40px;
          }

          .club-rankingFilterSheet label {
            display: grid;
            gap: 5px;
          }

          .club-rankingFilterSheet label span {
            color: #64748b;
            font-size: 10px;
            font-weight: 900;
            text-transform: uppercase;
          }

          .club-rankingFilterSheet select {
            background: #fff;
            border: 1px solid #dbe5ef;
            border-radius: 12px;
            color: #061b3a;
            font: inherit;
            font-size: 16px;
            min-height: 46px;
            padding: 9px 11px;
          }

          .club-rankingFilterSheetActions {
            display: grid;
            gap: 8px;
            grid-template-columns: 1fr 1.4fr;
          }

          .club-rankingFilterSheetActions button {
            background: #fff;
            border: 1px solid color-mix(in srgb, var(--club-theme-accent) 34%, #dbe5ef);
            border-radius: 999px;
            color: #061b3a;
            font: inherit;
            font-size: 13px;
            font-weight: 900;
            min-height: 44px;
          }

          .club-rankingFilterSheetActions button:last-child {
            background: #061b3a;
            color: #fff;
          }

          .club-rankingTabs {
            width: 100%;
          }

          .club-rankingTabs button {
            flex: 1;
          }

          .club-rankingCard,
          .club-rankingCard--pair {
            gap: 11px;
            grid-template-columns: 1fr;
            padding: 12px;
          }

          .club-rankingColumnHeader {
            padding: 15px 14px 12px;
          }

          .club-rankingColumnLabels {
            gap: 6px;
            grid-template-columns: 32px minmax(0, 1fr) 56px 64px;
            padding: 6px 8px;
            top: 64px;
          }

          .club-rankingPlayerRow {
            border-radius: 12px;
            gap: 7px;
            grid-template-columns: 22px 28px minmax(0, 1fr) minmax(84px, max-content);
            min-height: 46px;
            overflow: visible;
            padding: 6px 7px;
          }

          .club-rankingPlayerRow .club-rankingAvatar {
            border-radius: 12px;
            flex-basis: 28px;
            height: 28px;
            width: 28px;
          }

          .club-rankingPlace strong {
            font-size: 1rem;
          }

          .club-rankingPlace span,
          .club-rankingCrown,
          .club-rankingTopBadge,
          .club-rankingTieBadge {
            display: none;
          }

          .club-rankingPoints {
            grid-column: 4;
            grid-row: 1;
            justify-items: end;
            min-width: 84px;
            white-space: nowrap;
          }

          .club-rankingPoints strong {
            font-size: 1rem;
          }

          .club-rankingPoints span {
            font-size: 0.6rem;
          }

          .club-rankingPlayerTitle strong {
            font-size: 0.8rem;
            line-height: 1.12;
            overflow: visible;
            text-overflow: clip;
            white-space: normal;
          }

          .club-rankingPlayerMeta span {
            font-size: 0.6rem;
            padding: 3px 5px;
          }

          .club-rankingRank,
          .club-rankingScoreBlock,
          .club-rankingPerformance {
            grid-column: auto;
          }

          .club-rankingRank {
            align-items: center;
            display: flex;
            justify-content: space-between;
          }

          .club-rankingRank strong {
            font-size: 1.45rem;
          }

          .club-rankingIdentity {
            align-items: flex-start;
          }

          .club-rankingNameLine {
            align-items: flex-start;
            flex-direction: column;
            gap: 5px;
          }

          .club-rankingPerformance,
          .club-rankingCard--pair .club-rankingPerformance {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      `}</style>
    </div>
  )
}
