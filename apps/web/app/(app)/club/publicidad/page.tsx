'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Calendar, ExternalLink, ImageIcon, Megaphone, MoreVertical, Plus, Upload, UsersRound, X } from 'lucide-react'
import { useSession } from '@/components/session/SessionProvider'
import { supabase } from '@/lib/supabaseClient'
import ConfigurableAdBanner from '@/components/ads/ConfigurableAdBanner'
import { defaultPlatformAdRenderConfig } from '@/lib/platformAdConfig'
import styles from './publicidad.module.css'

type Section = 'sponsors' | 'campaigns'
type Sponsor = {
  id: string; name: string; logo_url: string | null; logo_path: string | null; description: string | null
  category: string; website_url: string | null; contact_name: string | null; contact_email: string | null
  contact_phone: string | null; starts_on: string | null; ends_on: string | null; contribution_amount: number | null
  currency_code: string; internal_notes: string | null; visual_priority: number; status: 'active' | 'inactive'
}
type Campaign = {
  id: string; sponsor_id: string | null; internal_name: string | null; title: string; description: string | null
  image_url: string | null; image_path: string | null; target_url: string | null; cta_label: string | null
  internal_notes: string | null; template_key: string; status: 'draft' | 'scheduled' | 'active' | 'paused' | 'ended'
  sort_order: number; starts_at: string | null; ends_at: string | null; render_config: unknown
  sponsor?: Pick<Sponsor, 'id' | 'name' | 'status' | 'ends_on'> | null
  placements?: Array<{ placement_key: string }>
}
type Metric = { impressions: number; clicks: number; firstAt: string | null; lastAt: string | null }

const placements = [
  { key: 'CLUB_HOME_HERO', label: 'Hero de la home', hint: 'Banner horizontal 1200 × 360' },
  { key: 'CLUB_HOME_AFTER_TOURNAMENTS', label: 'Después de torneos', hint: 'Banner horizontal 1200 × 300' },
  { key: 'CLUB_HOME_AFTER_NEWS', label: 'Después de noticias', hint: 'Banner horizontal 1200 × 300' },
]
const categories: Record<string, string> = {
  MAIN: 'Principal', GOLD: 'Oro', SILVER: 'Plata', BRONZE: 'Bronce',
  INSTITUTIONAL: 'Institucional', SUPPLIER: 'Proveedor', OTHER: 'Otro',
}
const campaignLabels: Record<Campaign['status'], string> = {
  draft: 'Borrador', scheduled: 'Programada', active: 'Activa', paused: 'Pausada', ended: 'Finalizada',
}
const blankSponsor = {
  name: '', description: '', category: 'OTHER', websiteUrl: '', contactName: '', contactEmail: '',
  contactPhone: '', startsOn: '', endsOn: '', contributionAmount: '', currencyCode: 'ARS',
  internalNotes: '', visualPriority: '100', status: 'active', logoUrl: '', logoPath: '',
}
const blankCampaign = {
  internalName: '', sponsorId: '', title: '', description: '', imageUrl: '', imagePath: '',
  targetUrl: '', ctaLabel: 'Conocer más', internalNotes: '', templateKey: 'BANNER_HORIZONTAL',
  status: 'draft', sortOrder: '100', startsAt: '', endsAt: '', placements: ['CLUB_HOME_HERO'],
}

function isoFromLocal(value: string) {
  return value ? new Date(value).toISOString() : null
}
function localFromIso(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
function sponsorState(row?: Sponsor | null) {
  if (!row) return blankSponsor
  return {
    name: row.name, description: row.description ?? '', category: row.category, websiteUrl: row.website_url ?? '',
    contactName: row.contact_name ?? '', contactEmail: row.contact_email ?? '', contactPhone: row.contact_phone ?? '',
    startsOn: row.starts_on ?? '', endsOn: row.ends_on ?? '', contributionAmount: row.contribution_amount?.toString() ?? '',
    currencyCode: row.currency_code, internalNotes: row.internal_notes ?? '', visualPriority: String(row.visual_priority),
    status: row.status, logoUrl: row.logo_url ?? '', logoPath: row.logo_path ?? '',
  }
}
function campaignState(row?: Campaign | null) {
  if (!row) return blankCampaign
  return {
    internalName: row.internal_name ?? row.title, sponsorId: row.sponsor_id ?? '', title: row.title,
    description: row.description ?? '', imageUrl: row.image_url ?? '', imagePath: row.image_path ?? '',
    targetUrl: row.target_url ?? '', ctaLabel: row.cta_label ?? '', internalNotes: row.internal_notes ?? '',
    templateKey: row.template_key, status: row.status, sortOrder: String(row.sort_order ?? 100),
    startsAt: localFromIso(row.starts_at), endsAt: localFromIso(row.ends_at),
    placements: row.placements?.map((item) => item.placement_key) ?? [row.placements?.[0]?.placement_key ?? 'CLUB_HOME_HERO'],
  }
}
function effectiveSponsorStatus(sponsor: Sponsor) {
  const today = new Date().toISOString().slice(0, 10)
  if (sponsor.status === 'inactive') return 'Inactivo'
  if (sponsor.ends_on && sponsor.ends_on < today) return 'Vencido'
  if (sponsor.ends_on) {
    const days = Math.ceil((new Date(`${sponsor.ends_on}T00:00:00`).getTime() - Date.now()) / 86400000)
    if (days <= 30) return 'Próximo a vencer'
  }
  return 'Activo'
}

export default function ClubAdvertisingPage() {
  const { activeClub } = useSession()
  const [section, setSection] = useState<Section>('sponsors')
  const [sponsors, setSponsors] = useState<Sponsor[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [metrics, setMetrics] = useState<Record<string, Metric>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [modal, setModal] = useState<'sponsor' | 'campaign' | 'preview' | null>(null)
  const [editingSponsor, setEditingSponsor] = useState<Sponsor | null>(null)
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null)
  const [sponsorForm, setSponsorForm] = useState(blankSponsor)
  const [campaignForm, setCampaignForm] = useState(blankCampaign)
  const clubId = activeClub?.id

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token ?? '', [])
  const load = useCallback(async () => {
    if (!clubId) return
    try {
      const accessToken = await token()
      setLoading(true)
      const headers = { Authorization: `Bearer ${accessToken}` }
      const [sponsorRes, campaignRes, metricRes] = await Promise.all([
        fetch(`/api/clubs/${clubId}/sponsors`, { headers, cache: 'no-store' }),
        fetch(`/api/clubs/${clubId}/campaigns`, { headers, cache: 'no-store' }),
        fetch(`/api/clubs/${clubId}/campaigns/metrics`, { headers, cache: 'no-store' }),
      ])
      const [sponsorJson, campaignJson, metricJson] = await Promise.all([sponsorRes.json(), campaignRes.json(), metricRes.json()])
      if (!sponsorRes.ok) throw new Error(sponsorJson.error)
      if (!campaignRes.ok) throw new Error(campaignJson.error)
      setSponsors(sponsorJson.sponsors ?? [])
      setCampaigns(campaignJson.campaigns ?? [])
      setMetrics(metricJson.metrics ?? {})
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos cargar el módulo.')
    } finally { setLoading(false) }
  }, [clubId, token])
  useEffect(() => {
    const request = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(request)
  }, [load])

  const activeCampaigns = useMemo(() => campaigns.filter((item) => item.status === 'active' || item.status === 'scheduled').length, [campaigns])
  const campaignCount = useMemo(() => {
    const map = new Map<string, number>()
    campaigns.filter((item) => item.status === 'active' || item.status === 'scheduled').forEach((item) => {
      if (item.sponsor_id) map.set(item.sponsor_id, (map.get(item.sponsor_id) ?? 0) + 1)
    })
    return map
  }, [campaigns])

  async function uploadAsset(file: File, kind: 'sponsors' | 'campaigns') {
    if (!activeClub?.id) return null
    const form = new FormData()
    form.set('kind', kind)
    form.set('file', file)
    const res = await fetch(`/api/clubs/${activeClub.id}/commercial-assets`, {
      method: 'POST', headers: { Authorization: `Bearer ${await token()}` }, body: form,
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error)
    return json as { path: string; publicUrl: string }
  }
  function openSponsor(row?: Sponsor) {
    setEditingSponsor(row ?? null); setSponsorForm(sponsorState(row)); setModal('sponsor'); setMessage('')
  }
  function openCampaign(row?: Campaign) {
    setEditingCampaign(row ?? null); setCampaignForm(campaignState(row)); setModal('campaign'); setMessage('')
  }
  async function saveSponsor(event: FormEvent) {
    event.preventDefault(); if (!activeClub?.id) return
    setSaving(true)
    try {
      const url = editingSponsor ? `/api/clubs/${activeClub.id}/sponsors/${editingSponsor.id}` : `/api/clubs/${activeClub.id}/sponsors`
      const res = await fetch(url, {
        method: editingSponsor ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(sponsorForm),
      })
      const json = await res.json(); if (!res.ok) throw new Error(json.error)
      setModal(null); setMessage(editingSponsor ? 'Sponsor actualizado.' : 'Sponsor creado.'); await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No pudimos guardar el sponsor.') }
    finally { setSaving(false) }
  }
  async function saveCampaign(event: FormEvent) {
    event.preventDefault(); if (!activeClub?.id) return
    setSaving(true)
    try {
      const url = editingCampaign ? `/api/clubs/${activeClub.id}/campaigns/${editingCampaign.id}` : `/api/clubs/${activeClub.id}/campaigns`
      const res = await fetch(url, {
        method: editingCampaign ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...campaignForm, startsAt: isoFromLocal(campaignForm.startsAt), endsAt: isoFromLocal(campaignForm.endsAt) }),
      })
      const json = await res.json(); if (!res.ok) throw new Error(json.error)
      setModal(null); setMessage(editingCampaign ? 'Campaña actualizada.' : 'Campaña creada.'); await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No pudimos guardar la campaña.') }
    finally { setSaving(false) }
  }
  async function remove(kind: 'sponsors' | 'campaigns', id: string) {
    if (!activeClub?.id || !window.confirm('Esta acción no se puede deshacer. ¿Continuar?')) return
    const res = await fetch(`/api/clubs/${activeClub.id}/${kind}/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${await token()}` } })
    const json = await res.json(); if (!res.ok) setMessage(json.error); else { setMessage('Elemento eliminado.'); await load() }
  }
  async function quickCampaignStatus(campaign: Campaign, status: Campaign['status']) {
    setCampaignForm(campaignState(campaign))
    const payload = { ...campaignState(campaign), status, startsAt: campaign.starts_at, endsAt: campaign.ends_at }
    const res = await fetch(`/api/clubs/${activeClub!.id}/campaigns/${campaign.id}`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const json = await res.json(); if (!res.ok) setMessage(json.error); else { setMessage(`Campaña ${campaignLabels[status].toLowerCase()}.`); await load() }
  }
  async function quickSponsorStatus(sponsor: Sponsor) {
    if (!activeClub?.id) return
    const payload = { ...sponsorState(sponsor), status: sponsor.status === 'active' ? 'inactive' : 'active' }
    const res = await fetch(`/api/clubs/${activeClub.id}/sponsors/${sponsor.id}`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const json = await res.json(); if (!res.ok) setMessage(json.error); else { setMessage(payload.status === 'active' ? 'Sponsor activado.' : 'Sponsor desactivado.'); await load() }
  }
  async function duplicateCampaign(campaign: Campaign) {
    if (!activeClub?.id) return
    const payload = { ...campaignState(campaign), internalName: `${campaign.internal_name ?? campaign.title} (copia)`, status: 'draft', startsAt: campaign.starts_at, endsAt: campaign.ends_at }
    const res = await fetch(`/api/clubs/${activeClub.id}/campaigns`, {
      method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const json = await res.json(); if (!res.ok) setMessage(json.error); else { setMessage('Campaña duplicada como borrador.'); await load() }
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div><span>CONTENIDO DEL CLUB</span><h1>Sponsors y publicidad</h1><p>Administrá alianzas y piezas visibles en la home pública de {activeClub?.name ?? 'tu club'}.</p></div>
        <div className={styles.heroStats}><b>{sponsors.filter((s) => effectiveSponsorStatus(s) === 'Activo').length}<small>Sponsors activos</small></b><b>{activeCampaigns}<small>Campañas visibles</small></b></div>
      </section>

      <section className={styles.workspace}>
        <div className={styles.toolbar}>
          <div className={styles.segmented} role="tablist" aria-label="Secciones">
            <button role="tab" aria-selected={section === 'sponsors'} onClick={() => setSection('sponsors')}><UsersRound size={16} /> Sponsors</button>
            <button role="tab" aria-selected={section === 'campaigns'} onClick={() => setSection('campaigns')}><Megaphone size={16} /> Campañas</button>
          </div>
          <button className={styles.primary} onClick={() => section === 'sponsors' ? openSponsor() : openCampaign()}><Plus size={17} /> {section === 'sponsors' ? 'Nuevo sponsor' : 'Nueva campaña'}</button>
        </div>
        {message ? <div className={styles.message} role="status">{message}<button onClick={() => setMessage('')} aria-label="Cerrar"><X size={15} /></button></div> : null}
        {loading ? <div className={styles.loading}>Cargando contenido…</div> : section === 'sponsors' ? (
          sponsors.length ? <div className={styles.list}>
            {sponsors.map((sponsor) => {
              const status = effectiveSponsorStatus(sponsor)
              return <article className={styles.sponsorCard} key={sponsor.id}>
                <div className={styles.logo}>{sponsor.logo_url ? <img src={sponsor.logo_url} alt={`Logo de ${sponsor.name}`} /> : <span>{sponsor.name.slice(0, 2).toUpperCase()}</span>}</div>
                <div className={styles.cardMain}><div className={styles.cardTitle}><h2>{sponsor.name}</h2><span data-tone={status}>{status}</span></div>
                  <p>{categories[sponsor.category] ?? 'Otro'}{sponsor.ends_on ? ` · hasta ${new Date(`${sponsor.ends_on}T00:00:00`).toLocaleDateString('es-AR')}` : ' · sin vencimiento'}</p>
                  <small>{campaignCount.get(sponsor.id) ?? 0} campañas activas</small>
                </div>
                <details className={styles.menu}><summary aria-label={`Acciones de ${sponsor.name}`}><MoreVertical size={18} /></summary><div>
                  <button onClick={() => openSponsor(sponsor)}>Editar</button>
                  <button onClick={() => { setSection('campaigns'); openCampaign(); setCampaignForm((old) => ({ ...old, sponsorId: sponsor.id })) }}>Crear campaña</button>
                  <button onClick={() => quickSponsorStatus(sponsor)}>{sponsor.status === 'active' ? 'Desactivar' : 'Activar'}</button>
                  <button onClick={() => remove('sponsors', sponsor.id)}>Eliminar</button>
                </div></details>
              </article>
            })}
          </div> : <Empty title="Aún no agregaste sponsors." action="Crear primer sponsor" onAction={() => openSponsor()} />
        ) : campaigns.length ? <div className={styles.list}>
          {campaigns.map((campaign) => {
            const metric = metrics[campaign.id] ?? { impressions: 0, clicks: 0 }
            const ctr = metric.impressions ? ((metric.clicks / metric.impressions) * 100).toFixed(1) : '0,0'
            return <article className={styles.campaignCard} key={campaign.id}>
              <div className={styles.campaignThumb}>{campaign.image_url ? <img src={campaign.image_url} alt="" /> : <ImageIcon size={22} />}</div>
              <div className={styles.cardMain}><div className={styles.cardTitle}><h2>{campaign.internal_name ?? campaign.title}</h2><span data-tone={campaign.status}>{campaignLabels[campaign.status]}</span></div>
                <p>{campaign.sponsor?.name ?? 'Institucional'} · {campaign.placements?.length ?? 1} ubicaciones</p>
                <div className={styles.metrics}><span><b>{metric.impressions}</b> impresiones</span><span><b>{metric.clicks}</b> clics</span><span><b>{ctr}%</b> CTR</span></div>
              </div>
              <details className={styles.menu}><summary aria-label={`Acciones de ${campaign.title}`}><MoreVertical size={18} /></summary><div>
                <button onClick={() => openCampaign(campaign)}>Editar</button><button onClick={() => { setEditingCampaign(campaign); setCampaignForm(campaignState(campaign)); setModal('preview') }}>Preview</button>
                <button onClick={() => duplicateCampaign(campaign)}>Duplicar</button>
                {campaign.status !== 'active' ? <button onClick={() => quickCampaignStatus(campaign, 'active')}>Publicar</button> : <button onClick={() => quickCampaignStatus(campaign, 'paused')}>Pausar</button>}
                <button onClick={() => quickCampaignStatus(campaign, 'ended')}>Finalizar</button><button onClick={() => remove('campaigns', campaign.id)}>Eliminar</button>
              </div></details>
            </article>
          })}
        </div> : <Empty title="Aún no creaste campañas publicitarias." action="Crear primera campaña" onAction={() => openCampaign()} />}
      </section>

      {modal === 'sponsor' ? <Modal title={editingSponsor ? 'Editar sponsor' : 'Nuevo sponsor'} onClose={() => setModal(null)}>
        <form onSubmit={saveSponsor} className={styles.form}>
          <FormGroup title="Identidad"><label>Nombre<input required maxLength={180} value={sponsorForm.name} onChange={(e) => setSponsorForm({ ...sponsorForm, name: e.target.value })} /></label>
            <label>Categoría<select value={sponsorForm.category} onChange={(e) => setSponsorForm({ ...sponsorForm, category: e.target.value })}>{Object.entries(categories).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
            <label className={styles.full}>Descripción<textarea maxLength={500} value={sponsorForm.description} onChange={(e) => setSponsorForm({ ...sponsorForm, description: e.target.value })} /></label>
            <AssetField label="Logo" value={sponsorForm.logoUrl} onUpload={async (file) => { const asset = await uploadAsset(file, 'sponsors'); if (asset) setSponsorForm({ ...sponsorForm, logoUrl: asset.publicUrl, logoPath: asset.path }) }} />
          </FormGroup>
          <FormGroup title="Vigencia"><label>Desde<input type="date" value={sponsorForm.startsOn} onChange={(e) => setSponsorForm({ ...sponsorForm, startsOn: e.target.value })} /></label><label>Hasta<input type="date" value={sponsorForm.endsOn} onChange={(e) => setSponsorForm({ ...sponsorForm, endsOn: e.target.value })} /></label><label>Estado<select value={sponsorForm.status} onChange={(e) => setSponsorForm({ ...sponsorForm, status: e.target.value })}><option value="active">Activo</option><option value="inactive">Inactivo</option></select></label></FormGroup>
          <details className={styles.more}><summary>Más detalles</summary><div>
            <label>Aporte<input type="number" min="0" step="0.01" value={sponsorForm.contributionAmount} onChange={(e) => setSponsorForm({ ...sponsorForm, contributionAmount: e.target.value })} /></label><label>Moneda<input maxLength={3} value={sponsorForm.currencyCode} onChange={(e) => setSponsorForm({ ...sponsorForm, currencyCode: e.target.value.toUpperCase() })} /></label>
            <label>Prioridad visual<input type="number" min="0" max="9999" value={sponsorForm.visualPriority} onChange={(e) => setSponsorForm({ ...sponsorForm, visualPriority: e.target.value })} /></label>
            <label className={styles.full}>Sitio web<input type="url" value={sponsorForm.websiteUrl} onChange={(e) => setSponsorForm({ ...sponsorForm, websiteUrl: e.target.value })} /></label>
            <label>Contacto<input value={sponsorForm.contactName} onChange={(e) => setSponsorForm({ ...sponsorForm, contactName: e.target.value })} /></label><label>Email<input type="email" value={sponsorForm.contactEmail} onChange={(e) => setSponsorForm({ ...sponsorForm, contactEmail: e.target.value })} /></label><label>Teléfono<input value={sponsorForm.contactPhone} onChange={(e) => setSponsorForm({ ...sponsorForm, contactPhone: e.target.value })} /></label>
            <label className={styles.full}>Observaciones internas<textarea value={sponsorForm.internalNotes} onChange={(e) => setSponsorForm({ ...sponsorForm, internalNotes: e.target.value })} /></label>
          </div></details>
          <footer><button type="button" onClick={() => setModal(null)}>Cancelar</button><button className={styles.primary} disabled={saving}>{saving ? 'Guardando…' : 'Guardar sponsor'}</button></footer>
        </form>
      </Modal> : null}

      {modal === 'campaign' ? <Modal title={editingCampaign ? 'Editar campaña' : 'Nueva campaña'} onClose={() => setModal(null)} wide>
        <form onSubmit={saveCampaign} className={styles.editor}>
          <div className={styles.form}>
            <FormGroup title="Contenido"><label>Nombre interno<input required value={campaignForm.internalName} onChange={(e) => setCampaignForm({ ...campaignForm, internalName: e.target.value })} /></label><label>Sponsor<select value={campaignForm.sponsorId} onChange={(e) => setCampaignForm({ ...campaignForm, sponsorId: e.target.value })}><option value="">Institucional del club</option>{sponsors.filter((s) => effectiveSponsorStatus(s) === 'Activo').map((s) => <option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
              <label className={styles.full}>Título visible<input required maxLength={180} value={campaignForm.title} onChange={(e) => setCampaignForm({ ...campaignForm, title: e.target.value })} /></label><label className={styles.full}>Texto secundario<textarea maxLength={500} value={campaignForm.description} onChange={(e) => setCampaignForm({ ...campaignForm, description: e.target.value })} /></label>
              <AssetField label="Imagen" value={campaignForm.imageUrl} onUpload={async (file) => { const asset = await uploadAsset(file, 'campaigns'); if (asset) setCampaignForm({ ...campaignForm, imageUrl: asset.publicUrl, imagePath: asset.path }) }} />
            </FormGroup>
            <FormGroup title="Botón"><label>Texto<input maxLength={60} value={campaignForm.ctaLabel} onChange={(e) => setCampaignForm({ ...campaignForm, ctaLabel: e.target.value })} /></label><label className={styles.full}>Enlace<input type="url" value={campaignForm.targetUrl} onChange={(e) => setCampaignForm({ ...campaignForm, targetUrl: e.target.value })} /></label></FormGroup>
            <FormGroup title="Ubicación"><div className={styles.placementList}>{placements.map((placement) => <label key={placement.key}><input type="checkbox" checked={campaignForm.placements.includes(placement.key)} onChange={(e) => setCampaignForm({ ...campaignForm, placements: e.target.checked ? [...campaignForm.placements, placement.key] : campaignForm.placements.filter((key) => key !== placement.key) })} /><span><b>{placement.label}</b><small>{placement.hint}</small></span></label>)}</div></FormGroup>
            <FormGroup title="Vigencia y publicación"><label>Inicio<input type="datetime-local" value={campaignForm.startsAt} onChange={(e) => setCampaignForm({ ...campaignForm, startsAt: e.target.value })} /></label><label>Final<input type="datetime-local" value={campaignForm.endsAt} onChange={(e) => setCampaignForm({ ...campaignForm, endsAt: e.target.value })} /></label><label>Estado<select value={campaignForm.status} onChange={(e) => setCampaignForm({ ...campaignForm, status: e.target.value as Campaign['status'] })}>{Object.entries(campaignLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Prioridad<input type="number" min="0" max="9999" value={campaignForm.sortOrder} onChange={(e) => setCampaignForm({ ...campaignForm, sortOrder: e.target.value })} /></label></FormGroup>
            <details className={styles.more}><summary>Opciones avanzadas</summary><div><label className={styles.full}>Observaciones internas<textarea maxLength={2000} value={campaignForm.internalNotes} onChange={(e) => setCampaignForm({ ...campaignForm, internalNotes: e.target.value })} /></label></div></details>
            <footer><button type="button" onClick={() => setModal(null)}>Cancelar</button><button className={styles.primary} disabled={saving || !campaignForm.placements.length}>{saving ? 'Guardando…' : campaignForm.status === 'draft' ? 'Guardar borrador' : 'Guardar campaña'}</button></footer>
          </div>
          <CampaignPreview form={campaignForm} />
        </form>
      </Modal> : null}
      {modal === 'preview' ? <Modal title="Preview de campaña" onClose={() => setModal(null)}><CampaignPreview form={campaignForm} /></Modal> : null}
    </main>
  )
}

function Empty({ title, action, onAction }: { title: string; action: string; onAction: () => void }) {
  return <div className={styles.empty}><Megaphone size={24} /><p>{title}</p><button onClick={onAction}>{action}</button></div>
}
function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return <div className={styles.backdrop} role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}><section className={`${styles.modal} ${wide ? styles.wide : ''}`} role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button onClick={onClose} aria-label="Cerrar"><X size={20} /></button></header>{children}</section></div>
}
function FormGroup({ title, children }: { title: string; children: ReactNode }) {
  return <fieldset className={styles.group}><legend>{title}</legend><div>{children}</div></fieldset>
}
function AssetField({ label, value, onUpload }: { label: string; value: string; onUpload: (file: File) => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  return <label className={styles.full}>{label}<span className={styles.asset}>{value ? <img src={value} alt="" /> : <ImageIcon size={24} />}<span><Upload size={15} />{busy ? 'Subiendo…' : 'Seleccionar imagen'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; setBusy(true); try { await onUpload(file) } finally { setBusy(false) } }} /></span></span></label>
}
function CampaignPreview({ form }: { form: typeof blankCampaign }) {
  return <aside className={styles.preview}><div><span>PREVIEW</span><small><Calendar size={13} /> Vista responsive</small></div><ConfigurableAdBanner title={form.title || 'Título de campaña'} description={form.description} imageUrl={form.imageUrl} href={form.targetUrl} config={{ ...defaultPlatformAdRenderConfig, enabled: true, subtitle: form.description, buttonEnabled: Boolean(form.ctaLabel), buttonText: form.ctaLabel, buttonUrl: form.targetUrl }} /><p><ExternalLink size={14} /> Solo se publicará en las ubicaciones seleccionadas.</p></aside>
}
