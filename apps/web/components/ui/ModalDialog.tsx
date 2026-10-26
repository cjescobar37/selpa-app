'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import styles from './ModalDialog.module.css'

/** Native modal semantics, focus trap, scroll lock and a mobile Back entry. */
export default function ModalDialog({ title, onClose, children, fullscreen = false }: {
  title: string; onClose: () => void; children: ReactNode; fullscreen?: boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const historyKey = useRef('')
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    const element = dialog.current!
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    const key = historyKey.current || `selpa-dialog-${Date.now()}-${Math.random()}`
    historyKey.current = key
    const openingUrl = window.location.href
    if (window.history.state?.selpaDialog !== key) window.history.pushState({ ...window.history.state, selpaDialog: key }, '')
    const pop = () => onClose()
    window.addEventListener('popstate', pop)
    document.body.style.overflow = 'hidden'
    element.showModal()
    return () => {
      mounted.current = false
      window.removeEventListener('popstate', pop)
      document.body.style.overflow = previousOverflow
      element.close()
      previousFocus?.focus({ preventScroll: true })
      // React Strict Mode replays effects. Reuse the same entry on replay;
      // consume it only when really unmounted, still at the opening URL.
      queueMicrotask(() => {
        if (!mounted.current && window.location.href === openingUrl && window.history.state?.selpaDialog === key) window.history.back()
      })
    }
  }, [onClose])
  const dismiss = () => {
    if (window.history.state?.selpaDialog === historyKey.current) window.history.back()
    else onClose()
  }
  return <dialog ref={dialog} className={`${styles.dialog} ${fullscreen ? styles.fullscreen : ''}`} aria-label={title}
    onCancel={event => { event.preventDefault(); dismiss() }} onClick={event => { if (event.target === event.currentTarget) dismiss() }}>
    <header className={styles.header}><h2>{title}</h2><button type="button" onClick={dismiss} aria-label={`Cerrar ${title.toLowerCase()}`} autoFocus><X size={21} aria-hidden="true" /></button></header>
    <div className={styles.content}>{children}</div>
  </dialog>
}
