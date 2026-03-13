'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import AuthAlert from '@/components/AuthAlert'

type ClubRow = { id: string; name: string; city: string | null; is_active: boolean | null; created_at: string }

export default function PlatformClubsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clubs, setClubs] = useState<ClubRow[]>([])

  async function load() {
    setLoading(true)
    setError(null)

    const { data, error } = await supabase
      .from('clubs')
      .select('id,name,city,is_active,created_at')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) setError(error.message)
    setClubs(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div className="platform-shell">
      <div className="px-platform">
        <div className="px-platformHead">
          <div>
            <h1 className="px-platformTitle">Clubs</h1>
            <div className="px-platformSub">Gestión de clubes, estados y suspensiones.</div>
          </div>
          <div className="px-toolbar">
            <Link className="px-btn" href="/platform/clubs/nuevo">Alta de club</Link>
            <button className="px-btn px-btn--ghost" onClick={load} disabled={loading}>
              {loading ? (<><span className="px-spinner" /> Recargando…</>) : 'Recargar'}
            </button>
          </div>
        </div>

        {error ? (
          <div style={{ marginTop: 12 }}>
            <AuthAlert variant="error" title="No pude traer clubes" message={error} />
          </div>
        ) : null}

        <div style={{ marginTop: 14 }}>
          {clubs.length ? (
            <table className="px-table">
              <thead>
                <tr>
                  <th>Club</th>
                  <th>Ciudad</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {clubs.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 1000 }}>{c.name}</td>
                    <td style={{ opacity: 0.8 }}>{c.city ?? '—'}</td>
                    <td style={{ opacity: 0.8 }}>{c.is_active === false ? 'Inactivo' : 'Activo'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="px-empty">No hay clubes todavía.</div>
          )}
        </div>
      </div>
    </div>
  )
}
