'use client'

import { useEffect, useId, useRef } from 'react'
import { toast, type ToastTone } from '@/lib/toastStore'

export type ActionFeedbackTone = ToastTone

/** Compatibility bridge: all existing notices use the single global viewport. */
export function ActionFeedbackNotice({ tone, title, message, detail, onDismiss, autoDismissMs }: {
  tone: ActionFeedbackTone
  title: string
  message: string
  detail?: string
  onDismiss: () => void
  autoDismissMs?: number
}) {
  const id = useId()
  const dismiss = useRef(onDismiss)
  useEffect(() => { dismiss.current = onDismiss }, [onDismiss])
  useEffect(() => {
    toast[tone](message, { title, detail, duration: autoDismissMs, dedupeKey: id, onDismiss: () => dismiss.current() })
  }, [id, tone, title, message, detail, autoDismissMs])
  return null
}
