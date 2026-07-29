'use client'

import Link from 'next/link'
import RankingPlayerAvatar from '@/components/ranking/RankingPlayerAvatar'

export type PairRankingRow = {
  partnership_id: string
  position: number
  player1_user_id: string
  player2_user_id: string
  player1_name: string
  player2_name: string
  player1_avatar_url: string | null
  player2_avatar_url: string | null
  player1_points: number
  player2_points: number
  combined_points: number
}

export default function PairRankingBoard({ rows }: { rows: PairRankingRow[] }) {
  return (
    <div className="pairRankingBoard" aria-label="Ranking de parejas">
      {rows.map((pair) => (
        <article className="pairRankingCard" key={pair.partnership_id}>
          <Link className="pairRankingPlayer pairRankingPlayer--left" href={`/club/jugadores/${pair.player1_user_id}`}>
            <RankingPlayerAvatar className="pairRankingAvatar" name={pair.player1_name} src={pair.player1_avatar_url} sizes="44px" />
            <span>
              <strong>{pair.player1_name}</strong>
              <small>{pair.player1_points} pts</small>
            </span>
          </Link>

          <div className="pairRankingCenter" aria-label={`Posición ${pair.position}, ${pair.combined_points} puntos`}>
            <strong>#{pair.position}</strong>
            <b>{pair.combined_points}</b>
            <small>PTS</small>
          </div>

          <Link className="pairRankingPlayer pairRankingPlayer--right" href={`/club/jugadores/${pair.player2_user_id}`}>
            <span>
              <strong>{pair.player2_name}</strong>
              <small>{pair.player2_points} pts</small>
            </span>
            <RankingPlayerAvatar className="pairRankingAvatar" name={pair.player2_name} src={pair.player2_avatar_url} sizes="44px" />
          </Link>
        </article>
      ))}

      <style jsx>{`
        .pairRankingBoard {
          display: grid;
          gap: 8px;
          margin-inline: auto;
          max-width: 920px;
          width: 100%;
        }

        .pairRankingCard {
          align-items: stretch;
          background: #fff;
          border: 1px solid color-mix(in srgb, var(--ranking-accent) 14%, #e2e8f0);
          border-radius: 15px;
          box-shadow: 0 10px 22px rgba(15, 23, 42, .04);
          display: grid;
          grid-template-columns: minmax(0, 35fr) minmax(68px, 30fr) minmax(0, 35fr);
          min-height: 76px;
          overflow: hidden;
        }

        .pairRankingPlayer {
          align-items: center;
          color: #061b3a;
          display: flex;
          gap: 8px;
          min-width: 0;
          padding: 10px;
          text-decoration: none;
          transition: background-color .18s ease;
        }

        .pairRankingPlayer:hover,
        .pairRankingPlayer:focus-visible {
          background: #f8fafc;
          outline: none;
        }

        .pairRankingPlayer:focus-visible {
          box-shadow: inset 0 0 0 2px var(--ranking-accent);
        }

        .pairRankingPlayer > span {
          display: grid;
          gap: 4px;
          min-width: 0;
        }

        .pairRankingPlayer strong {
          display: -webkit-box;
          font-size: 14px;
          font-weight: 950;
          line-height: 1.08;
          overflow: hidden;
          overflow-wrap: anywhere;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }

        .pairRankingPlayer small {
          color: #64748b;
          font-size: 10px;
          font-weight: 850;
          white-space: nowrap;
        }

        .pairRankingPlayer--left > span { text-align: left; }
        .pairRankingPlayer--right { justify-content: flex-end; }
        .pairRankingPlayer--right > span { text-align: right; }

        :global(.pairRankingAvatar) {
          align-items: center;
          background: #0f274a;
          border: 2px solid #fff;
          border-radius: 999px;
          box-shadow: 0 8px 18px rgba(15, 23, 42, .12), 0 0 0 1px color-mix(in srgb, var(--ranking-accent) 28%, transparent);
          color: #fff;
          display: flex;
          flex: 0 0 44px;
          font-size: 12px;
          font-weight: 950;
          height: 44px;
          justify-content: center;
          overflow: hidden;
          width: 44px;
        }

        .pairRankingCenter {
          align-content: center;
          border-inline: 1px solid color-mix(in srgb, var(--ranking-accent) 12%, #e2e8f0);
          display: grid;
          justify-items: center;
          min-width: 0;
          padding: 7px 3px;
          text-align: center;
        }

        .pairRankingCenter strong,
        .pairRankingCenter b {
          font-family: "Bebas Neue", "Rajdhani", "Outfit", Inter, system-ui, sans-serif;
          font-weight: 950;
        }

        .pairRankingCenter strong {
          color: var(--ranking-accent);
          font-size: 20px;
          line-height: .95;
        }

        .pairRankingCenter b {
          color: #061b3a;
          font-size: 25px;
          line-height: .9;
        }

        .pairRankingCenter small {
          color: #64748b;
          font-size: 8px;
          font-weight: 950;
          letter-spacing: .04em;
        }

        @media (max-width: 374px) {
          .pairRankingCard {
            grid-template-columns: minmax(0, 1fr) 64px minmax(0, 1fr);
          }

          .pairRankingPlayer {
            gap: 5px;
            padding: 7px 6px;
          }

          :global(.pairRankingAvatar) {
            flex-basis: 36px;
            height: 36px;
            width: 36px;
          }

          .pairRankingPlayer strong { font-size: 12px; }
          .pairRankingCenter b { font-size: 22px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .pairRankingPlayer { transition-duration: .01ms; }
        }
      `}</style>
    </div>
  )
}
