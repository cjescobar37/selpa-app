'use client'

import { useSession } from '@/components/session/SessionProvider'

export default function ClubCalendarioPage() {
  const { activeClub } = useSession()

  return (
    <div className="club-shell">
      <div className="club-panel">
        <h1 className="club-title">Calendario del club</h1>
        <p className="club-sub">Fechas, canchas y agenda operativa de {activeClub?.name ?? 'tu club'}.</p>
        <div className="px-card px-card--flat" style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 900 }}>Próximo paso</div>
          <div className="px-help" style={{ marginTop: 6 }}>Conectar esta vista con torneos, canchas y reservas.</div>
        </div>
      </div>
    </div>
  )
}
