'use client'

type RankingGenderTabsProps = {
  active: 'M' | 'F'
  counts?: Partial<Record<'M' | 'F', number>>
  onChange: (gender: 'M' | 'F') => void
}

const tabs = [
  { value: 'M' as const, label: 'Caballeros' },
  { value: 'F' as const, label: 'Damas' },
]

export default function RankingGenderTabs({ active, counts, onChange }: RankingGenderTabsProps) {
  return (
    <div className="rankingGenderTabs" role="tablist" aria-label="Ranking por rama">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={active === tab.value}
          className={active === tab.value ? 'is-active' : ''}
          onClick={() => onChange(tab.value)}
        >
          <span>{tab.label}</span>
          <small>{counts?.[tab.value] ?? 0}</small>
        </button>
      ))}

      <style jsx>{`
        .rankingGenderTabs {
          background: #f8fafc;
          border: 1px solid #dbe6f0;
          border-radius: 999px;
          display: none;
          gap: 4px;
          padding: 4px;
          width: 100%;
        }

        .rankingGenderTabs button {
          align-items: center;
          background: transparent;
          border: 0;
          border-radius: 999px;
          color: #64748b;
          cursor: pointer;
          display: flex;
          flex: 1;
          font: inherit;
          font-size: 12px;
          font-weight: 950;
          gap: 7px;
          justify-content: center;
          min-height: 36px;
          padding: 7px 10px;
        }

        .rankingGenderTabs button.is-active {
          background: #061b3a;
          box-shadow: 0 10px 22px var(--rank-mobile-glow, rgba(15, 23, 42, .12));
          color: #fff;
        }

        .rankingGenderTabs small {
          background: rgba(255, 255, 255, .18);
          border-radius: 999px;
          font-size: 11px;
          line-height: 1;
          padding: 4px 6px;
        }

        .rankingGenderTabs button:not(.is-active) small {
          background: #e2e8f0;
          color: #475569;
        }

        @media (max-width: 820px) {
          .rankingGenderTabs {
            display: flex;
          }
        }
      `}</style>
    </div>
  )
}
