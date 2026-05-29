'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import AuthAlert from '@/components/AuthAlert'
import { CLUB_THEMES, CLUB_THEME_LABELS, getClubTheme, type ClubThemeKey } from '@/lib/clubThemes'

type AlertState =
  | { variant: 'success' | 'warning' | 'error' | 'info'; title: string; message?: string }
  | null

const initial = {
  name: '',
  brand_name: '',
  legal_name: '',
  cuit: '',
  city: '',
  province: '',
  country: 'Argentina',
  address: '',
  phone: '',
  contact_email: '',
  website: '',
  instagram: '',
  opening_hours: '',
  courts_count: '',
  courts_surface: '',
  logo_url: '',
  notes: '',
  rules_pdf_url: '',
  theme_key: 'cyan' as ClubThemeKey,
  owner_name: '',
  owner_phone: '',
  owner_email: '',
  owner_password: '',
}

const themeOptions = Object.values(CLUB_THEMES)

export default function PlatformCreateClubPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [alert, setAlert] = useState<AlertState>(null)
  const [v, setV] = useState(initial)

  const onChange = (k: keyof typeof initial, value: string) => setV((p) => ({ ...p, [k]: value }))

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setAlert(null)
    setLoading(true)

    try {
      const { data: s } = await supabase.auth.getSession()
      const token = s?.session?.access_token
      if (!token) {
        setAlert({ variant: 'warning', title: 'Sesión expirada', message: 'Volvé a iniciar sesión.' })
        setLoading(false)
        return
      }

      const res = await fetch('/api/platform/create-club', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: token,
          club: {
            name: v.name, brand_name: v.brand_name, legal_name: v.legal_name, cuit: v.cuit, city: v.city, province: v.province,
            country: v.country, address: v.address, phone: v.phone, contact_email: v.contact_email, website: v.website,
            instagram: v.instagram, opening_hours: v.opening_hours, courts_count: v.courts_count, courts_surface: v.courts_surface,
            logo_url: v.logo_url, notes: v.notes, rules_pdf_url: v.rules_pdf_url, theme_key: getClubTheme(v.theme_key).key,
          },
          owner: { email: v.owner_email, password: v.owner_password, fullName: v.owner_name, phone: v.owner_phone },
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        setAlert({ variant: 'error', title: 'No se pudo crear', message: json?.error ?? 'Error' })
        setLoading(false)
        return
      }

      setAlert({
        variant: 'success',
        title: 'Club creado',
        message: `Club: ${json.clubName}. Acceso OWNER: ${v.owner_email}. Podés entrar también con el slug ${json.slug}.`,
      })
      setTimeout(() => router.push('/platform/clubs'), 900)
    } catch (err: any) {
      setAlert({ variant: 'error', title: 'Error', message: err?.message ?? String(err) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="platform-shell">
      <div className="px-platform">
        <div className="px-platformHead">
          <div>
            <h1 className="px-platformTitle">Alta de club</h1>
            <div className="px-platformSub">Crea el club + usuario OWNER + acceso por email / CUIT / slug.</div>
          </div>
        </div>

        {alert ? <div style={{ marginTop: 12 }}><AuthAlert variant={alert.variant} title={alert.title} message={alert.message} /></div> : null}

        <form onSubmit={onSubmit} style={{ marginTop: 14, display: 'grid', gap: 12 }}>
          <div className="px-card px-glass" style={{ borderRadius: 18 }}>
            <div className="px-sectionTitle">Datos del club</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="px-field"><label className="px-label">Nombre *</label><input className="px-input" value={v.name} onChange={e => onChange('name', e.target.value)} required /></div>
              <div className="px-field"><label className="px-label">Nombre comercial</label><input className="px-input" value={v.brand_name} onChange={e => onChange('brand_name', e.target.value)} /></div>
              <div className="px-field"><label className="px-label">Razón social</label><input className="px-input" value={v.legal_name} onChange={e => onChange('legal_name', e.target.value)} /></div>
              <div className="px-field"><label className="px-label">CUIT</label><input className="px-input" value={v.cuit} onChange={e => onChange('cuit', e.target.value)} placeholder="30-71234567-8" /></div>
              <div className="px-field"><label className="px-label">Ciudad</label><input className="px-input" value={v.city} onChange={e => onChange('city', e.target.value)} /></div>
              <div className="px-field"><label className="px-label">Provincia</label><input className="px-input" value={v.province} onChange={e => onChange('province', e.target.value)} /></div>
              <div className="px-field"><label className="px-label">País</label><input className="px-input" value={v.country} onChange={e => onChange('country', e.target.value)} /></div>
              <div className="px-field"><label className="px-label">Dirección</label><input className="px-input" value={v.address} onChange={e => onChange('address', e.target.value)} /></div>
              <div className="px-field"><label className="px-label">Email contacto</label><input className="px-input" type="email" value={v.contact_email} onChange={e => onChange('contact_email', e.target.value)} /></div>
              <div className="px-field"><label className="px-label">Teléfono</label><input className="px-input" value={v.phone} onChange={e => onChange('phone', e.target.value)} /></div>
              <div className="px-field"><label className="px-label">Website</label><input className="px-input" value={v.website} onChange={e => onChange('website', e.target.value)} /></div>
              <div className="px-field"><label className="px-label">Instagram</label><input className="px-input" value={v.instagram} onChange={e => onChange('instagram', e.target.value)} /></div>
              <div className="px-field"><label className="px-label">Cantidad de canchas</label><input className="px-input" value={v.courts_count} onChange={e => onChange('courts_count', e.target.value)} /></div>
              <div className="px-field"><label className="px-label">Superficie</label><input className="px-input" value={v.courts_surface} onChange={e => onChange('courts_surface', e.target.value)} /></div>
              <div className="px-field"><label className="px-label">Horarios</label><input className="px-input" value={v.opening_hours} onChange={e => onChange('opening_hours', e.target.value)} /></div>
              <div className="px-field"><label className="px-label">URL logo</label><input className="px-input" value={v.logo_url} onChange={e => onChange('logo_url', e.target.value)} /></div>
              <div className="px-field"><label className="px-label">URL reglamento PDF</label><input className="px-input" value={v.rules_pdf_url} onChange={e => onChange('rules_pdf_url', e.target.value)} /></div>
              <div className="px-field" style={{ gridColumn: '1 / -1' }}><label className="px-label">Notas</label><textarea className="px-input" value={v.notes} onChange={e => onChange('notes', e.target.value)} rows={3} /></div>
            </div>
          </div>

          <div className="px-card px-glass" style={{ borderRadius: 18 }}>
            <div className="px-sectionTitle">Identidad visual *</div>
            <div className="px-help" style={{ marginTop: 6 }}>La paleta elegida queda fija para mantener consistencia de marca.</div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))',
                gap: 10,
                marginTop: 12,
              }}
            >
              {themeOptions.map((theme) => {
                const selected = getClubTheme(v.theme_key).key === theme.key
                return (
                  <button
                    key={theme.key}
                    type="button"
                    onClick={() => onChange('theme_key', theme.key)}
                    aria-pressed={selected}
                    style={{
                      background: '#fff',
                      border: selected ? `2px solid ${theme.vars.accent}` : '1px solid rgba(15,23,42,.10)',
                      borderRadius: 16,
                      boxShadow: selected ? `0 18px 42px ${theme.vars.glow}, 0 0 0 4px ${theme.vars.soft}` : '0 10px 28px rgba(15,23,42,.05)',
                      cursor: 'pointer',
                      display: 'grid',
                      gap: 8,
                      overflow: 'hidden',
                      padding: 0,
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ minHeight: 68, padding: 12, background: `linear-gradient(135deg, ${theme.vars.hero})` }}>
                      <span
                        style={{
                          display: 'block',
                          width: 52,
                          height: 9,
                          borderRadius: 999,
                          background: `linear-gradient(90deg, ${theme.vars.accent}, ${theme.vars.accent2})`,
                          boxShadow: `0 0 20px ${theme.vars.glow}`,
                        }}
                      />
                    </span>
                    <span style={{ display: 'grid', gap: 2, padding: '0 12px 12px' }}>
                      <strong style={{ color: '#17253f', fontSize: 13 }}>{CLUB_THEME_LABELS[theme.key]}</strong>
                      <em style={{ color: selected ? theme.vars.accent : '#64748b', fontSize: 11, fontStyle: 'normal', fontWeight: 800 }}>
                        {selected ? 'Seleccionado' : 'Theme Pamprax'}
                      </em>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="px-card px-glass" style={{ borderRadius: 18 }}>
            <div className="px-sectionTitle">Usuario OWNER del club</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="px-field"><label className="px-label">Nombre completo</label><input className="px-input" value={v.owner_name} onChange={e => onChange('owner_name', e.target.value)} /></div>
              <div className="px-field"><label className="px-label">Teléfono</label><input className="px-input" value={v.owner_phone} onChange={e => onChange('owner_phone', e.target.value)} /></div>
              <div className="px-field"><label className="px-label">Email *</label><input className="px-input" type="email" value={v.owner_email} onChange={e => onChange('owner_email', e.target.value)} required /></div>
              <div className="px-field"><label className="px-label">Clave *</label><input className="px-input" type="password" value={v.owner_password} onChange={e => onChange('owner_password', e.target.value)} required /></div>
            </div>
            <div className="px-help" style={{ marginTop: 10 }}>El club podrá iniciar sesión con email, CUIT o slug, usando siempre esta misma contraseña.</div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="px-btn" type="submit" disabled={loading}>{loading ? 'Creando…' : 'Crear club'}</button>
            <button className="px-btn px-btn--ghost" type="button" onClick={() => router.push('/platform/clubs')}>Volver</button>
          </div>
        </form>
      </div>
    </div>
  )
}
