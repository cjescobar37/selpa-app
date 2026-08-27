'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'

type FormState = {
  club_name: string
  brand_name: string
  cuit: string
  email: string
  phone: string
  website: string
  instagram: string
  address: string
  city: string
  province: string
  country: string
  courts_count: string
  courts_surface: string
  opening_hours: string
  logo_url: string
  notes: string

  admin_name: string
  admin_email: string
  admin_phone: string
}

const initial: FormState = {
  club_name: '',
  brand_name: '',
  cuit: '',
  email: '',
  phone: '',
  website: '',
  instagram: '',
  address: '',
  city: '',
  province: '',
  country: 'Argentina',
  courts_count: '',
  courts_surface: '',
  opening_hours: '',
  logo_url: '',
  notes: '',

  admin_name: '',
  admin_email: '',
  admin_phone: '',
}

export default function UnirMiClubPage() {
  const [v, setV] = useState<FormState>(initial)
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const requiredMissing = useMemo(() => {
    const req: (keyof FormState)[] = ['club_name', 'email', 'city', 'province', 'admin_name', 'admin_email']
    return req.filter((k) => !String(v[k] ?? '').trim())
  }, [v])

  function onChange<K extends keyof FormState>(k: K, val: string) {
    setV((p) => ({ ...p, [k]: val }))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (requiredMissing.length) {
      alert('Faltan campos obligatorios: ' + requiredMissing.join(', '))
      return
    }

    setSubmitting(true)
    const res = await fetch('/api/club-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(v),
    })
    const json = await res.json().catch(() => ({}))
    setSubmitting(false)
    if (!res.ok) {
      alert(json?.error ?? 'No pudimos guardar la solicitud')
      return
    }

    setSent(true)
  }

  return (
    <div className="px-wrap" style={{ paddingTop: 10 }}>
      <div className="px-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 className="px-h1">Unir mi club</h1>
            <p className="px-muted" style={{ marginTop: 6 }}>
              Completá este formulario para enviar la <b>solicitud de alta</b> de tu club.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Link className="px-btn px-btn--ghost" href="/">Volver</Link>
            <Link className="px-btn px-btn--ghost" href="/login">Login</Link>
          </div>
        </div>

        {sent ? (
          <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
            <div className="px-help">
              ✅ Solicitud enviada. Ya quedó guardada como pendiente para revisión.
            </div>
            <button className="px-btn" onClick={() => { setV(initial); setSent(false) }}>
              Cargar otra solicitud
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} style={{ marginTop: 14 }}>
            <div className="px-formGrid">
              <div className="px-sepRow">Datos del club</div>

              <div className="px-grid2">
                <div className="px-field">
                  <div className="px-label">Nombre del club *</div>
                  <input className="px-input" value={v.club_name} onChange={(e) => onChange('club_name', e.target.value)} placeholder="Complejo LA33" />
                </div>
                <div className="px-field">
                  <div className="px-label">Nombre comercial / branding</div>
                  <input className="px-input" value={v.brand_name} onChange={(e) => onChange('brand_name', e.target.value)} placeholder="LA33 Pádel" />
                </div>
              </div>

              <div className="px-grid3">
                <div className="px-field">
                  <div className="px-label">CUIT</div>
                  <input className="px-input" value={v.cuit} onChange={(e) => onChange('cuit', e.target.value)} placeholder="20-xxxxxxxx-x" />
                </div>
                <div className="px-field">
                  <div className="px-label">Email contacto *</div>
                  <input className="px-input" value={v.email} onChange={(e) => onChange('email', e.target.value)} placeholder="club@dominio.com" />
                </div>
                <div className="px-field">
                  <div className="px-label">Teléfono</div>
                  <input className="px-input" value={v.phone} onChange={(e) => onChange('phone', e.target.value)} placeholder="+54 ..." />
                </div>
              </div>

              <div className="px-grid3">
                <div className="px-field">
                  <div className="px-label">Website</div>
                  <input className="px-input" value={v.website} onChange={(e) => onChange('website', e.target.value)} placeholder="https://..." />
                </div>
                <div className="px-field">
                  <div className="px-label">Instagram</div>
                  <input className="px-input" value={v.instagram} onChange={(e) => onChange('instagram', e.target.value)} placeholder="@club" />
                </div>
                <div className="px-field">
                  <div className="px-label">URL Logo (opcional)</div>
                  <input className="px-input" value={v.logo_url} onChange={(e) => onChange('logo_url', e.target.value)} placeholder="https://.../logo.png" />
                </div>
              </div>

              <div className="px-grid2">
                <div className="px-field">
                  <div className="px-label">Dirección</div>
                  <input className="px-input" value={v.address} onChange={(e) => onChange('address', e.target.value)} placeholder="Calle y número" />
                </div>
                <div className="px-field">
                  <div className="px-label">Ciudad *</div>
                  <input className="px-input" value={v.city} onChange={(e) => onChange('city', e.target.value)} placeholder="Santa Rosa" />
                </div>
              </div>

              <div className="px-grid3">
                <div className="px-field">
                  <div className="px-label">Provincia *</div>
                  <input className="px-input" value={v.province} onChange={(e) => onChange('province', e.target.value)} placeholder="La Pampa" />
                </div>
                <div className="px-field">
                  <div className="px-label">País</div>
                  <input className="px-input" value={v.country} onChange={(e) => onChange('country', e.target.value)} />
                </div>
                <div className="px-field">
                  <div className="px-label">Horarios</div>
                  <input className="px-input" value={v.opening_hours} onChange={(e) => onChange('opening_hours', e.target.value)} placeholder="Lun a Dom 08:00–23:00" />
                </div>
              </div>

              <div className="px-grid3">
                <div className="px-field">
                  <div className="px-label">Cantidad de canchas</div>
                  <input className="px-input" value={v.courts_count} onChange={(e) => onChange('courts_count', e.target.value)} placeholder="Ej: 6" />
                </div>
                <div className="px-field">
                  <div className="px-label">Superficie</div>
                  <input className="px-input" value={v.courts_surface} onChange={(e) => onChange('courts_surface', e.target.value)} placeholder="Césped sintético, Mondo, etc." />
                </div>
                <div className="px-field">
                  <div className="px-label">Notas</div>
                  <input className="px-input" value={v.notes} onChange={(e) => onChange('notes', e.target.value)} placeholder="Observaciones / necesidades" />
                </div>
              </div>

              <div className="px-sepRow">Usuario administrador del club</div>

              <div className="px-grid3">
                <div className="px-field">
                  <div className="px-label">Nombre y apellido *</div>
                  <input className="px-input" value={v.admin_name} onChange={(e) => onChange('admin_name', e.target.value)} placeholder="Nombre Apellido" />
                </div>
                <div className="px-field">
                  <div className="px-label">Email admin *</div>
                  <input className="px-input" value={v.admin_email} onChange={(e) => onChange('admin_email', e.target.value)} placeholder="admin@dominio.com" />
                </div>
                <div className="px-field">
                  <div className="px-label">Teléfono admin</div>
                  <input className="px-input" value={v.admin_phone} onChange={(e) => onChange('admin_phone', e.target.value)} placeholder="+54 ..." />
                </div>
              </div>

              <div className="px-help">
                * Campos obligatorios. Revisaremos tu solicitud y nos comunicaremos con vos.
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="px-btn" type="submit" disabled={submitting}>{submitting ? 'Enviando…' : 'Enviar solicitud'}</button>
                <button className="px-btn px-btn--ghost" type="button" onClick={() => setV(initial)}>
                  Limpiar
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
