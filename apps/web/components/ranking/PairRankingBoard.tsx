'use client'

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
  category?: number | null
  gender?: string | null
}

export default function PairRankingBoard({ rows }: { rows: PairRankingRow[] }) {
  return (
    <div className="pairRankingBoard" aria-label="Ranking de parejas">
      {rows.map((pair) => (
        <article className="pairRankingCard" key={pair.partnership_id} aria-label={`Posición ${pair.position}, ${pair.combined_points} puntos`}>
          <strong className="pairRankingPosition">#{pair.position}</strong>
          <div className="pairRankingAvatars" aria-hidden="true">
            <RankingPlayerAvatar className="pairRankingAvatar" name={pair.player1_name} src={pair.player1_avatar_url} sizes="38px" />
            <RankingPlayerAvatar className="pairRankingAvatar" name={pair.player2_name} src={pair.player2_avatar_url} sizes="38px" />
          </div>
          <div className="pairRankingNames">
            <b>{pair.player1_name} / {pair.player2_name}</b>
            <small>{pair.category ? `${pair.category}ta` : 'Categoría'}{pair.gender ? ` · ${pair.gender === 'F' ? 'Damas' : 'Caballeros'}` : ''}</small>
          </div>
          <div className="pairRankingPoints"><b>{pair.combined_points}</b><small>PTS</small></div>
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
          align-items:center;
          gap:10px;
          grid-template-columns:36px 68px minmax(0,1fr) auto;
          min-height:64px;
          overflow: hidden;
        }

        .pairRankingPosition { color:var(--ranking-accent); font-size:20px; padding-left:10px; }
        .pairRankingAvatars { display:flex; padding-left:4px; }
        .pairRankingAvatars :global(.pairRankingAvatar) + :global(.pairRankingAvatar) { margin-left:-11px; }
        .pairRankingNames { display:grid; gap:3px; min-width:0; }
        .pairRankingNames b {
          display: -webkit-box;
          font-size: 14px;
          font-weight: 950;
          line-height: 1.08;
          overflow: hidden;
          overflow-wrap: anywhere;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }

        .pairRankingNames small {
          color: #64748b;
          font-size: 10px;
          font-weight: 850;
          white-space: nowrap;
        }

        :global(.pairRankingAvatar) {
          align-items: center;
          background: #0f274a;
          border: 2px solid #fff;
          border-radius: 999px;
          box-shadow: 0 8px 18px rgba(15, 23, 42, .12), 0 0 0 1px color-mix(in srgb, var(--ranking-accent) 28%, transparent);
          color: #fff;
          display: flex;
          flex: 0 0 38px;
          font-size: 12px;
          font-weight: 950;
          height: 38px;
          justify-content: center;
          overflow: hidden;
          width: 38px;
        }

        .pairRankingPoints {
          align-content:center;
          background:#f8fafc;
          border-left:1px solid color-mix(in srgb, var(--ranking-accent) 12%, #e2e8f0);
          display: grid;
          justify-items: center;
          min-width: 0;
          min-height:64px;
          padding: 6px 12px;
          text-align: center;
        }

        .pairRankingPoints b {
          font-family: "Bebas Neue", "Rajdhani", "Outfit", Inter, system-ui, sans-serif;
          font-weight: 950;
        }

        .pairRankingPoints b {
          color: #061b3a;
          font-size: 25px;
          line-height: .9;
        }

        .pairRankingPoints small {
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
