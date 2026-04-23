'use client'

import Link from 'next/link'
import { useSession } from '@/components/session/SessionProvider'

export default function EnVivoPage() {
  const { role } = useSession()

  return (
    <div className="px-page">
      <div className="px-pageHead">
        <h1 className="px-pageTitle">En vivo</h1>
        <p className="px-pageSub">Resultados en tiempo real y próximos partidos.</p>
      </div>

      {role === 'guest' ? (
        <div className="px-card px-cardTopAccent px-sectionCard">
          <h2 className="px-cardTitle">Seguí la acción</h2>
          <div className="px-help" style={{ marginTop: 10 }}>
            Para ver “En vivo” completo y recibir notificaciones, iniciá sesión.
          </div>
          <div className="px-pageActions">
            <Link className="px-btn" href="/login">Ingresar</Link>
          </div>
        </div>
      ) : (
        <div className="px-card px-cardTopAccent px-sectionCard">
          <h2 className="px-cardTitle">Partidos en curso</h2>
          <div className="px-help" style={{ marginTop: 10 }}>(placeholder) Vista “En vivo” para usuarios logueados.</div>
        </div>
      )}
    </div>
  )
}
