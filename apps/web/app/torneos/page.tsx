'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useSession } from '@/components/session/SessionProvider'

export default function TorneosPublicPage() {
  const { role } = useSession()

  useEffect(() => {
    if (role === 'club') {
      window.location.assign('/club/torneos')
    }
  }, [role])

  return (
    <div className="px-page">
      <div className="px-pageHead">
        <h1 className="px-pageTitle">Torneos</h1>
        <p className="px-pageSub">Calendario, torneos vigentes y reglamento público.</p>
      </div>

      <div className="px-card px-cardTopAccent px-sectionCard" id="calendario">
        <h2 className="px-cardTitle">Calendario</h2>
        <p className="px-muted" style={{ marginTop: 6 }}>
          (placeholder) Acá va la vista calendario + filtro por club / categoría.
        </p>
        <div className="px-pageActions">
          <Link className="px-btn px-btn--ghost" href="/torneos/calendario">Ir al calendario</Link>
          <Link className="px-btn px-btn--ghost" href="/torneos/reglamento">Ver reglamento</Link>
        </div>
      </div>

      <div id="reglamento" className="px-card px-cardTopAccent px-sectionCard">
        <h2 className="px-cardTitle">Reglamento</h2>
        <p className="px-muted" style={{ marginTop: 6 }}>
          (placeholder) Reglamento general + reglas específicas por club.
        </p>
      </div>
    </div>
  )
}
