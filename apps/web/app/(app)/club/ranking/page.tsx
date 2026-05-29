'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useSession } from '@/components/session/SessionProvider'
import { getClubInitials } from '@/lib/clubAssets'

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

type PairRankingRow = {
  position: number
  pair_key: string
  player1_user_id: string
  player2_user_id: string
  player1_name: string
  player2_name: string
  player1_avatar_url: string | null
  player2_avatar_url: string | null
  category: number | null
  gender: string | null
  combined_points: number
  tournaments_together: number
  matches_played: number
  wins: number
  losses: number
  best_result: string
  latest_tournament_at: string | null
}

type RankingResponse = {
  meta?: {
    source: string
    individualSource: string
    pairSource: string
    generatedAt: string
    warnings: string[]
  }
  individual?: IndividualRankingRow[]
  pairs?: PairRankingRow[]
  error?: string
}

const categoryOptions = [
  { value: 'all', label: 'Todas' },
  { value: '1', label: '1ra' },
  { value: '2', label: '2da' },
  { value: '3', label: '3ra' },
  { value: '4', label: '4ta' },
  { value: '5', label: '5ta' },
  { value: '6', label: '6ta' },
  { value: '7', label: '7ma' },
]

const genderOptions = [
  { value: 'all', label: 'Todos' },
  { value: 'M', label: 'Masculino' },
  { value: 'F', label: 'Femenino' },
  { value: 'MIXED', label: 'Mixto' },
]

function formatCategory(value?: number | null) {
  if (!value) return 'Sin categoría'
  return categoryOptions.find((option) => option.value === String(value))?.label ?? `${value}`
}

function formatGender(value?: string | null) {
  const normalized = String(value ?? '').toUpperCase()
  if (normalized === 'M' || normalized === 'MALE') return 'Masculino'
  if (normalized === 'F' || normalized === 'FEMALE') return 'Femenino'
  if (normalized === 'MIXED') return 'Mixto'
  return 'Sin género'
}

function normalizeGender(value?: string | null) {
  const normalized = String(value ?? '').toUpperCase()
  if (normalized === 'MALE') return 'M'
  if (normalized === 'FEMALE') return 'F'
  return normalized || 'UNKNOWN'
}

function matchesSearch(value: string, query: string) {
  return value.toLowerCase().includes(query.trim().toLowerCase())
}

function PlayerAvatar({ name, src }: { name: string; src?: string | null }) {
  return (
    <span className="club-rankingAvatar">
      {src ? <Image src={src} alt={name} fill sizes="38px" /> : getClubInitials(name)}
    </span>
  )
}

function getTopBadge(position: number) {
  if (position === 1) return 'Líder'
  if (position <= 3) return 'Podio'
  if (position <= 10) return 'Top 10'
  return null
}

function withVisualPositions(rows: IndividualRankingRow[]) {
  const pointCounts = new Map<number, number>()
  rows.forEach((row) => pointCounts.set(row.ranking_points, (pointCounts.get(row.ranking_points) ?? 0) + 1))

  let lastPoints: number | null = null
  let lastPosition = 0
  return rows.map((row, index) => {
    const position = lastPoints === row.ranking_points ? lastPosition : index + 1
    lastPoints = row.ranking_points
    lastPosition = position
    return {
      ...row,
      genderPosition: position,
      isTied: (pointCounts.get(row.ranking_points) ?? 0) > 1,
    }
  })
}

function formatUpdatedAt(value?: string | null) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function getGenderColumnLabel(gender: 'M' | 'F') {
  return gender === 'M' ? 'Masculino' : 'Femenino'
}

export default function ClubRankingPage() {
  const { activeClub } = useSession()
  const [category, setCategory] = useState('all')
  const [gender, setGender] = useState('all')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [data, setData] = useState<RankingResponse | null>(null)
  const showTechnicalWarnings = process.env.NODE_ENV === 'development'

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

  const filteredIndividual = useMemo(() => {
    const rows = data?.individual ?? []
    return rows.filter((row) => {
      if (category !== 'all' && String(row.category ?? '') !== category) return false
      if (gender !== 'all' && normalizeGender(row.gender) !== gender) return false
      if (query.trim() && !matchesSearch(`${row.full_name} ${row.email ?? ''}`, query)) return false
      return true
    })
  }, [data?.individual, category, gender, query])

  const summary = useMemo(() => {
    const individual = data?.individual ?? []
    const pairs = data?.pairs ?? []
    return {
      players: individual.length,
      pairs: pairs.length,
      points: individual.reduce((total, row) => total + row.ranking_points, 0),
      matches: individual.reduce((total, row) => total + row.matches_played, 0),
    }
  }, [data])

  const visibleColumns = useMemo(() => {
    if (gender === 'M') return ['M'] as const
    if (gender === 'F') return ['F'] as const
    return ['M', 'F'] as const
  }, [gender])

  const rankingsByGender = useMemo(() => {
    return {
      M: filteredIndividual
        .filter((player) => normalizeGender(player.gender) === 'M')
        .sort((a, b) => b.ranking_points - a.ranking_points || a.full_name.localeCompare(b.full_name)),
      F: filteredIndividual
        .filter((player) => normalizeGender(player.gender) === 'F')
        .sort((a, b) => b.ranking_points - a.ranking_points || a.full_name.localeCompare(b.full_name)),
    }
  }, [filteredIndividual])

  function renderPlayerRow(player: IndividualRankingRow & { genderPosition: number; isTied: boolean }, accent: 'cyan' | 'pink') {
    const topBadge = getTopBadge(player.genderPosition)
    const isTopTen = player.genderPosition <= 10

    return (
      <Link
        href={`/club/jugadores/${player.user_id}`}
        className={[
          'club-rankingPlayerRow',
          `club-rankingPlayerRow--${accent}`,
          isTopTen ? 'is-top10' : 'is-compact',
          player.genderPosition === 1 ? 'is-leader' : '',
          player.genderPosition <= 3 ? 'is-podium' : '',
        ].filter(Boolean).join(' ')}
        key={player.user_id}
      >
        <div className="club-rankingPlace">
          <strong>{player.genderPosition}</strong>
          <span>—</span>
        </div>

        <PlayerAvatar name={player.full_name} src={player.avatar_url} />

        <div className="club-rankingPlayerMain">
          <div className="club-rankingPlayerTitle">
            <strong>{player.full_name}</strong>
            {player.genderPosition === 1 ? <span className="club-rankingCrown">#1</span> : null}
            {topBadge && player.genderPosition !== 1 ? <span className="club-rankingTopBadge">{topBadge}</span> : null}
            {player.isTied ? <span className="club-rankingTieBadge">Empate</span> : null}
          </div>
          <div className="club-rankingPlayerMeta">
            <span>{formatCategory(player.category)}</span>
            <span>{formatGender(player.gender)}</span>
          </div>
        </div>

        <div className="club-rankingPoints">
          <strong>{player.ranking_points}</strong>
          <span>pts</span>
        </div>
      </Link>
    )
  }

  return (
    <div className="club-shell">
      <div className="club-panel club-rankingPage">
        <header className="club-rankingHero">
          <div>
            <span className="club-kicker">Ranking derivado</span>
            <h1 className="club-title">Ranking interno</h1>
            <p className="club-sub">
              {activeClub?.name ?? 'Club'} · Actualizado {formatUpdatedAt(data?.meta?.generatedAt)}
            </p>
            <p className="club-rankingHeroNote">Ranking derivado de resultados de torneos finalizados.</p>
          </div>
          <button type="button" className="club-rankingRefresh" onClick={loadRanking} disabled={loading || !activeClub?.id}>
            {loading ? 'Actualizando...' : 'Actualizar'}
          </button>
        </header>

        {!activeClub?.id ? (
          <div className="px-empty">Primero seleccioná un club activo.</div>
        ) : (
          <>
            {message ? <div className="club-rankingAlert club-rankingAlert--danger">{message}</div> : null}

            {showTechnicalWarnings && (data?.meta?.warnings ?? []).length > 0 ? (
              <div className="club-rankingAlert">
                {(data?.meta?.warnings ?? []).map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            ) : null}

            <section className="club-rankingStats" aria-label="Resumen de ranking">
              <article>
                <span>Total jugadores</span>
                <strong>{summary.players}</strong>
              </article>
              <article>
                <span>Masculino</span>
                <strong>{rankingsByGender.M.length}</strong>
              </article>
              <article>
                <span>Femenino</span>
                <strong>{rankingsByGender.F.length}</strong>
              </article>
              <article>
                <span>Puntos totales</span>
                <strong>{summary.points}</strong>
              </article>
            </section>

            <section className="club-rankingToolbar">
              <div className="club-rankingFilters">
                <label>
                  <span>Categoría</span>
                  <select value={category} onChange={(event) => setCategory(event.target.value)}>
                    {categoryOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Género</span>
                  <select value={gender} onChange={(event) => setGender(event.target.value)}>
                    {genderOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="club-rankingSearch">
                  <span>Búsqueda</span>
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Jugador o pareja" />
                </label>
              </div>
            </section>

            {loading ? (
              <div className="px-empty">Cargando ranking...</div>
            ) : (
              <section className={`club-rankingBoard ${visibleColumns.length === 1 ? 'is-single' : ''}`} aria-label="Ranking individual por género">
                {visibleColumns.map((columnGender) => {
                  const accent = columnGender === 'M' ? 'cyan' : 'pink'
                  const rows = withVisualPositions(rankingsByGender[columnGender])
                  return (
                    <article className={`club-rankingColumn club-rankingColumn--${accent}`} key={columnGender}>
                      <header className="club-rankingColumnHeader">
                        <div>
                          <span>Ranking</span>
                          <strong>{getGenderColumnLabel(columnGender)}</strong>
                        </div>
                        <em>{rows.length} jugadores</em>
                      </header>
                      <div className="club-rankingColumnList">
                        {rows.length === 0 ? (
                          <div className="px-empty">Sin jugadores para los filtros seleccionados.</div>
                        ) : (
                          rows.map((player) => renderPlayerRow(player, accent))
                        )}
                      </div>
                    </article>
                  )
                })}
              </section>
            )}

            <footer className="club-rankingFootnote">
              El perfil completo del jugador queda para la siguiente capa. Esta vista ya deja identificados los `user_id`
              para abrir perfiles sin cambiar el modelo actual.
            </footer>
          </>
        )}
      </div>

      <style>{`
        .club-rankingPage {
          display: grid;
          gap: 16px;
        }

        .club-rankingHero {
          align-items: flex-start;
          display: flex;
          gap: 16px;
          justify-content: space-between;
        }

        .club-rankingRefresh {
          background: #d7f9ff;
          border: 1px solid #7dd9e8;
          border-radius: 10px;
          color: #063449;
          cursor: pointer;
          font: inherit;
          font-size: 0.86rem;
          font-weight: 850;
          padding: 10px 13px;
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
          background: #effaff;
          border: 1px solid #bfecf7;
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
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .club-rankingStats article,
        .club-rankingToolbar,
        .club-rankingCard,
        .club-rankingFootnote {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.05);
        }

        .club-rankingStats article {
          display: grid;
          gap: 5px;
          padding: 13px;
        }

        .club-rankingStats span {
          color: #64748b;
          font-size: 0.76rem;
          font-weight: 800;
        }

        .club-rankingStats strong {
          color: #061b3a;
          font-size: 1.45rem;
          font-weight: 850;
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
          grid-template-columns: 130px 130px minmax(180px, 1fr);
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
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          box-shadow: 0 18px 42px rgba(15, 23, 42, 0.07);
          min-width: 0;
          overflow: visible;
          position: relative;
        }

        .club-rankingColumn::before {
          border-radius: 18px 18px 0 0;
          content: "";
          height: 4px;
          inset: 0 0 auto;
          position: absolute;
        }

        .club-rankingColumn--cyan::before {
          background: #35d3e4;
        }

        .club-rankingColumn--pink::before {
          background: #f05aa9;
        }

        .club-rankingColumnHeader {
          align-items: center;
          background: rgba(255, 255, 255, 0.92);
          border-bottom: 1px solid #e2e8f0;
          border-radius: 18px 18px 0 0;
          display: flex;
          gap: 12px;
          justify-content: space-between;
          padding: 18px 18px 14px;
          position: sticky;
          top: 84px;
          z-index: 3;
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
          background: #f8fafc;
          border: 1px solid #dbe5ef;
          border-radius: 999px;
          color: #475569;
          font-size: 0.72rem;
          font-style: normal;
          font-weight: 850;
          padding: 7px 9px;
          white-space: nowrap;
        }

        .club-rankingColumnList {
          display: grid;
          gap: 9px;
          padding: 12px;
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
          border-color: #9ee7f0;
          box-shadow: 0 16px 34px rgba(15, 23, 42, 0.11);
          transform: translateY(-1px);
        }

        .club-rankingPlayerRow--pink:hover {
          border-color: #f7b2d8;
        }

        .club-rankingPlayerRow.is-podium {
          border-color: #bfeaf1;
        }

        .club-rankingPlayerRow--pink.is-podium {
          border-color: #f6c4dd;
        }

        .club-rankingPlayerRow.is-leader {
          background: #fbfeff;
          box-shadow: inset 0 0 0 1px rgba(53, 211, 228, 0.35), 0 14px 36px rgba(15, 23, 42, 0.08);
        }

        .club-rankingPlayerRow--pink.is-leader {
          background: #fffafd;
          box-shadow: inset 0 0 0 1px rgba(240, 90, 169, 0.28), 0 14px 36px rgba(15, 23, 42, 0.08);
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
          background: #eafaff;
          color: #08758f;
        }

        .club-rankingTieBadge {
          background: #f8fafc;
          border: 1px solid #dbe5ef;
          color: #64748b;
        }

        .club-rankingPlayerRow--pink .club-rankingTopBadge {
          background: #fff0f7;
          color: #be185d;
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

          .club-rankingColumnHeader {
            top: 72px;
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

        @media (max-width: 560px) {
          .club-rankingStats {
            grid-template-columns: 1fr;
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
            top: 64px;
          }

          .club-rankingPlayerRow {
            grid-template-columns: 42px 48px minmax(0, 1fr);
          }

          .club-rankingPlayerRow .club-rankingAvatar {
            border-radius: 14px;
            flex-basis: 48px;
            height: 48px;
            width: 48px;
          }

          .club-rankingPoints {
            grid-column: 3;
            justify-items: start;
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
