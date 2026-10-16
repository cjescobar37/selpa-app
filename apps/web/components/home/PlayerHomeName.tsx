'use client'

import { useEffect, useRef, useState } from 'react'
import homePilot from '@/components/home/HomeMobilePilot.module.css'

export default function PlayerHomeName({ name }: { name: string }) {
  const text = useRef<HTMLSpanElement>(null)
  const [canExpand, setCanExpand] = useState<boolean | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const node = text.current
    if (!node) return
    let active = true
    const measure = () => {
      if (active) setCanExpand(node.scrollHeight > parseFloat(getComputedStyle(node).lineHeight) * 2 + 1)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    void document.fonts.ready.then(measure)
    document.fonts.addEventListener('loadingdone', measure)
    return () => { active = false; observer.disconnect(); document.fonts.removeEventListener('loadingdone', measure) }
  }, [name, canExpand])

  const label = `Hola, ${name}`
  const content = <span ref={text} className={homePilot.nameText} data-unclamped={expanded || canExpand === false || undefined}>{label}</span>
  return (
    <h1 aria-label={label} title={label}>
      {canExpand ? <button type="button" className={homePilot.nameToggle} aria-expanded={expanded}
        aria-label={`${expanded ? 'Contraer nombre' : 'Ver nombre completo'}: ${name}`}
        onClick={() => setExpanded(value => !value)} onKeyDown={event => { if (event.key === 'Escape') setExpanded(false) }}>
        {content}
      </button> : content}
    </h1>
  )
}
