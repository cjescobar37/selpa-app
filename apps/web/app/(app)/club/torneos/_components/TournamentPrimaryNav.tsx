'use client'

export type TournamentPrimaryTab = 'general' | 'pairs' | 'groups' | 'playoff'

type Tab = {
  id: TournamentPrimaryTab
  label: string
}

type Props = {
  activeTab: TournamentPrimaryTab
  registrationsCount: number
  showGroups: boolean
  showPlayoff: boolean
  onChange: (tab: TournamentPrimaryTab) => void
}

export function TournamentPrimaryNav({ activeTab, registrationsCount, showGroups, showPlayoff, onChange }: Props) {
  const tabs: Tab[] = [
    { id: 'general', label: 'General' },
    { id: 'pairs', label: registrationsCount > 0 ? `Parejas (${registrationsCount})` : 'Parejas' },
    ...(showGroups ? [{ id: 'groups' as const, label: 'Grupos' }] : []),
    ...(showPlayoff ? [{ id: 'playoff' as const, label: 'Playoff' }] : []),
  ]

  return (
    <nav className="tournamentPrimaryNav" role="tablist" aria-label="Secciones del torneo">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          className={activeTab === tab.id ? 'is-active' : ''}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
      <style jsx>{`
        .tournamentPrimaryNav {
          background: color-mix(in srgb, var(--club-admin-accent) 4%, #f8fafc);
          display: grid;
          grid-template-columns: repeat(${tabs.length}, minmax(0, 1fr));
          min-width: 0;
        }
        button {
          background: transparent;
          border: 0;
          border-bottom: 3px solid transparent;
          color: #64748b;
          cursor: pointer;
          font: inherit;
          font-size: 12px;
          font-weight: 850;
          min-height: 48px;
          min-width: 0;
          overflow: hidden;
          padding: 8px 6px 7px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        button.is-active {
          background: #fff;
          border-bottom-color: var(--club-admin-accent);
          color: #061b3a;
        }
        button:focus-visible {
          outline: 3px solid color-mix(in srgb, var(--club-admin-accent) 32%, transparent);
          outline-offset: -3px;
        }
        @media (max-width: 430px) {
          button { font-size: 11.5px; min-height: 46px; padding-inline: 3px; }
        }
        @media (max-width: 360px) {
          button { font-size: 10.5px; }
        }
      `}</style>
    </nav>
  )
}
