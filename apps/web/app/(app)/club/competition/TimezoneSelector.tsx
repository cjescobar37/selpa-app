'use client'
import { useId, useMemo, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { competitionTimezoneLabel, competitionTimezoneOptions } from '@/lib/competitionTimezone'
import styles from './TimezoneSelector.module.css'

export default function TimezoneSelector({ value, onChange, disabled=false }: { value: string | null; onChange: (value: string) => void; disabled?:boolean }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const catalog = useMemo(() => competitionTimezoneOptions(value), [value])
  const options = catalog.filter(zone => normalize(`${competitionTimezoneLabel(zone)} ${zone}`).includes(normalize(query)))
  const choose = (zone: string) => { onChange(zone); setOpen(false); setQuery(''); setActive(0); document.getElementById(`${id}-trigger`)?.focus() }
  return <div className={styles.selector}>
    <input type="hidden" name="timezone" value={value ?? ''} />
    <button disabled={disabled} id={`${id}-trigger`} type="button" role="combobox" aria-label="Zona horaria" aria-expanded={open&&!disabled} aria-controls={`${id}-list`} aria-haspopup="listbox" onClick={() => { setOpen(!open); setQuery(''); setActive(0) }}><span>{value ? competitionTimezoneLabel(value) : 'Elegir zona horaria'}</span><ChevronDown size={17} /></button>
    {open&&!disabled ? <div className={styles.panel} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); document.getElementById(`${id}-trigger`)?.focus() } }}>
      <div className={styles.search}><Search size={17} /><input autoFocus aria-label="Buscar zona horaria" placeholder="Buscar ciudad o país" value={query} onChange={event => { setQuery(event.target.value); setActive(0) }} aria-controls={`${id}-list`} aria-activedescendant={options[active] ? `${id}-option-${active}` : undefined} onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); const next = Math.max(0, Math.min(options.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1))); setActive(next); document.getElementById(`${id}-option-${next}`)?.scrollIntoView({ block: 'nearest' }) }
        if (event.key === 'Enter') { event.preventDefault(); if (options[active]) choose(options[active]) }
      }} /></div>
      <div id={`${id}-list`} role="listbox" aria-label="Zonas horarias" className={styles.list}>{options.map((zone,index) => <button id={`${id}-option-${index}`} type="button" role="option" aria-selected={value === zone} key={zone} className={index === active ? styles.active : undefined} onClick={() => choose(zone)}><span>{competitionTimezoneLabel(zone)}</span>{value === zone ? <Check size={17} /> : null}</button>)}{!options.length ? <p>Sin coincidencias.</p> : null}</div>
    </div> : null}
  </div>
}
