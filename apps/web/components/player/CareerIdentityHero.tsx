'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useCallback, useState } from 'react'
import { Camera, ChevronRight, Pencil, Share2 } from 'lucide-react'
import ProfilePhotoViewer from './ProfilePhotoViewer'
import { profileEditorHref } from '@/lib/profileEditorHref'
import PageBackAction from '@/components/navigation/PageBackAction'
import RankingPlayerAvatar from '@/components/ranking/RankingPlayerAvatar'
import type { CareerIdentity } from '@/features/player-career/player-career.types'
import styles from './CareerIdentityHero.module.css'

/** Restores playerProfileV3's cover + overlapping photo + identity, not its
 * administrative controls or legacy sports numbers. Public fields only. */
export default function CareerIdentityHero({identity,own=false,demo=false,category,gender,editorHref='/mis-datos',onShare}:{identity:CareerIdentity;own?:boolean;demo?:boolean;category?:string;gender?:string;editorHref?:string;onShare:()=>void}) {
  const [failedCover,setFailedCover]=useState<string|null>(null)
  const [photo,setPhoto]=useState<'avatar'|'cover'|null>(null)
  const closePhoto=useCallback(()=>setPhoto(null),[])
  const coverFailed=failedCover===identity.coverUrl
  const context=identity.contexts.find(c=>c.clubPlayerId===identity.selectedClubPlayerId)
  return <section className={styles.hero} data-profile-owner={own || undefined} aria-label="Identidad del jugador">
    <div className={styles.cover} data-cover-state={identity.coverUrl && !coverFailed ? 'photo' : 'fallback'}>
      {identity.coverUrl && !coverFailed?<button className={styles.coverView} type="button" aria-label={`Ver portada de ${identity.name}`} onClick={()=>setPhoto('cover')}><Image src={identity.coverUrl} alt="" fill unoptimized priority sizes="(max-width: 768px) 100vw, 980px" onError={()=>setFailedCover(identity.coverUrl)}/></button>:null}
      {!identity.coverUrl || coverFailed ? <div className={styles.coverSignature} aria-hidden="true"><span>SELPA</span><small>EL JUEGO DEJA HUELLA</small></div> : null}
      <div className={styles.heroBack}><PageBackAction href={demo?'/preview/demo':own?'/player':'/ranking'} tone="dark"/></div>
      {own ? <Link className={styles.coverEdit} href={profileEditorHref(editorHref,'cover')} aria-label="Cambiar portada" title="Cambiar portada"><Camera size={19} aria-hidden="true"/></Link> : null}
    </div>
    <div className={styles.heroIntro}>
      <div className={styles.avatarStage}>
        {identity.avatarUrl ? <button className={styles.avatarView} type="button" aria-label={`Ver foto de perfil de ${identity.name}`} onClick={()=>setPhoto('avatar')}><RankingPlayerAvatar name={identity.name} src={identity.avatarUrl} sizes="(max-width: 600px) 152px, 168px" className={styles.heroAvatar}/></button> : <RankingPlayerAvatar name={identity.name} sizes="(max-width: 600px) 152px, 168px" className={styles.heroAvatar}/>}
        {own ? <Link className={styles.avatarEdit} href={profileEditorHref(editorHref,'avatar')} aria-label="Cambiar foto de perfil"><Camera size={18}/></Link> : null}
      </div>
      <div className={styles.heroName}><span>{own?'Mi perfil':'Perfil de jugador'} · SELPA</span><h1>{identity.name}</h1>
        {context?<div className={styles.identityMeta}><Link href={demo?'/preview/demo':`/clubs/${context.clubId}`}>{context.clubName}<ChevronRight size={14}/></Link><p>{category ?? (context.category?`${context.category}ª categoría`:'Categoría no publicada')}{(gender??context.gender)?` · ${(gender??context.gender)==='F'?'Damas':(gender??context.gender)==='M'?'Caballeros':'Mixto'}`:''}</p></div>:<p>Identidad global · SELPA</p>}
        <div className={styles.profileActions}>
          {own ? <><Link className={styles.primaryAction} href="/mis-datos"><Pencil size={17}/>Editar perfil</Link><Link href="/completar-perfil?edit=sports&returnTo=%2Fperfil">Datos deportivos</Link><button type="button" onClick={onShare} aria-label="Compartir mi perfil"><Share2 size={17}/><span>Compartir</span></button></> : <><a className={styles.primaryAction} href="#perfil-carrera">Ver carrera</a>{context?<Link href={demo?'/preview/demo':`/clubs/${context.clubId}`}>Ver club</Link>:null}<button type="button" onClick={onShare} aria-label="Compartir perfil"><Share2 size={17}/><span>Compartir</span></button></>}
        </div>
      </div>
    </div>
    {photo && (photo==='cover'?identity.coverUrl:identity.avatarUrl) ? <ProfilePhotoViewer key={photo} src={(photo==='cover'?identity.coverUrl:identity.avatarUrl)!} title={`${photo==='cover'?'Portada':'Foto de perfil'} de ${identity.name}`} onClose={closePhoto}/> : null}
  </section>
}
