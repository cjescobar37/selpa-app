'use client'

import ClubAdminHubNav, { type ClubAdminHubLink } from '@/components/club/ClubAdminHubNav'
import { getClubTheme } from '@/lib/clubThemes'
import { useSession } from '@/components/session/SessionProvider'
import type { CSSProperties } from 'react'

const items: readonly ClubAdminHubLink[] = [
  { href: '/club/usuarios', label: 'Equipo y roles', description: 'Personas y permisos', icon: 'team', requiredAnyCapabilities: ['roles:view', 'roles:manage'] as const },
  { href: '/club/contabilidad', label: 'Finanzas', description: 'Movimientos del club', icon: 'finance', requiredAnyCapabilities: ['finance:view', 'finance:manage'] as const },
  { href: '/club/estadisticas', label: 'Estadísticas', description: 'Actividad del club', icon: 'analytics', requiredAnyCapabilities: ['reports:operational_view'] as const },
  { href: '/club/reportes', label: 'Reportes', description: 'Consultas operativas', icon: 'reports', requiredAnyCapabilities: ['reports:operational_view', 'audit:view'] as const },
  { href: '/club/mensajes', label: 'Mensajes', description: 'Comunicación del club', icon: 'messages', requiredAnyCapabilities: ['messages:view'] as const },
  { href: '/club/perfil', label: 'Perfil público', description: 'Cómo se ve tu club', icon: 'profile', group: 'secondary' as const, requiredAnyCapabilities: ['club:profile_manage'] as const },
  { href: '/club/configuracion', label: 'Configuración', description: 'Datos e identidad', icon: 'settings', group: 'secondary' as const, requiredAnyCapabilities: ['club:update', 'club:branding', 'security:manage'] as const },
]

export default function ClubAdminPage() {
  const { activeClub } = useSession()
  const theme = getClubTheme(null)
  return <main className="club-shell">
    <section className="club-panel" style={{ '--club-admin-accent': theme.vars.accent, '--club-admin-soft': theme.vars.soft } as CSSProperties}>
      <div style={{ display: 'grid', gap: 4, marginBottom: 4 }}>
        <span className="club-kicker">CLUB</span>
        <h1 className="club-title" style={{ fontSize: 'clamp(24px, 6vw, 32px)', margin: 0 }}>Administración del club</h1>
        <p className="club-sub" style={{ margin: 0 }}>Gestioná el equipo, la operación y la configuración de {activeClub?.name ?? 'tu club'}.</p>
      </div>
      <ClubAdminHubNav label="Administración del club" primaryLabel="Gestión" secondaryLabel="Configuración" items={items} />
    </section>
  </main>
}
