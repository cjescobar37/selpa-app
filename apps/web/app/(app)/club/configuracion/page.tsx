'use client'

import ClubBackLink from '@/components/club/ClubBackLink'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useSession } from '@/components/session/SessionProvider'
import { buildLocalPreview } from '@/lib/clubAssets'
import { CLUB_THEMES, getClubTheme, type ClubThemeKey } from '@/lib/clubThemes'
import { BrandingCard } from './_components/BrandingCard'
import { SportsSettingsCard } from './_components/SportsSettingsCard'
import { ThemeSelectorCard } from './_components/ThemeSelectorCard'
import { AdminCollapsibleSection } from '@/components/admin/AdminCollapsibleSection'

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
  theme_key: ClubThemeKey
  theme_locked: boolean
}

type ClubStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED'

type ClubReview = {
  status: ClubStatus
  rejected_at: string | null
  rejection_reason: string | null
  correction_requested_at: string | null
  correction_reason: string | null
  suspended_at: string | null
  suspension_reason: string | null
}

type ClubApiResponse = ClubForm & ClubReview

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
  theme_key: 'cyan',
  theme_locked: false,
}

const visibleThemeKeys: ClubThemeKey[] = [
  'forest',
  'ocean',
  'terracotta',
  'royal',
  'titanium',
  'emerald',
  'crimson',
  'sunset',
  'sand',
  'violet',
  'copper',
  'midnight',
  'lava',
  'arctic',
  'petrol',
  'wine',
  'olive',
  'graphite',
  'clay',
  'lagoon',
  'purpleRain',
]

const THEME_OPTIONS = visibleThemeKeys.map((key) => CLUB_THEMES[key])

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
      background: '#f8fafc',
      border: '1px solid rgba(15,23,42,.10)',
      color: '#334155',
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

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function getStatusLabel(status?: ClubStatus | null) {
  if (status === 'ACTIVE') return 'Activo'
  if (status === 'REJECTED') return 'Rechazado'
  if (status === 'SUSPENDED') return 'Suspendido'
  return 'Pendiente de aprobación'
}

const openingHourSections = [
  { key: 'weekdays', label: 'Lunes a viernes' },
  { key: 'saturday', label: 'Sábado' },
  { key: 'sunday', label: 'Domingo' },
] as const

type OpeningHourKey = typeof openingHourSections[number]['key']
type OpeningHourValues = Record<OpeningHourKey, string>

function parseOpeningHours(value: string): OpeningHourValues {
  const result: OpeningHourValues = { weekdays: '', saturday: '', sunday: '' }
  const raw = value.trim()
  if (!raw) return result

  const parts = raw.split(/\s*[|;]\s*/).filter(Boolean)
  for (const part of parts) {
    const [label, ...rest] = part.split(':')
    const normalizedLabel = label.trim().toLowerCase()
    const content = rest.join(':').trim()
    if (!content) continue
    if (normalizedLabel.includes('lunes') || normalizedLabel.includes('viernes')) result.weekdays = content
    else if (normalizedLabel.includes('sábado') || normalizedLabel.includes('sabado')) result.saturday = content
    else if (normalizedLabel.includes('domingo')) result.sunday = content
  }

  if (!result.weekdays && !result.saturday && !result.sunday) {
    result.weekdays = raw
  }

  return result
}

function serializeOpeningHours(values: OpeningHourValues) {
  return openingHourSections
    .map((section) => {
      const value = values[section.key].trim()
      return value ? `${section.label}: ${value}` : ''
    })
    .filter(Boolean)
    .join(' | ')
}

export default function ClubConfiguracionPage() {
  const { activeClub, refresh } = useSession()

  const [v, setV] = useState<ClubForm>(empty)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeMobileSection, setActiveMobileSection] = useState<string | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingRules, setUploadingRules] = useState(false)
  const [banner, setBanner] = useState<BannerState>(null)
  const [review, setReview] = useState<ClubReview | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [selectedRulesName, setSelectedRulesName] = useState<string>('')
  const [pendingThemeKey, setPendingThemeKey] = useState<ClubThemeKey | null>(null)

  const displayLogo = useMemo(() => {
    if (logoPreview) return logoPreview
    if (isRealUrl(v.logo_url)) return v.logo_url
    return ''
  }, [logoPreview, v.logo_url])

  const selectedTheme = useMemo(() => getClubTheme(v.theme_key), [v.theme_key])
  const canChooseTheme = !v.theme_locked
  const themeStyle = useMemo(
    () =>
      ({
        '--club-admin-accent': selectedTheme.vars.accent,
        '--club-admin-accent-2': selectedTheme.vars.accent2,
        '--club-admin-soft': selectedTheme.vars.soft,
        '--club-admin-glow': selectedTheme.vars.glow,
      }) as CSSProperties,
    [selectedTheme]
  )

  async function loadClubData(clubId: string) {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData?.session?.access_token
    if (!token) {
      throw new Error('Sesión inválida.')
    }

    const response = await fetch(`/api/clubs/${clubId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    })
    const json = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(json?.error ?? 'No pude cargar los datos del club.')
    }

    const data = json?.club as Partial<ClubApiResponse> | undefined

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
      theme_key: getClubTheme(data?.theme_key).key,
      theme_locked: Boolean(data?.theme_locked),
    })
    setReview({
      status: (data?.status as ClubStatus | null) ?? 'PENDING_APPROVAL',
      rejected_at: data?.rejected_at ?? null,
      rejection_reason: data?.rejection_reason ?? null,
      correction_requested_at: data?.correction_requested_at ?? null,
      correction_reason: data?.correction_reason ?? null,
      suspended_at: data?.suspended_at ?? null,
      suspension_reason: data?.suspension_reason ?? null,
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
      } catch (error: unknown) {
        if (alive) {
          setBanner({ type: 'error', text: getErrorMessage(error, 'No pude cargar los datos del club.') })
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
  const openingHourValues = useMemo(() => parseOpeningHours(v.opening_hours), [v.opening_hours])
  const onOpeningHourChange = (key: OpeningHourKey, value: string) => {
    onChange('opening_hours', serializeOpeningHours({ ...openingHourValues, [key]: value }))
  }

  async function hardSyncBranding() {
    await refresh()
    setTimeout(() => {
      window.location.reload()
    }, 120)
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
    } catch (err: unknown) {
      setBanner({ type: 'error', text: getErrorMessage(err, 'No pude subir el logo.') })
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
    } catch (err: unknown) {
      setBanner({ type: 'error', text: getErrorMessage(err, 'No pude subir el PDF.') })
    } finally {
      setUploadingRules(false)
    }
  }

  async function save() {
    if (!activeClub?.id) return

    setSaving(true)
    setBanner(null)

    const payload: Record<string, string | number | boolean | null> = {
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
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData?.session?.access_token

    if (!token) {
      setSaving(false)
      setBanner({ type: 'error', text: 'Sesión inválida.' })
      return
    }

    const response = await fetch(`/api/clubs/${activeClub.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })
    const json = await response.json().catch(() => ({}))

    setSaving(false)

    if (!response.ok) {
      setBanner({ type: 'error', text: json?.error ?? 'No pude guardar los cambios.' })
      return
    }

    await loadClubData(activeClub.id)
    await refresh()

    setBanner({ type: 'success', text: 'Cambios guardados.' })
  }

  async function submitThemeRequest(themeKey: ClubThemeKey) {
    if (!activeClub?.id || saving) return
    setSaving(true)
    setBanner(null)
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) {
      setSaving(false)
      setBanner({ type: 'error', text: 'Tu sesión venció. Volvé a ingresar.' })
      return
    }
    const response = await fetch(`/api/clubs/${activeClub.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ theme_key: themeKey }),
    })
    const json = await response.json().catch(() => ({}))
    setSaving(false)
    if (!response.ok) {
      setBanner({ type: 'error', text: json?.error ?? 'No pudimos actualizar la identidad visual.' })
      return
    }
    setPendingThemeKey(null)
    await loadClubData(activeClub.id)
    await refresh()
    setBanner({ type: 'success', text: 'Identidad visual actualizada.' })
  }

  return (
    <div className="club-shell">
      <div className="club-panel club-config" style={themeStyle}>
        <div className="club-configHead">
          <div>
            <ClubBackLink />
            <span className="club-kicker">CLUB</span>
            <h1 className="club-title">Configuración del club</h1>
            <p className="club-sub">Datos del club, branding, contacto y reglamento PDF.</p>
          </div>
          <div className="club-configOps">
            <div>
              <span>Estado del club</span>
              <strong>{getStatusLabel(review?.status)}</strong>
            </div>
          </div>
        </div>

        <Banner banner={banner} />

        {loading ? (
          <div className="px-help" style={{ marginTop: 14 }}>
            Cargando datos del club…
          </div>
        ) : (
          <div className="club-configStack">
            <AdminCollapsibleSection title="Identidad y datos del club" summary={v.name || activeClub?.name || 'Datos principales'} open={activeMobileSection === 'identity'} onToggle={() => setActiveMobileSection((value) => value === 'identity' ? null : 'identity')}>
              <BrandingCard
              value={v}
              activeClubName={activeClub?.name}
              displayLogo={displayLogo}
              selectedThemeSoft={selectedTheme.vars.soft}
              uploadingLogo={uploadingLogo}
              uploadingRules={uploadingRules}
              selectedRulesName={selectedRulesName}
              onChange={onChange}
              onLogoFileChange={onLogoFileChange}
              onRulesFileChange={onRulesFileChange}
              />
            </AdminCollapsibleSection>

            <AdminCollapsibleSection title="Horarios" summary="Días hábiles, sábados y domingos" open={activeMobileSection === 'hours'} onToggle={() => setActiveMobileSection((value) => value === 'hours' ? null : 'hours')}>
              <section className="px-card px-card--flat club-hoursCard">
              <div style={{ alignItems: 'baseline', display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }}>
                <div className="px-sectionTitle">Horarios operativos</div>
                <span className="px-help" style={{ fontSize: 12 }}>Se guardan en el campo actual del club.</span>
              </div>
              <div className="club-hoursGrid">
                {openingHourSections.map((section) => (
                  <label key={section.key} className="px-field" style={{ gap: 4 }}>
                    <span className="px-label" style={{ fontSize: 10 }}>{section.label}</span>
                    <input
                      className="px-input"
                      value={openingHourValues[section.key]}
                      onChange={(event) => onOpeningHourChange(section.key, event.target.value)}
                      placeholder="Ej: 08:00 - 23:00"
                      style={{ minHeight: 36 }}
                    />
                  </label>
                ))}
              </div>
              </section>
            </AdminCollapsibleSection>

            <AdminCollapsibleSection title="Identidad visual" summary={`Tema ${selectedTheme.key}`} open={activeMobileSection === 'theme'} onToggle={() => setActiveMobileSection((value) => value === 'theme' ? null : 'theme')}>
              <ThemeSelectorCard
              themes={THEME_OPTIONS}
              selectedTheme={selectedTheme}
              themeLocked={v.theme_locked}
              canChooseTheme={canChooseTheme}
              pendingThemeKey={pendingThemeKey}
              onSubmitThemeRequest={submitThemeRequest}
              />
            </AdminCollapsibleSection>

            <AdminCollapsibleSection title="Configuración deportiva" summary={`${v.courts_count || 0} canchas configuradas`} open={activeMobileSection === 'sports'} onToggle={() => setActiveMobileSection((value) => value === 'sports' ? null : 'sports')}>
              <SportsSettingsCard courtsCount={v.courts_count} />
            </AdminCollapsibleSection>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                className="px-btn club-saveBtn"
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
      <style>{`
        .club-config {
          background: #fff;
          border: 1px solid rgba(15,23,42,.08);
          border-radius: 24px;
          box-shadow: 0 24px 64px rgba(15,23,42,.09);
          min-width: 0;
          overflow: hidden;
          padding: 22px;
          position: relative;
        }
        .club-config::before {
          background: linear-gradient(90deg, var(--club-admin-accent), var(--club-admin-accent-2));
          content: "";
          height: 4px;
          left: 0;
          position: absolute;
          right: 0;
          top: 0;
        }
        .club-configHead {
          align-items: flex-start;
          background: linear-gradient(135deg, rgba(248,250,252,.98), var(--club-admin-soft));
          border: 1px solid rgba(15,23,42,.07);
          border-radius: 20px;
          display: flex;
          gap: 14px;
          justify-content: space-between;
          padding: 18px;
        }
        .club-kicker { color: var(--club-admin-accent); font-size: 11px; font-weight: 950; letter-spacing: .06em; text-transform: uppercase; }
        .club-configOps {
          background: #fff;
          border: 1px solid rgba(15,23,42,.08);
          border-radius: 16px;
          display: grid;
          gap: 8px;
          grid-template-columns: minmax(132px, 1fr);
          min-width: min(100%, 190px);
          padding: 10px;
        }
        .club-configOps div,
        .club-configOps label {
          display: grid;
          gap: 4px;
          margin: 0;
          min-width: 0;
        }
        .club-configOps span {
          color: #64748b;
          font-size: 10px;
          font-weight: 950;
          letter-spacing: .04em;
          text-transform: uppercase;
        }
        .club-configOps strong {
          color: #061b3a;
          font-size: 13px;
          font-weight: 950;
        }
        .club-configStack { display: grid; gap: 12px; margin-top: 14px; min-width: 0; }
        .adminCollapsibleSection__toggle { display:none; }
        .adminCollapsibleSection__content { min-width:0; }
        .club-config .px-card {
          background: rgba(255,255,255,.96);
          border: 1px solid rgba(15,23,42,.08);
          border-radius: 20px;
          box-shadow: 0 16px 42px rgba(15,23,42,.055);
          min-width: 0;
        }
        .club-config .px-sectionTitle { color: #061b3a; letter-spacing: .02em; }
        .club-config .px-input {
          border-color: rgba(15,23,42,.10);
          border-radius: 12px;
        }
        .club-config .px-input:focus {
          border-color: color-mix(in srgb, var(--club-admin-accent) 45%, transparent);
          box-shadow: 0 0 0 3px var(--club-admin-soft);
          outline: none;
        }
        .club-hoursCard {
          display: grid;
          gap: 10px;
          padding: 14px;
        }
        .club-hoursGrid {
          background: rgba(248,250,252,.72);
          border: 1px solid rgba(15,23,42,.08);
          border-radius: 14px;
          display: grid;
          gap: 8px;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          padding: 10px;
        }
        .club-themePaletteGrid { grid-template-columns: repeat(7, minmax(0, 1fr)); }
        .club-configBrandGrid { grid-template-columns: 220px minmax(0, 1fr); }
        .club-configTwoGrid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .club-saveBtn {
          background: #061b3a;
          border: 1px solid color-mix(in srgb, var(--club-admin-accent) 38%, transparent);
          border-radius: 999px;
          box-shadow: 0 12px 28px var(--club-admin-glow);
          color: #fff;
          font-weight: 950;
          min-height: 40px;
          padding: 9px 16px;
          transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease;
        }
        .club-saveBtn:hover:not(:disabled) { box-shadow: 0 16px 34px var(--club-admin-glow); transform: translateY(-1px); }
        @media (max-width: 1100px) {
          .club-themePaletteGrid { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
        }
        @media (max-width: 760px) {
          .club-config { padding: 14px; }
          .club-configHead { border-radius:14px; display: grid; padding:14px; }
          .club-configHead .club-title { font-size:24px; }
          .club-configHead .club-sub { display:none; }
          .club-configOps { grid-template-columns: 1fr; min-width: 0; }
          .club-hoursGrid { grid-template-columns: 1fr; }
          .club-configBrandGrid, .club-configBrandFields, .club-configTwoGrid { grid-template-columns: 1fr !important; }
          .club-themePaletteGrid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .adminCollapsibleSection { background:#fff; border:1px solid rgba(15,23,42,.09); border-radius:14px; overflow:hidden; }
          .adminCollapsibleSection__toggle { align-items:center; background:#fff; border:0; color:#061b3a; display:flex; justify-content:space-between; min-height:68px; padding:12px 14px; text-align:left; width:100%; }
          .adminCollapsibleSection__toggle > span:first-child { display:grid; gap:3px; }
          .adminCollapsibleSection__toggle strong { font-size:15px; }
          .adminCollapsibleSection__toggle small { color:#64748b; font-size:12px; font-weight:700; }
          .adminCollapsibleSection__action { align-items:center; color:var(--club-admin-accent); display:flex; font-size:12px; font-weight:900; gap:4px; }
          .adminCollapsibleSection__action svg { transition:transform .18s ease; }
          .adminCollapsibleSection__content { display:none; padding:0 10px 10px; }
          .adminCollapsibleSection.is-open .adminCollapsibleSection__content { display:block; }
          .adminCollapsibleSection.is-open .adminCollapsibleSection__action svg { transform:rotate(180deg); }
          .adminCollapsibleSection .px-card { border-radius:12px; box-shadow:none; }
        }
      `}</style>
    </div>
  )
}
