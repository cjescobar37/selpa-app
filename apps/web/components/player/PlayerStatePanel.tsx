'use client'

import Link from 'next/link'
import { AlertCircle, Inbox, RotateCw } from 'lucide-react'
import SelpaLoader from '@/components/SelpaLoader'

type PlayerStatePanelProps = {
  kind?: 'loading' | 'empty' | 'error'
  title: string
  message?: string
  action?: { label: string; href?: string; onClick?: () => void }
  onRetry?: () => void
  viewport?: boolean
  compact?: boolean
}

export default function PlayerStatePanel({
  kind = 'empty',
  title,
  message,
  action,
  onRetry,
  viewport = false,
  compact = false,
}: PlayerStatePanelProps) {
  return (
    <section className={`playerStatePanel is-${kind}${viewport ? ' is-viewport' : ''}${compact ? ' is-compact' : ''}`} aria-live="polite">
      {kind === 'loading' ? (
        <SelpaLoader title={title} subtitle={message ?? ''} />
      ) : (
        <>
          <span className="playerStatePanel__icon" aria-hidden="true">
            {kind === 'error' ? <AlertCircle size={21} /> : <Inbox size={21} />}
          </span>
          <div>
            <strong>{title}</strong>
            {message ? <p>{message}</p> : null}
          </div>
          {action?.href ? <Link href={action.href}>{action.label}</Link> : null}
          {action?.onClick ? <button type="button" onClick={action.onClick}><RotateCw size={15} />{action.label}</button> : null}
          {!action && onRetry ? <button type="button" onClick={onRetry}><RotateCw size={15} />Reintentar</button> : null}
        </>
      )}
      <style>{`
        .playerStatePanel { align-items: center; background: rgba(255,255,255,.9); border: 1px solid #e2e8f0; border-radius: 18px; box-shadow: 0 14px 36px rgba(15,23,42,.06); color: #061b3a; display: grid; gap: 10px; justify-items: center; min-height: 132px; padding: 18px; text-align: center; width: 100%; }
        .playerStatePanel.is-viewport { align-content: center; min-height: calc(100dvh - var(--app-navbar-height, 64px) - 32px); }
        .playerStatePanel.is-compact { min-height: 96px; padding: 14px; }
        .playerStatePanel.is-loading { background: transparent; border-color: transparent; box-shadow: none; }
        .playerStatePanel__icon { align-items: center; background: #ecfeff; border: 1px solid #a5f3fc; border-radius: 13px; color: #0891b2; display: flex; height: 42px; justify-content: center; width: 42px; }
        .playerStatePanel.is-error .playerStatePanel__icon { background: #fff1f2; border-color: #fecdd3; color: #be123c; }
        .playerStatePanel strong { display: block; font-size: 17px; font-weight: 850; line-height: 1.15; }
        .playerStatePanel p { color: #64748b; font-size: 13px; font-weight: 650; line-height: 1.35; margin: 4px 0 0; max-width: 460px; }
        .playerStatePanel a, .playerStatePanel button { align-items: center; background: #061b3a; border: 1px solid rgba(34,211,238,.26); border-radius: 12px; color: #fff; display: inline-flex; font: inherit; font-size: 13px; font-weight: 850; gap: 7px; justify-content: center; min-height: 44px; padding: 0 14px; text-decoration: none; }
        @media (max-width: 560px) { .playerStatePanel { border-radius: 15px; min-height: 112px; padding: 14px; } .playerStatePanel.is-viewport { border: 0; box-shadow: none; min-height: calc(100dvh - 68px - env(safe-area-inset-bottom, 0px)); } }
      `}</style>
    </section>
  )
}
