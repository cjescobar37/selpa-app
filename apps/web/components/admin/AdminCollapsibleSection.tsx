'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

export function AdminCollapsibleSection({
  title,
  summary,
  children,
  open: controlledOpen,
  onToggle,
}: {
  title: string
  summary: string
  children: ReactNode
  open?: boolean
  onToggle?: () => void
}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen

  return (
    <section className={`adminCollapsibleSection ${open ? 'is-open' : ''}`}>
      <button
        className="adminCollapsibleSection__toggle"
        type="button"
        aria-expanded={open}
        onClick={onToggle ?? (() => setInternalOpen((value) => !value))}
      >
        <span><strong>{title}</strong><small>{summary}</small></span>
        <span className="adminCollapsibleSection__action">Editar <ChevronDown size={17} aria-hidden /></span>
      </button>
      <div className="adminCollapsibleSection__content">{children}</div>
    </section>
  )
}
