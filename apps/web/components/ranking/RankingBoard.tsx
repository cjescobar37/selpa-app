'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import RankingGenderTabs from '@/components/ranking/RankingGenderTabs'
import RankingPlayerAvatar from '@/components/ranking/RankingPlayerAvatar'
import { formatRankingCategory, formatRankingGender } from '@/lib/ranking'

export type RankingBoardGender = 'M' | 'F'

export type RankingBoardRow = {
  id: string
  name: string
  avatarUrl?: string | null
  category: number | null
  gender: string | null
  points: number
  position: number
  isTied?: boolean
  href?: string
  subtitle?: string | null
}

type RankingBoardColumn = {
  gender: RankingBoardGender
  rows: RankingBoardRow[]
}

type RankingBoardProps = {
  columns: RankingBoardColumn[]
  className?: string
  stickyTop?: number
}

const accents = {
  M: {
    label: 'Caballeros',
    playerLabel: 'Jugador',
    countLabel: 'jugadores',
    color: '#06b6d4',
    soft: 'rgba(6, 182, 212, 0.12)',
  },
  F: {
    label: 'Damas',
    playerLabel: 'Jugadora',
    countLabel: 'jugadoras',
    color: '#ec4899',
    soft: 'rgba(236, 72, 153, 0.12)',
  },
} satisfies Record<RankingBoardGender, { label: string; playerLabel: string; countLabel: string; color: string; soft: string }>

export default function RankingBoard({ columns, className, stickyTop = 76 }: RankingBoardProps) {
  const [mobileGender, setMobileGender] = useState<RankingBoardGender>('M')
  const visibleColumns = columns.length ? columns : [{ gender: 'M' as const, rows: [] }, { gender: 'F' as const, rows: [] }]
  const showTabs = visibleColumns.length > 1
  const counts = useMemo(
    () => ({
      M: visibleColumns.find((column) => column.gender === 'M')?.rows.length ?? 0,
      F: visibleColumns.find((column) => column.gender === 'F')?.rows.length ?? 0,
    }),
    [visibleColumns],
  )

  return (
    <section
      className={['rankingBoard', visibleColumns.length === 1 ? 'is-single' : '', showTabs ? `mobile-gender-${mobileGender}` : '', className ?? ''].filter(Boolean).join(' ')}
      style={{ ['--ranking-sticky-top' as string]: `${stickyTop}px` }}
      aria-label="Ranking por rama"
    >
      {showTabs ? <RankingGenderTabs active={mobileGender} counts={counts} onChange={setMobileGender} /> : null}

      <div className="rankingBoardGrid">
        {visibleColumns.map((column) => {
          const accent = accents[column.gender]
          return (
            <article
              className="rankingBoardColumn"
              data-ranking-gender={column.gender}
              key={column.gender}
              style={{
                ['--ranking-accent' as string]: accent.color,
                ['--ranking-soft' as string]: accent.soft,
              }}
            >
              <div className="rankingBoardSticky">
                <header className="rankingBoardHeader">
                  <div>
                    <span>Ranking</span>
                    <strong>{accent.label}</strong>
                  </div>
                  <em>{column.rows.length} {accent.countLabel}</em>
                </header>
                <div className="rankingBoardLabels" aria-hidden="true">
                  <span>Pos</span>
                  <span>{accent.playerLabel}</span>
                  <span>Puntos</span>
                </div>
              </div>

              <div className="rankingBoardList">
                {column.rows.length ? column.rows.map((row) => <RankingCard key={row.id} row={row} />) : (
                  <div className="rankingBoardEmpty">🏆 Todavía no hay {column.gender === 'F' ? 'jugadoras' : 'jugadores'} rankeados.</div>
                )}
              </div>
            </article>
          )
        })}
      </div>

      <style jsx>{`
        .rankingBoard {
          --rank-mobile-glow: rgba(6, 182, 212, 0.18);
          display: grid;
          gap: 12px;
          min-width: 0;
          width: 100%;
        }

        .rankingBoardGrid {
          align-items: start;
          display: grid;
          gap: 16px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          min-width: 0;
        }

        .rankingBoard.is-single .rankingBoardGrid {
          grid-template-columns: minmax(0, 1fr);
        }

        .rankingBoardColumn {
          align-content: start;
          background: #fff;
          border: 1px solid rgba(15, 23, 42, .1);
          border-radius: 18px;
          box-shadow: 0 16px 36px rgba(15, 23, 42, .06);
          display: grid;
          gap: 10px;
          min-width: 0;
          overflow: visible;
          padding: 12px;
        }

        .rankingBoardSticky {
          background: #fff;
          border-radius: 14px;
          display: grid;
          gap: 8px;
          position: sticky;
          top: var(--ranking-sticky-top);
          z-index: 50;
        }

        .rankingBoardHeader {
          align-items: center;
          background: #fff;
          border: 1px solid color-mix(in srgb, var(--ranking-accent) 26%, #dbe3ec);
          border-radius: 14px;
          border-top: 3px solid var(--ranking-accent);
          box-shadow: 0 10px 20px rgba(15, 23, 42, .045);
          display: grid;
          gap: 10px;
          grid-template-columns: minmax(0, 1fr) auto;
          padding: 12px;
        }

        .rankingBoardHeader span {
          color: var(--ranking-accent);
          display: block;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: .04em;
          text-transform: uppercase;
        }

        .rankingBoardHeader strong {
          color: #061b3a;
          display: block;
          font-size: 21px;
          font-weight: 950;
          letter-spacing: -.035em;
          line-height: 1.05;
        }

        .rankingBoardHeader em {
          background: #f8fafc;
          border: 1px solid color-mix(in srgb, var(--ranking-accent) 18%, #dbe5ef);
          border-radius: 999px;
          color: #334155;
          font-size: 12px;
          font-style: normal;
          font-weight: 900;
          padding: 6px 9px;
          white-space: nowrap;
        }

        .rankingBoardLabels {
          background: #fbfdff;
          border: 1px solid color-mix(in srgb, var(--ranking-accent) 14%, #e2e8f0);
          border-radius: 12px;
          box-shadow: 0 8px 18px rgba(15, 23, 42, .045);
          color: #64748b;
          display: grid;
          font-size: 10px;
          font-weight: 950;
          gap: 8px;
          grid-template-columns: 48px minmax(0, 1fr) 72px;
          padding: 7px 10px;
          text-transform: uppercase;
        }

        .rankingBoardList {
          display: grid;
          gap: 9px;
          min-width: 0;
        }

        .rankingBoardEmpty {
          align-items: center;
          background: rgba(255, 255, 255, .94);
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          color: #64748b;
          display: flex;
          font-weight: 850;
          min-height: 54px;
          padding: 12px;
        }

        @media (max-width: 820px) {
          .rankingBoardGrid {
            grid-template-columns: 1fr;
          }

          .rankingBoard.mobile-gender-M .rankingBoardColumn[data-ranking-gender="F"],
          .rankingBoard.mobile-gender-F .rankingBoardColumn[data-ranking-gender="M"] {
            display: none;
          }

          .rankingBoardSticky {
            top: 64px;
          }
        }

        @media (max-width: 560px) {
          .rankingBoardColumn {
            border-radius: 15px;
            padding: 10px;
          }

          .rankingBoardHeader {
            align-items: start;
            padding: 10px;
          }

          .rankingBoardHeader strong {
            font-size: 18px;
          }

          .rankingBoardHeader em {
            font-size: 11px;
            padding: 5px 7px;
          }

          .rankingBoardLabels {
            gap: 6px;
            grid-template-columns: 32px minmax(0, 1fr) 64px;
            padding: 6px 8px;
          }
        }
      `}</style>
    </section>
  )
}

function RankingCard({ row }: { row: RankingBoardRow }) {
  const isFeatured = row.position <= 10
  const content = (
    <>
      <strong className="rankingCardPosition">#{row.position}</strong>
      <RankingPlayerAvatar className="rankingCardAvatar" name={row.name} src={row.avatarUrl} sizes={isFeatured ? '74px' : '48px'} />
      <div className="rankingCardBody">
        <b>{row.name}</b>
        <span>{formatRankingCategory(row.category)} · {formatRankingGender(row.gender)}{row.isTied ? ' · Empate' : ''}</span>
        {row.subtitle ? <small>{row.subtitle}</small> : null}
      </div>
      <div className="rankingCardPoints">
        <b>{row.points}</b>
        <span>PTS</span>
      </div>
    </>
  )

  const className = `rankingCard ${isFeatured ? 'is-featured' : 'is-compact'}`
  return row.href ? (
    <Link className={className} href={row.href}>
      {content}
      <RankingCardStyles />
    </Link>
  ) : (
    <article className={className}>
      {content}
      <RankingCardStyles />
    </article>
  )
}

function RankingCardStyles() {
  return (
    <style jsx global>{`
      .rankingCard {
        align-items: center;
        background: #fff;
        border: 1px solid color-mix(in srgb, var(--ranking-accent) 14%, #e2e8f0);
        border-radius: 15px;
        color: #061b3a;
        cursor: pointer;
        display: grid;
        gap: 14px;
        grid-template-columns: 52px 74px minmax(0, 1fr) 92px;
        min-width: 0;
        min-height: 94px;
        padding: 12px 14px;
        text-decoration: none;
        box-shadow: 0 10px 22px rgba(15, 23, 42, .04);
        transition: background .18s ease, border-color .18s ease, box-shadow .18s ease, transform .18s ease;
      }

      .rankingCard:hover {
        background: #fbfdff;
        border-color: color-mix(in srgb, var(--ranking-accent) 26%, #dbe5ef);
        box-shadow: 0 16px 34px rgba(15, 23, 42, .075);
        transform: translateY(-1px);
      }

      .rankingCardPosition {
        color: var(--ranking-accent);
        font-family: "Bebas Neue", "Rajdhani", "Outfit", Inter, system-ui, sans-serif;
        font-size: 28px;
        font-weight: 950;
        letter-spacing: .01em;
        line-height: .9;
        text-align: center;
      }

      .rankingCardAvatar {
        align-items: center;
        background: #0f274a;
        border: 4px solid #fff;
        border-radius: 999px;
        color: #fff;
        display: flex;
        box-shadow: 0 12px 24px rgba(15, 23, 42, .12), 0 0 0 2px color-mix(in srgb, var(--ranking-accent) 30%, transparent);
        font-family: "Outfit", Inter, system-ui, sans-serif;
        font-size: 18px;
        font-weight: 950;
        height: 74px;
        justify-content: center;
        overflow: hidden;
        position: relative;
        transition: box-shadow .18s ease, transform .18s ease;
        width: 74px;
      }

      .rankingCardAvatar :global(img) {
        object-fit: cover;
      }

      .rankingCardBody {
        display: grid;
        gap: 3px;
        min-width: 0;
      }

      .rankingCardBody b {
        display: block;
        font-family: "Outfit", Inter, system-ui, sans-serif;
        font-size: 16px;
        font-weight: 950;
        line-height: 1.12;
        min-width: 0;
        overflow-wrap: anywhere;
      }

      .rankingCardBody span,
      .rankingCardBody small {
        color: #64748b;
        font-size: 11px;
        font-weight: 850;
        line-height: 1.12;
      }

      .rankingCardPoints {
        align-self: stretch;
        background: #f8fafc;
        border: 1px solid color-mix(in srgb, var(--ranking-accent) 18%, #dbe6f0);
        border-radius: 16px;
        display: grid;
        justify-content: center;
        justify-items: end;
        min-width: 92px;
        padding: 9px 10px;
        place-content: center end;
        transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease;
        white-space: nowrap;
      }

      .rankingCard:hover .rankingCardAvatar {
        box-shadow: 0 14px 28px rgba(15, 23, 42, .16), 0 0 0 2px color-mix(in srgb, var(--ranking-accent) 42%, transparent);
        transform: scale(1.018);
      }

      .rankingCard:hover .rankingCardPoints {
        border-color: color-mix(in srgb, var(--ranking-accent) 28%, #dbe6f0);
        box-shadow: 0 10px 20px rgba(15, 23, 42, .06);
        transform: translateX(-1px);
      }

      .rankingCardPoints b {
        font-family: "Bebas Neue", "Rajdhani", "Outfit", Inter, system-ui, sans-serif;
        font-size: 42px;
        font-weight: 950;
        letter-spacing: .01em;
        line-height: .78;
      }

      .rankingCardPoints span {
        color: #334155;
        font-family: "Rajdhani", Inter, system-ui, sans-serif;
        font-size: 12px;
        font-weight: 950;
        letter-spacing: .04em;
        text-transform: uppercase;
      }

      .rankingCard.is-compact {
        gap: 10px;
        grid-template-columns: 42px 48px minmax(0, 1fr) 72px;
        min-height: 66px;
        padding: 8px 10px;
      }

      .rankingCard.is-compact .rankingCardAvatar {
        border-width: 2px;
        box-shadow: 0 8px 18px rgba(15, 23, 42, .12), 0 0 0 1px color-mix(in srgb, var(--ranking-accent) 28%, transparent);
        font-size: 12px;
        height: 48px;
        width: 48px;
      }

      .rankingCard.is-compact .rankingCardBody {
        gap: 2px;
      }

      .rankingCard.is-compact .rankingCardBody b {
        font-size: 14px;
        line-height: 1.05;
      }

      .rankingCard.is-compact .rankingCardBody span,
      .rankingCard.is-compact .rankingCardBody small {
        font-size: 10px;
      }

      .rankingCard.is-compact .rankingCardPoints {
        border-radius: 12px;
        min-width: 72px;
        padding: 6px 8px;
      }

      .rankingCard.is-compact .rankingCardPoints b {
        font-size: 30px;
      }

      .rankingCard.is-compact .rankingCardPoints span {
        font-size: 10px;
      }

      @media (max-width: 560px) {
        .rankingCard {
          border-radius: 13px;
          gap: 9px;
          grid-template-columns: 28px 48px minmax(0, 1fr) 70px;
          min-height: 72px;
          padding: 8px;
        }

        .rankingCardPosition {
          font-size: 17px;
        }

        .rankingCardAvatar {
          border-width: 2px;
          font-size: 12px;
          height: 48px;
          width: 48px;
        }

        .rankingCardBody b {
          font-size: 13px;
          overflow: visible;
          text-overflow: clip;
          white-space: normal;
        }

        .rankingCardBody span {
          font-size: 11px;
        }

        .rankingCardBody small {
          display: none;
        }

        .rankingCardPoints {
          border-radius: 12px;
          min-width: 70px;
          padding: 6px 7px;
        }

        .rankingCardPoints b {
          font-size: 24px;
        }
      }
    `}</style>
  )
}
