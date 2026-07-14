'use client'

import { useEffect, useMemo, useState } from 'react'
import ConfigurableAdBanner from '@/components/ads/ConfigurableAdBanner'
import AdVisualEditor from '@/components/ads/AdVisualEditor'
import AuthAlert from '@/components/AuthAlert'
import PlatformModuleShell from '@/components/platform/PlatformModuleShell'
import {
  defaultPlatformAdRenderConfig,
  normalizePlatformAdRenderConfig,
  type PlatformAdRenderConfig,
} from '@/lib/platformAdConfig'
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
  render_config?: unknown
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

type CampaignForm = {
  title: string
  description: string
  linkUrl: string
  slot: Campaign['slot']
  status: Campaign['status']
  sortOrder: string
  renderConfig: PlatformAdRenderConfig
}

const newBannerConfig: PlatformAdRenderConfig = {
  ...defaultPlatformAdRenderConfig,
  enabled: true,
  themeMode: 'AUTO',
  subtitle: 'Campaña destacada',
  secondaryText: '',
  buttonEnabled: true,
}

const emptyCampaign: CampaignForm = { title: '', description: '', linkUrl: '', slot: 'HOME_AFTER_RANKING', status: 'ACTIVE', sortOrder: '100', renderConfig: newBannerConfig }
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function hexToRgb(value: string) {
  const normalized = value.replace('#', '').trim()
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  }
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((part) => clamp(Math.round(part), 0, 255).toString(16).padStart(2, '0')).join('')}`
}

function mixHex(value: string, target: string, amount: number) {
  const from = hexToRgb(value)
  const to = hexToRgb(target)
  if (!from || !to) return value
  return rgbToHex(
    from.r + (to.r - from.r) * amount,
    from.g + (to.g - from.g) * amount,
    from.b + (to.b - from.b) * amount,
  )
}

function extractImageAccent(src: string) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      const canvas = document.createElement('canvas')
      const width = 24
      const height = Math.max(1, Math.round((image.naturalHeight / Math.max(1, image.naturalWidth)) * width))
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) {
        reject(new Error('Canvas no disponible'))
        return
      }
      context.drawImage(image, 0, 0, width, height)
      const pixels = context.getImageData(0, 0, width, height).data
      let r = 0
      let g = 0
      let b = 0
      let count = 0
      for (let index = 0; index < pixels.length; index += 16) {
        const alpha = pixels[index + 3]
        if (alpha < 80) continue
        const pr = pixels[index]
        const pg = pixels[index + 1]
        const pb = pixels[index + 2]
        const brightness = (pr + pg + pb) / 3
        if (brightness < 24 || brightness > 238) continue
        r += pr
        g += pg
        b += pb
        count += 1
      }
      if (!count) {
        reject(new Error('No se pudo detectar color'))
        return
      }
      resolve(rgbToHex(r / count, g / count, b / count))
    }
    image.onerror = reject
    image.src = src
  })
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
  const [campaignModalAlert, setCampaignModalAlert] = useState<AlertState>(null)
  const [sponsorModalAlert, setSponsorModalAlert] = useState<AlertState>(null)

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

  useEffect(() => {
    const image = campaignPreviewUrl
    if (!image || campaignForm.renderConfig.themeMode !== 'AUTO') return
    let active = true
    extractImageAccent(image)
      .then((accent) => {
        if (!active) return
        setCampaignForm((state) => ({
          ...state,
          renderConfig: {
            ...state.renderConfig,
            backgroundMode: 'gradient',
            backgroundColor: mixHex(accent, '#061b3a', 0.56),
            gradientFrom: mixHex(accent, '#061b3a', 0.64),
            gradientTo: mixHex(accent, '#020617', 0.82),
            buttonBackgroundColor: '#ffffff',
            buttonTextColor: mixHex(accent, '#061b3a', 0.72),
          },
        }))
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [campaignPreviewUrl, campaignForm.renderConfig.themeMode])

  const selectedCampaign = useMemo(() => campaigns.find((row) => row.id === selectedCampaignId) ?? null, [campaigns, selectedCampaignId])
  const selectedSponsor = useMemo(() => sponsors.find((row) => row.id === selectedSponsorId) ?? null, [sponsors, selectedSponsorId])
  const editingCampaign = useMemo(() => campaigns.find((row) => row.id === editingCampaignId) ?? null, [campaigns, editingCampaignId])
  const editingSponsor = useMemo(() => sponsors.find((row) => row.id === editingSponsorId) ?? null, [sponsors, editingSponsorId])

  function updateCampaignConfig(patch: Partial<PlatformAdRenderConfig>) {
    setCampaignForm((state) => ({
      ...state,
      renderConfig: normalizePlatformAdRenderConfig({ ...state.renderConfig, ...patch }),
    }))
  }

  function openNewCampaign() {
    setAlert(null)
    setCampaignModalAlert(null)
    setEditingCampaignId(null)
    setCampaignForm({ ...emptyCampaign, renderConfig: { ...newBannerConfig } })
    setCampaignFile(null)
    setKeepImage(true)
    setCampaignOpen(true)
  }

  function openEditCampaign(row: Campaign) {
    setAlert(null)
    setCampaignModalAlert(null)
    setSelectedCampaignId(row.id)
    setEditingCampaignId(row.id)
    setCampaignForm({
      title: row.title,
      description: row.description || '',
      linkUrl: row.link_url || '',
      slot: editableSlot(row.slot),
      status: row.status,
      sortOrder: String(row.sort_order ?? 100),
      renderConfig: normalizePlatformAdRenderConfig(row.render_config),
    })
    setCampaignFile(null)
    setKeepImage(Boolean(row.image_url))
    setCampaignOpen(true)
  }

  function openNewSponsor() {
    setAlert(null)
    setSponsorModalAlert(null)
    setEditingSponsorId(null)
    setSponsorForm(emptySponsor)
    setSponsorFile(null)
    setKeepLogo(true)
    setSponsorOpen(true)
  }

  function openEditSponsor(row: Sponsor) {
    setAlert(null)
    setSponsorModalAlert(null)
    setSelectedSponsorId(row.id)
    setEditingSponsorId(row.id)
    setSponsorForm({ name: row.name, websiteUrl: row.website_url || '', tier: row.tier, status: row.status, sortOrder: String(row.sort_order ?? 100) })
    setSponsorFile(null)
    setKeepLogo(Boolean(row.logo_url))
    setSponsorOpen(true)
  }

  async function saveCampaign() {
    const token = await getToken()
    if (!token) return
    setCampaignModalAlert(null)
    setSaving(true)
    const fd = new FormData()
    fd.set('title', campaignForm.title)
    fd.set('description', campaignForm.description)
    fd.set('linkUrl', campaignForm.linkUrl)
    fd.set('slot', campaignForm.slot)
    fd.set('status', campaignForm.status)
    fd.set('sortOrder', campaignForm.sortOrder)
    fd.set('keepImage', keepImage ? '1' : '0')
    fd.set('renderConfig', JSON.stringify(campaignForm.renderConfig))
    if (campaignFile) fd.set('image', campaignFile)
    const res = await fetch(editingCampaignId ? `/api/platform/ads/${editingCampaignId}` : '/api/platform/ads', { method: editingCampaignId ? 'PATCH' : 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      if (json?.setupRequired) setCampaignModalAlert({ variant: 'warning', title: 'Contenido no inicializado', message: json?.detail || json?.error || 'Falta migración de contenido.' })
      else setCampaignModalAlert({ variant: 'error', title: 'No pude guardar la campaña', message: json?.error || 'Error inesperado.' })
      return
    }
    setCampaignOpen(false)
    setAlert({ variant: 'success', title: editingCampaignId ? 'Campaña actualizada' : 'Campaña creada' })
    await load()
  }

  async function saveSponsor() {
    const token = await getToken()
    if (!token) return
    setSponsorModalAlert(null)
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
      if (json?.setupRequired) setSponsorModalAlert({ variant: 'warning', title: 'Contenido no inicializado', message: json?.detail || json?.error || 'Falta migración de contenido.' })
      else setSponsorModalAlert({ variant: 'error', title: 'No pude guardar el sponsor', message: json?.error || 'Error inesperado.' })
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

  const campaignPreviewImage = campaignPreviewUrl || (editingCampaignId && keepImage ? editingCampaign?.image_url || null : null)
  const sponsorPreviewImage = sponsorPreviewUrl || (editingSponsorId && keepLogo ? editingSponsor?.logo_url || null : null)
  const rankingPreviewCampaign = selectedCampaign && isAfterRankingSlot(selectedCampaign.slot)
    ? selectedCampaign
    : campaigns.find((item) => isAfterRankingSlot(item.slot) && item.status === 'ACTIVE') ?? campaigns.find((item) => isAfterRankingSlot(item.slot)) ?? null
  const newsPreviewCampaign = selectedCampaign && isAfterNewsHeroSlot(selectedCampaign.slot)
    ? selectedCampaign
    : campaigns.find((item) => isAfterNewsHeroSlot(item.slot) && item.status === 'ACTIVE') ?? campaigns.find((item) => isAfterNewsHeroSlot(item.slot)) ?? null

  function renderRealCampaignPreview(row: Campaign | null, label: string) {
    if (!row) {
      return <div className="px-realPreviewEmpty">Sin campañas en esta posición.</div>
    }
    const config = normalizePlatformAdRenderConfig(row.render_config)
    return (
      <article className="px-realPreviewItem">
        <span className={slotBadgeClass(row.slot)}>{label}</span>
        {config.enabled ? (
          <ConfigurableAdBanner
            className="px-realPreviewBanner"
            config={config}
            description={row.description}
            imageUrl={row.image_url}
            title={row.title}
            viewport="desktop"
          />
        ) : (
          <div className="px-realPreviewLegacy">
            {row.image_url ? <img src={row.image_url} alt={row.title} /> : <span>Sin imagen</span>}
            <strong>{row.title}</strong>
          </div>
        )}
      </article>
    )
  }

  return (
    <PlatformModuleShell
      title="Publicidad y sponsors"
      subtitle="Organizá campañas, posiciones y logos con una lectura clara de qué sale y dónde."
      metrics={metrics}
      actions={<div className="px-mediaActions"><button className="px-btn px-btn--ghost" type="button" onClick={load}>Actualizar</button><button className="px-btn" type="button" onClick={openNewCampaign}>Nueva campaña</button></div>}
      aside={(
        <div className="px-platformCard px-mediaAside px-realPreviewAside">
          <div className="px-mediaAsideHead"><h3>Preview real</h3><p>Cómo se ven las piezas dentro del sitio.</p></div>
          <div className="px-realPreviewList">
            {renderRealCampaignPreview(rankingPreviewCampaign, 'Después de rankings')}
            {renderRealCampaignPreview(newsPreviewCampaign, 'Después de noticia destacada')}
          </div>
        </div>
      )}
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

      </div>

      {campaignOpen ? (
        <div className="px-mediaOverlay">
          <div className="px-mediaModal" onClick={(event) => event.stopPropagation()}>
            <div className="px-mediaModalHead">
              <div><h3>{editingCampaignId ? 'Editar campaña' : 'Nueva campaña'}</h3><p>Definí pieza, ubicación y prioridad visual.</p></div>
              <button className="px-btn px-btn--ghost" type="button" onClick={() => setCampaignOpen(false)}>Cerrar</button>
            </div>
            {campaignModalAlert ? <AuthAlert variant={campaignModalAlert.variant} title={campaignModalAlert.title} message={campaignModalAlert.message} /> : null}
            <AdVisualEditor
              key={editingCampaignId || 'new-campaign'}
              title={campaignForm.title}
              description={campaignForm.description}
              linkUrl={campaignForm.linkUrl}
              imageUrl={campaignPreviewImage}
              renderConfig={campaignForm.renderConfig}
              slotLabel={slotLabel(campaignForm.slot)}
              onTitleChange={(title) => setCampaignForm((state) => ({ ...state, title }))}
              onDescriptionChange={(description) => setCampaignForm((state) => ({ ...state, description }))}
              onRenderConfigChange={(renderConfig) => setCampaignForm((state) => ({ ...state, renderConfig: normalizePlatformAdRenderConfig(renderConfig) }))}
              onCancel={() => setCampaignOpen(false)}
              onSave={saveCampaign}
              saving={saving}
              saveLabel={editingCampaignId ? 'Guardar cambios' : 'Crear campaña'}
              generalFields={(
                <>
                  <div className="adGeneralRow is-two">
                    <label><span>Nombre</span><input value={campaignForm.title} onChange={(event) => setCampaignForm((state) => ({ ...state, title: event.target.value }))} /></label>
                    <label><span>Link</span><input value={campaignForm.linkUrl} onChange={(event) => setCampaignForm((state) => ({ ...state, linkUrl: event.target.value }))} /></label>
                  </div>
                  <div className="adGeneralRow is-three">
                    <label><span>Posición</span><select value={campaignForm.slot} onChange={(event) => setCampaignForm((state) => ({ ...state, slot: event.target.value as Campaign['slot'] }))}><option value="HOME_AFTER_RANKING">Después de rankings</option><option value="HOME_AFTER_NEWS_HERO">Después de noticia destacada</option></select></label>
                    <label><span>Visibilidad</span><select value={campaignForm.status} onChange={(event) => setCampaignForm((state) => ({ ...state, status: event.target.value as Campaign['status'] }))}><option value="ACTIVE">Activa</option><option value="PAUSED">Oculta</option></select></label>
                    <label><span>Orden</span><input value={campaignForm.sortOrder} onChange={(event) => setCampaignForm((state) => ({ ...state, sortOrder: event.target.value }))} /></label>
                  </div>
                  <div className="adGeneralRow is-three">
                    {campaignForm.renderConfig.enabled ? <label><span>Tema</span><select value={campaignForm.renderConfig.themeMode} onChange={(event) => updateCampaignConfig({ themeMode: event.target.value as PlatformAdRenderConfig['themeMode'] })}><option value="AUTO">Automático</option><option value="MANUAL">Manual</option></select></label> : null}
                    <label><span>Modo</span><select value={campaignForm.renderConfig.enabled ? 'configured' : 'legacy'} onChange={(event) => updateCampaignConfig({ enabled: event.target.value === 'configured' })}><option value="configured">Banner SELPA</option><option value="legacy">Imagen legacy</option></select></label>
                    {campaignForm.renderConfig.enabled ? <label><span>Layout</span><select value={campaignForm.renderConfig.layout} onChange={(event) => updateCampaignConfig({ layout: event.target.value as PlatformAdRenderConfig['layout'] })}><option value="image-right">Imagen derecha</option><option value="image-left">Imagen izquierda</option><option value="image-only">Solo imagen</option><option value="text-only">Solo texto</option></select></label> : null}
                  </div>
                  <div className="adGeneralRow is-full">
                    <label><span>Imagen base</span><input type="file" accept="image/*" onChange={(event) => { setCampaignModalAlert(null); setCampaignFile(event.target.files?.[0] || null); if (event.target.files?.[0]) setKeepImage(false) }} /></label>
                  </div>
                  {editingCampaignId ? <label className="px-mediaCheckbox"><input type="checkbox" checked={keepImage} onChange={(event) => setKeepImage(event.target.checked)} />Mantener imagen actual si no subo otra.</label> : null}
                </>
              )}
              imageField={<label><span>Recurso</span><input type="file" accept="image/*" onChange={(event) => { setCampaignModalAlert(null); setCampaignFile(event.target.files?.[0] || null); if (event.target.files?.[0]) setKeepImage(false) }} /></label>}
            />
          </div>
        </div>
      ) : null}

      {sponsorOpen ? (
        <div className="px-mediaOverlay">
          <div className="px-mediaModal" onClick={(event) => event.stopPropagation()}>
            <div className="px-mediaModalHead">
              <div><h3>{editingSponsorId ? 'Editar sponsor' : 'Nuevo sponsor'}</h3><p>Logo, nivel y posición visual dentro del home.</p></div>
              <button className="px-btn px-btn--ghost" type="button" onClick={() => setSponsorOpen(false)}>Cerrar</button>
            </div>
            {sponsorModalAlert ? <AuthAlert variant={sponsorModalAlert.variant} title={sponsorModalAlert.title} message={sponsorModalAlert.message} /> : null}
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
                  <label className="px-mediaUpload"><span>Logo cuadrado o horizontal limpio</span><input type="file" accept="image/*" onChange={(event) => { setSponsorModalAlert(null); setSponsorFile(event.target.files?.[0] || null); if (event.target.files?.[0]) setKeepLogo(false) }} /></label>
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
        .px-mediaAsideHead p { margin: 3px 0 0; color: rgba(23,37,63,.62); font-size: 12px; line-height: 1.35; }
        .px-realPreviewAside { align-content: start; }
        .px-realPreviewList { display: grid; gap: 12px; }
        .px-realPreviewItem { background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 10px; display: grid; gap: 8px; padding: 10px; }
        .px-realPreviewItem > span { justify-self: start; }
        .px-realPreviewBanner { --selpa-ad-height: 112px; border-radius: 8px; box-shadow: 0 12px 24px rgba(15,23,42,.08); width: 100%; }
        .px-realPreviewLegacy { border-radius: 8px; display: grid; gap: 8px; overflow: hidden; }
        .px-realPreviewLegacy img, .px-realPreviewLegacy > span { background: rgba(148,163,184,.16); border-radius: 8px; color: rgba(23,37,63,.62); display: grid; height: 112px; object-fit: cover; place-items: center; width: 100%; }
        .px-realPreviewLegacy strong { color: #061b3a; font-size: 13px; line-height: 1.2; }
        .px-realPreviewEmpty { background: rgba(148,163,184,.12); border: 1px dashed rgba(15,23,42,.14); border-radius: 10px; color: rgba(23,37,63,.58); font-size: 12px; font-weight: 700; padding: 14px; text-align: center; }
        .px-mediaRuleList { display: grid; gap: 10px; }
        .px-mediaRuleList div { display: grid; gap: 4px; }
        .px-mediaRuleList span { font-size: 12px; color: rgba(23,37,63,.56); }
        .px-mediaRuleList strong { font-size: 14px; line-height: 1.3; }
        .px-mediaOverlay { position: fixed; inset: 72px 0 0 0; background: rgba(15,23,42,.66); padding: 16px; z-index: 70; overflow-y: auto; }
        .px-mediaModal { width: min(1160px, 100%); margin: 0 auto; background: #f8fafc; border-radius: 10px; padding: 14px; display: grid; gap: 12px; overflow: visible; }
        .px-mediaModalHead { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .px-mediaModalHead h3 { margin: 0; font-size: 22px; }
        .px-mediaModalHead p { margin: 3px 0 0; font-size: 13px; color: rgba(23,37,63,.62); }
        .px-mediaModalGrid { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 14px; align-items: start; overflow: visible; }
        .px-mediaModalGrid--designer { grid-template-columns: minmax(0, 1fr) 420px; }
        .px-mediaFormStack, .px-mediaFormPreview { display: grid; gap: 12px; }
        .px-mediaFormBlock { background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 8px; padding: 10px; display: grid; gap: 8px; }
        .px-mediaFormBlock h4, .px-mediaFormPreview h4 { margin: 0; font-size: 14px; }
        .px-mediaFormBlock label { display: grid; gap: 4px; font-size: 12px; color: rgba(23,37,63,.84); font-weight: 700; }
        .px-mediaFormBlock label span { color: rgba(23,37,63,.62); font-size: 11px; font-weight: 800; }
        .px-mediaFormBlock input, .px-mediaFormBlock select, .px-mediaFormBlock textarea { width: 100%; border: 1px solid rgba(15,23,42,.14); border-radius: 7px; padding: 7px 9px; background: #fff; color: #0f172a; font-size: 12px; min-height: 34px; }
        .px-mediaFormBlock textarea { min-height: 58px; resize: vertical; }
        .px-mediaSplit { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
        .px-colorGrid { display: grid; gap: 8px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .px-colorControl { align-items: center; display: grid !important; grid-template-columns: minmax(0, 1fr) 36px; gap: 8px !important; }
        .px-colorControl input[type="color"] { height: 32px; min-height: 32px; padding: 3px; }
        .px-rangeControl { align-items: center; display: grid !important; grid-template-columns: 154px minmax(0, 1fr); gap: 10px !important; }
        .px-rangeControl span { align-items: center; display: flex; justify-content: space-between; gap: 8px; }
        .px-rangeControl b { color: #0f172a; font-size: 11px; font-weight: 900; }
        .px-rangeControl input[type="range"] { min-height: 28px; padding: 0; }
        .px-mediaUpload input { padding: 8px; }
        .px-mediaCheckbox { display: flex !important; align-items: center; gap: 8px; }
        .px-mediaCheckbox input { width: auto !important; }
        .px-mediaFormPreview { background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 8px; padding: 12px; }
        .px-mediaFormPreviewHead { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .px-mediaFormPreviewHead > div:first-child { display: grid; gap: 6px; }
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
        .px-mediaModalActions { background: linear-gradient(180deg, rgba(248,250,252,.74), #f8fafc 36%); bottom: 0; display: flex; justify-content: flex-end; gap: 8px; margin: 0 -2px -2px; padding: 10px 2px 2px; position: sticky; z-index: 4; }
        @media (max-width: 980px) {
          .px-mediaPreviewGrid { grid-template-columns: 1fr; }
          .px-mediaPreviewCard--hero, .px-mediaPreviewCard--sponsors { grid-column: span 1; }
          .px-mediaModalGrid { grid-template-columns: 1fr; }
          .px-mediaSplit { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 720px) {
          .px-mediaActions, .px-mediaSectionHead, .px-mediaModalHead, .px-mediaModalActions, .px-mediaTop { flex-direction: column; align-items: stretch; }
          .px-mediaRow { align-items: stretch; }
          .px-mediaThumb, .px-mediaThumb--logo { width: 100%; min-width: 0; height: 180px; }
          .px-mediaRowActions { flex-direction: row; width: 100%; }
          .px-mediaMeta span { max-width: 100%; }
          .px-mediaOverlay { inset: 64px 0 0 0; padding: 0; }
          .px-mediaModal { border-radius: 0; min-height: calc(100vh - 64px); }
          .px-mediaSplit, .px-colorGrid { grid-template-columns: 1fr; }
          .px-rangeControl { grid-template-columns: 1fr; gap: 4px !important; }
          .px-colorControl { grid-template-columns: minmax(0, 1fr) 44px; }
        }
      `}</style>
    </PlatformModuleShell>
  )
}
