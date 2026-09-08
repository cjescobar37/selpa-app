'use client'

import { CheckCircle2, X } from 'lucide-react'

export type TournamentMilestone = {
  id: string
  eyebrow: string
  title: string
  message: string
  actionLabel?: string
}

type Props = {
  milestone: TournamentMilestone
  onAction?: () => void
  onDismiss: () => void
}

export function TournamentMilestoneNotice({ milestone, onAction, onDismiss }: Props) {
  return (
    <section className="tournamentMilestone" aria-live="polite">
      <CheckCircle2 className="tournamentMilestone__icon" size={20} aria-hidden="true" />
      <div className="tournamentMilestone__copy">
        <span>{milestone.eyebrow}</span>
        <h2>{milestone.title}</h2>
        <p>{milestone.message}</p>
      </div>
      <div className="tournamentMilestone__actions">
        {milestone.actionLabel && onAction ? <button type="button" onClick={onAction}>{milestone.actionLabel}</button> : null}
        <button type="button" className="tournamentMilestone__dismiss" aria-label="Cerrar aviso" onClick={onDismiss}><X size={17} /></button>
      </div>
      <style jsx>{`
        .tournamentMilestone {
          align-items: center;
          background: linear-gradient(135deg, color-mix(in srgb, var(--club-admin-accent) 10%, white), #fff);
          border: 1px solid color-mix(in srgb, var(--club-admin-accent) 30%, transparent);
          border-left: 4px solid var(--club-admin-accent);
          border-radius: 12px;
          display: grid;
          gap: 8px;
          grid-template-columns: auto minmax(0, 1fr) auto;
          margin: 6px;
          padding: 8px 9px;
        }
        :global(.tournamentMilestone__icon) { color: var(--club-admin-accent); }
        div { min-width: 0; }
        span { color: var(--club-admin-accent); font-size: 9.5px; font-weight: 950; letter-spacing: .07em; text-transform: uppercase; }
        h2 { color: #061b3a; font-size: 15px; line-height: 1.12; margin: 1px 0; }
        p { color: #52657a; font-size: 11.5px; font-weight: 700; line-height: 1.2; margin: 0; }
        .tournamentMilestone__actions { align-items: center; display: flex; gap: 2px; }
        button { background: #061b3a; border: 0; border-radius: 8px; color: #fff; cursor: pointer; font: inherit; font-size: 11px; font-weight: 900; min-height: 38px; padding: 6px 9px; white-space: nowrap; }
        button.tournamentMilestone__dismiss { background: transparent; color: #64748b; min-width: 38px; padding: 0; }
        @media (max-width: 560px) {
          .tournamentMilestone { align-items: center; gap: 7px; grid-template-columns: auto minmax(0, 1fr) auto; margin: 6px; padding: 7px 8px; }
          .tournamentMilestone__copy > span { display: none; }
          h2 { font-size: 14px; }
          .tournamentMilestone__actions { justify-content: flex-end; }
          button, button.tournamentMilestone__dismiss { min-height: 44px; }
          button.tournamentMilestone__dismiss { min-width: 44px; }
        }
        @media (max-width: 350px) {
          .tournamentMilestone { align-items: start; grid-template-columns: auto minmax(0, 1fr); }
          .tournamentMilestone__actions { grid-column: 2; justify-content: flex-start; }
        }
      `}</style>
    </section>
  )
}
