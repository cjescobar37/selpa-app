'use client'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import type { RankingContext } from '@/features/player-career/player-career.types'
import { rankingHref, type RankingSearch } from '@/features/player-career/public-ranking.presentation'
import styles from './RankingDiscovery.module.css'

export default function RankingDiscovery({contexts,current,params}:{contexts:RankingContext[];current:RankingContext|null;params:RankingSearch}) {
  const dialog=useRef<HTMLDialogElement>(null)
  const [searchOpen,setSearchOpen]=useState(Boolean(params.q))
  const modality=params.modality ?? 'INDIVIDUAL',gender=current?.gender ?? params.gender ?? 'M'
  const categories=contexts.filter(c=>c.modality===modality && c.gender===gender)
  const modalities=[...new Set(contexts.map(c=>c.modality))]
  const searchRef=useRef<HTMLInputElement>(null)
  return <div className={styles.discovery}>
    <nav className={styles.branches} aria-label="Ranking por rama">{(['M','F'] as const).map(branch=><Link key={branch} data-branch={branch} aria-current={gender===branch?'page':undefined}
      href={rankingHref(params,{gender:branch,division:undefined,category:undefined,page:undefined})}>{branch==='M'?'Caballeros':'Damas'}</Link>)}</nav>
    <div className={styles.tools}>
      <button type="button" aria-haspopup="dialog" onClick={()=>dialog.current?.showModal()}>{current?.categoryName ?? 'Elegir categoría'}<ChevronDown size={17}/></button>
      {modalities.length>1?<nav className={styles.modes} aria-label="Modalidad">{modalities.map(mode=><Link key={mode} aria-current={modality===mode?'page':undefined} href={rankingHref(params,{modality:mode,division:undefined,category:undefined,page:undefined})}>{mode==='PAIRS'?'Parejas':'Individual'}</Link>)}</nav>:null}
      <button type="button" className={styles.searchToggle} aria-label="Buscar jugador" aria-expanded={searchOpen} onClick={()=>{setSearchOpen(v=>!v);requestAnimationFrame(()=>searchRef.current?.focus())}}><Search size={19}/></button>
    </div>
    {searchOpen?<form className={styles.search} action="/ranking" method="get">
      {Object.entries(params).filter(([key,value])=>value && !['q','page','club'].includes(key)).map(([key,value])=><input key={key} type="hidden" name={key} value={value}/>)}
      <label><span>Buscar {modality==='PAIRS'?'pareja':'jugador'}</span><input ref={searchRef} name="q" defaultValue={params.q ?? ''} maxLength={80} placeholder="Nombre" type="search"/></label>
      <button type="submit" aria-label="Buscar"><Search size={18}/></button>
      {params.q?<Link href={rankingHref(params,{q:undefined,page:undefined})} aria-label="Limpiar búsqueda"><X size={18}/></Link>:null}
    </form>:null}
    <dialog ref={dialog} className={styles.sheet} aria-labelledby="ranking-category-title" onClick={event=>{if(event.target===dialog.current)dialog.current?.close()}}>
      <header><h2 id="ranking-category-title">Elegí categoría</h2><button type="button" autoFocus aria-label="Cerrar categorías" onClick={()=>dialog.current?.close()}><X size={20}/></button></header>
      <p>{gender==='F'?'Damas':'Caballeros'} · {modality==='PAIRS'?'Parejas':'Individual'}</p>
      <nav aria-label="Categorías">{categories.map(c=><Link key={c.divisionId} aria-current={current?.divisionId===c.divisionId?'page':undefined} onClick={()=>dialog.current?.close()}
        href={rankingHref(params,{division:c.divisionId,category:c.category===null?undefined:String(c.category),page:undefined})}><strong>{c.categoryName}</strong><span>{c.rankedCount===undefined?'Lectura no disponible':c.rankedCount>0?`${c.rankedCount} ${modality==='PAIRS'?'parejas':'jugadores'} rankeados`:'Sin ranking publicado'}</span></Link>)}</nav>
      {!categories.length?<p>No hay categorías disponibles en este contexto.</p>:null}
    </dialog>
  </div>
}
