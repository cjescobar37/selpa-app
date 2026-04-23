'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useSession } from '@/components/session/SessionProvider'
import {
  buildLocalPreview,
  getClubInitials,
} from '@/lib/clubAssets'

type ClubForm = {
  name: string
  brand_name: string
  legal_name: string
  cuit: string
  city: string
  province: string
  country: string
  address: string
  phone: string
  contact_email: string
  website: string
  instagram: string
  opening_hours: string
  courts_count: string
  courts_surface: string
  logo_url: string
  rules_pdf_url: string
  notes: string
}

const empty: ClubForm = {
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
  rules_pdf_url: '',
  notes: '',
}

type BannerState =
  | { type: 'success' | 'error' | 'info'; text: string }
  | null

function Banner({ banner }: { banner: BannerState }) {
  if (!banner) return null

  const map = {
    success: {
      background: '#ecfdf3',
      border: '1px solid #b7ebc6',
      color: '#166534',
    },
    error: {
      background: '#fff0f0',
      border: '1px solid #f0b2b2',
      color: '#8f1d1d',
    },
    info: {
      background: '#eef8ff',
      border: '1px solid #b8dff1',
      color: '#164e63',
    },
  } as const

  return (
    <div
      style={{
        ...map[banner.type],
        padding: 12,
        borderRadius: 14,
        marginTop: 14,
        fontWeight: 700,
      }}
    >
      {banner.text}
    </div>
  )
}

function isRealUrl(value?: string | null) {
  if (!value) return false
  return /^https?:\/\//i.test(value.trim())
}

function normalizeUrl(value?: string | null) {
  return isRealUrl(value) ? value!.trim() : ''
}

export default function ClubConfiguracionPage() {
  const { activeClub, refresh } = useSession()

  const [v, setV] = useState<ClubForm>(empty)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingRules, setUploadingRules] = useState(false)
  const [banner, setBanner] = useState<BannerState>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [selectedRulesName, setSelectedRulesName] = useState<string>('')

  const displayLogo = useMemo(() => {
    if (logoPreview) return logoPreview
    if (isRealUrl(v.logo_url)) return v.logo_url
    return ''
  }, [logoPreview, v.logo_url])

  async function loadClubData(clubId: string) {
    const { data, error } = await supabase
      .from('clubs')
      .select(
        'name,brand_name,legal_name,cuit,city,province,country,address,phone,contact_email,website,instagram,opening_hours,courts_count,courts_surface,logo_url,rules_pdf_url,notes'
      )
      .eq('id', clubId)
      .maybeSingle()

    if (error) {
      throw error
    }

    setV({
      name: data?.name ?? '',
      brand_name: data?.brand_name ?? '',
      legal_name: data?.legal_name ?? '',
      cuit: data?.cuit ?? '',
      city: data?.city ?? '',
      province: data?.province ?? '',
      country: data?.country ?? 'Argentina',
      address: data?.address ?? '',
      phone: data?.phone ?? '',
      contact_email: data?.contact_email ?? '',
      website: data?.website ?? '',
      instagram: data?.instagram ?? '',
      opening_hours: data?.opening_hours ?? '',
      courts_count: data?.courts_count ? String(data.courts_count) : '',
      courts_surface: data?.courts_surface ?? '',
      logo_url: normalizeUrl(data?.logo_url),
      rules_pdf_url: normalizeUrl(data?.rules_pdf_url),
      notes: data?.notes ?? '',
    })
  }

  useEffect(() => {
    let alive = true

    ;(async () => {
      if (!activeClub?.id) {
        setLoading(false)
        return
      }

      try {
        await loadClubData(activeClub.id)
      } catch (error: any) {
        if (alive) {
          setBanner({ type: 'error', text: error?.message ?? 'No pude cargar los datos del club.' })
        }
      } finally {
        if (alive) setLoading(false)
      }
    })()

    return () => {
      alive = false
    }
  }, [activeClub?.id])

  const onChange = (k: keyof ClubForm, value: string) =>
    setV((prev) => ({ ...prev, [k]: value }))

  async function hardSyncBranding() {
    await refresh()
    setTimeout(() => {
      window.location.reload()
    }, 120)
  }

  async function persistSingleField(field: 'logo_url' | 'rules_pdf_url', value: string) {
    if (!activeClub?.id) return

    const safeValue = normalizeUrl(value)

    const { error } = await supabase
      .from('clubs')
      .update({ [field]: safeValue || null })
      .eq('id', activeClub.id)

    if (error) throw error
  }

  async function onLogoFileChange(file: File | null) {
    if (!file || !activeClub?.id) return

    const localPreview = buildLocalPreview(file)
    setLogoPreview(localPreview)
    setUploadingLogo(true)
    setBanner({ type: 'info', text: 'Subiendo logo…' })

    try {
      const { data: sess } = await supabase.auth.getSession()
      const token = sess?.session?.access_token

      if (!token) throw new Error('Sesión inválida.')

      const form = new FormData()
      form.append('clubId', activeClub.id)
      form.append('assetType', 'logo')
      form.append('file', file)

      const res = await fetch('/api/club-branding', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? 'No pude subir el logo.')

      await loadClubData(activeClub.id)
      setBanner({ type: 'success', text: 'Logo subido y guardado correctamente.' })
      await hardSyncBranding()
    } catch (err: any) {
      setBanner({ type: 'error', text: err?.message ?? 'No pude subir el logo.' })
    } finally {
      setUploadingLogo(false)
    }
  }

  async function onRulesFileChange(file: File | null) {
    if (!file || !activeClub?.id) return

    setUploadingRules(true)
    setSelectedRulesName(file.name)
    setBanner({ type: 'info', text: 'Subiendo reglamento PDF…' })

    try {
      const { data: sess } = await supabase.auth.getSession()
      const token = sess?.session?.access_token

      if (!token) throw new Error('Sesión inválida.')

      const form = new FormData()
      form.append('clubId', activeClub.id)
      form.append('assetType', 'rules')
      form.append('file', file)

      const res = await fetch('/api/club-branding', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? 'No pude subir el PDF.')

      await loadClubData(activeClub.id)
      setBanner({ type: 'success', text: 'Reglamento PDF subido y guardado correctamente.' })
    } catch (err: any) {
      setBanner({ type: 'error', text: err?.message ?? 'No pude subir el PDF.' })
    } finally {
      setUploadingRules(false)
    }
  }

  async function save() {
    if (!activeClub?.id) return

    setSaving(true)
    setBanner(null)

    const payload = {
      name: v.name || null,
      brand_name: v.brand_name || null,
      legal_name: v.legal_name || null,
      cuit: v.cuit.replace(/\D/g, '') || null,
      city: v.city || null,
      province: v.province || null,
      country: v.country || null,
      address: v.address || null,
      phone: v.phone || null,
      contact_email: v.contact_email || null,
      website: v.website || null,
      instagram: v.instagram || null,
      opening_hours: v.opening_hours || null,
      courts_count: v.courts_count ? Number(v.courts_count) : null,
      courts_surface: v.courts_surface || null,
      logo_url: normalizeUrl(v.logo_url) || null,
      rules_pdf_url: normalizeUrl(v.rules_pdf_url) || null,
      notes: v.notes || null,
    }

    const { error } = await supabase
      .from('clubs')
      .update(payload)
      .eq('id', activeClub.id)

    setSaving(false)

    if (error) {
      setBanner({ type: 'error', text: error.message })
      return
    }

    await loadClubData(activeClub.id)
    await refresh()

    setBanner({ type: 'success', text: 'Cambios guardados.' })
  }

  return (
    <div className="club-shell">
      <div className="club-panel">
        <h1 className="club-title">Configuración</h1>
        <p className="club-sub">Datos del club, branding, contacto y reglamento PDF.</p>

        <Banner banner={banner} />

        {loading ? (
          <div className="px-help" style={{ marginTop: 14 }}>
            Cargando datos del club…
          </div>
        ) : (
          <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
            <div className="px-card px-card--flat">
              <div className="px-sectionTitle">Branding</div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(250px,300px) 1fr',
                  gap: 20,
                  marginTop: 10,
                }}
              >
                <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
                  <label
                    style={{
                      border: '1px dashed rgba(23,37,63,.16)',
                      borderRadius: 18,
                      padding: 18,
                      background: 'rgba(255,255,255,.55)',
                      display: 'grid',
                      gap: 12,
                      justifyItems: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      style={{
                        width: 180,
                        height: 110,
                        borderRadius: 22,
                        background: 'rgba(255,255,255,.90)',
                        border: '1px solid rgba(23,37,63,.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        padding: 12,
                      }}
                    >
                      {displayLogo ? (
                        <img
                          src={displayLogo}
                          alt="Logo del club"
                          style={{
                            maxWidth: '100%',
                            maxHeight: '100%',
                            objectFit: 'contain',
                            display: 'block',
                          }}
                        />
                      ) : (
                        <span
                          style={{
                            width: 74,
                            height: 74,
                            borderRadius: 20,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'rgba(83,199,217,0.14)',
                            color: '#17253f',
                            fontWeight: 900,
                            fontSize: 24,
                          }}
                        >
                          {getClubInitials(v.name || activeClub?.name || 'Club')}
                        </span>
                      )}
                    </div>

                    <span className="px-help" style={{ textAlign: 'center' }}>
                      {uploadingLogo
                        ? 'Subiendo logo…'
                        : 'Elegí una imagen para usar como logo del club.'}
                    </span>

                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: 12,
                        background: 'rgba(255,255,255,.90)',
                        border: '1px solid rgba(23,37,63,.10)',
                        fontWeight: 700,
                        color: '#17253f',
                      }}
                    >
                      Seleccionar imagen
                    </div>

                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => onLogoFileChange(e.target.files?.[0] ?? null)}
                      style={{ display: 'none' }}
                    />
                  </label>

                  <label
                    style={{
                      border: '1px dashed rgba(23,37,63,.16)',
                      borderRadius: 16,
                      padding: 14,
                      background: 'rgba(255,255,255,.55)',
                      display: 'grid',
                      gap: 10,
                      cursor: 'pointer',
                    }}
                  >
                    <div className="px-label">Reglamento PDF</div>

                    <div
                      style={{
                        padding: '10px 12px',
                        borderRadius: 12,
                        background: 'rgba(255,255,255,.90)',
                        border: '1px solid rgba(23,37,63,.08)',
                        color: '#17253f',
                        fontWeight: 700,
                      }}
                    >
                      {uploadingRules
                        ? 'Subiendo PDF…'
                        : selectedRulesName || 'Seleccionar archivo PDF'}
                    </div>

                    <div className="px-help">Solo se aceptan archivos PDF.</div>

                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      onChange={(e) => onRulesFileChange(e.target.files?.[0] ?? null)}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>

                <div style={{ display: 'grid', gap: 12 }}>
                  <div className="px-field">
                    <div className="px-label">Nombre</div>
                    <input
                      className="px-input"
                      value={v.name}
                      onChange={(e) => onChange('name', e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="px-field">
                      <div className="px-label">URL logo</div>
                      <input
                        className="px-input"
                        value={v.logo_url}
                        readOnly
                      />
                    </div>

                    <div className="px-field">
                      <div className="px-label">URL reglamento PDF</div>
                      <input
                        className="px-input"
                        value={v.rules_pdf_url}
                        readOnly
                      />
                    </div>
                  </div>

                  {isRealUrl(v.rules_pdf_url) ? (
                    <div className="px-help">
                      Reglamento actual:{' '}
                      <a
                        href={v.rules_pdf_url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-link"
                      >
                        abrir PDF
                      </a>
                    </div>
                  ) : null}

                  <div className="px-field">
                    <div className="px-label">Notas</div>
                    <textarea
                      className="px-input"
                      rows={3}
                      value={v.notes}
                      onChange={(e) => onChange('notes', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="px-card px-card--flat">
              <div className="px-sectionTitle">Identidad y contacto</div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                  marginTop: 10,
                }}
              >
                <div className="px-field">
                  <div className="px-label">Nombre comercial</div>
                  <input className="px-input" value={v.brand_name} onChange={e => onChange('brand_name', e.target.value)} />
                </div>

                <div className="px-field">
                  <div className="px-label">Razón social</div>
                  <input className="px-input" value={v.legal_name} onChange={e => onChange('legal_name', e.target.value)} />
                </div>

                <div className="px-field">
                  <div className="px-label">CUIT</div>
                  <input className="px-input" value={v.cuit} onChange={e => onChange('cuit', e.target.value)} />
                </div>

                <div className="px-field">
                  <div className="px-label">Email contacto</div>
                  <input className="px-input" value={v.contact_email} onChange={e => onChange('contact_email', e.target.value)} />
                </div>

                <div className="px-field">
                  <div className="px-label">Teléfono</div>
                  <input className="px-input" value={v.phone} onChange={e => onChange('phone', e.target.value)} />
                </div>

                <div className="px-field">
                  <div className="px-label">Website</div>
                  <input className="px-input" value={v.website} onChange={e => onChange('website', e.target.value)} />
                </div>

                <div className="px-field">
                  <div className="px-label">Instagram</div>
                  <input className="px-input" value={v.instagram} onChange={e => onChange('instagram', e.target.value)} />
                </div>
              </div>
            </div>

            <div className="px-card px-card--flat">
              <div className="px-sectionTitle">Ubicación y operación</div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                  marginTop: 10,
                }}
              >
                <div className="px-field">
                  <div className="px-label">Ciudad</div>
                  <input className="px-input" value={v.city} onChange={e => onChange('city', e.target.value)} />
                </div>

                <div className="px-field">
                  <div className="px-label">Provincia</div>
                  <input className="px-input" value={v.province} onChange={e => onChange('province', e.target.value)} />
                </div>

                <div className="px-field">
                  <div className="px-label">País</div>
                  <input className="px-input" value={v.country} onChange={e => onChange('country', e.target.value)} />
                </div>

                <div className="px-field">
                  <div className="px-label">Dirección</div>
                  <input className="px-input" value={v.address} onChange={e => onChange('address', e.target.value)} />
                </div>

                <div className="px-field">
                  <div className="px-label">Cantidad de canchas</div>
                  <input className="px-input" value={v.courts_count} onChange={e => onChange('courts_count', e.target.value)} />
                </div>

                <div className="px-field">
                  <div className="px-label">Superficie</div>
                  <input className="px-input" value={v.courts_surface} onChange={e => onChange('courts_surface', e.target.value)} />
                </div>

                <div className="px-field" style={{ gridColumn: '1 / -1' }}>
                  <div className="px-label">Horarios</div>
                  <input className="px-input" value={v.opening_hours} onChange={e => onChange('opening_hours', e.target.value)} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                className="px-btn"
                type="button"
                onClick={save}
                disabled={saving || uploadingLogo || uploadingRules}
              >
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}