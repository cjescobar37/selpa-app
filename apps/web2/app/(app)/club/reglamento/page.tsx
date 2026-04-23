'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useSession } from '@/components/session/SessionProvider'

export default function ClubReglamentoPage() {
  const { activeClub } = useSession()
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!activeClub?.id) return
      const { data } = await supabase.from('clubs').select('rules_pdf_url').eq('id', activeClub.id).maybeSingle()
      if (alive) setUrl((data as any)?.rules_pdf_url ?? null)
    })()
    return () => { alive = false }
  }, [activeClub?.id])

  return (
    <div className="club-shell">
      <div className="club-panel">
        <h1 className="club-title">Reglamento del club</h1>
        <p className="club-sub">PDF cargado desde Configuración del club.</p>

        <div className="px-card px-card--flat" style={{ marginTop: 14 }}>
          {url ? (
            <>
              <div style={{ fontWeight: 900 }}>Reglamento disponible</div>
              <div className="px-pageActions" style={{ marginTop: 12 }}>
                <a className="px-btn" href={url} target="_blank" rel="noreferrer">Abrir PDF</a>
                <a className="px-btn px-btn--ghost" href={url} download>Descargar PDF</a>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 900 }}>Todavía no cargaste un reglamento PDF</div>
              <div className="px-help" style={{ marginTop: 8 }}>Podés cargar la URL del reglamento desde la configuración del club.</div>
              <div className="px-pageActions" style={{ marginTop: 12 }}>
                <Link className="px-btn px-btn--ghost" href="/club/configuracion">Ir a configuración</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
