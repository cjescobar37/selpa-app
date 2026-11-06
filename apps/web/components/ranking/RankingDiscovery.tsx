'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Search, X, Users, UserRound, Mars, Venus, SlidersHorizontal } from 'lucide-react'
import type { RankingContext } from '@/features/player-career/player-career.types'
import { rankingBranchHref, rankingHref, compactCategory, type RankingSearch } from '@/features/player-career/public-ranking.presentation'
import styles from './RankingDiscovery.module.css'

const categoryKey = (c: RankingContext) => c.categoryId ?? String(c.category ?? c.categoryName)

export default function RankingDiscovery({ contexts, current, params, seasons = [], enabledBranches }: {
  contexts: RankingContext[]; current: RankingContext | null; params: RankingSearch; seasons?: Array<{ id: string; name: string }>; enabledBranches?: Array<'M' | 'F' | 'MIXED'>;
}) {
  const router = useRouter()
  const [panel, setPanel] = useState<'search' | 'filters' | null>(params.q ? 'search' : null)
  const searchInput = useRef<HTMLInputElement>(null)
  const focusSearch = useRef(false)
  const searchOpen = panel === 'search'
  const filtersOpen = panel === 'filters'
  const categoriesRef = useRef<HTMLElement>(null)
  const modality = params.modality ?? 'INDIVIDUAL'
  const gender = current?.gender ?? params.gender ?? 'M'
  const available = contexts.filter(c => c.modality === modality && c.gender === gender)
  const categories = [...new Map(available.map(c => [categoryKey(c), c])).values()]
  const groups = current ? available.filter(c => categoryKey(c) === categoryKey(current)) : []
  const branches = (enabledBranches ?? ['M', 'F', 'MIXED']).filter(branch => branch !== 'MIXED' || contexts.some(c => c.gender === 'MIXED'))
  const hasFilters = seasons.length > 0 || groups.length > 0
  useEffect(() => {
    if (searchOpen && focusSearch.current) {
      searchInput.current?.focus()
      focusSearch.current = false
    }
  }, [searchOpen])
  useEffect(() => {
    const strip = categoriesRef.current
    const selected = strip?.querySelector<HTMLElement>('[aria-current="page"]')
    if (strip && selected) strip.scrollTo({ left: Math.max(0, selected.offsetLeft - (strip.clientWidth - selected.offsetWidth) / 2), behavior: 'instant' })
  }, [current?.divisionId])
  function categoryHref(category: RankingContext) {
    const target = available.find(c => categoryKey(c) === categoryKey(category) && c.segmentId === current?.segmentId) ?? category
    return rankingHref(params, { division: target.divisionId, category: target.category === null ? undefined : String(target.category), page: undefined })
  }
  function modeHref(mode: string) {
    const candidates = current ? contexts.filter(c => c.modality === mode && c.gender === gender && categoryKey(c) === categoryKey(current)) : []
    const target = candidates.find(c => c.segmentId === current?.segmentId) ?? candidates.find(c => c.segmentName?.toLocaleLowerCase('es-AR') === 'libres') ?? candidates[0]
    return rankingHref(params, { modality: mode, gender, division: target ? target.divisionId : undefined, category: target?.category == null ? undefined : String(target.category), page: undefined })
  }
  return <div className={styles.discovery}>
    <nav className={styles.modes} aria-label="Modalidad de ranking">
      {['PAIRS', 'INDIVIDUAL'].map(mode => <Link key={mode} href={modeHref(mode)} aria-current={modality === mode ? 'page' : undefined}>{mode === 'PAIRS' ? <Users size={18} aria-hidden="true"/> : <UserRound size={18} aria-hidden="true"/>}{mode === 'PAIRS' ? 'Parejas' : 'Individual'}</Link>)}
    </nav>
    {branches.length ? <nav className={styles.branches} aria-label="Ranking por rama">
      {branches.map(branch => <Link key={branch} data-branch={branch} aria-current={gender === branch ? 'page' : undefined}
        href={rankingBranchHref(params, branch, current?.category, contexts)}>{branch === 'M' ? <Mars size={17} aria-hidden="true"/> : branch === 'F' ? <Venus size={17} aria-hidden="true"/> : <Users size={17} aria-hidden="true"/>}{branch === 'M' ? 'Caballeros' : branch === 'F' ? 'Damas' : 'Mixto'}</Link>)}
    </nav> : null}
    <div className={styles.tools}>
      {categories.length ? <nav ref={categoriesRef} className={styles.categories} aria-label="Categorías del club">
        {categories.map(category => <Link key={categoryKey(category)} href={categoryHref(category)} aria-current={current && categoryKey(current) === categoryKey(category) ? 'page' : undefined} aria-label={category.categoryName}>{compactCategory(category)}</Link>)}
      </nav> : null}
      <div className={styles.toolActions}>
        <button type="button" className={styles.tool} aria-label="Buscar en el ranking" title="Buscar"
          aria-expanded={searchOpen} aria-controls={searchOpen ? 'ranking-search' : undefined} data-active={params.q ? 'true' : undefined}
          onClick={() => { focusSearch.current = !searchOpen; setPanel(searchOpen ? null : 'search') }}>
          <Search size={18} aria-hidden="true" />
        </button>
        {hasFilters ? <button type="button" className={styles.tool} aria-label="Filtros del ranking" title="Temporada y división"
          aria-expanded={filtersOpen} aria-controls={filtersOpen ? 'ranking-context-filters' : undefined}
          onClick={() => setPanel(filtersOpen ? null : 'filters')}>
          <SlidersHorizontal size={18} aria-hidden="true" />
        </button> : null}
      </div>
    </div>
    {searchOpen ?
      <form id="ranking-search" className={styles.search} action={params.demo === '1' ? '/preview/demo' : params.scope === 'club' ? '/club/ranking' : '/ranking'} method="get">
        {Object.entries(params).filter(([key, value]) => value && !['q', 'page', 'club', 'scope'].includes(key)).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
        <button type="submit" aria-label="Buscar"><Search size={19} aria-hidden="true" /></button>
        <label><span className={styles.srOnly}>Buscar {modality === 'PAIRS' ? 'pareja' : 'jugador'}</span><input ref={searchInput} key={params.q ?? ''} name="q" defaultValue={params.q ?? ''} maxLength={80} placeholder={modality === 'PAIRS' ? 'Buscar pareja…' : 'Buscar jugador…'} type="search" /></label>
        {params.q ? <a href={rankingHref(params, { q: undefined, page: undefined })} aria-label="Limpiar búsqueda"><X size={17} aria-hidden="true" /></a> : null}
      </form> : null}
    {filtersOpen && hasFilters ? <div className={styles.secondary} id="ranking-context-filters">
      {seasons.length ? <label className={styles.season}><span>Temporada</span>
        <select aria-label="Año del ranking" value={params.season ?? current?.seasonId ?? ''} onChange={event => router.push(rankingHref(params, { season: event.target.value, division: undefined, category: undefined, page: undefined }))}>
          {!current && !params.season ? <option value="">Elegir</option> : null}
          {seasons.map(season => <option key={season.id} value={season.id}>{season.name.replace(/^Temporada +/i, '')}</option>)}
        </select>
      </label> : null}
      {groups.length > 0 ? <label className={styles.group}><span>Grupo / división</span><select aria-label="Grupo del ranking" value={current?.divisionId} onChange={event => router.push(rankingHref(params, { division: event.target.value, page: undefined }))}>
        {groups.map(group => <option key={group.divisionId} value={group.divisionId}>{group.segmentName ?? 'General'}</option>)}
      </select></label> : null}
    </div> : null}
  </div>
}
