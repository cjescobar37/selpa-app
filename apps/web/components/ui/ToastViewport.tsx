'use client'

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, CircleAlert, Info, X } from 'lucide-react'
import { toast, visibleToasts, type ToastMessage } from '@/lib/toastStore'
import styles from './ToastViewport.module.css'

const empty: ToastMessage[] = []
const subscribeHydration = () => () => {}

function ToastEntry({ item }: { item: ToastMessage }) {
  const element = useRef<HTMLElement>(null)
  const close = useCallback(() => {
    const node = element.current
    if (!node || !node.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { toast.dismiss(item.id); return }
    if (node.dataset.closing) return
    node.dataset.closing = 'true'
    node.animate([{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: '0 -4px' }], { duration: 160, fill: 'forwards' }).finished.then(() => toast.dismiss(item.id), () => toast.dismiss(item.id))
  }, [item.id])
  useEffect(() => {
    if (item.duration === null) return
    const timer = window.setTimeout(close, item.duration)
    return () => window.clearTimeout(timer)
  }, [close, item.duration])
  const Icon = { success: CheckCircle2, error: CircleAlert, warning: AlertTriangle, info: Info }[item.tone]
  return <aside ref={element} data-toast={item.tone} className={`${styles.toast} ${styles[item.tone]}`} role={item.tone === 'error' ? 'alert' : 'status'} aria-live={item.tone === 'error' ? 'assertive' : 'polite'} aria-atomic="true">
    <Icon aria-hidden="true" /><div>{item.title ? <strong>{item.title}</strong> : null}<span>{item.message}</span>{item.detail ? <small>{item.detail}</small> : null}</div>
    <button type="button" aria-label={`Cerrar mensaje: ${item.title || item.message}`} onClick={close}><X aria-hidden="true" /></button>
  </aside>
}

export function ToastViewport() {
  const messages = useSyncExternalStore(toast.subscribe, toast.getSnapshot, () => empty)
  const hydrated = useSyncExternalStore(subscribeHydration, () => true, () => false)
  useEffect(() => {
    const measure = () => {
      const header = document.querySelector('.px-nav')?.getBoundingClientRect()
      document.documentElement.style.setProperty('--selpa-toast-top', `${Math.max(72, header && header.top < 100 ? header.bottom + 8 : 72)}px`)
      const viewport = document.querySelector<HTMLElement>('[data-toast-viewport]')
      const active = document.activeElement
      if (viewport) {
        viewport.dataset.placement = 'top'
        if (active instanceof HTMLElement && active.matches('input,select,textarea')) {
          const input = active.getBoundingClientRect(), stack = viewport.getBoundingClientRect()
          if (input.top < stack.bottom && input.bottom > stack.top) viewport.dataset.placement = 'bottom'
        }
      }
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('focusin', measure)
    window.addEventListener('focusout', measure)
    const observer = new MutationObserver(measure)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure); window.removeEventListener('focusin', measure); window.removeEventListener('focusout', measure) }
  }, [])
  if (!hydrated) return null
  const visible = visibleToasts(messages)
  return createPortal(<div data-toast-viewport className={styles.viewport} aria-label="Mensajes de acciones">{visible.map(item => <ToastEntry key={item.id} item={item} />)}{messages.length > visible.length ? <small className={styles.queued}>{messages.length - visible.length} mensajes pendientes</small> : null}</div>, document.body)
}
