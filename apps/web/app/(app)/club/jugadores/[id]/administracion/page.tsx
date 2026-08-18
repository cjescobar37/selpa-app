'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowLeft, ChevronRight, Trophy, UsersRound } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useSession } from '@/components/session/SessionProvider'
import { supabase } from '@/lib/supabaseClient'
import { getClubInitials } from '@/lib/clubAssets'
import styles from './playerAdministration.module.css'

type Detail = { player: { full_name: string; avatar_url: string | null; category: number | null; gender: string | null; ranking_points: number; approved_at: string | null; created_at: string; city: string | null; email: string | null }; membership: { role: string; status: string; created_at: string; approved_at: string | null } | null; stats: { tournaments_played: number; registrations: number }; permissions: { can_manage: boolean; can_view_private: boolean } }
const label = (value?: string | null) => ({ APPROVED: 'Aprobado', PENDING: 'Pendiente', REJECTED: 'Rechazado', BANNED: 'Bloqueado' }[String(value ?? '').toUpperCase()] ?? 'Sin estado')
const date = (value?: string | null) => value ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(value)) : 'Sin fecha'
const branch = (value?: string | null) => value === 'M' || value === 'MALE' ? 'Caballeros' : value === 'F' || value === 'FEMALE' ? 'Damas' : value ? 'Mixto' : 'Sin rama'

export default function PlayerAdministrationPage() {
  const { id } = useParams<{ id: string }>()
  const { activeClub } = useSession()
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!activeClub?.id || !id) return
    let mounted = true
    ;(async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      const response = await fetch('/api/clubs/' + activeClub.id + '/players/' + id + '/admin', { headers: token ? { Authorization: 'Bearer ' + token } : {}, cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!mounted) return
      if (!response.ok) { setError(payload.error ?? 'No pude cargar la ficha administrativa.'); return }
      setDetail(payload as Detail)
    })()
    return () => { mounted = false }
  }, [activeClub?.id, id])
  if (!detail) return <main className={styles.page}><Link href="/club/jugadores" className={styles.back}><ArrowLeft size={17} />Jugadores</Link><p className={error ? styles.error : styles.loading}>{error || 'Cargando ficha administrativa…'}</p></main>
  const status = detail.membership?.status ?? (detail.player.approved_at ? 'APPROVED' : 'PENDING')
  return <main className={styles.page}>
    <Link href="/club/jugadores" className={styles.back}><ArrowLeft size={17} />Jugadores</Link>
    <header className={styles.hero}><div className={styles.identity}><span className={styles.avatar}>{detail.player.avatar_url ? <Image src={detail.player.avatar_url} alt="" fill sizes="56px" /> : getClubInitials(detail.player.full_name)}</span><div><span>FICHA ADMINISTRATIVA</span><h1>{detail.player.full_name}</h1><p>{detail.player.category ? String(detail.player.category) + 'ta' : 'Sin categoría'} · {branch(detail.player.gender)}</p></div></div><b className={styles['status_' + String(status).toLowerCase()]}>{label(status)}</b></header>
    <section className={styles.summary}><div><span>Ranking</span><strong>{detail.player.ranking_points} pts</strong></div><div><span>Torneos</span><strong>{detail.stats.tournaments_played}</strong></div><div><span>Inscripciones</span><strong>{detail.stats.registrations}</strong></div><div><span>Alta</span><strong>{date(detail.membership?.approved_at ?? detail.player.approved_at)}</strong></div></section>
    <section className={styles.section}><header><Trophy size={18} /><div><span>COMPETENCIA</span><h2>Actividad del club</h2></div></header><p>{detail.stats.tournaments_played ? 'Participó en ' + detail.stats.tournaments_played + ' torneo' + (detail.stats.tournaments_played === 1 ? '' : 's') + ' del club.' : 'Todavía no registra torneos disputados en este club.'}</p></section>
    <section className={styles.section}><header><UsersRound size={18} /><div><span>MEMBRESÍA</span><h2>{label(status)}</h2></div></header><p>{detail.membership ? detail.membership.role + ' · solicitado el ' + date(detail.membership.created_at) : 'Sin membresía asociada.'}</p>{detail.permissions.can_view_private && detail.player.email ? <p className={styles.private}>{detail.player.email}{detail.player.city ? ' · ' + detail.player.city : ''}</p> : null}</section>
    {detail.permissions.can_manage ? <Link className={styles.manage} href="/club/jugadores"><span>Gestionar membresía</span><ChevronRight size={18} /></Link> : null}
  </main>
}
