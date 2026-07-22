'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Activity, Clock3, MapPin, Pencil, ShieldCheck } from 'lucide-react'
import { useSession } from '@/components/session/SessionProvider'
import PlayerStatePanel from '@/components/player/PlayerStatePanel'
import PlayerSpaceLayout from '@/components/player/PlayerSpaceLayout'
import { supabase } from '@/lib/supabaseClient'

type Membership = {
  club_id: string
  status: string
  approved_at: string | null
  player_id: string | null
  club: { id: string; name: string; city: string | null; logo_url: string | null } | null
}

function label(value: string | null | undefined, values: Record<string, string>) {
  return value ? values[value] ?? value : 'Sin completar'
}

export default function PerfilPage() {
  const router = useRouter()
  const session = useSession()
  const profile = session.globalProfile
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [loadingMemberships, setLoadingMemberships] = useState(true)

  useEffect(() => {
    if (session.status !== 'ready' || !session.user) return
    let alive = true
    async function loadMemberships() {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) return setLoadingMemberships(false)
      const response = await fetch('/api/clubs/my-memberships', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      const result = await response.json().catch(() => null) as { memberships?: Membership[] } | null
      if (alive) {
        setMemberships(response.ok ? result?.memberships ?? [] : [])
        setLoadingMemberships(false)
      }
    }
    void loadMemberships()
    return () => { alive = false }
  }, [session.status, session.user])

  const approved = memberships.filter((item) => item.status === 'APPROVED' && item.approved_at && item.club)
  const preferredPlayer = approved.find((item) => item.club_id === session.activeClubId && item.player_id) ?? approved.find((item) => item.player_id)

  useEffect(() => {
    if (!loadingMemberships && preferredPlayer?.player_id) {
      router.replace(`/jugadores/${preferredPlayer.player_id}?own=1`)
    }
  }, [loadingMemberships, preferredPlayer?.player_id, router])

  if (session.status === 'loading') return <PlayerStatePanel kind="loading" title="Cargando perfil" message="Preparando tu perfil público" viewport />
  if (!session.user) return <PlayerStatePanel kind="empty" title="Ingresá para ver tu perfil" message="Tu perfil público estará disponible al iniciar sesión." action={{ label: 'Ingresar', href: '/login' }} viewport />
  if (loadingMemberships) return <PlayerStatePanel kind="loading" title="Cargando perfil" message="Preparando tu perfil deportivo" viewport />

  const pending = memberships.filter((item) => item.status === 'PENDING' && item.club)
  const playerName = profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || session.user.name
  const location = [profile?.city, profile?.province].filter(Boolean).join(' · ') || 'Argentina'
  const clubName = session.activeClub?.name || approved[0]?.club?.name || 'Sin club'
  const initials = playerName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()

  if (preferredPlayer?.player_id) return <PlayerStatePanel kind="loading" title="Cargando perfil" message="Preparando tu perfil deportivo" viewport />

  return <PlayerSpaceLayout><main className="publicPlayerProfile">
    <section className="publicPlayerProfile__cover" style={profile?.cover_url ? { backgroundImage: `linear-gradient(180deg,rgba(5,20,42,.08),rgba(5,20,42,.62)),url(${profile.cover_url})` } : undefined}>
      <span>Perfil público</span>
    </section>
    <section className="publicPlayerProfile__identity">
      <div className="publicPlayerProfile__avatar">{profile?.avatar_url ? <Image src={profile.avatar_url} alt={`Foto de ${playerName}`} width={132} height={132} /> : initials}</div>
      <div><h1>{playerName}</h1><p><MapPin />{location}</p><strong>{clubName}</strong></div>
      <Link href="/mis-datos"><Pencil />Mis datos</Link>
    </section>
    <section className="publicPlayerProfile__facts">
      <article><span>Mano hábil</span><strong>{label(profile?.dominant_hand, { RIGHT: 'Derecha', LEFT: 'Izquierda', AMBIDEXTROUS: 'Ambidiestro/a' })}</strong></article>
      <article><span>Posición</span><strong>{label(profile?.preferred_position, { DRIVE: 'Drive', REVES: 'Revés', BOTH: 'Ambas' })}</strong></article>
      <article><span>Altura</span><strong>{profile?.height_cm ? `${profile.height_cm} cm` : 'Sin completar'}</strong></article>
    </section>
    {!loadingMemberships && !approved.length ? <section className="publicPlayerProfile__noClub"><ShieldCheck /><div><strong>Sin club</strong><p>Tu perfil sigue activo y visible. Podés sumarte a un club cuando quieras.</p></div><Link href="/clubs">Explorar clubes</Link></section> : null}
    {pending.length ? <section className="publicPlayerProfile__requests"><header><Clock3 /><div><span>Solicitudes pendientes</span><h2>Clubes revisando tu ingreso</h2></div></header>{pending.map((item) => <article key={item.club_id}><span>{item.club?.name.slice(0,2).toUpperCase()}</span><div><strong>{item.club?.name}</strong><small>{item.club?.city || 'Solicitud enviada'}</small></div><em>En revisión</em></article>)}</section> : null}
    <Link className="publicPlayerProfile__activity" href="/actividad"><Activity /><div><strong>Actividad</strong><span>Revisá tus últimas novedades e inscripciones</span></div></Link>
    <style>{`
      .publicPlayerProfile{color:#061b3a;display:grid;gap:14px;width:100%}.publicPlayerProfile__identity{align-items:center;background:#fff;border:1px solid var(--player-card-border);border-radius:var(--player-card-radius);box-shadow:var(--player-card-shadow);display:grid;gap:18px;grid-template-columns:112px minmax(0,1fr) auto;padding:18px 22px}.publicPlayerProfile__avatar{align-items:center;background:#0f274a;border:4px solid #fff;border-radius:50%;box-shadow:0 12px 28px rgba(15,23,42,.18);color:#fff;display:flex;font-size:28px;font-weight:850;height:112px;justify-content:center;overflow:hidden;width:112px}.publicPlayerProfile__avatar img{height:100%;object-fit:cover;width:100%}.publicPlayerProfile__identity h1{font-size:30px;line-height:1;margin:0 0 7px}.publicPlayerProfile__identity p{align-items:center;color:#64748b;display:flex;font-size:12px;gap:5px;margin:0 0 5px}.publicPlayerProfile__identity p svg{height:14px;width:14px}.publicPlayerProfile__identity strong{font-size:13px}.publicPlayerProfile__identity>a{align-items:center;background:#061b3a;border-radius:11px;color:#fff;display:flex;font-size:12px;font-weight:750;gap:6px;padding:11px 14px;text-decoration:none}.publicPlayerProfile__identity>a svg{height:15px;width:15px}.publicPlayerProfile__facts{display:grid;gap:10px;grid-template-columns:repeat(3,1fr)}.publicPlayerProfile__facts article,.publicPlayerProfile__noClub,.publicPlayerProfile__requests,.publicPlayerProfile__activity{background:#fff;border:1px solid var(--player-card-border);border-radius:var(--player-card-radius);box-shadow:var(--player-card-shadow)}.publicPlayerProfile__facts article{padding:13px}.publicPlayerProfile__facts span{color:#64748b;display:block;font-size:10px;font-weight:800;text-transform:uppercase}.publicPlayerProfile__facts strong{display:block;font-size:14px;margin-top:4px}.publicPlayerProfile__noClub{align-items:center;display:grid;gap:12px;grid-template-columns:38px minmax(0,1fr) auto;padding:13px}.publicPlayerProfile__noClub>svg{background:color-mix(in srgb,var(--player-accent) 12%,white);border-radius:11px;color:var(--player-accent);height:38px;padding:9px;width:38px}.publicPlayerProfile__noClub strong{font-size:14px}.publicPlayerProfile__noClub p{color:#64748b;font-size:11px;margin:3px 0 0}.publicPlayerProfile__noClub a{color:var(--player-accent);font-size:11px;font-weight:800;text-decoration:none}.publicPlayerProfile__requests{border-color:color-mix(in srgb,var(--player-accent) 38%,var(--player-card-border));padding:14px}.publicPlayerProfile__requests header{align-items:center;display:flex;gap:9px;margin-bottom:8px}.publicPlayerProfile__requests header>svg,.publicPlayerProfile__requests header span{color:var(--player-accent)}.publicPlayerProfile__requests header span{font-size:9px;font-weight:850;text-transform:uppercase}.publicPlayerProfile__requests h2{font-size:16px;margin:2px 0 0}.publicPlayerProfile__requests article{align-items:center;border-top:1px solid #edf2f7;display:grid;gap:9px;grid-template-columns:34px minmax(0,1fr) auto;padding:9px 0}.publicPlayerProfile__requests article>span{align-items:center;background:color-mix(in srgb,var(--player-accent) 10%,white);border-radius:10px;color:var(--player-accent);display:flex;font-size:10px;font-weight:850;height:34px;justify-content:center}.publicPlayerProfile__requests article strong,.publicPlayerProfile__requests article small{display:block}.publicPlayerProfile__requests article strong{font-size:12px}.publicPlayerProfile__requests article small{color:#64748b;font-size:10px}.publicPlayerProfile__requests em{background:#fff7ed;border-radius:999px;color:#b45309;font-size:10px;font-style:normal;font-weight:800;padding:6px 8px}.publicPlayerProfile__activity{align-items:center;color:inherit;display:grid;gap:10px;grid-template-columns:34px 1fr;padding:12px;text-decoration:none}.publicPlayerProfile__activity>svg{color:var(--player-accent)}.publicPlayerProfile__activity strong,.publicPlayerProfile__activity span{display:block}.publicPlayerProfile__activity strong{font-size:13px}.publicPlayerProfile__activity span{color:#64748b;font-size:10px;margin-top:2px}@media(max-width:600px){.publicPlayerProfile{gap:12px}.publicPlayerProfile__identity{grid-template-columns:1fr;justify-items:center;padding:16px;text-align:center}.publicPlayerProfile__avatar{height:132px;width:132px}.publicPlayerProfile__identity h1{font-size:28px}.publicPlayerProfile__identity p{justify-content:center}.publicPlayerProfile__facts article{padding:10px 7px;text-align:center}.publicPlayerProfile__facts strong{font-size:12px}.publicPlayerProfile__noClub{grid-template-columns:34px 1fr}.publicPlayerProfile__noClub>a{grid-column:2}}
    `}</style>
    <style>{`
      .publicPlayerProfile{background:#f8fafc;border:1px solid #e2e8f0;border-radius:22px;box-shadow:0 20px 55px rgba(15,23,42,.09);display:block;overflow:hidden}
      .publicPlayerProfile__cover{align-items:flex-start;background:linear-gradient(135deg,#0b3151,#13536a);background-position:center;background-size:cover;display:flex;height:230px;padding:18px}
      .publicPlayerProfile__cover span{background:rgba(6,27,58,.72);border:1px solid rgba(255,255,255,.25);border-radius:999px;color:#fff;font-size:11px;font-weight:800;padding:7px 10px}
      .publicPlayerProfile__identity{background:transparent;border:0;border-radius:0;box-shadow:none;grid-template-columns:150px minmax(0,1fr) auto;margin-top:-72px;padding:0 28px 22px}
      .publicPlayerProfile__avatar{height:150px;width:150px}
      .publicPlayerProfile__identity h1{font-size:34px;margin:78px 0 7px}
      .publicPlayerProfile__identity>a{margin-top:72px}
      .publicPlayerProfile__facts{padding:0 28px 20px}
      .publicPlayerProfile__noClub{margin:0 28px 14px}
      .publicPlayerProfile__requests{margin:0 28px 14px}
      .publicPlayerProfile__activity{margin:0 28px 28px}
      @media(max-width:600px){
        .publicPlayerProfile{border-radius:0;min-height:100vh}
        .publicPlayerProfile__cover{height:185px}
        .publicPlayerProfile__identity{grid-template-columns:1fr;justify-items:center;margin-top:-64px;padding:0 16px 18px;text-align:center}
        .publicPlayerProfile__avatar{height:132px;width:132px}
        .publicPlayerProfile__identity h1{font-size:28px;margin:0}
        .publicPlayerProfile__identity>a{margin-top:0}
        .publicPlayerProfile__facts{padding:0 12px 14px}
        .publicPlayerProfile__noClub,.publicPlayerProfile__requests,.publicPlayerProfile__activity{margin-left:12px;margin-right:12px}
        .publicPlayerProfile__activity{margin-bottom:18px}
      }
    `}</style>
  </main></PlayerSpaceLayout>
}
