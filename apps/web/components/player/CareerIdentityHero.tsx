'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'
import { Share2 } from 'lucide-react'
import PageBackAction from '@/components/navigation/PageBackAction'
import RankingPlayerAvatar from '@/components/ranking/RankingPlayerAvatar'
import type { CareerIdentity } from '@/features/player-career/player-career.types'
import styles from './CareerIdentityHero.module.css'

/** Restores playerProfileV3's cover + overlapping photo + identity, not its
 * administrative controls or legacy sports numbers. Public fields only. */
export default function CareerIdentityHero({identity,own=false,demo=false,category,gender,onShare}:{identity:CareerIdentity;own?:boolean;demo?:boolean;category?:string;gender?:string;onShare:()=>void}) {
  const [coverFailed,setCoverFailed]=useState(false)
  const context=identity.contexts.find(c=>c.clubPlayerId===identity.selectedClubPlayerId)
  return <section className={styles.hero} data-profile-owner={own || undefined} aria-label="Identidad del jugador">
    <div className={styles.cover} data-cover-state={identity.coverUrl && !coverFailed ? 'photo' : 'fallback'}>
      {identity.coverUrl && !coverFailed?<Image src={identity.coverUrl} alt="" fill unoptimized priority sizes="(max-width: 768px) 100vw, 980px" onError={()=>setCoverFailed(true)}/>:null}
      {!identity.coverUrl || coverFailed ? <div className={styles.coverSignature} aria-hidden="true"><span>SELPA</span><small>EL JUEGO DEJA HUELLA</small></div> : null}
      <div className={styles.heroBack}><PageBackAction href={demo?'/preview/demo':own?'/player':'/ranking'} tone="dark"/></div>
      <button className={styles.heroShare} type="button" onClick={onShare} aria-label="Compartir perfil público"><Share2 size={18}/>Compartir</button>
    </div>
    <div className={styles.heroIntro}>
      <RankingPlayerAvatar name={identity.name} src={identity.avatarUrl} sizes="(max-width: 600px) 140px, 156px" className={styles.heroAvatar}/>
      <div className={styles.heroName}><span>{own?'Mi carrera':'Perfil público'} · SELPA</span><h1>{identity.name}</h1>
        {context?<><Link href={demo?'/preview/demo':`/clubs/${context.clubId}`}>{context.clubName}</Link><p>{category ?? (context.category?`${context.category}ª categoría`:'Categoría no publicada')}{(gender??context.gender)?` · ${(gender??context.gender)==='F'?'Damas':(gender??context.gender)==='M'?'Caballeros':'Mixto'}`:''}</p></>:<p>Identidad global · SELPA</p>}
      </div>
    </div>
  </section>
}
