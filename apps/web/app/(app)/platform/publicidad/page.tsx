'use client'

import { useEffect, useMemo, useState } from 'react'
import AuthAlert from '@/components/AuthAlert'
import PlatformModuleShell from '@/components/platform/PlatformModuleShell'
import { supabase } from '@/lib/supabaseClient'

type Campaign = {
  id: string
  title: string
  description: string | null
  image_url: string | null
  link_url: string | null
  slot: 'HOME_HERO' | 'HOME_GRID' | 'HOME_INLINE'
  status: 'ACTIVE' | 'PAUSED'
  sort_order: number
}

type Sponsor = {
  id: string
  name: string
  website_url: string | null
  logo_url: string | null
  tier: 'SPONSOR' | 'PARTNER' | 'LOCAL'
  status: 'ACTIVE' | 'PAUSED'
  sort_order: number
}

type AlertState = { variant: 'success' | 'warning' | 'error' | 'info'; title: string; message?: string } | null
const emptyCampaign = { title: '', description: '', linkUrl: '', slot: 'HOME_GRID', status: 'ACTIVE', sortOrder: '100' }
const emptySponsor = { name: '', websiteUrl: '', tier: 'SPONSOR', status: 'ACTIVE', sortOrder: '100' }

export default function PlatformPublicidadPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [sponsors, setSponsors] = useState<Sponsor[]>([])
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null)
  const [selectedSponsorId, setSelectedSponsorId] = useState<string | null>(null)
  const [campaignOpen, setCampaignOpen] = useState(false)
  const [sponsorOpen, setSponsorOpen] = useState(false)
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null)
  const [editingSponsorId, setEditingSponsorId] = useState<string | null>(null)
  const [campaignForm, setCampaignForm] = useState(emptyCampaign)
  const [sponsorForm, setSponsorForm] = useState(emptySponsor)
  const [campaignFile, setCampaignFile] = useState<File | null>(null)
  const [sponsorFile, setSponsorFile] = useState<File | null>(null)
  const [keepImage, setKeepImage] = useState(true)
  const [keepLogo, setKeepLogo] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [setupRequired, setSetupRequired] = useState<string | null>(null)
  const [alert, setAlert] = useState<AlertState>(null)

  async function getToken() {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || null
  }

  async function load() {
    setLoading(true)
    const token = await getToken()
    if (!token) return
    const headers = { Authorization: `Bearer ${token}` }
    const [adsRes, sponsorsRes] = await Promise.all([
      fetch('/api/platform/ads', { headers, cache: 'no-store' }),
      fetch('/api/platform/sponsors', { headers, cache: 'no-store' }),
    ])
    const adsJson = await adsRes.json().catch(() => ({}))
    const sponsorsJson = await sponsorsRes.json().catch(() => ({}))
    if (!adsRes.ok) {
      if (adsJson?.setupRequired) setSetupRequired(adsJson?.detail || adsJson?.error || 'Falta migración de contenido.')
      else setAlert({ variant: 'error', title: 'No pude cargar campañas', message: adsJson?.error || 'Error inesperado.' })
      setLoading(false)
      return
    }
    if (!sponsorsRes.ok) {
      if (sponsorsJson?.setupRequired) setSetupRequired(sponsorsJson?.detail || sponsorsJson?.error || 'Falta migración de contenido.')
      else setAlert({ variant: 'error', title: 'No pude cargar sponsors', message: sponsorsJson?.error || 'Error inesperado.' })
      setLoading(false)
      return
    }
    setSetupRequired(null)
    setCampaigns(adsJson.rows || [])
    setSponsors(sponsorsJson.rows || [])
    setSelectedCampaignId((cur) => cur ?? adsJson.rows?.[0]?.id ?? null)
    setSelectedSponsorId((cur) => cur ?? sponsorsJson.rows?.[0]?.id ?? null)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const selectedCampaign = useMemo(() => campaigns.find((row) => row.id === selectedCampaignId) ?? null, [campaigns, selectedCampaignId])
  const selectedSponsor = useMemo(() => sponsors.find((row) => row.id === selectedSponsorId) ?? null, [sponsors, selectedSponsorId])

  function openNewCampaign() {
    setEditingCampaignId(null)
    setCampaignForm(emptyCampaign)
    setCampaignFile(null)
    setKeepImage(true)
    setCampaignOpen(true)
  }

  function openEditCampaign(row: Campaign) {
    setEditingCampaignId(row.id)
    setCampaignForm({ title: row.title, description: row.description || '', linkUrl: row.link_url || '', slot: row.slot, status: row.status, sortOrder: String(row.sort_order ?? 100) })
    setCampaignFile(null)
    setKeepImage(Boolean(row.image_url))
    setCampaignOpen(true)
  }

  function openNewSponsor() {
    setEditingSponsorId(null)
    setSponsorForm(emptySponsor)
    setSponsorFile(null)
    setKeepLogo(true)
    setSponsorOpen(true)
  }

  function openEditSponsor(row: Sponsor) {
    setEditingSponsorId(row.id)
    setSponsorForm({ name: row.name, websiteUrl: row.website_url || '', tier: row.tier, status: row.status, sortOrder: String(row.sort_order ?? 100) })
    setSponsorFile(null)
    setKeepLogo(Boolean(row.logo_url))
    setSponsorOpen(true)
  }

  async function saveCampaign() {
    const token = await getToken()
    if (!token) return
    setSaving(true)
    const fd = new FormData()
    fd.set('title', campaignForm.title)
    fd.set('description', campaignForm.description)
    fd.set('linkUrl', campaignForm.linkUrl)
    fd.set('slot', campaignForm.slot)
    fd.set('status', campaignForm.status)
    fd.set('sortOrder', campaignForm.sortOrder)
    fd.set('keepImage', keepImage ? '1' : '0')
    if (campaignFile) fd.set('image', campaignFile)
    const res = await fetch(editingCampaignId ? `/api/platform/ads/${editingCampaignId}` : '/api/platform/ads', { method: editingCampaignId ? 'PATCH' : 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      if (json?.setupRequired) setSetupRequired(json?.detail || json?.error || 'Falta migración de contenido.')
      else setAlert({ variant: 'error', title: 'No pude guardar la campaña', message: json?.error || 'Error inesperado.' })
      return
    }
    setCampaignOpen(false)
    setAlert({ variant: 'success', title: editingCampaignId ? 'Campaña actualizada' : 'Campaña creada' })
    await load()
  }

  async function saveSponsor() {
    const token = await getToken()
    if (!token) return
    setSaving(true)
    const fd = new FormData()
    fd.set('name', sponsorForm.name)
    fd.set('websiteUrl', sponsorForm.websiteUrl)
    fd.set('tier', sponsorForm.tier)
    fd.set('status', sponsorForm.status)
    fd.set('sortOrder', sponsorForm.sortOrder)
    fd.set('keepLogo', keepLogo ? '1' : '0')
    if (sponsorFile) fd.set('logo', sponsorFile)
    const res = await fetch(editingSponsorId ? `/api/platform/sponsors/${editingSponsorId}` : '/api/platform/sponsors', { method: editingSponsorId ? 'PATCH' : 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      if (json?.setupRequired) setSetupRequired(json?.detail || json?.error || 'Falta migración de contenido.')
      else setAlert({ variant: 'error', title: 'No pude guardar el sponsor', message: json?.error || 'Error inesperado.' })
      return
    }
    setSponsorOpen(false)
    setAlert({ variant: 'success', title: editingSponsorId ? 'Sponsor actualizado' : 'Sponsor creado' })
    await load()
  }

  async function removeCampaign(row: Campaign) {
    const token = await getToken()
    if (!token || !window.confirm(`Eliminar campaña “${row.title}”?`)) return
    const res = await fetch(`/api/platform/ads/${row.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (json?.setupRequired) setSetupRequired(json?.detail || json?.error || 'Falta migración de contenido.')
      else setAlert({ variant: 'error', title: 'No pude eliminar la campaña', message: json?.error || 'Error inesperado.' })
      return
    }
    await load()
  }

  async function removeSponsor(row: Sponsor) {
    const token = await getToken()
    if (!token || !window.confirm(`Eliminar sponsor “${row.name}”?`)) return
    const res = await fetch(`/api/platform/sponsors/${row.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (json?.setupRequired) setSetupRequired(json?.detail || json?.error || 'Falta migración de contenido.')
      else setAlert({ variant: 'error', title: 'No pude eliminar el sponsor', message: json?.error || 'Error inesperado.' })
      return
    }
    await load()
  }

  const metrics = [
    { label: 'Campañas activas', value: String(campaigns.filter((item) => item.status === 'ACTIVE').length) },
    { label: 'Sponsors activos', value: String(sponsors.filter((item) => item.status === 'ACTIVE').length) },
    { label: 'Slots ocupados', value: String(new Set(campaigns.filter((item) => item.status === 'ACTIVE').map((item) => item.slot)).size) },
    { label: 'Pausadas', value: String(campaigns.filter((item) => item.status === 'PAUSED').length + sponsors.filter((item) => item.status === 'PAUSED').length) },
  ]

  return (
    <PlatformModuleShell
      title="Publicidad y sponsors"
      subtitle="Gestioná banners, sponsors y piezas reales que se muestran en el index invitado."
      metrics={metrics}
      actions={<><button className="px-btn" type="button" onClick={openNewCampaign}>Nueva campaña</button><button className="px-btn px-btn--soft" type="button" onClick={load}>Recargar</button></>}
      quickActions={[
        { title: 'Banners del home', description: 'Campañas con imagen, link y slot visible para invitados.', tag: 'Ads' },
        { title: 'Sponsors oficiales', description: 'Logos, sitio web y orden de aparición debajo de noticias.', tag: 'Branding' },
      ]}
      aside={
        <div className="px-platformCard">
          <div className="px-sectionTitle">Regla operativa</div>
          <div className="px-platformChecklist">
            <div>HOME_HERO se usa para un banner principal grande.</div>
            <div>HOME_GRID sirve para piezas más chicas o promociones.</div>
            <div>Los sponsors activos se muestran en bloque fijo del index.</div>
          </div>
        </div>
      }
    >
      {alert ? <AuthAlert variant={alert.variant} title={alert.title} message={alert.message} /> : null}
      {setupRequired ? <AuthAlert variant="warning" title="Contenido no inicializado" message={setupRequired} /> : null}
      <div className="px-contentAdminGrid px-contentAdminGrid--editor" style={{ marginTop: 14 }}>
        <div className="px-platformCard">
          <div className="px-sectionTitle">Campañas publicitarias</div>
          <div className="px-contentList px-contentList--compact">
            {loading ? <div className="px-empty">Cargando campañas…</div> : null}
            {!loading && !campaigns.length ? <div className="px-empty">Todavía no hay campañas cargadas.</div> : null}
            {campaigns.map((row) => (
              <div key={row.id} className={`px-contentItem ${selectedCampaignId === row.id ? 'is-selected' : ''}`}>
                <div className="px-contentItemHead">
                  <div onClick={() => setSelectedCampaignId(row.id)} style={{ cursor: 'pointer', flex: 1 }}>
                    <div className="px-contentItemTitle">{row.title}</div>
                    <div className="px-contentMeta"><span>{row.slot}</span><span>{row.status}</span><span>Orden {row.sort_order}</span></div>
                  </div>
                  <div className="px-contentActions">
                    <button className="px-btn px-btn--soft px-btn--xs" type="button" onClick={() => openEditCampaign(row)}>Editar</button>
                    <button className="px-btn px-btn--danger px-btn--xs" type="button" onClick={() => removeCampaign(row)}>Eliminar</button>
                  </div>
                </div>
                {row.description ? <div className="px-platformSub">{row.description}</div> : null}
              </div>
            ))}
          </div>
        </div>

        <div className="px-platformCard">
          <div className="px-sectionTitle">Sponsors</div>
          <div style={{ marginBottom: 10 }}>
            <button className="px-btn px-btn--soft" type="button" onClick={openNewSponsor}>Nuevo sponsor</button>
          </div>
          <div className="px-contentList px-contentList--compact">
            {!loading && !sponsors.length ? <div className="px-empty">Todavía no hay sponsors cargados.</div> : null}
            {sponsors.map((row) => (
              <div key={row.id} className={`px-contentItem ${selectedSponsorId === row.id ? 'is-selected' : ''}`}>
                <div className="px-contentItemHead">
                  <div onClick={() => setSelectedSponsorId(row.id)} style={{ cursor: 'pointer', flex: 1 }}>
                    <div className="px-contentItemTitle">{row.name}</div>
                    <div className="px-contentMeta"><span>{row.tier}</span><span>{row.status}</span><span>Orden {row.sort_order}</span></div>
                  </div>
                  <div className="px-contentActions">
                    <button className="px-btn px-btn--soft px-btn--xs" type="button" onClick={() => openEditSponsor(row)}>Editar</button>
                    <button className="px-btn px-btn--danger px-btn--xs" type="button" onClick={() => removeSponsor(row)}>Eliminar</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {campaignOpen ? (
        <div className="px-overlay" onClick={() => !saving && setCampaignOpen(false)}>
          <div className="px-modalCard px-contentModal" onClick={(e) => e.stopPropagation()}>
            <div className="px-modalHead">
              <div>
                <h3 className="px-modalTitle">{editingCampaignId ? 'Editar campaña' : 'Nueva campaña'}</h3>
                <div className="px-modalSub">Alta con modal, misma lógica visual que el resto.</div>
              </div>
              <button className="px-btn px-btn--soft px-btn--xs" type="button" onClick={() => setCampaignOpen(false)}>Cerrar</button>
            </div>
            <div className="px-formGrid">
              <label className="px-field px-formGridSpan2"><span>Título</span><input className="px-input" value={campaignForm.title} onChange={(e) => setCampaignForm((s) => ({ ...s, title: e.target.value }))} /></label>
              <label className="px-field px-formGridSpan2"><span>Link</span><input className="px-input" value={campaignForm.linkUrl} onChange={(e) => setCampaignForm((s) => ({ ...s, linkUrl: e.target.value }))} /></label>
              <label className="px-field px-formGridSpan2"><span>Descripción</span><textarea className="px-input px-textarea" value={campaignForm.description} onChange={(e) => setCampaignForm((s) => ({ ...s, description: e.target.value }))} /></label>
              <label className="px-field"><span>Slot</span><select className="px-select" value={campaignForm.slot} onChange={(e) => setCampaignForm((s) => ({ ...s, slot: e.target.value as any }))}><option value="HOME_HERO">Home hero</option><option value="HOME_GRID">Home grid</option><option value="HOME_INLINE">Home inline</option></select></label>
              <label className="px-field"><span>Estado</span><select className="px-select" value={campaignForm.status} onChange={(e) => setCampaignForm((s) => ({ ...s, status: e.target.value as any }))}><option value="ACTIVE">Activa</option><option value="PAUSED">Pausada</option></select></label>
              <label className="px-field"><span>Orden</span><input className="px-input" value={campaignForm.sortOrder} onChange={(e) => setCampaignForm((s) => ({ ...s, sortOrder: e.target.value }))} /></label>
              <label className="px-field"><span>Imagen</span><input type="file" accept="image/*" onChange={(e) => setCampaignFile(e.target.files?.[0] || null)} /></label>
              {editingCampaignId ? <label className="px-checkboxLine px-formGridSpan2"><input type="checkbox" checked={keepImage} onChange={(e) => setKeepImage(e.target.checked)} />Mantener imagen actual si no subo otra.</label> : null}
            </div>
            <div className="px-platformDecisionActions" style={{ marginTop: 18 }}>
              <button className="px-btn px-btn--soft" type="button" onClick={() => setCampaignOpen(false)}>Cancelar</button>
              <button className="px-btn" type="button" onClick={saveCampaign} disabled={saving}>{saving ? 'Guardando…' : editingCampaignId ? 'Guardar cambios' : 'Crear campaña'}</button>
            </div>
          </div>
        </div>
      ) : null}

      {sponsorOpen ? (
        <div className="px-overlay" onClick={() => !saving && setSponsorOpen(false)}>
          <div className="px-modalCard px-contentModal" onClick={(e) => e.stopPropagation()}>
            <div className="px-modalHead">
              <div>
                <h3 className="px-modalTitle">{editingSponsorId ? 'Editar sponsor' : 'Nuevo sponsor'}</h3>
                <div className="px-modalSub">Mismo sistema de altas con modal.</div>
              </div>
              <button className="px-btn px-btn--soft px-btn--xs" type="button" onClick={() => setSponsorOpen(false)}>Cerrar</button>
            </div>
            <div className="px-formGrid">
              <label className="px-field px-formGridSpan2"><span>Nombre</span><input className="px-input" value={sponsorForm.name} onChange={(e) => setSponsorForm((s) => ({ ...s, name: e.target.value }))} /></label>
              <label className="px-field px-formGridSpan2"><span>Web</span><input className="px-input" value={sponsorForm.websiteUrl} onChange={(e) => setSponsorForm((s) => ({ ...s, websiteUrl: e.target.value }))} /></label>
              <label className="px-field"><span>Tier</span><select className="px-select" value={sponsorForm.tier} onChange={(e) => setSponsorForm((s) => ({ ...s, tier: e.target.value as any }))}><option value="SPONSOR">Sponsor</option><option value="PARTNER">Partner</option><option value="LOCAL">Local</option></select></label>
              <label className="px-field"><span>Estado</span><select className="px-select" value={sponsorForm.status} onChange={(e) => setSponsorForm((s) => ({ ...s, status: e.target.value as any }))}><option value="ACTIVE">Activo</option><option value="PAUSED">Pausado</option></select></label>
              <label className="px-field"><span>Orden</span><input className="px-input" value={sponsorForm.sortOrder} onChange={(e) => setSponsorForm((s) => ({ ...s, sortOrder: e.target.value }))} /></label>
              <label className="px-field"><span>Logo</span><input type="file" accept="image/*" onChange={(e) => setSponsorFile(e.target.files?.[0] || null)} /></label>
              {editingSponsorId ? <label className="px-checkboxLine px-formGridSpan2"><input type="checkbox" checked={keepLogo} onChange={(e) => setKeepLogo(e.target.checked)} />Mantener logo actual si no subo otro.</label> : null}
            </div>
            <div className="px-platformDecisionActions" style={{ marginTop: 18 }}>
              <button className="px-btn px-btn--soft" type="button" onClick={() => setSponsorOpen(false)}>Cancelar</button>
              <button className="px-btn" type="button" onClick={saveSponsor} disabled={saving}>{saving ? 'Guardando…' : editingSponsorId ? 'Guardar cambios' : 'Crear sponsor'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </PlatformModuleShell>
  )
}
