'use client'

import { useCallback, useState } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import ModalDialog from '@/components/ui/ModalDialog'
import styles from './TournamentSearch.module.css'

type Props = {
  query: string; onQuery: (value: string) => void;
  category: string; onCategory: (value: string) => void;
  gender: string; onGender: (value: string) => void;
  club: string; onClub: (value: string) => void; clubs: string[]; count: number;
}
const branches = [{ value: 'all', label: 'Todas' }, { value: 'M', label: 'Caballeros' }, { value: 'F', label: 'Damas' }, { value: 'MIXED', label: 'Mixto' }]
export default function TournamentSearch({ query, onQuery, category, onCategory, gender, onGender, club, onClub, clubs, count }: Props) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const filters = [
    ...(category !== 'all' ? [{ label: `${category}ª categoría`, clear: () => onCategory('all') }] : []),
    ...(gender !== 'all' ? [{ label: branches.find(branch => branch.value === gender)?.label ?? gender, clear: () => onGender('all') }] : []),
    ...(club !== 'all' ? [{ label: club, clear: () => onClub('all') }] : []),
  ]
  const clear = () => { onCategory('all'); onGender('all'); onClub('all') }
  return <section className={styles.search} aria-label="Buscar torneos">
    <div className={styles.row}>
      <label className={styles.field}><Search size={18} aria-hidden="true" /><input type="search" value={query} onChange={event => onQuery(event.target.value)} placeholder="Buscá un torneo o club" aria-label="Buscá un torneo o club" /></label>
      <button className={styles.filterButton} type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}><SlidersHorizontal size={17} aria-hidden="true" /><span>Filtros{filters.length ? ` (${filters.length})` : ''}</span></button>
    </div>
    {filters.length ? <div className={styles.chips} aria-label="Filtros activos">{filters.map(filter => <button key={filter.label} type="button" onClick={filter.clear} aria-label={`Quitar filtro ${filter.label}`}><span>{filter.label}</span><X size={14} aria-hidden="true" /></button>)}<button type="button" className={styles.clear} onClick={clear}>Limpiar</button></div> : null}
    {open ? <ModalDialog title="Filtrar torneos" onClose={close}>
      <div className={styles.filters}>
        <label>Categoría<select aria-label="Categoría" value={category} onChange={event => onCategory(event.target.value)}>{['all', '1', '2', '3', '4', '5', '6', '7'].map(value => <option key={value} value={value}>{value === 'all' ? 'Todas las categorías' : `${value}ª categoría`}</option>)}</select></label>
        <label>Rama<select aria-label="Rama" value={gender} onChange={event => onGender(event.target.value)}>{branches.map(branch => <option key={branch.value} value={branch.value}>{branch.label}</option>)}</select></label>
        <label>Club<select aria-label="Club" value={club} onChange={event => onClub(event.target.value)}><option value="all">Todos los clubes</option>{clubs.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <p role="status">{count} {count === 1 ? 'torneo coincide' : 'torneos coinciden'} con tu búsqueda.</p>
        <button className={styles.reset} type="button" disabled={!filters.length} onClick={clear}>Limpiar filtros</button>
        <button className={styles.apply} type="button" onClick={() => window.history.back()}>Ver resultados</button>
      </div>
    </ModalDialog> : null}
  </section>
}
