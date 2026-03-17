'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useSession } from '@/components/session/SessionProvider'
import { supabase } from '@/lib/supabaseClient'
import { resolveStorageUrl } from '@/lib/clubAssets'

type ClubData = {
  id: string
  name: string
  city: string | null
  province: string | null
  country: string | null
  address: string | null
  phone: string | null
  contact_email: string | null
  website: string | null
  instagram: string | null
  courts_count: number | null
  opening_hours: string | null
  rules_pdf_url: string | null
  logo_url: string | null
  notes: string | null
}

export default function ClubPage() {
  const { role, activeClub } = useSession()
  const [club, setClub] = useState<ClubData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      if (!activeClub?.id) {
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('clubs')
        .select('id, name, city, province, country, address, phone, contact_email, website, instagram, courts_count, opening_hours, rules_pdf_url, logo_url, notes')
        .eq('id', activeClub.id)
        .maybeSingle()

      if (data?.logo_url) {
        data.logo_url = await resolveStorageUrl(data.logo_url)
      }

      setClub((data as ClubData) ?? null)
      setLoading(false)
    })()
  }, [activeClub?.id])

  if (loading) return <div className="px-wrap"><div className="px-help">Cargando club…</div></div>

  if (!club) {
    return <div className="px-wrap"><div className="px-help">No hay club activo seleccionado.</div></div>
  }

  if (role === 'player') {
    return (
      <div className="px-wrap">
        <div className="club-panel">
          <h1 className="club-title">Ver club</h1>
          <p className="club-sub">Información pública del club activo.</p>

          <div className="clubInfoLayout">
            <div className="px-card px-card--flat clubInfoLogoCard">
              {club.logo_url ? (
                <img
                  src={club.logo_url}
                  alt={club.name}
                  style={{ maxWidth: '100%', maxHeight: 120, objectFit: 'contain' }}
                />
              ) : (
                <div className="px-help">Sin logo</div>
              )}
            </div>

            <div className="px-card px-card--flat clubInfoDataCard">
              <div style={{ fontSize: 28, fontWeight: 900 }}>{club.name}</div>
              <div><b>Ubicación:</b> {[club.city, club.province, club.country].filter(Boolean).join(' · ') || 'Sin datos'}</div>
              <div><b>Dirección:</b> {club.address || 'Sin datos'}</div>
              <div><b>Teléfono:</b> {club.phone || 'Sin datos'}</div>
              <div><b>Email:</b> {club.contact_email || 'Sin datos'}</div>
              <div><b>Website:</b> {club.website || 'Sin datos'}</div>
              <div><b>Instagram:</b> {club.instagram || 'Sin datos'}</div>
              <div><b>Canchas:</b> {club.courts_count ?? 'Sin dato'}</div>
              <div><b>Horarios:</b> {club.opening_hours || 'Sin datos'}</div>
              <div>
                <b>Reglamento:</b>{' '}
                {club.rules_pdf_url ? (
                  <a href={club.rules_pdf_url} target="_blank" rel="noreferrer" className="px-link">
                    Abrir PDF
                  </a>
                ) : (
                  'No cargado'
                )}
              </div>

              <div className="clubInfoActions">
                <Link href="/mensajes?to=club" className="px-btn">
                  Enviar mensaje al club
                </Link>
                <Link href="/mensajes?to=platform" className="px-btn px-btn--ghost">
                  Reportar problema al superadmin
                </Link>
              </div>
            </div>
          </div>
        </div>
        <style jsx>{`
          .clubInfoLayout {
            margin-top: 18px;
            display: grid;
            grid-template-columns: 240px minmax(0, 1fr);
            gap: 18px;
            align-items: start;
          }
          .clubInfoLogoCard {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 180px;
          }
          .clubInfoDataCard {
            display: grid;
            gap: 10px;
            min-width: 0;
          }
          .clubInfoActions {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            margin-top: 8px;
          }
          @media (max-width: 760px) {
            .clubInfoLayout {
              grid-template-columns: 1fr;
            }
            .clubInfoLogoCard {
              min-height: 150px;
            }
            .clubInfoActions {
              display: grid;
              grid-template-columns: 1fr;
            }
          }
        `}</style>
      </div>
    )
  }

  return (
    <div className="px-wrap">
      <div className="club-panel">
        <h1 className="club-title">Dashboard del club</h1>
        <p className="club-sub">
          {club.name} · {[club.city, club.province].filter(Boolean).join(' · ')}
        </p>

        <div className="club-kpis">
          <div className="club-kpi"><b>Club activo</b><br />{club.name}</div>
          <div className="club-kpi"><b>Canchas</b><br />{club.courts_count ?? 0}</div>
          <div className="club-kpi"><b>Email contacto</b><br />{club.contact_email || 'Sin dato'}</div>
          <div className="club-kpi"><b>Reglamento PDF</b><br />{club.rules_pdf_url ? 'Sí' : 'No cargado'}</div>
        </div>

        <div className="club-grid">
          <div className="club-card">
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Acciones rápidas</div>
            <div style={{ display: 'grid', gap: 10 }}>
              <Link href="/club/inscripciones" className="px-link">Inscripciones</Link>
              <Link href="/club/partidos" className="px-link">Partidos / resultados</Link>
              <Link href="/club/usuarios" className="px-link">Usuarios del club</Link>
              <Link href="/mensajes?to=platform" className="px-link">Contactar superadmin</Link>
            </div>
          </div>

          <div className="club-card">
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Estado del club</div>
            <div>Logo: {club.logo_url ? 'configurado' : 'pendiente'}</div>
            <div>Reglamento: {club.rules_pdf_url ? 'cargado' : 'pendiente'}</div>
            <div style={{ marginTop: 14 }}>
              <Link href="/club/configuracion" className="px-btn">
                Ir a configuración
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}