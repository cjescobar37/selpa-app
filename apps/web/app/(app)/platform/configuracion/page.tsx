'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import AuthAlert from '@/components/AuthAlert'
import { supabase } from '@/lib/supabaseClient'

type AlertState =
  | { variant: 'success' | 'warning' | 'error' | 'info'; title: string; message?: string }
  | null

type PlatformSettings = {
  default_commission_bps: number
  default_currency: string
  platform_public_name: string
  contact_email: string
}

const DEFAULT_SETTINGS: PlatformSettings = {
  default_commission_bps: 1000,
  default_currency: 'ARS',
  platform_public_name: 'PAMPrax',
  contact_email: '',
}

function commissionPercent(bps: number) {
  return `${(Number(bps || 0) / 100).toLocaleString('es-AR', { maximumFractionDigits: 2 })}%`
}

export default function PlatformConfiguracionPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settingsReady, setSettingsReady] = useState(true)
  const [alert, setAlert] = useState<AlertState>(null)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS)
  const [draft, setDraft] = useState({
    default_commission_bps: String(DEFAULT_SETTINGS.default_commission_bps),
    default_currency: DEFAULT_SETTINGS.default_currency,
    platform_public_name: DEFAULT_SETTINGS.platform_public_name,
    contact_email: DEFAULT_SETTINGS.contact_email,
  })

  async function token() {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  }

  function hydrate(next: PlatformSettings) {
    setSettings(next)
    setDraft({
      default_commission_bps: String(next.default_commission_bps),
      default_currency: next.default_currency,
      platform_public_name: next.platform_public_name,
      contact_email: next.contact_email,
    })
  }

  async function load() {
    setLoading(true)
    setError(null)

    const accessToken = await token()
    if (!accessToken) {
      setError('Sesión expirada.')
      setLoading(false)
      return
    }

    const res = await fetch('/api/platform/settings', {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    })
    const json = await res.json().catch(() => ({}))

    if (json?.code === 'SETTINGS_NOT_INITIALIZED') {
      setSettingsReady(false)
      hydrate(json?.settings ?? DEFAULT_SETTINGS)
      setLoading(false)
      return
    }

    if (!res.ok) {
      setError(json?.error ?? 'No pude cargar configuración.')
      setLoading(false)
      return
    }

    setSettingsReady(true)
    hydrate(json?.settings ?? DEFAULT_SETTINGS)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const changed = useMemo(() => {
    return (
      String(settings.default_commission_bps) !== draft.default_commission_bps.trim() ||
      settings.default_currency !== draft.default_currency.trim().toUpperCase() ||
      settings.platform_public_name !== draft.platform_public_name.trim() ||
      settings.contact_email !== draft.contact_email.trim()
    )
  }, [settings, draft])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextSettings = {
      default_commission_bps: Number(draft.default_commission_bps),
      default_currency: draft.default_currency.trim().toUpperCase(),
      platform_public_name: draft.platform_public_name.trim(),
      contact_email: draft.contact_email.trim(),
    }

    const accessToken = await token()
    if (!accessToken) {
      setAlert({ variant: 'warning', title: 'Sesión expirada', message: 'Volvé a iniciar sesión.' })
      return
    }

    setSaving(true)
    const res = await fetch('/api/platform/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ settings: nextSettings }),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)

    if (json?.code === 'SETTINGS_NOT_INITIALIZED') {
      setSettingsReady(false)
      setAlert({ variant: 'info', title: 'Configuración aún no inicializada', message: 'Aplicá la migración de platform_settings y recargá.' })
      return
    }

    if (!res.ok) {
      setAlert({ variant: 'error', title: 'No pude guardar', message: json?.error ?? 'Error inesperado.' })
      return
    }

    hydrate(json?.settings ?? nextSettings)
    setAlert({ variant: 'success', title: 'Configuración guardada', message: 'Los parámetros globales quedaron actualizados y auditados.' })
  }

  return (
    <div className="platform-shell">
      <div className="px-platform px-platform--settings">
        <div className="px-platformHead">
          <div>
            <h1 className="px-platformTitle">Configuración</h1>
            <div className="px-platformSub">Parámetros globales simples para operar Platform con una sola fuente de verdad.</div>
          </div>
          <div className="px-toolbar">
            <button className="px-btn px-btn--ghost" type="button" onClick={load} disabled={loading}>
              {loading ? (<><span className="px-spinner" /> Recargando…</>) : 'Recargar'}
            </button>
          </div>
        </div>

        {!settingsReady ? (
          <div style={{ marginTop: 14 }}>
            <AuthAlert
              variant="info"
              title="Configuración aún no inicializada"
              message="Aplicá la migración platform_settings y recargá esta pantalla para guardar cambios."
            />
          </div>
        ) : null}
        {alert ? <div style={{ marginTop: 14 }}><AuthAlert variant={alert.variant} title={alert.title} message={alert.message} /></div> : null}
        {error ? <div style={{ marginTop: 14 }}><AuthAlert variant="error" title="No pude cargar configuración" message={error} /></div> : null}

        <div className="px-settingsLayout">
          <form className="px-platformCard px-settingsForm" onSubmit={save}>
            <section>
              <div className="px-sectionTitle">Finanzas</div>
              <div className="px-settingsGrid">
                <label>
                  <span>Comisión default</span>
                  <input
                    className="px-input"
                    inputMode="numeric"
                    value={draft.default_commission_bps}
                    onChange={(event) => setDraft((current) => ({ ...current, default_commission_bps: event.target.value }))}
                  />
                  <small>Basis points. {commissionPercent(Number(draft.default_commission_bps))}</small>
                </label>
                <label>
                  <span>Moneda default</span>
                  <input
                    className="px-input"
                    maxLength={3}
                    value={draft.default_currency}
                    onChange={(event) => setDraft((current) => ({ ...current, default_currency: event.target.value.toUpperCase() }))}
                  />
                  <small>Código ISO de 3 letras.</small>
                </label>
              </div>
            </section>

            <section>
              <div className="px-sectionTitle">Identidad pública</div>
              <div className="px-settingsGrid">
                <label>
                  <span>Nombre público</span>
                  <input
                    className="px-input"
                    value={draft.platform_public_name}
                    onChange={(event) => setDraft((current) => ({ ...current, platform_public_name: event.target.value }))}
                  />
                </label>
                <label>
                  <span>Email de contacto</span>
                  <input
                    className="px-input"
                    type="email"
                    value={draft.contact_email}
                    onChange={(event) => setDraft((current) => ({ ...current, contact_email: event.target.value }))}
                    placeholder="contacto@pamprax.com"
                  />
                </label>
              </div>
            </section>

            <div className="px-settingsActions">
              <button className="px-btn px-btn--ghost" type="button" onClick={() => hydrate(settings)} disabled={!changed || saving}>
                Descartar
              </button>
              <button className="px-btn" type="submit" disabled={!settingsReady || !changed || saving}>
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </form>

          <aside className="px-platformCard px-settingsSummary">
            <div className="px-sectionTitle">Resumen activo</div>
            <div className="px-platformDetailGrid">
              <div><span>Comisión</span><strong>{commissionPercent(settings.default_commission_bps)}</strong></div>
              <div><span>Moneda</span><strong>{settings.default_currency}</strong></div>
              <div><span>Nombre</span><strong>{settings.platform_public_name}</strong></div>
              <div><span>Contacto</span><strong>{settings.contact_email || '—'}</strong></div>
            </div>
            <div className="px-platformNoteBox" style={{ marginTop: 12 }}>
              Estos valores son globales. Las reglas específicas de torneos o clubes pueden sumarse después sin mezclar configuración operativa con lógica de negocio.
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
