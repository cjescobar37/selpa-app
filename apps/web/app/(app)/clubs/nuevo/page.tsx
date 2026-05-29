'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import AuthAlert from '@/components/AuthAlert'
import { useSession } from '@/components/session/SessionProvider'
import { CLUB_THEMES, CLUB_THEME_LABELS, getClubTheme, type ClubThemeKey } from '@/lib/clubThemes'

type AlertState =
  | { variant: 'success' | 'warning' | 'error' | 'info'; title: string; message?: string }
  | null

type SurfaceRow = {
  surface: string
  courts: string
}

type OpeningDay = {
  key: string
  label: string
  enabled: boolean
  opens: string
  closes: string
}

type DraftState = {
  v: typeof initial
  surfaces: SurfaceRow[]
  hours: OpeningDay[]
}

const initial = {
  legal_name: '',
  brand_name: '',
  cuit: '',
  country: 'Argentina',
  province: '',
  city: '',
  address: '',
  phone: '',
  mobile_phone: '',
  website: '',
  instagram: '',
  theme_key: 'cyan' as ClubThemeKey,
  courts_count: '1',
  description: '',
}

const themeOptions = Object.values(CLUB_THEMES)

const provinceOptions = [
  'Buenos Aires',
  'CABA',
  'Catamarca',
  'Chaco',
  'Chubut',
  'Cordoba',
  'Corrientes',
  'Entre Rios',
  'Formosa',
  'Jujuy',
  'La Pampa',
  'La Rioja',
  'Mendoza',
  'Misiones',
  'Neuquen',
  'Rio Negro',
  'Salta',
  'San Juan',
  'San Luis',
  'Santa Cruz',
  'Santa Fe',
  'Santiago del Estero',
  'Tierra del Fuego',
  'Tucuman',
]

const cityOptions = ['Santa Rosa', 'General Pico', 'Buenos Aires', 'Cordoba', 'Rosario', 'Mendoza', 'Neuquen', 'Mar del Plata']
const countryOptions = ['Argentina', 'Uruguay', 'Chile', 'Paraguay', 'Brasil']
const surfaceOptions = ['Sintetico', 'Cemento', 'Blindex', 'Parquet', 'Carpeta', 'Otro']
const courtCountOptions = Array.from({ length: 20 }, (_, index) => String(index + 1))
const draftKey = 'pamprax.club-onboarding-draft.v1'
const initialSurfaces: SurfaceRow[] = [{ surface: 'Sintetico', courts: '1' }]

const initialHours: OpeningDay[] = [
  { key: 'monday', label: 'Lunes', enabled: true, opens: '08:00', closes: '23:00' },
  { key: 'tuesday', label: 'Martes', enabled: true, opens: '08:00', closes: '23:00' },
  { key: 'wednesday', label: 'Miercoles', enabled: true, opens: '08:00', closes: '23:00' },
  { key: 'thursday', label: 'Jueves', enabled: true, opens: '08:00', closes: '23:00' },
  { key: 'friday', label: 'Viernes', enabled: true, opens: '08:00', closes: '23:00' },
  { key: 'saturday', label: 'Sabado', enabled: false, opens: '09:00', closes: '21:00' },
  { key: 'sunday', label: 'Domingo', enabled: false, opens: '09:00', closes: '21:00' },
]

function hasDraftContent(draft: DraftState) {
  const hasTextOrChangedSelect = Object.entries(draft.v).some(([key, value]) => {
    const initialValue = initial[key as keyof typeof initial]
    return value.trim() !== initialValue.trim()
  })
  const surfacesChanged = JSON.stringify(draft.surfaces) !== JSON.stringify(initialSurfaces)
  const hoursChanged = JSON.stringify(draft.hours) !== JSON.stringify(initialHours)

  return hasTextOrChangedSelect || surfacesChanged || hoursChanged
}

export default function CreateClubPage() {
  const router = useRouter()
  const session = useSession()
  const [loading, setLoading] = useState(false)
  const [alert, setAlert] = useState<AlertState>(null)
  const [v, setV] = useState(initial)
  const [surfaces, setSurfaces] = useState<SurfaceRow[]>(initialSurfaces)
  const [hours, setHours] = useState<OpeningDay[]>(initialHours)
  const [draftReady, setDraftReady] = useState(false)
  const [draftRestored, setDraftRestored] = useState(false)

  const onChange = (key: keyof typeof initial, value: string) => setV((prev) => ({ ...prev, [key]: value }))

  const totalSurfaceCourts = useMemo(() => {
    return surfaces.reduce((sum, item) => sum + Number(item.courts || 0), 0)
  }, [surfaces])

  const enabledHours = useMemo(() => hours.filter((day) => day.enabled), [hours])

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(draftKey)
      if (saved) {
        const draft = JSON.parse(saved) as Partial<DraftState>
        if (draft.v && typeof draft.v === 'object') {
          setV((prev) => ({ ...prev, ...draft.v }))
        }
        if (Array.isArray(draft.surfaces) && draft.surfaces.length) {
          setSurfaces(draft.surfaces)
        }
        if (Array.isArray(draft.hours) && draft.hours.length) {
          setHours(
            initialHours.map((day) => {
              const savedDay = draft.hours?.find((item) => item.key === day.key)
              return savedDay ? { ...day, ...savedDay } : day
            })
          )
        }
        setDraftRestored(true)
      }
    } catch {
      window.localStorage.removeItem(draftKey)
    } finally {
      setDraftReady(true)
    }
  }, [])

  useEffect(() => {
    if (!draftReady) return
    const timer = window.setTimeout(() => {
      const draft: DraftState = { v, surfaces, hours }
      if (!hasDraftContent(draft)) {
        window.localStorage.removeItem(draftKey)
        return
      }
      window.localStorage.setItem(draftKey, JSON.stringify(draft))
    }, 600)

    return () => window.clearTimeout(timer)
  }, [draftReady, v, surfaces, hours])

  function updateSurface(index: number, patch: Partial<SurfaceRow>) {
    setSurfaces((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  }

  function removeSurface(index: number) {
    setSurfaces((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
  }

  function updateHour(index: number, patch: Partial<OpeningDay>) {
    setHours((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  }

  function discardDraft() {
    const ok = window.confirm('¿Descartar el borrador de alta de club?')
    if (!ok) return

    window.localStorage.removeItem(draftKey)
    setV(initial)
    setSurfaces(initialSurfaces)
    setHours(initialHours)
    setDraftRestored(false)
    setAlert({ variant: 'info', title: 'Borrador descartado', message: 'Podés empezar una carga nueva.' })
  }

  function validateForm() {
    const courtsCount = Number(v.courts_count)
    if (!v.legal_name.trim() || !v.brand_name.trim() || !v.cuit.trim()) {
      return 'Completá razón social, nombre comercial y CUIT.'
    }
    if (!v.country.trim() || !v.province.trim() || !v.city.trim() || !v.address.trim()) {
      return 'Completá país, provincia, ciudad y dirección.'
    }
    if (!Number.isInteger(courtsCount) || courtsCount < 1 || courtsCount > 20) {
      return 'La cantidad de canchas debe estar entre 1 y 20.'
    }
    if (!surfaces.length || surfaces.some((item) => !item.surface.trim() || Number(item.courts) < 1)) {
      return 'Agregá al menos una superficie con cantidad válida.'
    }
    if (totalSurfaceCourts !== courtsCount) {
      return 'La suma de canchas por superficie debe coincidir con la cantidad total.'
    }
    if (!enabledHours.length) {
      return 'Seleccioná al menos un día de atención.'
    }
    if (enabledHours.some((day) => !day.opens || !day.closes || day.opens >= day.closes)) {
      return 'Revisá los horarios: cada día activo necesita apertura menor al cierre.'
    }
    if (!v.description.trim()) {
      return 'Agregá una descripción breve del club.'
    }
    if (!getClubTheme(v.theme_key).key) {
      return 'Elegí una identidad visual para el club.'
    }
    return null
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setAlert(null)

    const validationError = validateForm()
    if (validationError) {
      setAlert({ variant: 'warning', title: 'Faltan datos', message: validationError })
      return
    }

    setLoading(true)

    try {
      const { data: s } = await supabase.auth.getSession()
      const token = s?.session?.access_token
      const authUser = s?.session?.user
      if (!token || !authUser) {
        setAlert({ variant: 'warning', title: 'Sesión expirada', message: 'Volvé a iniciar sesión.' })
        setLoading(false)
        return
      }

      const normalizedSurfaces = surfaces.map((item) => ({
        surface: item.surface.trim(),
        courts: Number(item.courts),
      }))
      const normalizedHours = hours
        .filter((day) => day.enabled)
        .map((day) => ({
          day: day.key,
          label: day.label,
          opens: day.opens,
          closes: day.closes,
        }))

      const res = await fetch('/api/platform/create-club', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: token,
          club: {
            name: v.brand_name,
            brand_name: v.brand_name,
            legal_name: v.legal_name,
            cuit: v.cuit,
            country: v.country,
            province: v.province,
            city: v.city,
            address: v.address,
            phone: v.phone,
            mobile_phone: v.mobile_phone,
            website: v.website,
            instagram: v.instagram,
            courts_count: v.courts_count,
            court_surfaces: normalizedSurfaces,
            opening_hours_json: normalizedHours,
            description: v.description,
            theme_key: getClubTheme(v.theme_key).key,
          },
          owner: {
            email: authUser.email,
            fullName: session.user?.name,
          },
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
        message: `Club: ${json.clubName}. Quedaste como OWNER y la revisión quedó pendiente.`,
      })
      window.localStorage.removeItem(draftKey)
      await session.refresh()
      setTimeout(() => router.push('/club'), 900)
    } catch (err: unknown) {
      setAlert({ variant: 'error', title: 'Error', message: err instanceof Error ? err.message : String(err) })
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
            <div className="px-platformSub">Cargá los datos operativos del club. La revisión del superadmin queda pendiente.</div>
          </div>
        </div>

        {alert ? <div style={{ marginTop: 12 }}><AuthAlert variant={alert.variant} title={alert.title} message={alert.message} /></div> : null}
        {draftRestored ? (
          <div className="clubDraftNotice">
            Recuperamos un borrador guardado en este dispositivo.
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="clubOnboardingForm">
          <section className="px-card px-glass clubOnboardingSection">
            <div className="px-sectionTitle">Identidad</div>
            <p className="clubSectionHelp">El nombre comercial será el visible para jugadores cuando el club sea aprobado.</p>
            <div className="clubFormGrid clubFormGrid--three">
              <div className="px-field"><label className="px-label">Nombre legal o razón social *</label><input className="px-input" value={v.legal_name} onChange={(e) => onChange('legal_name', e.target.value)} required /></div>
              <div className="px-field"><label className="px-label">Nombre comercial *</label><input className="px-input" value={v.brand_name} onChange={(e) => onChange('brand_name', e.target.value)} required /></div>
              <div className="px-field"><label className="px-label">CUIT *</label><input className="px-input" value={v.cuit} onChange={(e) => onChange('cuit', e.target.value)} placeholder="30-71234567-8" required /></div>
            </div>
          </section>

          <section className="px-card px-glass clubOnboardingSection">
            <div className="px-sectionTitle">Identidad visual *</div>
            <p className="clubSectionHelp">Elegí una paleta Pamprax. Una vez creado el club, esta identidad queda fija para mantener consistencia de marca.</p>
            <div className="clubThemeGrid">
              {themeOptions.map((theme) => {
                const selected = getClubTheme(v.theme_key).key === theme.key
                return (
                  <button
                    key={theme.key}
                    type="button"
                    className="clubThemeChoice"
                    onClick={() => onChange('theme_key', theme.key)}
                    aria-pressed={selected}
                    style={{
                      borderColor: selected ? theme.vars.accent : 'rgba(15,23,42,.10)',
                      boxShadow: selected ? `0 18px 42px ${theme.vars.glow}, 0 0 0 4px ${theme.vars.soft}` : '0 10px 28px rgba(15,23,42,.05)',
                    }}
                  >
                    <span className="clubThemePreview" style={{ background: `linear-gradient(135deg, ${theme.vars.hero})` }}>
                      <span className="clubThemeAccent" style={{ background: `linear-gradient(90deg, ${theme.vars.accent}, ${theme.vars.accent2})`, boxShadow: `0 0 20px ${theme.vars.glow}` }} />
                    </span>
                    <span className="clubThemeMeta">
                      <strong>{CLUB_THEME_LABELS[theme.key]}</strong>
                      {selected ? <em style={{ color: theme.vars.accent }}>Seleccionado</em> : <em>Theme Pamprax</em>}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="px-card px-glass clubOnboardingSection">
            <div className="px-sectionTitle">Ubicacion</div>
            <p className="clubSectionHelp">Usá provincia y ciudad donde funciona la sede principal.</p>
            <div className="clubFormGrid">
              <div className="px-field"><label className="px-label">Pais *</label><input className="px-input" list="px-country-options" value={v.country} onChange={(e) => onChange('country', e.target.value)} required /></div>
              <div className="px-field"><label className="px-label">Provincia *</label><input className="px-input" list="px-province-options" value={v.province} onChange={(e) => onChange('province', e.target.value)} required /></div>
              <div className="px-field"><label className="px-label">Ciudad *</label><input className="px-input" list="px-city-options" value={v.city} onChange={(e) => onChange('city', e.target.value)} required /></div>
              <div className="px-field"><label className="px-label">Direccion *</label><input className="px-input" value={v.address} onChange={(e) => onChange('address', e.target.value)} required /></div>
            </div>
          </section>

          <section className="px-card px-glass clubOnboardingSection">
            <div className="px-sectionTitle">Contacto</div>
            <p className="clubSectionHelp">Estos datos ayudan a revisar el alta. Luego podrás ajustar la información pública.</p>
            <div className="clubFormGrid">
              <div className="px-field"><label className="px-label">Telefono</label><input className="px-input" value={v.phone} onChange={(e) => onChange('phone', e.target.value)} /></div>
              <div className="px-field"><label className="px-label">Celular</label><input className="px-input" value={v.mobile_phone} onChange={(e) => onChange('mobile_phone', e.target.value)} /></div>
              <div className="px-field"><label className="px-label">Website</label><input className="px-input" value={v.website} onChange={(e) => onChange('website', e.target.value)} placeholder="https://..." /></div>
              <div className="px-field"><label className="px-label">Instagram</label><input className="px-input" value={v.instagram} onChange={(e) => onChange('instagram', e.target.value)} placeholder="@club" /></div>
            </div>
          </section>

          <section className="px-card px-glass clubOnboardingSection">
            <div className="px-sectionTitle">Infraestructura</div>
            <p className="clubSectionHelp">La suma de canchas por superficie debe coincidir con el total declarado.</p>
            <div className="clubStack">
              <div className="px-field clubShortField">
                <label className="px-label">Cantidad de canchas *</label>
                <select className="px-input" value={v.courts_count} onChange={(e) => onChange('courts_count', e.target.value)}>
                  {courtCountOptions.map((count) => <option key={count} value={count}>{count}</option>)}
                </select>
              </div>

              <div className="clubStack clubStack--tight">
                <div className="px-label">Superficies</div>
                {surfaces.map((item, index) => (
                  <div key={index} className="clubSurfaceRow">
                    <div className="px-field">
                      <label className="px-label">Tipo</label>
                      <input className="px-input" list="px-surface-options" value={item.surface} onChange={(e) => updateSurface(index, { surface: e.target.value })} />
                    </div>
                    <div className="px-field">
                      <label className="px-label">Canchas</label>
                      <select className="px-input" value={item.courts} onChange={(e) => updateSurface(index, { courts: e.target.value })}>
                        {courtCountOptions.map((count) => <option key={count} value={count}>{count}</option>)}
                      </select>
                    </div>
                    <button className="px-btn px-btn--ghost" type="button" onClick={() => removeSurface(index)} disabled={surfaces.length === 1}>
                      Quitar
                    </button>
                  </div>
                ))}
                <div className="clubInlineActions">
                  <button className="px-btn px-btn--ghost" type="button" onClick={() => setSurfaces((prev) => [...prev, { surface: '', courts: '1' }])}>
                    Agregar superficie
                  </button>
                  <span className="px-help">Total por superficie: {totalSurfaceCourts} / {v.courts_count}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="px-card px-glass clubOnboardingSection">
            <div className="px-sectionTitle">Horarios</div>
            <p className="clubSectionHelp">Marcá solo los días en que el club atiende o tiene canchas disponibles.</p>
            <div className="clubStack clubStack--tight">
              {hours.map((day, index) => (
                <div key={day.key} className="clubHoursRow">
                  <label className="clubDayToggle">
                    <input type="checkbox" checked={day.enabled} onChange={(e) => updateHour(index, { enabled: e.target.checked })} />
                    {day.label}
                  </label>
                  <div className="px-field">
                    <label className="px-label">Apertura</label>
                    <input className="px-input" type="time" value={day.opens} disabled={!day.enabled} onChange={(e) => updateHour(index, { opens: e.target.value })} />
                  </div>
                  <div className="px-field">
                    <label className="px-label">Cierre</label>
                    <input className="px-input" type="time" value={day.closes} disabled={!day.enabled} onChange={(e) => updateHour(index, { closes: e.target.value })} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="px-card px-glass clubOnboardingSection">
            <div className="px-sectionTitle">Presentacion</div>
            <p className="clubSectionHelp">Una descripción corta alcanza para la revisión inicial.</p>
            <div className="px-field clubDescriptionField">
              <label className="px-label">Descripcion *</label>
              <textarea className="px-input" value={v.description} onChange={(e) => onChange('description', e.target.value)} rows={4} required />
            </div>
          </section>

          <div className="clubFormActions">
            <button className="px-btn px-btn--ghost" type="button" onClick={discardDraft}>
              Descartar borrador
            </button>
            <button className="px-btn px-btn--ghost" type="button" onClick={() => router.push('/clubs')}>
              Cancelar
            </button>
            <button className="px-btn" type="submit" disabled={loading}>
              {loading ? 'Creando…' : 'Crear club'}
            </button>
          </div>

          <datalist id="px-country-options">
            {countryOptions.map((item) => <option key={item} value={item} />)}
          </datalist>
          <datalist id="px-province-options">
            {provinceOptions.map((item) => <option key={item} value={item} />)}
          </datalist>
          <datalist id="px-city-options">
            {cityOptions.map((item) => <option key={item} value={item} />)}
          </datalist>
          <datalist id="px-surface-options">
            {surfaceOptions.map((item) => <option key={item} value={item} />)}
          </datalist>
        </form>

        <style>{`
          .clubDraftNotice {
            margin-top: 12px;
            border: 1px solid rgba(21, 128, 61, 0.22);
            border-radius: 12px;
            background: rgba(240, 253, 244, 0.86);
            color: #166534;
            font-size: 13px;
            font-weight: 800;
            padding: 10px 12px;
          }

          .clubOnboardingForm {
            display: grid;
            gap: 12px;
            margin-top: 14px;
          }

          .clubOnboardingSection {
            border-radius: 16px;
            padding: 16px;
          }

          .clubSectionHelp {
            color: var(--px-muted, #64748b);
            font-size: 13px;
            line-height: 1.45;
            margin: 6px 0 0;
          }

          .clubFormGrid,
          .clubStack {
            display: grid;
            gap: 12px;
            margin-top: 12px;
          }

          .clubStack--tight {
            gap: 10px;
          }

          .clubShortField {
            max-width: 100%;
          }

          .clubSurfaceRow,
          .clubHoursRow {
            display: grid;
            gap: 10px;
            border: 1px solid rgba(15, 23, 42, 0.08);
            border-radius: 12px;
            padding: 12px;
            background: rgba(255, 255, 255, 0.66);
          }

          .clubDayToggle {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 800;
            min-height: 40px;
          }

          .clubInlineActions {
            display: grid;
            gap: 8px;
          }

          .clubDescriptionField {
            margin-top: 12px;
          }

          .clubThemeGrid {
            display: grid;
            gap: 10px;
            grid-template-columns: repeat(auto-fit, minmax(168px, 1fr));
            margin-top: 12px;
          }

          .clubThemeChoice {
            background: rgba(255, 255, 255, 0.86);
            border: 2px solid rgba(15, 23, 42, 0.1);
            border-radius: 16px;
            cursor: pointer;
            display: grid;
            gap: 8px;
            overflow: hidden;
            padding: 0;
            text-align: left;
            transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
          }

          .clubThemeChoice:hover {
            transform: translateY(-2px);
          }

          .clubThemePreview {
            min-height: 70px;
            position: relative;
          }

          .clubThemePreview::after {
            content: '';
            position: absolute;
            inset: 0;
            background: radial-gradient(circle at 20% 20%, rgba(255,255,255,.18), transparent 28%);
          }

          .clubThemeAccent {
            border-radius: 999px;
            height: 9px;
            left: 12px;
            position: absolute;
            top: 12px;
            width: 52px;
            z-index: 1;
          }

          .clubThemeMeta {
            display: grid;
            gap: 2px;
            padding: 0 12px 12px;
          }

          .clubThemeMeta strong {
            color: #17253f;
            font-size: 13px;
          }

          .clubThemeMeta em {
            color: #64748b;
            font-size: 11px;
            font-style: normal;
            font-weight: 800;
          }

          .clubFormActions {
            position: sticky;
            bottom: 0;
            z-index: 4;
            display: grid;
            gap: 10px;
            padding: 12px 0 2px;
            background: linear-gradient(to top, rgba(248, 250, 252, 0.98), rgba(248, 250, 252, 0.82), rgba(248, 250, 252, 0));
          }

          .clubFormActions .px-btn {
            width: 100%;
            justify-content: center;
          }

          @media (min-width: 720px) {
            .clubOnboardingSection {
              padding: 18px;
            }

            .clubFormGrid {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }

            .clubFormGrid--three {
              grid-template-columns: repeat(3, minmax(0, 1fr));
            }

            .clubShortField {
              max-width: 240px;
            }

            .clubSurfaceRow {
              grid-template-columns: minmax(180px, 1fr) 120px auto;
              align-items: end;
            }

            .clubHoursRow {
              grid-template-columns: 150px minmax(0, 1fr) minmax(0, 1fr);
              align-items: center;
            }

            .clubInlineActions {
              align-items: center;
              display: flex;
              flex-wrap: wrap;
              gap: 10px;
            }

            .clubFormActions {
              align-items: center;
              display: flex;
              justify-content: flex-end;
            }

            .clubFormActions .px-btn {
              width: auto;
            }
          }
        `}</style>
      </div>
    </div>
  )
}
