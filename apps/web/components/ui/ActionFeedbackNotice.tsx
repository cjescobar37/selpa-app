'use client'

import { useEffect, useId, useRef } from 'react'
import { humanizeToastMessage, toast, type ToastTone } from '@/lib/toastStore'
import styles from './ActionFeedbackNotice.module.css'

export type ActionFeedbackTone = ToastTone

/** Compatibility bridge: all existing notices use the single global viewport. */
export function ActionFeedbackNotice({ tone, title, message, detail, onDismiss, autoDismissMs, inline=false }: {
  tone: ActionFeedbackTone
  title: string
  message: string
  detail?: string
  onDismiss: () => void
  autoDismissMs?: number
  inline?: boolean
}) {
  const id = useId()
  const dismiss = useRef(onDismiss)
  useEffect(() => { dismiss.current = onDismiss }, [onDismiss])
  useEffect(() => {
    if(inline)return
    toast[tone](message, { title, detail, duration: autoDismissMs, dedupeKey: id, onDismiss: () => dismiss.current() })
  }, [id, tone, title, message, detail, autoDismissMs, inline])
  useEffect(()=>{
    if(!inline || !autoDismissMs)return
    const timer=window.setTimeout(()=>dismiss.current(),autoDismissMs)
    return ()=>window.clearTimeout(timer)
  },[inline,autoDismissMs,title,message])
  if(inline)return <aside className={styles.notice} data-tone={tone} role={tone==='error'?'alert':'status'} aria-live={tone==='error'?'assertive':'polite'}>
    <div><strong>{humanizeToastMessage(title)}</strong><p>{humanizeToastMessage(message)}</p>{detail?<small>{humanizeToastMessage(detail)}</small>:null}</div><button type="button" onClick={onDismiss} aria-label="Cerrar mensaje">×</button>
  </aside>
  return null
}
