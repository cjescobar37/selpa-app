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
  slot: 'HOME_AFTER_RANKING' | 'HOME_AFTER_NEWS_HERO' | 'HOME_HERO' | 'HOME_GRID' | 'HOME_INLINE'
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

const emptyCampaign = { title: '', description: '', linkUrl: '', slot: 'HOME_AFTER_RANKING' as Campaign['slot'], status: 'ACTIVE' as Campaign['status'], sortOrder: '100' }
const emptySponsor = { name: '', websiteUrl: '', tier: 'SPONSOR' as Sponsor['tier'], status: 'ACTIVE' as Sponsor['status'], sortOrder: '100' }

function slotLabel(slot: Campaign['slot']) {
  if (slot === 'HOME_AFTER_NEWS_HERO' || slot === 'HOME_INLINE' || slot === 'HOME_HERO') return 'Después de noticia destacada'
  return 'Después de rankings'
}

function slotBadgeClass(slot: Campaign['slot']) {
  if (slot === 'HOME_AFTER_NEWS_HERO' || slot === 'HOME_INLINE' || slot === 'HOME_HERO') return 'px-slotBadge px-slotBadge--inline'
  return 'px-slotBadge px-slotBadge--grid'
}

function statusBadgeClass(status: 'ACTIVE' | 'PAUSED') {
  return status === 'ACTIVE' ? 'px-entityBadge px-entityBadge--active' : 'px-entityBadge px-entityBadge--paused'
}

function statusLabel(status: 'ACTIVE' | 'PAUSED') {
  return status === 'ACTIVE' ? 'Activa' : 'Oculta'
}

function isAfterRankingSlot(slot: Campaign['slot']) {
  return slot === 'HOME_AFTER_RANKING' || slot === 'HOME_GRID'
}

function isAfterNewsHeroSlot(slot: Campaign['slot']) {
  return slot === 'HOME_AFTER_NEWS_HERO' || slot === 'HOME_INLINE' || slot === 'HOME_HERO'
}

function editableSlot(slot: Campaign['slot']): Campaign['slot'] {
  if (isAfterNewsHeroSlot(slot)) return 'HOME_AFTER_NEWS_HERO'
  return 'HOME_AFTER_RANKING'
}

function tierBadgeClass(tier: Sponsor['tier']) {
  if (tier === 'PARTNER') return 'px-slotBadge px-slotBadge--partner'
  if (tier === 'LOCAL') return 'px-slotBadge px-slotBadge--local'
  return 'px-slotBadge px-slotBadge--sponsor'
}

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
  const [campaignPreviewUrl, setCampaignPreviewUrl] = useState<string | null>(null)
  const [sponsorPreviewUrl, setSponsorPreviewUrl] = useState<string | null>(null)
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

  useEffect(() => {
    if (!campaignFile) {
      setCampaignPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(campaignFile)
    setCampaignPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [campaignFile])

  useEffect(() => {
    if (!sponsorFile) {
      setSponsorPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(sponsorFile)
    setSponsorPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [sponsorFile])

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
    setCampaignForm({ title: row.title, description: row.description || '', linkUrl: row.link_url || '', slot: editableSlot(row.slot), status: row.status, sortOrder: String(row.sort_order ?? 100) })
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
    { label: 'Ocultas', value: String(campaigns.filter((item) => item.status === 'PAUSED').length) },
  ]

  const campaignPreviewImage = campaignPreviewUrl || (editingCampaignId && keepImage ? selectedCampaign?.image_url || null : null)
  const sponsorPreviewImage = sponsorPreviewUrl || (editingSponsorId && keepLogo ? selectedSponsor?.logo_url || null : null)

  return (
    <PlatformModuleShell
      title="Publicidad y sponsors"
      subtitle="Organizá campañas, posiciones y logos con una lectura clara de qué sale y dónde."
      metrics={metrics}
      actions={<div className="px-mediaActions"><button className="px-btn px-btn--ghost" type="button" onClick={load}>Actualizar</button><button className="px-btn" type="button" onClick={openNewCampaign}>Nueva campaña</button></div>}
      aside={<div className="px-platformCard px-mediaAside"><div className="px-mediaAsideHead"><h3>Impacto actual</h3></div><div className="px-mediaRuleList"><div><span>Después de rankings</span><strong>{campaigns.filter((item) => isAfterRankingSlot(item.slot) && item.status === 'ACTIVE').length} activa(s)</strong></div><div><span>Después de noticia destacada</span><strong>{campaigns.filter((item) => isAfterNewsHeroSlot(item.slot) && item.status === 'ACTIVE').length} activa(s)</strong></div><div><span>Ocultas</span><strong>{campaigns.filter((item) => item.status === 'PAUSED').length}</strong></div><div><span>Sponsors visibles</span><strong>{sponsors.filter((item) => item.status === 'ACTIVE').length}</strong></div></div></div>}
    >
      {alert ? <AuthAlert variant={alert.variant} title={alert.title} message={alert.message} /> : null}
      {setupRequired ? <AuthAlert variant="warning" title="Contenido no inicializado" message={setupRequired} /> : null}

      <div className="px-mediaBoard">
        <section className="px-platformCard px-mediaSection">
          <div className="px-mediaSectionHead">
            <div><h3>Campañas</h3><p>Hero, grilla y posiciones secundarias.</p></div>
            <button className="px-btn px-btn--soft" type="button" onClick={openNewCampaign}>Cargar campaña</button>
          </div>
          <div className="px-mediaList">
            {loading ? <div className="px-empty">Cargando campañas…</div> : null}
            {!loading && !campaigns.length ? <div className="px-empty">Todavía no hay campañas cargadas.</div> : null}
            {campaigns.map((row) => (
              <article key={row.id} className={`px-mediaRow ${selectedCampaignId === row.id ? 'is-active' : ''}`} onClick={() => setSelectedCampaignId(row.id)}>
                <div className="px-mediaThumb">{row.image_url ? <img src={row.image_url} alt={row.title} /> : <span>Sin pieza</span>}</div>
                <div className="px-mediaMain">
                  <div className="px-mediaTop">
                    <strong>{row.title}</strong>
                    <div className="px-mediaBadges"><span className={slotBadgeClass(row.slot)}>{slotLabel(row.slot)}</span><span className={statusBadgeClass(row.status)}>{statusLabel(row.status)}</span></div>
                  </div>
                  <div className="px-mediaMeta"><span>Orden {row.sort_order}</span>{row.link_url ? <span>{row.link_url}</span> : null}</div>
                </div>
                <div className="px-mediaRowActions">
                  <button className="px-btn px-btn--ghost" type="button" onClick={(event) => { event.stopPropagation(); openEditCampaign(row) }}>Editar</button>
                  <button className="px-btn px-btn--dangerGhost" type="button" onClick={(event) => { event.stopPropagation(); void removeCampaign(row) }}>Eliminar</button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="px-platformCard px-mediaSection">
          <div className="px-mediaSectionHead">
            <div><h3>Sponsors</h3><p>Bloque de aliados y marcas visibles en home.</p></div>
            <button className="px-btn px-btn--soft" type="button" onClick={openNewSponsor}>Cargar sponsor</button>
          </div>
          <div className="px-mediaList">
            {!loading && !sponsors.length ? <div className="px-empty">Todavía no hay sponsors cargados.</div> : null}
            {sponsors.map((row) => (
              <article key={row.id} className={`px-mediaRow ${selectedSponsorId === row.id ? 'is-active' : ''}`} onClick={() => setSelectedSponsorId(row.id)}>
                <div className="px-mediaThumb px-mediaThumb--logo">{row.logo_url ? <img src={row.logo_url} alt={row.name} /> : <span>{row.name.slice(0, 2).toUpperCase()}</span>}</div>
                <div className="px-mediaMain">
                  <div className="px-mediaTop">
                    <strong>{row.name}</strong>
                    <div className="px-mediaBadges"><span className={tierBadgeClass(row.tier)}>{row.tier}</span><span className={statusBadgeClass(row.status)}>{row.status === 'ACTIVE' ? 'Activo' : 'Pausado'}</span></div>
                  </div>
                  <div className="px-mediaMeta"><span>Orden {row.sort_order}</span>{row.website_url ? <span>{row.website_url}</span> : null}</div>
                </div>
                <div className="px-mediaRowActions">
                  <button className="px-btn px-btn--ghost" type="button" onClick={(event) => { event.stopPropagation(); openEditSponsor(row) }}>Editar</button>
                  <button className="px-btn px-btn--dangerGhost" type="button" onClick={(event) => { event.stopPropagation(); void removeSponsor(row) }}>Eliminar</button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="px-platformCard px-mediaSection px-mediaSection--preview">
          <div className="px-mediaSectionHead">
            <div><h3>Preview real</h3><p>Cómo impactan las piezas activas dentro del sitio.</p></div>
          </div>
          <div className="px-mediaPreviewGrid">
            <article className="px-mediaPreviewCard px-mediaPreviewCard--hero">
              <span className="px-slotBadge px-slotBadge--grid">HOME_AFTER_RANKING</span>
              {selectedCampaign && isAfterRankingSlot(selectedCampaign.slot) && selectedCampaign.image_url ? <img src={selectedCampaign.image_url} alt={selectedCampaign.title} className="px-mediaPreviewImage" /> : null}
              <div className="px-mediaPreviewBody"><strong>{selectedCampaign && isAfterRankingSlot(selectedCampaign.slot) ? selectedCampaign.title : 'Después de rankings'}</strong><p>Banner horizontal entre rankings y comunidad.</p></div>
            </article>
            <article className="px-mediaPreviewCard">
              <span className="px-slotBadge px-slotBadge--grid">Rankings</span>
              <div className="px-mediaMiniPreviewList">
                {campaigns.filter((item) => isAfterRankingSlot(item.slot)).slice(0, 3).map((item) => (
                  <div key={item.id} className="px-mediaMiniPreview">{item.image_url ? <img src={item.image_url} alt={item.title} /> : <div />}<strong>{item.title}</strong></div>
                ))}
              </div>
            </article>
            <article className="px-mediaPreviewCard">
              <span className="px-slotBadge px-slotBadge--inline">HOME_AFTER_NEWS_HERO</span>
              <div className="px-mediaInlinePreview">
                {campaigns.filter((item) => isAfterNewsHeroSlot(item.slot)).slice(0, 2).map((item) => (
                  <div key={item.id} className="px-mediaInlineItem"><strong>{item.title}</strong><span>{item.status === 'ACTIVE' ? 'Visible' : 'Oculta'}</span></div>
                ))}
                {!campaigns.some((item) => isAfterNewsHeroSlot(item.slot)) ? <span className="px-muted">Sin campañas en esta posición.</span> : null}
              </div>
            </article>
            <article className="px-mediaPreviewCard px-mediaPreviewCard--sponsors">
              <span className="px-slotBadge px-slotBadge--sponsor">Sponsors</span>
              <div className="px-mediaSponsorPreview">
                {sponsors.slice(0, 4).map((item) => (
                  <div key={item.id} className="px-mediaSponsorLogo">{item.logo_url ? <img src={item.logo_url} alt={item.name} /> : <span>{item.name.slice(0, 2).toUpperCase()}</span>}</div>
                ))}
              </div>
            </article>
          </div>
        </section>
      </div>

      {campaignOpen ? (
        <div className="px-mediaOverlay" onClick={() => !saving && setCampaignOpen(false)}>
          <div className="px-mediaModal" onClick={(event) => event.stopPropagation()}>
            <div className="px-mediaModalHead">
              <div><h3>{editingCampaignId ? 'Editar campaña' : 'Nueva campaña'}</h3><p>Definí pieza, ubicación y prioridad visual.</p></div>
              <button className="px-btn px-btn--ghost" type="button" onClick={() => setCampaignOpen(false)}>Cerrar</button>
            </div>
            <div className="px-mediaModalGrid">
              <div className="px-mediaFormStack">
                <section className="px-mediaFormBlock">
                  <h4>Datos principales</h4>
                  <label><span>Nombre de campaña</span><input value={campaignForm.title} onChange={(event) => setCampaignForm((state) => ({ ...state, title: event.target.value }))} /></label>
                  <label><span>Link</span><input value={campaignForm.linkUrl} onChange={(event) => setCampaignForm((state) => ({ ...state, linkUrl: event.target.value }))} /></label>
                  <label><span>Descripción</span><textarea rows={4} value={campaignForm.description} onChange={(event) => setCampaignForm((state) => ({ ...state, description: event.target.value }))} /></label>
                </section>
                <section className="px-mediaFormBlock">
                  <h4>Ubicación y estado</h4>
                  <div className="px-mediaSplit">
                    <label><span>Posición</span><select value={campaignForm.slot} onChange={(event) => setCampaignForm((state) => ({ ...state, slot: event.target.value as Campaign['slot'] }))}><option value="HOME_AFTER_RANKING">Después de rankings</option><option value="HOME_AFTER_NEWS_HERO">Después de noticia destacada</option></select></label>
                    <label><span>Visibilidad</span><select value={campaignForm.status} onChange={(event) => setCampaignForm((state) => ({ ...state, status: event.target.value as Campaign['status'] }))}><option value="ACTIVE">Activa</option><option value="PAUSED">Oculta</option></select></label>
                    <label><span>Orden</span><input value={campaignForm.sortOrder} onChange={(event) => setCampaignForm((state) => ({ ...state, sortOrder: event.target.value }))} /></label>
                  </div>
                </section>
                <section className="px-mediaFormBlock">
                  <h4>Imagen</h4>
                  <label className="px-mediaUpload"><span>Banner horizontal ancho</span><input type="file" accept="image/*" onChange={(event) => setCampaignFile(event.target.files?.[0] || null)} /></label>
                  {editingCampaignId ? <label className="px-mediaCheckbox"><input type="checkbox" checked={keepImage} onChange={(event) => setKeepImage(event.target.checked)} />Mantener imagen actual si no subo otra.</label> : null}
                </section>
              </div>
              <aside className="px-mediaFormPreview">
                <div className="px-mediaFormPreviewHead"><h4>Preview</h4><span className={slotBadgeClass(campaignForm.slot)}>{slotLabel(campaignForm.slot)}</span></div>
                <div className="px-mediaLiveCard is-inline">
                  {campaignPreviewImage ? <img src={campaignPreviewImage} alt={campaignForm.title || 'Preview campaña'} /> : <div className="px-mediaLiveFallback">Sin imagen</div>}
                  <div className="px-mediaLiveCopy"><strong>{campaignForm.title || 'Nombre de campaña'}</strong><p>{campaignForm.description || 'La pieza seleccionada se va a ver acá con el ratio y jerarquía de su posición.'}</p></div>
                </div>
              </aside>
            </div>
            <div className="px-mediaModalActions"><button className="px-btn px-btn--ghost" type="button" onClick={() => setCampaignOpen(false)}>Cancelar</button><button className="px-btn" type="button" onClick={saveCampaign} disabled={saving}>{saving ? 'Guardando…' : editingCampaignId ? 'Guardar cambios' : 'Crear campaña'}</button></div>
          </div>
        </div>
      ) : null}

      {sponsorOpen ? (
        <div className="px-mediaOverlay" onClick={() => !saving && setSponsorOpen(false)}>
          <div className="px-mediaModal" onClick={(event) => event.stopPropagation()}>
            <div className="px-mediaModalHead">
              <div><h3>{editingSponsorId ? 'Editar sponsor' : 'Nuevo sponsor'}</h3><p>Logo, nivel y posición visual dentro del home.</p></div>
              <button className="px-btn px-btn--ghost" type="button" onClick={() => setSponsorOpen(false)}>Cerrar</button>
            </div>
            <div className="px-mediaModalGrid">
              <div className="px-mediaFormStack">
                <section className="px-mediaFormBlock">
                  <h4>Datos principales</h4>
                  <label><span>Nombre</span><input value={sponsorForm.name} onChange={(event) => setSponsorForm((state) => ({ ...state, name: event.target.value }))} /></label>
                  <label><span>Website</span><input value={sponsorForm.websiteUrl} onChange={(event) => setSponsorForm((state) => ({ ...state, websiteUrl: event.target.value }))} /></label>
                </section>
                <section className="px-mediaFormBlock">
                  <h4>Jerarquía</h4>
                  <div className="px-mediaSplit">
                    <label><span>Nivel</span><select value={sponsorForm.tier} onChange={(event) => setSponsorForm((state) => ({ ...state, tier: event.target.value as Sponsor['tier'] }))}><option value="SPONSOR">Sponsor fijo</option><option value="PARTNER">Destacado</option><option value="LOCAL">Secundario</option></select></label>
                    <label><span>Estado</span><select value={sponsorForm.status} onChange={(event) => setSponsorForm((state) => ({ ...state, status: event.target.value as Sponsor['status'] }))}><option value="ACTIVE">Activo</option><option value="PAUSED">Pausado</option></select></label>
                    <label><span>Orden</span><input value={sponsorForm.sortOrder} onChange={(event) => setSponsorForm((state) => ({ ...state, sortOrder: event.target.value }))} /></label>
                  </div>
                </section>
                <section className="px-mediaFormBlock">
                  <h4>Logo</h4>
                  <label className="px-mediaUpload"><span>Logo cuadrado o horizontal limpio</span><input type="file" accept="image/*" onChange={(event) => setSponsorFile(event.target.files?.[0] || null)} /></label>
                  {editingSponsorId ? <label className="px-mediaCheckbox"><input type="checkbox" checked={keepLogo} onChange={(event) => setKeepLogo(event.target.checked)} />Mantener logo actual si no subo otro.</label> : null}
                </section>
              </div>
              <aside className="px-mediaFormPreview">
                <div className="px-mediaFormPreviewHead"><h4>Preview</h4><span className={tierBadgeClass(sponsorForm.tier)}>{sponsorForm.tier}</span></div>
                <div className="px-mediaSponsorLive">
                  <div className="px-mediaSponsorLogoLarge">{sponsorPreviewImage ? <img src={sponsorPreviewImage} alt={sponsorForm.name || 'Preview sponsor'} /> : <span>{(sponsorForm.name || 'SP').slice(0, 2).toUpperCase()}</span>}</div>
                  <strong>{sponsorForm.name || 'Nombre del sponsor'}</strong>
                  <p>{sponsorForm.websiteUrl || 'El bloque de sponsors del home se va a ver así de limpio y directo.'}</p>
                </div>
              </aside>
            </div>
            <div className="px-mediaModalActions"><button className="px-btn px-btn--ghost" type="button" onClick={() => setSponsorOpen(false)}>Cancelar</button><button className="px-btn" type="button" onClick={saveSponsor} disabled={saving}>{saving ? 'Guardando…' : editingSponsorId ? 'Guardar cambios' : 'Crear sponsor'}</button></div>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .px-mediaActions { display: flex; gap: 8px; }
        .px-mediaBoard { display: grid; gap: 16px; }
        .px-mediaSection { display: grid; gap: 12px; }
        .px-mediaSectionHead { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .px-mediaSectionHead h3 { margin: 0; font-size: 18px; }
        .px-mediaSectionHead p { margin: 2px 0 0; font-size: 13px; color: rgba(23,37,63,.62); }
        .px-mediaList { display: grid; gap: 8px; }
        .px-mediaRow { display: flex; gap: 10px; align-items: center; border: 1px solid rgba(15,23,42,.08); border-radius: 8px; padding: 10px; cursor: pointer; transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease; }
        .px-mediaRow:hover, .px-mediaRow.is-active { transform: translateY(-1px); border-color: rgba(16,185,129,.28); box-shadow: 0 14px 28px rgba(15,23,42,.08); }
        .px-mediaThumb { width: 82px; min-width: 82px; height: 58px; border-radius: 8px; background: rgba(148,163,184,.16); display: grid; place-items: center; overflow: hidden; color: rgba(23,37,63,.62); font-size: 11px; }
        .px-mediaThumb--logo { width: 70px; min-width: 70px; height: 70px; }
        .px-mediaThumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .px-mediaMain { flex: 1; min-width: 0; display: grid; gap: 6px; }
        .px-mediaTop { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
        .px-mediaTop strong { font-size: 14px; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .px-mediaBadges { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .px-mediaMeta { display: flex; flex-wrap: wrap; gap: 8px; font-size: 11px; color: rgba(23,37,63,.62); }
        .px-mediaMeta span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 280px; }
        .px-mediaRowActions { display: flex; flex-direction: column; gap: 6px; }
        .px-mediaRowActions :global(.px-btn) { min-height: 28px; padding: 0 9px; font-size: 11px; }
        .px-slotBadge, .px-entityBadge { display: inline-flex; align-items: center; justify-content: center; min-height: 24px; padding: 0 8px; border-radius: 999px; font-size: 11px; font-weight: 700; }
        .px-slotBadge--hero { background: rgba(236,72,153,.14); color: #be185d; }
        .px-slotBadge--grid { background: rgba(59,130,246,.12); color: #1d4ed8; }
        .px-slotBadge--inline { background: rgba(245,158,11,.16); color: #b45309; }
        .px-slotBadge--sponsor { background: rgba(16,185,129,.16); color: #047857; }
        .px-slotBadge--partner { background: rgba(124,58,237,.16); color: #6d28d9; }
        .px-slotBadge--local { background: rgba(100,116,139,.16); color: #475569; }
        .px-entityBadge--active { background: rgba(16,185,129,.16); color: #047857; }
        .px-entityBadge--paused { background: rgba(148,163,184,.16); color: #475569; }
        .px-mediaSection--preview { gap: 14px; }
        .px-mediaPreviewGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        .px-mediaPreviewCard { border: 1px solid rgba(15,23,42,.08); border-radius: 10px; background: #fff; padding: 12px; display: grid; gap: 10px; min-height: 180px; }
        .px-mediaPreviewCard--hero, .px-mediaPreviewCard--sponsors { grid-column: span 2; }
        .px-mediaPreviewImage { width: 100%; height: 180px; object-fit: cover; display: block; border-radius: 10px; }
        .px-mediaPreviewBody { display: grid; gap: 6px; }
        .px-mediaPreviewBody strong { font-size: 16px; }
        .px-mediaPreviewBody p { margin: 0; color: rgba(23,37,63,.66); font-size: 13px; line-height: 1.45; }
        .px-mediaMiniPreviewList { display: grid; gap: 8px; }
        .px-mediaMiniPreview { display: grid; grid-template-columns: 64px minmax(0,1fr); gap: 8px; align-items: center; }
        .px-mediaMiniPreview div, .px-mediaMiniPreview img { width: 64px; height: 46px; border-radius: 8px; background: rgba(148,163,184,.16); object-fit: cover; display: block; }
        .px-mediaMiniPreview strong { font-size: 13px; line-height: 1.2; }
        .px-mediaInlinePreview { display: grid; gap: 8px; }
        .px-mediaInlineItem { display: flex; justify-content: space-between; gap: 10px; border: 1px solid rgba(15,23,42,.06); border-radius: 8px; padding: 10px; }
        .px-mediaInlineItem strong { font-size: 13px; }
        .px-mediaInlineItem span { font-size: 12px; color: rgba(23,37,63,.62); }
        .px-mediaSponsorPreview { display: flex; gap: 10px; flex-wrap: wrap; }
        .px-mediaSponsorLogo { width: 92px; height: 56px; border: 1px solid rgba(15,23,42,.08); border-radius: 8px; display: grid; place-items: center; background: #fff; overflow: hidden; }
        .px-mediaSponsorLogo img { width: 100%; height: 100%; object-fit: contain; display: block; padding: 8px; }
        .px-mediaAside { display: grid; gap: 12px; }
        .px-mediaAsideHead h3 { margin: 0; }
        .px-mediaRuleList { display: grid; gap: 10px; }
        .px-mediaRuleList div { display: grid; gap: 4px; }
        .px-mediaRuleList span { font-size: 12px; color: rgba(23,37,63,.56); }
        .px-mediaRuleList strong { font-size: 14px; line-height: 1.3; }
        .px-mediaOverlay { position: fixed; inset: 72px 0 0 0; background: rgba(15,23,42,.66); padding: 16px; z-index: 70; overflow-y: auto; }
        .px-mediaModal { width: min(1160px, 100%); margin: 0 auto; background: #f8fafc; border-radius: 10px; padding: 16px; display: grid; gap: 16px; }
        .px-mediaModalHead { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .px-mediaModalHead h3 { margin: 0; font-size: 22px; }
        .px-mediaModalHead p { margin: 3px 0 0; font-size: 13px; color: rgba(23,37,63,.62); }
        .px-mediaModalGrid { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 14px; align-items: start; }
        .px-mediaFormStack, .px-mediaFormPreview { display: grid; gap: 12px; }
        .px-mediaFormBlock { background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 8px; padding: 14px; display: grid; gap: 10px; }
        .px-mediaFormBlock h4, .px-mediaFormPreview h4 { margin: 0; font-size: 14px; }
        .px-mediaFormBlock label { display: grid; gap: 6px; font-size: 13px; color: rgba(23,37,63,.84); }
        .px-mediaFormBlock input, .px-mediaFormBlock select, .px-mediaFormBlock textarea { width: 100%; border: 1px solid rgba(15,23,42,.14); border-radius: 8px; padding: 9px 10px; background: #fff; color: #0f172a; font-size: 13px; }
        .px-mediaSplit { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
        .px-mediaUpload input { padding: 8px; }
        .px-mediaCheckbox { display: flex !important; align-items: center; gap: 8px; }
        .px-mediaCheckbox input { width: auto !important; }
        .px-mediaFormPreview { background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 8px; padding: 14px; }
        .px-mediaFormPreviewHead { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .px-mediaLiveCard { display: grid; gap: 10px; }
        .px-mediaLiveCard img, .px-mediaSponsorLogoLarge img { width: 100%; display: block; object-fit: cover; border-radius: 10px; }
        .px-mediaLiveCard.is-hero img { height: 220px; }
        .px-mediaLiveCard.is-grid img { height: 180px; }
        .px-mediaLiveCard.is-inline img { height: 120px; }
        .px-mediaLiveFallback { height: 180px; border-radius: 10px; display: grid; place-items: center; background: rgba(148,163,184,.16); color: rgba(23,37,63,.62); }
        .px-mediaLiveCopy { display: grid; gap: 6px; }
        .px-mediaLiveCopy strong { font-size: 16px; }
        .px-mediaLiveCopy p, .px-mediaSponsorLive p { margin: 0; font-size: 13px; color: rgba(23,37,63,.66); line-height: 1.45; }
        .px-mediaSponsorLive { display: grid; gap: 10px; place-items: start; }
        .px-mediaSponsorLogoLarge { width: 180px; height: 108px; border-radius: 10px; border: 1px solid rgba(15,23,42,.08); background: #fff; display: grid; place-items: center; overflow: hidden; }
        .px-mediaSponsorLogoLarge span { font-size: 28px; font-weight: 700; color: rgba(23,37,63,.46); }
        .px-mediaModalActions { display: flex; justify-content: flex-end; gap: 8px; }
        @media (max-width: 980px) {
          .px-mediaPreviewGrid { grid-template-columns: 1fr; }
          .px-mediaPreviewCard--hero, .px-mediaPreviewCard--sponsors { grid-column: span 1; }
          .px-mediaModalGrid { grid-template-columns: 1fr; }
          .px-mediaSplit { grid-template-columns: 1fr; }
        }
        @media (max-width: 720px) {
          .px-mediaActions, .px-mediaSectionHead, .px-mediaModalHead, .px-mediaModalActions, .px-mediaTop { flex-direction: column; align-items: stretch; }
          .px-mediaRow { align-items: stretch; }
          .px-mediaThumb, .px-mediaThumb--logo { width: 100%; min-width: 0; height: 180px; }
          .px-mediaRowActions { flex-direction: row; width: 100%; }
          .px-mediaMeta span { max-width: 100%; }
          .px-mediaOverlay { inset: 64px 0 0 0; padding: 0; }
          .px-mediaModal { border-radius: 0; min-height: calc(100vh - 64px); }
        }
      `}</style>
    </PlatformModuleShell>
  )
}
