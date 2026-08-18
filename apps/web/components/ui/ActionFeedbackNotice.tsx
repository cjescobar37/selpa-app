'use client'

import { AlertTriangle, CheckCircle2, CircleAlert, X } from 'lucide-react'
import { useEffect } from 'react'

export type ActionFeedbackTone = 'success' | 'warning' | 'error'

export function ActionFeedbackNotice({
  tone,
  title,
  message,
  detail,
  onDismiss,
  autoDismissMs,
}: {
  tone: ActionFeedbackTone
  title: string
  message: string
  detail?: string
  onDismiss: () => void
  autoDismissMs?: number
}) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'error' ? CircleAlert : AlertTriangle

  useEffect(() => {
    if (!autoDismissMs) return
    const timeout = window.setTimeout(onDismiss, autoDismissMs)
    return () => window.clearTimeout(timeout)
  }, [autoDismissMs, onDismiss])

  return (
    <aside className={`actionFeedbackNotice actionFeedbackNotice--${tone}`} role={tone === 'error' ? 'alert' : 'status'} aria-live="polite">
      <Icon aria-hidden="true" />
      <div><strong>{title}</strong><span>{message}</span>{detail ? <small>{detail}</small> : null}</div>
      <button type="button" onClick={onDismiss} aria-label="Cerrar mensaje"><X aria-hidden="true" /></button>
      <style jsx>{`
        .actionFeedbackNotice { align-items:flex-start; backdrop-filter:blur(14px); border:1px solid; border-radius:14px; box-shadow:0 16px 34px rgba(15,23,42,.18); display:grid; gap:9px; grid-template-columns:22px minmax(0,1fr) 28px; left:50%; max-width:440px; padding:10px; position:fixed; top:calc(64px + env(safe-area-inset-top)); transform:translateX(-50%); width:calc(100% - 32px); z-index:80; }
        .actionFeedbackNotice > :global(svg) { height:21px; margin-top:1px; width:21px; }
        .actionFeedbackNotice > div { display:grid; gap:2px; min-width:0; }
        .actionFeedbackNotice strong { font-size:12px; line-height:1.2; }
        .actionFeedbackNotice span { font-size:12px; font-weight:750; line-height:1.32; }
        .actionFeedbackNotice small { font-size:10px; font-weight:750; line-height:1.25; }
        .actionFeedbackNotice button { align-items:center; background:transparent; border:0; border-radius:8px; color:inherit; cursor:pointer; display:flex; height:28px; justify-content:center; padding:0; width:28px; }
        .actionFeedbackNotice button:focus-visible { outline:2px solid currentColor; outline-offset:2px; }
        .actionFeedbackNotice button :global(svg) { height:17px; width:17px; }
        .actionFeedbackNotice--warning { background:color-mix(in srgb,#fff8e4 92%,transparent); border-color:rgba(217,119,6,.32); color:#854d0e; }
        .actionFeedbackNotice--error { background:color-mix(in srgb,#fff2f2 92%,transparent); border-color:rgba(220,38,38,.3); color:#a11d1d; }
        .actionFeedbackNotice--success { background:color-mix(in srgb,#effcf3 92%,transparent); border-color:rgba(22,163,74,.28); color:#166534; }
        @media (max-width:767px) { .actionFeedbackNotice { top:calc(62px + env(safe-area-inset-top)); width:calc(100% - 24px); } }
      `}</style>
    </aside>
  )
}
