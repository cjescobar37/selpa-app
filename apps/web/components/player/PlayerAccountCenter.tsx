'use client'

import Link from 'next/link'
import { Bell, ChevronRight, Dumbbell, LockKeyhole, Settings, ShieldCheck, UserRound, UsersRound } from 'lucide-react'
import { useSession } from '@/components/session/SessionProvider'
import PlayerSpaceLayout from './PlayerSpaceLayout'
import PlayerSectionHero from './PlayerSectionHero'
import styles from './PlayerAccountCenter.module.css'

const groups = [
  { title: 'Mis datos', links: [
    { href: '/completar-perfil?edit=personal', title: 'Datos personales', detail: 'Nombre, contacto y ubicación', icon: UserRound },
    { href: '/completar-perfil?edit=sports', title: 'Datos deportivos', detail: 'Mano hábil, posición, altura y fotos', icon: Dumbbell },
  ] },
  { title: 'Preferencias', links: [
    { href: '/ajustes', title: 'Preferencias de mi cuenta', detail: 'Opciones disponibles de tu experiencia', icon: Settings },
    { href: '/seleccionar-club', title: 'Mis clubes', detail: 'Elegir o cambiar el club activo', icon: UsersRound },
    { href: '/notificaciones', title: 'Notificaciones', detail: 'Avisos de clubes y torneos', icon: Bell },
  ] },
  { title: 'Privacidad y seguridad', links: [
    { href: '/reset-password', title: 'Actualizar contraseña', detail: 'Recuperación y acceso a tu cuenta', icon: LockKeyhole },
    { href: '/perfil', title: 'Revisar mi perfil', detail: 'Información visible en tu perfil deportivo', icon: ShieldCheck },
  ] },
]

export default function PlayerAccountCenter() {
  const session = useSession()
  return <PlayerSpaceLayout><main className={styles.shell}>
    <PlayerSectionHero title="Mi cuenta" badge="Área privada" description={session.user?.name ?? 'Datos, preferencias y seguridad'} icon={<Settings />} />
    {groups.map(group => <section className={styles.group} key={group.title} aria-label={group.title}>
      <h2>{group.title}</h2>
      {group.links.map(({ href, title, detail, icon: Icon }) => <Link href={href} key={href} className={styles.row}>
        <Icon size={20} aria-hidden="true" /><span><strong>{title}</strong><small>{detail}</small></span><ChevronRight size={17} aria-hidden="true" />
      </Link>)}
    </section>)}
    <p className={styles.note}>Los formularios personales son privados. La visibilidad deportiva depende de las publicaciones autorizadas del club; esta pantalla no cambia esos permisos.</p>
  </main></PlayerSpaceLayout>
}
