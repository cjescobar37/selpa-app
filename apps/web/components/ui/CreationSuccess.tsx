'use client'

import { Check } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'

export type CreationSuccessProps = {
  kicker: string
  title: string
  message: ReactNode
  nextStep: string
  actionLabel: string
  onAction: () => void
  redirectLabel?: string
  accent?: string
}

/**
 * Confirmación reutilizable para altas exitosas. La navegación queda en manos
 * del flujo que la usa, para que sirva igual para torneos, circuitos, pagos o registros.
 */
export function CreationSuccess({
  kicker,
  title,
  message,
  nextStep,
  actionLabel,
  onAction,
  redirectLabel,
  accent,
}: CreationSuccessProps) {
  const style = accent ? ({ '--creation-success-accent': accent } as CSSProperties) : undefined

  return (
    <section className="creationSuccess" style={style} role="status" aria-live="polite">
      <div className="creationSuccess__mark" aria-hidden="true"><Check /></div>
      <span className="creationSuccess__kicker">{kicker}</span>
      <h1>{title}</h1>
      <p>{message}</p>
      <small>{nextStep}</small>
      <button type="button" onClick={onAction}>{actionLabel}</button>
      {redirectLabel ? <span className="creationSuccess__redirect">{redirectLabel}</span> : null}

      <style jsx>{`
        .creationSuccess { --creation-success-accent:var(--club-admin-accent,#65a30d); align-content:center; display:grid; justify-items:center; min-height:min(580px,calc(100dvh - 120px)); overflow:hidden; padding:32px 20px; position:relative; text-align:center; }
        .creationSuccess::before,.creationSuccess::after { background:color-mix(in srgb,var(--creation-success-accent) 14%,transparent); border-radius:999px; content:''; height:7px; position:absolute; top:calc(50% - 94px); width:7px; }
        .creationSuccess::before { animation:creationSuccessSpark 1.15s .18s ease-out both; left:calc(50% - 66px); }
        .creationSuccess::after { animation:creationSuccessSpark 1.15s .3s ease-out both; right:calc(50% - 66px); }
        .creationSuccess__mark { align-items:center; animation:creationSuccessMark .52s cubic-bezier(.16,1,.3,1) both; border:4px solid var(--creation-success-accent); border-radius:50%; color:var(--creation-success-accent); display:flex; height:52px; justify-content:center; margin-bottom:10px; width:52px; }
        .creationSuccess__mark :global(svg) { animation:creationSuccessCheck .36s .28s ease-out both; height:29px; stroke-width:3; width:29px; }
        .creationSuccess__kicker { color:var(--creation-success-accent); font-size:10px; font-weight:950; letter-spacing:.08em; line-height:1.2; text-transform:uppercase; }
        .creationSuccess h1 { color:#071a35; font-size:28px; letter-spacing:-.04em; line-height:1.08; margin:4px 0 7px; }
        .creationSuccess p { color:#30455f; font-size:15px; line-height:1.35; margin:0; max-width:320px; }
        .creationSuccess p :global(strong) { color:#071a35; font-weight:900; }
        .creationSuccess small { color:#64748b; font-size:12px; font-weight:750; line-height:1.35; margin:5px 0 16px; max-width:300px; }
        .creationSuccess button { background:var(--creation-success-accent); border:0; border-radius:999px; box-shadow:0 12px 24px color-mix(in srgb,var(--creation-success-accent) 24%,transparent); color:#fff; cursor:pointer; font:inherit; font-size:14px; font-weight:950; min-height:46px; padding:0 24px; width:min(100%,278px); }
        .creationSuccess button:focus-visible { outline:3px solid color-mix(in srgb,var(--creation-success-accent) 45%,#fff); outline-offset:3px; }
        .creationSuccess__redirect { color:#8094b1; font-size:11px; font-weight:750; margin-top:9px; }
        @keyframes creationSuccessMark { from { opacity:0; transform:scale(.55); } 70% { transform:scale(1.08); } to { opacity:1; transform:scale(1); } }
        @keyframes creationSuccessCheck { from { opacity:0; transform:scale(.3); } to { opacity:1; transform:scale(1); } }
        @keyframes creationSuccessSpark { from { opacity:0; transform:translateY(10px) scale(.5); } 40% { opacity:1; } to { opacity:0; transform:translateY(-24px) scale(1); } }
        @media (prefers-reduced-motion:reduce) { .creationSuccess::before,.creationSuccess::after,.creationSuccess__mark,.creationSuccess__mark :global(svg) { animation:none; } }
      `}</style>
    </section>
  )
}
