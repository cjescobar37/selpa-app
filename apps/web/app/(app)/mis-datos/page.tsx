'use client'

import Link from 'next/link'
import { ChevronRight, Dumbbell, LockKeyhole, UserRound, UserRoundPen } from 'lucide-react'
import { useSession } from '@/components/session/SessionProvider'
import PlayerStatePanel from '@/components/player/PlayerStatePanel'
import PlayerSpaceLayout from '@/components/player/PlayerSpaceLayout'
import PlayerSectionHero from '@/components/player/PlayerSectionHero'

export default function MisDatosPage() {
  const session = useSession()

  if (session.status === 'loading') return <PlayerStatePanel kind="loading" title="Cargando tus datos" message="Preparando tu cuenta" viewport />
  if (!session.user) return <PlayerStatePanel kind="empty" title="Ingresá para editar tus datos" message="Esta información es privada." action={{ label: 'Ingresar', href: '/login' }} viewport />

  return <PlayerSpaceLayout><main className="playerDataHub">
    <PlayerSectionHero badge="Área privada" title="Mis datos" description="Administrá tu identidad, tu perfil deportivo y la seguridad de tu cuenta." icon={<UserRoundPen />} />
    <section className="playerDataHub__menu">
      <Link href="/completar-perfil?edit=personal"><UserRound /><div><strong>Datos personales</strong><small>Nombre, teléfono, fecha de nacimiento y ubicación</small></div><ChevronRight /></Link>
      <Link href="/completar-perfil?edit=sports"><Dumbbell /><div><strong>Perfil deportivo</strong><small>Mano hábil, posición, altura, foto y portada</small></div><ChevronRight /></Link>
      <Link href="/reset-password"><LockKeyhole /><div><strong>Cuenta y seguridad</strong><small>Correo de acceso y actualización de contraseña</small></div><ChevronRight /></Link>
    </section>
    <p className="playerDataHub__privacy">Estos datos son privados. En tu perfil público sólo se muestra la información que ayuda a otros jugadores a conocerte.</p>
    <style>{`
      .playerDataHub{color:#061b3a;display:grid;gap:14px;width:100%}.playerDataHub__menu{background:#fff;border:1px solid var(--player-card-border);border-radius:var(--player-card-radius);box-shadow:var(--player-card-shadow);display:grid;overflow:hidden;padding:8px 12px}.playerDataHub__menu a{align-items:center;border-top:1px solid #edf2f7;color:#061b3a;display:grid;gap:12px;grid-template-columns:38px minmax(0,1fr) 18px;min-height:72px;text-decoration:none}.playerDataHub__menu a:first-child{border-top:0}.playerDataHub__menu a>svg:first-child{background:color-mix(in srgb,var(--player-accent) 11%,white);border-radius:11px;color:var(--player-accent);height:38px;padding:9px;stroke-width:2;width:38px}.playerDataHub__menu a>svg:last-child{color:#94a3b8;stroke-width:2}.playerDataHub__menu strong,.playerDataHub__menu small{display:block}.playerDataHub__menu strong{font-size:14px}.playerDataHub__menu small{color:#64748b;font-size:11px;margin-top:3px}.playerDataHub__privacy{color:#64748b;font-size:11px;line-height:1.45;margin:0;padding:0 4px}
    `}</style>
  </main></PlayerSpaceLayout>
}
