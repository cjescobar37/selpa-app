'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Crown, TrendingUp } from 'lucide-react'
import RankingPlayerAvatar from '@/components/ranking/RankingPlayerAvatar'
import { useSession } from '@/components/session/SessionProvider'
import {
  formatRankingCategory,
  formatRankingGender,
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
  matches_played: number
  wins: number
  losses: number
  titles: number
}

type RankingResponse = {
  individual?: RankingRow[]
  meta?: { generatedAt?: string }
  error?: string
}

const PAMP_CYAN = '#06b6d4'
const PAMP_MAGENTA = '#ec4899'
const PAMP_GLOW = 'rgba(6, 182, 212, 0.18)'

function formatDate(value?: string | null) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(value))
}

export default function PlayerMyRankingPage() {
  const session = useSession()
  const [data, setData] = useState<RankingResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let alive = true

    async function loadRanking() {
      if (session.status === 'loading') return
      if (!session.activeClub?.id || !session.user?.id) {
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
        setMessage(json.error ?? 'No pude cargar tu ranking.')
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
  }, [session.activeClub?.id, session.status, session.user?.id])

  const myRow = useMemo(() => {
    return (data?.individual ?? []).find((row) => row.user_id === session.user?.id) ?? null
  }, [data?.individual, session.user?.id])

  const contextualRanking = useMemo(() => {
    if (!myRow) return []
    return withRankingPositions(
      sortRankingRows(
        (data?.individual ?? [])
          .filter((row) => row.category === myRow.category && normalizeRankingGender(row.gender) === normalizeRankingGender(myRow.gender))
      ),
      'contextualPosition',
    )
  }, [data?.individual, myRow])

  const myContextRow = useMemo(() => {
    return contextualRanking.find((row) => row.user_id === session.user?.id) ?? null
  }, [contextualRanking, session.user?.id])

  const contextualWindow = useMemo(() => {
    if (!myContextRow) return []
    const myIndex = contextualRanking.findIndex((row) => row.user_id === myContextRow.user_id)
    if (myIndex <= 2) return contextualRanking.slice(0, 7)
    return contextualRanking.slice(Math.max(0, myIndex - 3), myIndex + 4)
  }, [contextualRanking, myContextRow])

  const nextPlayer = useMemo(() => {
    if (!myContextRow) return null
    if (myContextRow.contextualPosition <= 1) return null
    const higherRows = contextualRanking.filter((row) => row.contextualPosition < myContextRow.contextualPosition)
    return higherRows[higherRows.length - 1] ?? null
  }, [contextualRanking, myContextRow])

  const leader = contextualRanking[0] ?? null
  const pointsToNext = nextPlayer && myContextRow ? Math.max(0, nextPlayer.ranking_points - myContextRow.ranking_points) : 0
  const pointsToLeader = leader && myContextRow ? Math.max(0, leader.ranking_points - myContextRow.ranking_points) : 0

  return (
    <main
      className="playerRankShell"
      style={{
        ['--rank-accent' as string]: PAMP_CYAN,
        ['--rank-accent-2' as string]: PAMP_MAGENTA,
        ['--rank-glow' as string]: PAMP_GLOW,
      }}
    >
      <section className="playerRankHero">
        <div>
          <span>Ranking personal</span>
          <h1>Mi ranking</h1>
          <p>
            {session.activeClub?.name ?? 'Club activo'}
            {myRow ? ` · ${formatRankingCategory(myRow.category)} · ${formatRankingGender(myRow.gender)}` : ' · Situación deportiva actual'}
          </p>
        </div>
        <Link href="/player/ranking/club">Ver ranking del club <ArrowRight size={16} /></Link>
      </section>

      {!session.activeClub?.id ? (
        <div className="playerRankEmpty">Seleccioná un club activo para ver tu ranking.</div>
      ) : loading ? (
        <div className="playerRankEmpty">Cargando ranking...</div>
      ) : message ? (
        <div className="playerRankEmpty playerRankEmpty--danger">{message}</div>
      ) : myRow ? (
        <>
          <section className="playerRankCard">
            <div className="playerRankMain">
              <RankingPlayerAvatar className="playerRankAvatar" name={myRow.full_name} src={myRow.avatar_url} sizes="74px" />
              <div>
                <span>Posición actual</span>
                <div className="playerRankIdentityLine">
                  <strong>#{myContextRow?.contextualPosition ?? myRow.position}</strong>
                  <div>
                    <p>{myRow.full_name}</p>
                    <small>{formatRankingCategory(myRow.category)} · {formatRankingGender(myRow.gender)}</small>
                    <span className="playerRankBadges">
                      <em>Vos</em>
                      {(myContextRow?.contextualPosition ?? myRow.position) === 1 ? <i>Líder</i> : null}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="playerRankPoints">
              <span>Puntos</span>
              <strong>{myRow.ranking_points}</strong>
              <small>{formatRankingCategory(myRow.category)} · {formatRankingGender(myRow.gender)}</small>
            </div>
          </section>

          <section className="playerRankStats playerRankStats--compact">
            <article><TrendingUp size={18} /><span>Para subir</span><strong>{nextPlayer ? `+${pointsToNext} pts` : 'Líder'}</strong></article>
            <article><Crown size={18} /><span>Distancia al líder</span><strong>{pointsToLeader > 0 ? `+${pointsToLeader} pts` : 'Sos vos'}</strong></article>
          </section>

          <section className="playerRankContext">
            <header>
              <span>Ranking contextual</span>
              <h2>{formatRankingCategory(myRow.category)} · {formatRankingGender(myRow.gender)}</h2>
            </header>
            <div className="playerRankContextLabels" aria-hidden="true">
              <span>Pos.</span>
              <span>Jugador</span>
              <span>Categoría</span>
              <span>Puntos</span>
            </div>
            <div className="playerRankContextList">
              {contextualWindow.map((player) => {
                const isMe = player.user_id === session.user?.id
                return (
                  <Link
                    href={`/club/jugadores/${player.player_id}`}
                    className={`playerRankContextRow${isMe ? ' is-me' : ''}`}
                    key={player.player_id}
                  >
                    <strong className="playerRankContextPlace">#{player.contextualPosition}</strong>
                    <RankingPlayerAvatar className="playerRankAvatar" name={player.full_name} src={player.avatar_url} sizes="50px" />
                    <div>
                      <b>{player.full_name}</b>
                      <span>{formatRankingCategory(player.category)} · {formatRankingGender(player.gender)}</span>
                    </div>
                    {isMe ? <em>Vos</em> : null}
                    <i>{player.ranking_points} pts</i>
                  </Link>
                )
              })}
            </div>
          </section>

          <div className="playerRankActions">
            <Link href="/player/ranking/club">Ver ranking completo del club</Link>
            <span>Actualizado {formatDate(data?.meta?.generatedAt)}</span>
          </div>
        </>
      ) : (
        <div className="playerRankEmpty">Todavía no aparecés en el ranking de este club.</div>
      )}

      <style>{`
        .playerRankShell { background:
          radial-gradient(circle at 8% 0%, var(--rank-glow), transparent 34%),
          #f3f7fb;
          color: #061b3a;
          display: grid;
          gap: 16px;
          margin: 0 auto;
          max-width: 1080px;
          padding: 18px;
          width: 100%;
        }
        .playerRankHero, .playerRankCard, .playerRankStats article, .playerRankContext, .playerRankEmpty, .playerRankActions {
          background: rgba(255,255,255,.9);
          border: 1px solid #e2e8f0;
          border-radius: 22px;
          box-shadow: 0 18px 48px rgba(15,23,42,.07);
        }
        .playerRankHero { align-items: center; display: flex; gap: 16px; justify-content: space-between; padding: 22px; }
        .playerRankHero span { color: var(--rank-accent); font-size: 12px; font-weight: 950; letter-spacing: .04em; text-transform: uppercase; }
        .playerRankHero h1 { font-size: clamp(34px, 5vw, 58px); font-weight: 950; letter-spacing: -.04em; line-height: .95; margin: 5px 0 7px; }
        .playerRankHero p { color: #64748b; font-weight: 800; margin: 0; }
        .playerRankHero a, .playerRankActions a { align-items: center; background: linear-gradient(135deg, var(--rank-accent), var(--rank-accent-2)); border-radius: 999px; color: #fff; display: inline-flex; font-weight: 950; gap: 7px; padding: 10px 13px; text-decoration: none; white-space: nowrap; }
        .playerRankCard { align-items: center; display: grid; gap: 18px; grid-template-columns: minmax(0, 1fr) 210px; overflow: hidden; padding: 18px 20px; position: relative; }
        .playerRankCard::before { background: linear-gradient(180deg, var(--rank-accent), var(--rank-accent-2)); content: ""; inset: 0 auto 0 0; position: absolute; width: 5px; }
        .playerRankMain { align-items: center; display: grid; gap: 18px; grid-template-columns: 96px minmax(0, 1fr); min-width: 0; }
        .playerRankAvatar { align-items: center; background: linear-gradient(135deg, var(--rank-accent), #172554); border: 5px solid #fff; border-radius: 999px; box-shadow: 0 14px 34px var(--rank-glow); color: #fff; display: flex; font-size: 24px; font-weight: 950; height: 96px; justify-content: center; overflow: hidden; position: relative; width: 96px; }
        .playerRankAvatar img { object-fit: cover; }
        .playerRankMain span, .playerRankPoints span, .playerRankStats span { color: #64748b; font-size: 11px; font-weight: 950; letter-spacing: .04em; text-transform: uppercase; }
        .playerRankIdentityLine { align-items: center; display: grid; gap: 28px; grid-template-columns: auto minmax(0, 1fr); margin-top: 4px; min-width: 0; }
        .playerRankMain strong { color: #061b3a; flex: 0 0 auto; font-size: clamp(56px, 8vw, 84px); font-weight: 950; letter-spacing: -.08em; line-height: .82; }
        .playerRankIdentityLine > div { min-width: 0; }
        .playerRankMain p { font-size: clamp(20px, 2.7vw, 28px); font-weight: 950; line-height: 1.08; margin: 0; overflow: visible; white-space: normal; word-break: normal; }
        .playerRankIdentityLine small { color: #64748b; display: block; font-size: 13px; font-weight: 850; margin-top: 4px; }
        .playerRankBadges { align-items: center; display: flex; flex-wrap: wrap; gap: 6px; margin-top: 7px; }
        .playerRankBadges em, .playerRankBadges i { border-radius: 999px; flex: 0 0 auto; font-size: 11px; font-style: normal; font-weight: 950; padding: 5px 8px; }
        .playerRankBadges em { background: color-mix(in srgb, var(--rank-accent) 12%, white); border: 1px solid color-mix(in srgb, var(--rank-accent) 30%, white); color: var(--rank-accent); }
        .playerRankBadges i { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
        .playerRankPoints { border-left: 1px solid #e2e8f0; display: grid; gap: 5px; justify-items: end; padding-left: 18px; text-align: right; }
        .playerRankPoints strong { font-size: 44px; font-weight: 950; line-height: 1; }
        .playerRankPoints small { color: #64748b; font-weight: 850; }
        .playerRankStats { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .playerRankStats article { align-items: center; display: grid; gap: 5px; padding: 16px; }
        .playerRankStats svg { color: var(--rank-accent); }
        .playerRankStats strong { font-size: clamp(22px, 3vw, 30px); font-weight: 950; line-height: 1; }
        .playerRankContext { display: grid; gap: 12px; padding: 16px; }
        .playerRankContext header { align-items: end; display: flex; justify-content: space-between; gap: 12px; }
        .playerRankContext header span { color: var(--rank-accent); font-size: 11px; font-weight: 950; letter-spacing: .04em; text-transform: uppercase; }
        .playerRankContext h2 { font-size: 22px; font-weight: 950; letter-spacing: -.02em; margin: 0; }
        .playerRankContextLabels { background: linear-gradient(135deg, color-mix(in srgb, var(--rank-accent) 16%, white), rgba(255,255,255,.98)); border: 1px solid color-mix(in srgb, var(--rank-accent) 32%, #e2e8f0); border-radius: 999px; box-shadow: 0 12px 28px rgba(15,23,42,.08); color: #64748b; display: grid; font-size: 10px; font-weight: 950; gap: 10px; grid-template-columns: 58px minmax(0, 1fr) 92px 72px; padding: 7px 12px; position: sticky; text-transform: uppercase; top: 76px; z-index: 30; backdrop-filter: blur(10px); }
        .playerRankContextList { display: grid; gap: 8px; }
        .playerRankContextRow { align-items: center; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; color: #061b3a; display: grid; gap: 10px; grid-template-columns: 58px 50px minmax(0, 1fr) auto auto; padding: 10px 12px; text-decoration: none; transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease; }
        .playerRankContextRow:hover { border-color: color-mix(in srgb, var(--rank-accent) 36%, #e2e8f0); transform: translateY(-1px); }
        .playerRankContextRow.is-me { background: linear-gradient(135deg, color-mix(in srgb, var(--rank-accent) 11%, white), #fff); border-color: color-mix(in srgb, var(--rank-accent) 55%, #e2e8f0); box-shadow: 0 14px 34px var(--rank-glow); }
        .playerRankContextPlace { color: var(--rank-accent); font-size: 18px; font-weight: 950; text-align: center; }
        .playerRankContextRow .playerRankAvatar { height: 50px; width: 50px; }
        .playerRankContextRow b { display: block; font-weight: 950; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .playerRankContextRow span { color: #64748b; display: block; font-size: 12px; font-weight: 800; margin-top: 2px; }
        .playerRankContextRow em { background: linear-gradient(135deg, var(--rank-accent), var(--rank-accent-2)); border-radius: 999px; color: #fff; font-size: 11px; font-style: normal; font-weight: 950; padding: 5px 8px; }
        .playerRankContextRow i { color: #061b3a; font-style: normal; font-weight: 950; white-space: nowrap; }
        .playerRankActions { align-items: center; display: flex; gap: 12px; justify-content: space-between; padding: 14px; }
        .playerRankActions span { color: #64748b; font-weight: 800; }
        .playerRankEmpty { color: #64748b; font-weight: 850; padding: 20px; }
        .playerRankEmpty--danger { color: #be123c; }
        @media (max-width: 720px) {
          .playerRankShell { padding: 12px; }
          .playerRankHero, .playerRankCard, .playerRankActions { align-items: stretch; display: grid; grid-template-columns: 1fr; }
          .playerRankMain { grid-template-columns: 82px minmax(0, 1fr); }
          .playerRankAvatar { height: 82px; width: 82px; }
          .playerRankIdentityLine { align-items: flex-start; display: grid; gap: 7px; grid-template-columns: auto minmax(0, 1fr); }
          .playerRankPoints { border-left: 0; border-top: 1px solid #e2e8f0; justify-items: start; padding-left: 0; padding-top: 14px; text-align: left; }
          .playerRankStats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .playerRankContext header { align-items: start; display: grid; }
          .playerRankContextLabels { grid-template-columns: 32px minmax(0, 1fr) 56px 64px; top: 64px; }
          .playerRankContextRow { border-radius: 12px; gap: 7px; grid-template-columns: 22px 28px minmax(0, 1fr) minmax(84px, max-content); min-height: 46px; padding: 6px 7px; }
          .playerRankContextRow .playerRankAvatar { height: 28px; width: 28px; }
          .playerRankContextRow b { overflow: visible; text-overflow: clip; white-space: normal; }
          .playerRankContextRow span { font-size: 11px; line-height: 1.15; }
          .playerRankContextRow em { display: none; }
          .playerRankContextRow i { grid-column: 4; grid-row: 1; justify-self: end; min-width: 84px; text-align: right; white-space: nowrap; }
        }
      `}</style>
    </main>
  )
}
