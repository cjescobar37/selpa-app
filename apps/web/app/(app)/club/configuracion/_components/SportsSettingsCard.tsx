'use client'

import Link from 'next/link'

export function SportsSettingsCard({ courtsCount }: { courtsCount?: string | number | null }) {
  const legacyCourtCount = Number(courtsCount ?? 0)

  return (
    <div className="px-card px-card--flat" style={{ background: '#fff', border: '1px solid rgba(15,23,42,.08)', display: 'grid', gap: 12, padding: 16 }}>
      <div>
        <div className="px-sectionTitle">Configuración deportiva</div>
        <p className="px-help" style={{ marginTop: 4 }}>
          Administrá las categorías y divisiones que el club ofrece en sus competencias.
        </p>
      </div>
      <Link
        href="/club/competition/divisions"
        style={{ alignItems: 'center', background: '#f8fafc', border: '1px solid rgba(15,23,42,.09)', borderRadius: 14, color: '#061b3a', display: 'flex', gap: 12, justifyContent: 'space-between', minHeight: 54, padding: '10px 12px', textDecoration: 'none' }}
      >
        <span style={{ display: 'grid', gap: 2 }}>
          <strong style={{ fontSize: 14 }}>Divisiones y categorías</strong>
          <small style={{ color: '#64748b', fontSize: 12 }}>Configurar la oferta competitiva del club</small>
        </span>
        <span aria-hidden="true" style={{ color: '#65a30d', fontSize: 24 }}>›</span>
      </Link>
      {legacyCourtCount > 0 ? (
        <p className="px-help" style={{ margin: 0 }}>
          El dato histórico indica {legacyCourtCount} {legacyCourtCount === 1 ? 'cancha' : 'canchas'}.
        </p>
      ) : null}
    </div>
  )
}
