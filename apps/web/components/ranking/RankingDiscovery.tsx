'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import type { RankingContext } from '@/features/player-career/player-career.types'
import { rankingBranchHref, rankingHref, type RankingSearch } from '@/features/player-career/public-ranking.presentation'
import styles from './RankingDiscovery.module.css'

const categoryKey = (c: RankingContext) => c.categoryId ?? String(c.category ?? c.categoryName)

export default function RankingDiscovery({ contexts, current, params, seasons = [], enabledBranches }: {
  contexts: RankingContext[]; current: RankingContext | null; params: RankingSearch; seasons?: Array<{ id: string; name: string }>; enabledBranches?: Array<'M' | 'F' | 'MIXED'>;
}) {
  const router = useRouter()
  const [searchOpen, setSearchOpen] = useState(Boolean(params.q))
  const searchRef = useRef<HTMLInputElement>(null)
  const modality = params.modality ?? 'PAIRS'
  const gender = current?.gender ?? params.gender ?? 'M'
  const available = contexts.filter(c => c.modality === modality && c.gender === gender)
  const categories = [...new Map(available.map(c => [categoryKey(c), c])).values()]
  const groups = current ? available.filter(c => categoryKey(c) === categoryKey(current)) : []
  const branches = (enabledBranches ?? ['M', 'F', 'MIXED']).filter(branch => branch !== 'MIXED' || contexts.some(c => c.gender === 'MIXED'))
  function categoryHref(category: RankingContext) {
    const target = available.find(c => categoryKey(c) === categoryKey(category) && c.segmentId === current?.segmentId) ?? category
    return rankingHref(params, { division: target.divisionId, category: target.category === null ? undefined : String(target.category), page: undefined })
  }
  function modeHref(mode: string) {
    const target = current && contexts.find(c => c.modality === mode && c.gender === gender && categoryKey(c) === categoryKey(current) && c.segmentId === current.segmentId)
    return rankingHref(params, { modality: mode, gender, division: target ? target.divisionId : undefined, category: target?.category == null ? undefined : String(target.category), page: undefined })
  }
  return <div className={styles.discovery}>
    <nav className={styles.modes} aria-label="Modalidad de ranking">
      {['PAIRS', 'INDIVIDUAL'].map(mode => <Link key={mode} href={modeHref(mode)} aria-current={modality === mode ? 'page' : undefined}>{mode === 'PAIRS' ? 'Parejas' : 'Individual'}</Link>)}
    </nav>
    <nav className={styles.branches} aria-label="Ranking por rama">
      {branches.map(branch => <Link key={branch} data-branch={branch} aria-current={gender === branch ? 'page' : undefined}
        href={rankingBranchHref(params, branch, current?.category, contexts)}>{branch === 'M' ? 'Caballeros' : branch === 'F' ? 'Damas' : 'Mixto'}</Link>)}
    </nav>
    {categories.length ? <nav className={styles.categories} aria-label="Categorías del club">
      {categories.map(category => <Link key={categoryKey(category)} href={categoryHref(category)} aria-current={current && categoryKey(current) === categoryKey(category) ? 'page' : undefined}>{category.categoryName}</Link>)}
    </nav> : null}
    <div className={styles.secondary}>
      {seasons.length ? <label className={styles.season}><span>Temporada</span>
        <select aria-label="Temporada del ranking" value={params.season ?? current?.seasonId ?? ''} onChange={event => router.push(rankingHref(params, { season: event.target.value, division: undefined, category: undefined, page: undefined }))}>
          {!current && !params.season ? <option value="">Elegir</option> : null}
          {seasons.map(season => <option key={season.id} value={season.id}>{season.name.replace(/^Temporada +/i, '')}</option>)}
        </select>
      </label> : <span />}
      {groups.length > 1 ? <label className={styles.group}><span>Grupo</span><select aria-label="Grupo del ranking" value={current?.divisionId} onChange={event => router.push(rankingHref(params, { division: event.target.value, page: undefined }))}>
        {groups.map(group => <option key={group.divisionId} value={group.divisionId}>{group.segmentName ?? 'General'}</option>)}
      </select></label> : null}
      <button type="button" className={styles.searchToggle} aria-label="Buscar en el ranking" aria-expanded={searchOpen} onClick={() => { setSearchOpen(v => !v); requestAnimationFrame(() => searchRef.current?.focus()) }}><Search size={18} aria-hidden="true" /></button>
    </div>
    {searchOpen ? <form className={styles.search} action={params.demo === '1' ? '/preview/demo' : params.scope === 'club' ? '/club/ranking' : '/ranking'} method="get">
      {Object.entries(params).filter(([key, value]) => value && !['q', 'page', 'club', 'scope'].includes(key)).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
      <label><span className={styles.srOnly}>Buscar {modality === 'PAIRS' ? 'pareja' : 'jugador'}</span><input key={params.q ?? ''} ref={searchRef} name="q" defaultValue={params.q ?? ''} maxLength={80} placeholder="Buscar por nombre" type="search" /></label>
      <button type="submit" aria-label="Buscar"><Search size={18} aria-hidden="true" /></button>
      {params.q ? <Link href={rankingHref(params, { q: undefined, page: undefined })} aria-label="Limpiar búsqueda"><X size={18} aria-hidden="true" /></Link> : null}
    </form> : null}
  </div>
}
