'use client'

import { useSession } from '@/components/session/SessionProvider'
import { getClubTheme } from '@/lib/clubThemes'
import { supabase } from '@/lib/supabaseClient'
import { type CSSProperties, type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'

type CommercialSlotStatus = 'Disponible' | 'Reservado' | 'Activo'

type CommercialSlot = {
  id: string
  name: string
  detailName: string
  status: CommercialSlotStatus
  visibility: string
  visibilityScore: number
  location: string
  format: string
  recommendedSize: string
  description: string
  previewClass: string
}

type ClubSponsor = {
  id: string
  name: string
  logo_url: string | null
  website_url: string | null
  contact_name: string | null
  contact_email: string | null
  status: 'active' | 'inactive'
}

type ClubCampaign = {
  id: string
  club_id: string
  sponsor_id: string | null
  slot_id: string
  title: string
  description: string | null
  image_url: string | null
  target_url: string | null
  status: 'draft' | 'active' | 'paused' | 'ended'
  starts_at: string | null
  ends_at: string | null
  sponsor?: Pick<ClubSponsor, 'id' | 'name' | 'logo_url' | 'website_url' | 'status'> | null
}

type CampaignFormState = {
  title: string
  description: string
  imageUrl: string
  targetUrl: string
  status: ClubCampaign['status']
  sponsorId: string
  newSponsorName: string
  startsAt: string
  endsAt: string
}

const commercialSlots: CommercialSlot[] = [
  {
    id: 'HOME_HERO_RIGHT',
    name: 'Hero principal derecho',
    detailName: 'Banner Principal Home',
    status: 'Activo',
    visibility: 'Alta visibilidad',
    visibilityScore: 5,
    location: 'Home pública',
    format: '6x3',
    recommendedSize: '1200x450',
    description: 'Ideal para sponsors principales.',
    previewClass: 'is-hero',
  },
  {
    id: 'HOME_NEWS_LEFT',
    name: 'Noticias destacado',
    detailName: 'Banner Editorial Principal',
    status: 'Disponible',
    visibility: 'Alta visibilidad',
    visibilityScore: 4,
    location: 'Home pública · Noticias',
    format: '6x4',
    recommendedSize: '900x600',
    description: 'Ideal para marcas asociadas a contenido, cobertura y novedades.',
    previewClass: 'is-news-left',
  },
  {
    id: 'HOME_NEWS_RIGHT',
    name: 'Noticias lateral',
    detailName: 'Banner Lateral Noticias',
    status: 'Reservado',
    visibility: 'Media visibilidad',
    visibilityScore: 3,
    location: 'Home pública · Noticias',
    format: '4x4',
    recommendedSize: '600x600',
    description: 'Ideal para refuerzo de marca junto a noticias del club.',
    previewClass: 'is-news-right',
  },
  {
    id: 'HOME_CALENDAR_INLINE',
    name: 'Calendario inline',
    detailName: 'Banner Calendario Torneos',
    status: 'Disponible',
    visibility: 'Media visibilidad',
    visibilityScore: 4,
    location: 'Home pública · Calendario',
    format: '6x2',
    recommendedSize: '900x300',
    description: 'Ideal para marcas vinculadas a torneos, paletas, indumentaria o servicios.',
    previewClass: 'is-calendar',
  },
  {
    id: 'HOME_FOOTER_STRIP',
    name: 'Banner inferior',
    detailName: 'Banner Inferior Institucional',
    status: 'Disponible',
    visibility: 'Baja visibilidad',
    visibilityScore: 2,
    location: 'Home pública · Footer',
    format: '12x2',
    recommendedSize: '1440x240',
    description: 'Ideal para sponsors institucionales con presencia persistente.',
    previewClass: 'is-footer',
  },
]

const statusTone: Record<CommercialSlotStatus, string> = {
  Disponible: 'is-available',
  Reservado: 'is-reserved',
  Activo: 'is-active',
}

const emptyCampaignForm: CampaignFormState = {
  title: '',
  description: '',
  imageUrl: '',
  targetUrl: '',
  status: 'draft',
  sponsorId: '',
  newSponsorName: '',
  startsAt: '',
  endsAt: '',
}

const campaignStatusLabel: Record<ClubCampaign['status'], string> = {
  draft: 'Borrador',
  active: 'Activo',
  paused: 'Pausado',
  ended: 'Finalizado',
}

function pickSlotCampaign(slotId: string, campaigns: ClubCampaign[]) {
  const rows = campaigns.filter((campaign) => campaign.slot_id === slotId)
  return rows.find((campaign) => campaign.status === 'active') ??
    rows.find((campaign) => campaign.status === 'draft') ??
    null
}

function toLocalDateInput(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60_000)
  return local.toISOString().slice(0, 16)
}

function fromLocalDateInput(value: string) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export default function ClubPublicidadPage() {
  const { activeClub } = useSession()
  const clubName = activeClub?.name ?? 'tu club'
  const [selectedSlotId, setSelectedSlotId] = useState(commercialSlots[0].id)
  const [sponsors, setSponsors] = useState<ClubSponsor[]>([])
  const [campaigns, setCampaigns] = useState<ClubCampaign[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [alert, setAlert] = useState<string | null>(null)
  const [modalMode, setModalMode] = useState<'create' | 'image' | null>(null)
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null)
  const [campaignForm, setCampaignForm] = useState<CampaignFormState>(emptyCampaignForm)
  const [themeKey, setThemeKey] = useState<string | null>(null)
  const selectedSlot = commercialSlots.find((slot) => slot.id === selectedSlotId) ?? commercialSlots[0]
  const selectedCampaign = pickSlotCampaign(selectedSlot.id, campaigns)
  const theme = useMemo(() => getClubTheme(themeKey), [themeKey])
  const themeStyle = useMemo(
    () => ({
      '--club-commercial-accent': theme.vars.accent,
      '--club-commercial-accent-2': theme.vars.accent2,
      '--club-commercial-soft': theme.vars.soft,
      '--club-commercial-glow': theme.vars.glow,
    }) as CSSProperties,
    [theme],
  )
  const campaignsBySlot = useMemo(() => {
    return new Map(commercialSlots.map((slot) => [slot.id, pickSlotCampaign(slot.id, campaigns)]))
  }, [campaigns])

  const statusSummary = commercialSlots.reduce<Record<CommercialSlotStatus, number>>(
    (acc, slot) => {
      acc[slot.status] += 1
      return acc
    },
    { Disponible: 0, Reservado: 0, Activo: 0 },
  )

  const loadCommercialData = useCallback(async () => {
    if (!activeClub?.id) return
    setLoading(true)
    setAlert(null)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('Sesión inválida.')

      const [sponsorsRes, campaignsRes] = await Promise.all([
        fetch(`/api/clubs/${activeClub.id}/sponsors`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }),
        fetch(`/api/clubs/${activeClub.id}/campaigns`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }),
      ])

      const sponsorsJson = await sponsorsRes.json().catch(() => ({}))
      const campaignsJson = await campaignsRes.json().catch(() => ({}))
      if (!sponsorsRes.ok) throw new Error(sponsorsJson?.error || 'No pude cargar sponsors.')
      if (!campaignsRes.ok) throw new Error(campaignsJson?.error || 'No pude cargar campañas.')

      setSponsors((sponsorsJson.sponsors ?? []) as ClubSponsor[])
      setCampaigns((campaignsJson.campaigns ?? []) as ClubCampaign[])
    } catch (error) {
      setAlert(error instanceof Error ? error.message : 'No pude cargar el inventario comercial.')
    } finally {
      setLoading(false)
    }
  }, [activeClub?.id])

  useEffect(() => {
    loadCommercialData()
  }, [loadCommercialData])

  useEffect(() => {
    let alive = true

    async function loadTheme() {
      if (!activeClub?.id) {
        setThemeKey(null)
        return
      }

      const { data } = await supabase
        .from('clubs')
        .select('theme_key')
        .eq('id', activeClub.id)
        .maybeSingle()

      if (alive) setThemeKey((data?.theme_key as string | null) ?? null)
    }

    void loadTheme()
    return () => {
      alive = false
    }
  }, [activeClub?.id])

  function openCampaignModal(mode: 'create' | 'image') {
    const current = selectedCampaign
    setModalMode(mode)
    setEditingCampaignId(current?.id ?? null)
    setCampaignForm({
      title: current?.title ?? (mode === 'image' ? `Imagen ${selectedSlot.name}` : ''),
      description: current?.description ?? '',
      imageUrl: current?.image_url ?? '',
      targetUrl: current?.target_url ?? '',
      status: current?.status ?? 'draft',
      sponsorId: current?.sponsor_id ?? '',
      newSponsorName: '',
      startsAt: toLocalDateInput(current?.starts_at ?? null),
      endsAt: toLocalDateInput(current?.ends_at ?? null),
    })
    setAlert(null)
  }

  async function saveCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeClub?.id || !modalMode) return
    setSaving(true)
    setAlert(null)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('Sesión inválida.')

      let sponsorId = campaignForm.sponsorId || null
      if (!sponsorId && campaignForm.newSponsorName.trim()) {
        const sponsorRes = await fetch(`/api/clubs/${activeClub.id}/sponsors`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: campaignForm.newSponsorName,
            status: 'active',
          }),
        })
        const sponsorJson = await sponsorRes.json().catch(() => ({}))
        if (!sponsorRes.ok) throw new Error(sponsorJson?.error || 'No pude crear el sponsor.')
        sponsorId = sponsorJson?.sponsor?.id ?? null
      }

      const payload = {
        sponsorId,
        slotId: selectedSlot.id,
        title: campaignForm.title,
        description: campaignForm.description,
        imageUrl: campaignForm.imageUrl,
        targetUrl: campaignForm.targetUrl,
        status: campaignForm.status,
        startsAt: fromLocalDateInput(campaignForm.startsAt),
        endsAt: fromLocalDateInput(campaignForm.endsAt),
      }

      const url = editingCampaignId
        ? `/api/clubs/${activeClub.id}/campaigns/${editingCampaignId}`
        : `/api/clubs/${activeClub.id}/campaigns`
      const res = await fetch(url, {
        method: editingCampaignId ? 'PATCH' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'No pude guardar la campaña.')

      setModalMode(null)
      setEditingCampaignId(null)
      await loadCommercialData()
    } catch (error) {
      setAlert(error instanceof Error ? error.message : 'No pude guardar la campaña.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="club-shell">
      <div className="club-panel club-commercial-page" style={themeStyle}>
        <header className="club-commercial-hero">
          <div>
            <span className="club-commercial-kicker">Contenido del club</span>
            <h1 className="club-title">Inventario Comercial</h1>
            <p className="club-sub">
              Espacios publicitarios disponibles para la Home de {clubName}. Gestioná campañas, sponsors e imágenes
              desde un inventario visual claro.
            </p>
          </div>

          <div className="club-commercial-summary" aria-label="Resumen del inventario">
            <div>
              <strong>{commercialSlots.length}</strong>
              <span>Slots</span>
            </div>
            <div>
              <strong>{statusSummary.Disponible}</strong>
              <span>Disponibles</span>
            </div>
            <div>
              <strong>{statusSummary.Activo}</strong>
              <span>Activos</span>
            </div>
          </div>
        </header>

        {alert ? <div className="club-commercial-alert">{alert}</div> : null}

        <section className="club-commercial-layout" aria-label="Inventario visual de publicidad">
          <article className="club-commercial-previewCard">
            <div className="club-commercial-sectionTitle">
              <span />
              <div>
                <p>Miniatura visual</p>
                <h2>Home del Club</h2>
              </div>
            </div>

            <div className="club-home-miniature" aria-label="Miniatura mockeada de la home del club">
              <div className="mini-hero">
                <span className="mini-logo">{clubName.slice(0, 2).toUpperCase()}</span>
                <div>
                  <strong>{clubName}</strong>
                  <small>Home pública del club</small>
                </div>
                <button
                  className={`mini-slot is-hero ${selectedSlotId === 'HOME_HERO_RIGHT' ? 'is-selected' : ''}`}
                  onClick={() => setSelectedSlotId('HOME_HERO_RIGHT')}
                  type="button"
                >
                  {campaignsBySlot.get('HOME_HERO_RIGHT')?.image_url ? (
                    <img src={campaignsBySlot.get('HOME_HERO_RIGHT')?.image_url ?? ''} alt="" />
                  ) : null}
                  <span>{campaignsBySlot.get('HOME_HERO_RIGHT')?.title ?? 'HOME_HERO_RIGHT'}</span>
                </button>
              </div>

              <div className="mini-news">
                <button
                  className={`mini-slot is-news-left ${selectedSlotId === 'HOME_NEWS_LEFT' ? 'is-selected' : ''}`}
                  onClick={() => setSelectedSlotId('HOME_NEWS_LEFT')}
                  type="button"
                >
                  {campaignsBySlot.get('HOME_NEWS_LEFT')?.image_url ? (
                    <img src={campaignsBySlot.get('HOME_NEWS_LEFT')?.image_url ?? ''} alt="" />
                  ) : null}
                  <span>{campaignsBySlot.get('HOME_NEWS_LEFT')?.title ?? 'HOME_NEWS_LEFT'}</span>
                </button>
                <button
                  className={`mini-slot is-news-right ${selectedSlotId === 'HOME_NEWS_RIGHT' ? 'is-selected' : ''}`}
                  onClick={() => setSelectedSlotId('HOME_NEWS_RIGHT')}
                  type="button"
                >
                  {campaignsBySlot.get('HOME_NEWS_RIGHT')?.image_url ? (
                    <img src={campaignsBySlot.get('HOME_NEWS_RIGHT')?.image_url ?? ''} alt="" />
                  ) : null}
                  <span>{campaignsBySlot.get('HOME_NEWS_RIGHT')?.title ?? 'HOME_NEWS_RIGHT'}</span>
                </button>
              </div>

              <button
                className={`mini-slot is-calendar ${selectedSlotId === 'HOME_CALENDAR_INLINE' ? 'is-selected' : ''}`}
                onClick={() => setSelectedSlotId('HOME_CALENDAR_INLINE')}
                type="button"
              >
                {campaignsBySlot.get('HOME_CALENDAR_INLINE')?.image_url ? (
                  <img src={campaignsBySlot.get('HOME_CALENDAR_INLINE')?.image_url ?? ''} alt="" />
                ) : null}
                <span>{campaignsBySlot.get('HOME_CALENDAR_INLINE')?.title ?? 'HOME_CALENDAR_INLINE'}</span>
              </button>

              <div className="mini-cards">
                <span />
                <span />
                <span />
              </div>

              <button
                className={`mini-slot is-footer ${selectedSlotId === 'HOME_FOOTER_STRIP' ? 'is-selected' : ''}`}
                onClick={() => setSelectedSlotId('HOME_FOOTER_STRIP')}
                type="button"
              >
                {campaignsBySlot.get('HOME_FOOTER_STRIP')?.image_url ? (
                  <img src={campaignsBySlot.get('HOME_FOOTER_STRIP')?.image_url ?? ''} alt="" />
                ) : null}
                <span>{campaignsBySlot.get('HOME_FOOTER_STRIP')?.title ?? 'HOME_FOOTER_STRIP'}</span>
              </button>
            </div>
          </article>

          <aside className="club-commercial-detailColumn">
            <article className="club-commercial-detail" aria-live="polite">
              <div className="club-commercial-sectionTitle">
                <span />
                <div>
                  <p>Detalle del slot</p>
                  <h2>{selectedSlot.detailName}</h2>
                </div>
              </div>

              <div className={`club-commercial-placeholder ${selectedCampaign?.image_url ? 'has-campaign' : ''}`}>
                {selectedCampaign?.image_url ? <img src={selectedCampaign.image_url} alt={selectedCampaign.title} /> : null}
                <span>{selectedCampaign?.title ?? 'Este espacio puede ser tuyo'}</span>
                <p>{selectedCampaign?.description ?? 'Publicitá con Pamprax y llegá a jugadores y clubes.'}</p>
                <em>
                  {selectedCampaign
                    ? `${campaignStatusLabel[selectedCampaign.status]} · ${selectedCampaign.sponsor?.name ?? 'Sin sponsor'}`
                    : `Slot publicitario ${selectedSlot.format}`}
                </em>
              </div>

              <dl className="club-commercial-detailGrid">
                <div>
                  <dt>Visibilidad</dt>
                  <dd aria-label={`${selectedSlot.visibility}: ${selectedSlot.visibilityScore} de 5`}>
                    <span>{'★'.repeat(selectedSlot.visibilityScore)}{'☆'.repeat(5 - selectedSlot.visibilityScore)}</span>
                    <small>{selectedSlot.visibility}</small>
                  </dd>
                </div>
                <div>
                  <dt>Ubicación</dt>
                  <dd>{selectedSlot.location}</dd>
                </div>
                <div>
                  <dt>Formato</dt>
                  <dd>{selectedSlot.format}</dd>
                </div>
                <div>
                  <dt>Tamaño recomendado</dt>
                  <dd>{selectedSlot.recommendedSize}</dd>
                </div>
                <div>
                  <dt>Estado</dt>
                  <dd><span className={`club-commercial-status ${statusTone[selectedSlot.status]}`}>{selectedSlot.status}</span></dd>
                </div>
                <div>
                  <dt>Descripción</dt>
                  <dd>{selectedSlot.description}</dd>
                </div>
              </dl>

              <div className="club-commercial-detailActions" aria-label="Acciones futuras">
                <button type="button" onClick={() => openCampaignModal('create')}>Crear anuncio</button>
                <button type="button" onClick={() => openCampaignModal('image')}>Subir imagen</button>
              </div>
            </article>

            <section className="club-commercial-slots" aria-label="Slots publicitarios disponibles">
              {commercialSlots.map((slot) => (
                <button
                  className={`club-commercial-slot ${selectedSlotId === slot.id ? 'is-selected' : ''}`}
                  key={slot.id}
                  onClick={() => setSelectedSlotId(slot.id)}
                  type="button"
                >
                  <span className="club-commercial-accent" aria-hidden="true" />
                  <div className="club-commercial-slotPreview">
                    <span className={`slot-shape ${slot.previewClass}`} />
                  </div>
                  <div className="club-commercial-slotBody">
                    <div className="club-commercial-slotHead">
                      <div>
                        <small>{slot.id}</small>
                        <h2>{slot.name}</h2>
                      </div>
                      <span className={`club-commercial-status ${statusTone[slot.status]}`}>{slot.status}</span>
                    </div>
                    <p>{slot.description}</p>
                    <div className="club-commercial-tags">
                      <span>{slot.visibility}</span>
                      <span>{slot.format}</span>
                      {campaignsBySlot.get(slot.id) ? (
                        <span>{campaignStatusLabel[campaignsBySlot.get(slot.id)!.status]}</span>
                      ) : null}
                    </div>
                  </div>
                </button>
              ))}
            </section>
          </aside>
        </section>

        <section className="club-commercial-note">
          <span aria-hidden="true" />
          <div>
            <strong>Inventario comercial preparado</strong>
            <p>
              Los slots mantienen formato, ubicación y visibilidad para que cada campaña encaje sin romper la Home pública del club.
            </p>
          </div>
        </section>

        {loading ? <div className="club-commercial-loading">Cargando inventario comercial...</div> : null}

        {modalMode ? (
          <div className="club-commercial-modal" role="dialog" aria-modal="true">
            <form className="club-commercial-modalCard" onSubmit={saveCampaign}>
              <header>
                <div>
                  <span className="club-commercial-kicker">{selectedSlot.id}</span>
                  <h2>{modalMode === 'image' ? 'Subir imagen del anuncio' : 'Crear anuncio'}</h2>
                  <p>Campos básicos para preparar una campaña del club. Sin crop ni storage avanzado todavía.</p>
                </div>
                <button type="button" onClick={() => setModalMode(null)}>Cerrar</button>
              </header>

              <div className="club-commercial-formGrid">
                <label>
                  Título
                  <input
                    required
                    value={campaignForm.title}
                    onChange={(event) => setCampaignForm((current) => ({ ...current, title: event.target.value }))}
                    placeholder="Banco de La Pampa"
                  />
                </label>
                <label>
                  Estado
                  <select
                    value={campaignForm.status}
                    onChange={(event) => setCampaignForm((current) => ({ ...current, status: event.target.value as ClubCampaign['status'] }))}
                  >
                    <option value="draft">Borrador</option>
                    <option value="active">Activo</option>
                    <option value="paused">Pausado</option>
                    <option value="ended">Finalizado</option>
                  </select>
                </label>
                <label>
                  Sponsor asociado
                  <select
                    value={campaignForm.sponsorId}
                    onChange={(event) => setCampaignForm((current) => ({ ...current, sponsorId: event.target.value, newSponsorName: '' }))}
                  >
                    <option value="">Sin sponsor</option>
                    {sponsors.map((sponsor) => (
                      <option key={sponsor.id} value={sponsor.id}>{sponsor.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Crear sponsor rápido
                  <input
                    disabled={Boolean(campaignForm.sponsorId)}
                    value={campaignForm.newSponsorName}
                    onChange={(event) => setCampaignForm((current) => ({ ...current, newSponsorName: event.target.value }))}
                    placeholder="Nombre del sponsor"
                  />
                </label>
                <label className="is-wide">
                  URL de imagen
                  <input
                    value={campaignForm.imageUrl}
                    onChange={(event) => setCampaignForm((current) => ({ ...current, imageUrl: event.target.value }))}
                    placeholder="https://..."
                  />
                </label>
                <label className="is-wide">
                  URL destino
                  <input
                    value={campaignForm.targetUrl}
                    onChange={(event) => setCampaignForm((current) => ({ ...current, targetUrl: event.target.value }))}
                    placeholder="https://marca.com"
                  />
                </label>
                <label>
                  Inicio
                  <input
                    type="datetime-local"
                    value={campaignForm.startsAt}
                    onChange={(event) => setCampaignForm((current) => ({ ...current, startsAt: event.target.value }))}
                  />
                </label>
                <label>
                  Fin
                  <input
                    type="datetime-local"
                    value={campaignForm.endsAt}
                    onChange={(event) => setCampaignForm((current) => ({ ...current, endsAt: event.target.value }))}
                  />
                </label>
                <label className="is-wide">
                  Descripción
                  <textarea
                    value={campaignForm.description}
                    onChange={(event) => setCampaignForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Mensaje corto visible en el placeholder o detalle."
                  />
                </label>
              </div>

              <footer>
                <button type="button" onClick={() => setModalMode(null)}>Cancelar</button>
                <button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar anuncio'}</button>
              </footer>
            </form>
          </div>
        ) : null}
      </div>

      <style>{`
        .club-commercial-page {
          background: #fff;
          border: 1px solid rgba(15,23,42,.08);
          border-radius: 24px;
          box-shadow: 0 24px 64px rgba(15,23,42,.09);
          display: grid;
          gap: 18px;
          min-width: 0;
          overflow: hidden;
          padding: 22px;
          position: relative;
        }

        .club-commercial-page::before {
          background: linear-gradient(90deg, var(--club-commercial-accent), var(--club-commercial-accent-2));
          content: "";
          height: 4px;
          left: 0;
          position: absolute;
          right: 0;
          top: 0;
        }

        .club-commercial-hero {
          align-items: flex-start;
          background: linear-gradient(135deg, rgba(248,250,252,.98), var(--club-commercial-soft));
          border: 1px solid rgba(15,23,42,.07);
          border-radius: 20px;
          display: grid;
          gap: 18px;
          grid-template-columns: minmax(0, 1fr) auto;
          padding: 18px;
        }

        .club-commercial-kicker,
        .club-commercial-sectionTitle p,
        .club-commercial-slotHead small {
          color: var(--club-commercial-accent);
          display: inline-block;
          font-size: 0.72rem;
          font-weight: 900;
          letter-spacing: 0.05em;
          margin: 0;
          text-transform: uppercase;
        }

        .club-commercial-summary {
          background: linear-gradient(135deg, #020617, #061b3a);
          border: 1px solid color-mix(in srgb, var(--club-commercial-accent) 28%, transparent);
          border-radius: 18px;
          box-shadow: 0 18px 42px var(--club-commercial-glow);
          color: #ffffff;
          display: grid;
          gap: 8px;
          grid-template-columns: repeat(3, minmax(74px, 1fr));
          padding: 12px;
        }

        .club-commercial-summary div {
          background: rgba(255, 255, 255, 0.07);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 14px;
          display: grid;
          gap: 3px;
          padding: 10px;
          text-align: center;
        }

        .club-commercial-summary strong {
          color: color-mix(in srgb, var(--club-commercial-accent) 68%, #ffffff);
          font-size: 1.45rem;
          font-weight: 950;
          line-height: 1;
        }

        .club-commercial-summary span {
          color: rgba(255, 255, 255, 0.72);
          font-size: 0.72rem;
          font-weight: 850;
        }

        .club-commercial-alert,
        .club-commercial-loading {
          background: #fff7ed;
          border: 1px solid #fed7aa;
          border-radius: 14px;
          color: #9a3412;
          font-size: 0.86rem;
          font-weight: 800;
          padding: 12px 14px;
        }

        .club-commercial-loading {
          background: var(--club-commercial-soft);
          border-color: color-mix(in srgb, var(--club-commercial-accent) 24%, transparent);
          color: #061b3a;
        }

        .club-commercial-layout {
          display: grid;
          gap: 16px;
          grid-template-columns: minmax(340px, 0.95fr) minmax(0, 1.35fr);
        }

        .club-commercial-previewCard,
        .club-commercial-slot,
        .club-commercial-note {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          box-shadow: 0 16px 42px rgba(15, 23, 42, 0.065);
        }

        .club-commercial-previewCard {
          display: grid;
          gap: 14px;
          min-width: 0;
          padding: 16px;
        }

        .club-commercial-sectionTitle {
          align-items: center;
          display: flex;
          gap: 10px;
        }

        .club-commercial-sectionTitle > span,
        .club-commercial-accent,
        .club-commercial-note > span {
          background: linear-gradient(180deg, var(--club-commercial-accent), var(--club-commercial-accent-2));
          border-radius: 999px;
          box-shadow: 0 0 18px var(--club-commercial-glow);
          flex: 0 0 auto;
          width: 5px;
        }

        .club-commercial-sectionTitle > span {
          height: 38px;
        }

        .club-commercial-sectionTitle h2 {
          color: #061b3a;
          font-size: 1.22rem;
          font-weight: 950;
          letter-spacing: -0.03em;
          line-height: 1.05;
          margin: 2px 0 0;
        }

        .club-home-miniature {
          background:
            radial-gradient(circle at 10% 8%, color-mix(in srgb, var(--club-commercial-accent) 22%, transparent), transparent 28%),
            radial-gradient(circle at 90% 14%, color-mix(in srgb, var(--club-commercial-accent-2) 18%, transparent), transparent 28%),
            linear-gradient(180deg, #f8fbff, #eef7fb);
          border: 1px solid color-mix(in srgb, var(--club-commercial-accent) 24%, transparent);
          border-radius: 18px;
          display: grid;
          gap: 10px;
          overflow: hidden;
          padding: 12px;
        }

        .mini-hero {
          align-items: center;
          background: linear-gradient(135deg, #020617, #061b3a);
          border-radius: 16px;
          color: #ffffff;
          display: grid;
          gap: 9px;
          grid-template-columns: 42px minmax(0, 1fr) minmax(105px, 0.42fr);
          min-height: 92px;
          padding: 12px;
        }

        .mini-logo {
          align-items: center;
          background: color-mix(in srgb, var(--club-commercial-accent) 16%, transparent);
          border: 1px solid color-mix(in srgb, var(--club-commercial-accent) 24%, transparent);
          border-radius: 14px;
          display: flex;
          font-size: 0.82rem;
          font-weight: 950;
          height: 42px;
          justify-content: center;
          width: 42px;
        }

        .mini-hero strong,
        .mini-hero small {
          display: block;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .mini-hero strong {
          font-size: 0.95rem;
          font-weight: 950;
        }

        .mini-hero small {
          color: rgba(255, 255, 255, 0.68);
          font-size: 0.72rem;
          font-weight: 800;
        }

        .mini-news {
          display: grid;
          gap: 10px;
          grid-template-columns: 1.25fr 0.75fr;
        }

        .mini-cards {
          display: grid;
          gap: 8px;
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .mini-cards span {
          background: rgba(255, 255, 255, 0.9);
          border: 1px solid #dbeafe;
          border-radius: 12px;
          height: 48px;
        }

        .mini-slot {
          align-items: center;
          background: rgba(255, 255, 255, 0.86);
          border: 1px dashed color-mix(in srgb, var(--club-commercial-accent) 48%, transparent);
          border-left: 4px solid var(--club-commercial-accent);
          border-radius: 12px;
          box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--club-commercial-accent-2) 10%, transparent);
          color: #061b3a;
          cursor: pointer;
          display: flex;
          font-size: 0.58rem;
          font-style: normal;
          font-weight: 950;
          font-family: inherit;
          justify-content: center;
          letter-spacing: 0.02em;
          min-height: 58px;
          padding: 8px;
          position: relative;
          text-align: center;
          transition: border-color 0.18s ease, box-shadow 0.18s ease, color 0.18s ease, transform 0.18s ease;
        }

        .mini-slot img {
          height: 100%;
          inset: 0;
          object-fit: cover;
          opacity: 0.76;
          position: absolute;
          transition: opacity 0.18s ease, transform 0.22s ease;
          width: 100%;
        }

        .mini-slot::before {
          background: linear-gradient(180deg, var(--club-commercial-accent), var(--club-commercial-accent-2));
          border-radius: 999px;
          content: "";
          inset: 8px auto 8px 8px;
          opacity: 0;
          position: absolute;
          transition: opacity 0.18s ease, box-shadow 0.18s ease;
          width: 4px;
        }

        .mini-slot span {
          position: relative;
          z-index: 1;
        }

        .mini-slot:hover,
        .mini-slot.is-selected {
          background: linear-gradient(135deg, var(--club-commercial-soft), rgba(255, 255, 255, 0.9));
          border-color: color-mix(in srgb, var(--club-commercial-accent-2) 42%, transparent);
          box-shadow: 0 14px 30px rgba(15, 23, 42, 0.12), 0 0 0 4px var(--club-commercial-glow);
          color: #061b3a;
          transform: translateY(-1px);
        }

        .mini-slot:hover img,
        .mini-slot.is-selected img {
          opacity: 0.9;
          transform: scale(1.025);
        }

        .mini-slot:hover::before,
        .mini-slot.is-selected::before {
          box-shadow: 0 0 18px var(--club-commercial-glow);
          opacity: 1;
        }

        .mini-slot.is-hero {
          min-height: 68px;
        }

        .mini-slot.is-footer {
          min-height: 38px;
        }

        .mini-slot.is-calendar {
          min-height: 46px;
        }

        .club-commercial-detailColumn {
          display: grid;
          gap: 12px;
          min-width: 0;
        }

        .club-commercial-detail {
          background:
            radial-gradient(circle at 0 0, color-mix(in srgb, var(--club-commercial-accent) 12%, transparent), transparent 34%),
            #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          box-shadow: 0 16px 42px rgba(15, 23, 42, 0.065);
          display: grid;
          gap: 14px;
          min-width: 0;
          padding: 16px;
        }

        .club-commercial-placeholder {
          background:
            radial-gradient(circle at 12% 0%, color-mix(in srgb, var(--club-commercial-accent) 24%, transparent), transparent 34%),
            radial-gradient(circle at 92% 12%, color-mix(in srgb, var(--club-commercial-accent-2) 18%, transparent), transparent 32%),
            linear-gradient(135deg, var(--club-commercial-soft), #f8fbff 62%, #ffffff);
          border: 1px dashed color-mix(in srgb, var(--club-commercial-accent) 42%, transparent);
          border-radius: 18px;
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.78);
          display: grid;
          gap: 7px;
          min-height: 138px;
          padding: 18px;
          position: relative;
          overflow: hidden;
        }

        .club-commercial-placeholder.has-campaign {
          color: #ffffff;
          min-height: 160px;
        }

        .club-commercial-placeholder::before {
          background: linear-gradient(180deg, var(--club-commercial-accent), var(--club-commercial-accent-2));
          border-radius: 999px;
          content: "";
          inset: 16px auto 16px 14px;
          position: absolute;
          width: 5px;
          z-index: 2;
        }

        .club-commercial-placeholder.has-campaign::after {
          background: linear-gradient(180deg, rgba(2, 6, 23, 0.2), rgba(2, 6, 23, 0.86));
          content: "";
          inset: 0;
          position: absolute;
          z-index: 1;
        }

        .club-commercial-placeholder img {
          height: 100%;
          inset: 0;
          object-fit: cover;
          position: absolute;
          width: 100%;
          z-index: 0;
        }

        .club-commercial-placeholder span {
          color: #061b3a;
          font-size: clamp(1.25rem, 2.4vw, 1.75rem);
          font-weight: 950;
          letter-spacing: -0.04em;
          line-height: 1;
          padding-left: 16px;
          position: relative;
          z-index: 2;
        }

        .club-commercial-placeholder p {
          color: #475569;
          font-size: 0.9rem;
          font-weight: 720;
          line-height: 1.38;
          margin: 0;
          max-width: 520px;
          padding-left: 16px;
          position: relative;
          z-index: 2;
        }

        .club-commercial-placeholder em {
          align-self: end;
          background: linear-gradient(135deg, #020617, #061b3a);
          border: 1px solid color-mix(in srgb, var(--club-commercial-accent) 38%, transparent);
          border-radius: 999px;
          color: #ffffff;
          font-size: 0.72rem;
          font-style: normal;
          font-weight: 950;
          justify-self: start;
          margin-left: 16px;
          padding: 7px 10px;
          text-transform: uppercase;
          position: relative;
          z-index: 2;
        }

        .club-commercial-placeholder.has-campaign span {
          color: #ffffff;
          text-shadow: 0 12px 26px rgba(2, 6, 23, 0.3);
        }

        .club-commercial-placeholder.has-campaign p {
          color: rgba(255, 255, 255, 0.82);
        }

        .club-commercial-detailGrid {
          display: grid;
          gap: 9px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          margin: 0;
        }

        .club-commercial-detailGrid div {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          display: grid;
          gap: 4px;
          padding: 11px;
        }

        .club-commercial-detailGrid dt {
          color: #64748b;
          font-size: 0.68rem;
          font-weight: 950;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .club-commercial-detailGrid dd {
          color: #061b3a;
          font-size: 0.86rem;
          font-weight: 850;
          line-height: 1.28;
          margin: 0;
        }

        .club-commercial-detailGrid dd span:not(.club-commercial-status) {
          color: #f59e0b;
          display: block;
          font-size: 0.92rem;
          letter-spacing: 0.06em;
          line-height: 1;
        }

        .club-commercial-detailGrid dd small {
          color: var(--club-commercial-accent);
          display: block;
          font-size: 0.72rem;
          font-weight: 900;
          margin-top: 4px;
        }

        .club-commercial-detailActions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .club-commercial-detailActions button {
          background: linear-gradient(135deg, #020617, #061b3a);
          border: 1px solid color-mix(in srgb, var(--club-commercial-accent) 38%, transparent);
          border-radius: 999px;
          box-shadow: 0 14px 26px var(--club-commercial-glow);
          color: #ffffff;
          cursor: pointer;
          font: inherit;
          font-size: 0.8rem;
          font-weight: 950;
          padding: 10px 13px;
          transition: box-shadow 0.18s ease, transform 0.18s ease;
        }

        .club-commercial-detailActions button + button {
          background: #ffffff;
          border-color: color-mix(in srgb, var(--club-commercial-accent) 34%, transparent);
          box-shadow: inset 0 0 0 1px var(--club-commercial-glow);
          color: #061b3a;
        }

        .club-commercial-detailActions button:hover {
          box-shadow: 0 20px 40px var(--club-commercial-glow);
          transform: translateY(-1px);
        }

        .club-commercial-slots {
          display: grid;
          gap: 12px;
          min-width: 0;
        }

        .club-commercial-slot {
          align-items: stretch;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          box-shadow: 0 16px 42px rgba(15, 23, 42, 0.065);
          color: inherit;
          cursor: pointer;
          display: grid;
          font: inherit;
          gap: 12px;
          grid-template-columns: 5px 112px minmax(0, 1fr);
          min-width: 0;
          padding: 12px;
          text-align: left;
          transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
        }

        .club-commercial-slot:hover,
        .club-commercial-slot.is-selected {
          border-color: color-mix(in srgb, var(--club-commercial-accent) 36%, transparent);
          box-shadow: 0 22px 52px rgba(15, 23, 42, 0.1), 0 0 0 4px var(--club-commercial-glow);
          transform: translateY(-2px);
        }

        .club-commercial-slot.is-selected {
          background: linear-gradient(135deg, var(--club-commercial-soft), #ffffff);
        }

        .club-commercial-slot:hover .club-commercial-accent,
        .club-commercial-slot.is-selected .club-commercial-accent {
          box-shadow: 0 0 20px var(--club-commercial-glow);
          transform: scaleY(1.08);
        }

        .club-commercial-accent {
          height: 100%;
          transition: box-shadow 0.18s ease, transform 0.18s ease;
        }

        .club-commercial-slotPreview {
          align-items: center;
          background:
            radial-gradient(circle at 20% 10%, color-mix(in srgb, var(--club-commercial-accent) 13%, transparent), transparent 36%),
            #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 15px;
          display: flex;
          justify-content: center;
          min-height: 86px;
          padding: 10px;
        }

        .slot-shape {
          background: linear-gradient(135deg, color-mix(in srgb, var(--club-commercial-accent) 20%, transparent), color-mix(in srgb, var(--club-commercial-accent-2) 16%, transparent));
          border: 1px dashed color-mix(in srgb, var(--club-commercial-accent) 52%, transparent);
          border-radius: 10px;
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.75);
          display: block;
          height: 48px;
          width: 78px;
        }

        .slot-shape.is-hero {
          height: 54px;
          width: 86px;
        }

        .slot-shape.is-news-left {
          height: 58px;
          width: 84px;
        }

        .slot-shape.is-news-right {
          height: 58px;
          width: 58px;
        }

        .slot-shape.is-calendar {
          height: 34px;
          width: 92px;
        }

        .slot-shape.is-footer {
          height: 24px;
          width: 96px;
        }

        .club-commercial-slotBody {
          display: grid;
          gap: 9px;
          min-width: 0;
        }

        .club-commercial-slotHead {
          align-items: flex-start;
          display: flex;
          gap: 10px;
          justify-content: space-between;
          min-width: 0;
        }

        .club-commercial-slotHead h2 {
          color: #061b3a;
          font-size: 1rem;
          font-weight: 950;
          letter-spacing: -0.02em;
          line-height: 1.08;
          margin: 2px 0 0;
        }

        .club-commercial-slotBody p {
          color: #52657d;
          font-size: 0.84rem;
          font-weight: 650;
          line-height: 1.38;
          margin: 0;
        }

        .club-commercial-status,
        .club-commercial-tags span {
          border-radius: 999px;
          display: inline-flex;
          font-size: 0.68rem;
          font-weight: 950;
          line-height: 1;
          padding: 7px 8px;
          white-space: nowrap;
        }

        .club-commercial-status.is-available {
          background: color-mix(in srgb, var(--club-commercial-accent) 12%, white);
          border: 1px solid color-mix(in srgb, var(--club-commercial-accent) 26%, transparent);
          color: #061b3a;
        }

        .club-commercial-status.is-reserved {
          background: rgba(245, 158, 11, 0.13);
          border: 1px solid rgba(245, 158, 11, 0.24);
          color: #92400e;
        }

        .club-commercial-status.is-active {
          background: rgba(16, 185, 129, 0.13);
          border: 1px solid rgba(16, 185, 129, 0.26);
          color: #047857;
        }

        .club-commercial-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .club-commercial-tags span {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          color: #475569;
        }

        .club-commercial-note {
          align-items: flex-start;
          display: flex;
          gap: 12px;
          padding: 15px;
        }

        .club-commercial-note > span {
          height: 42px;
        }

        .club-commercial-note strong {
          color: #061b3a;
          display: block;
          font-size: 0.95rem;
          font-weight: 950;
          margin-bottom: 4px;
        }

        .club-commercial-note p {
          color: #52657d;
          font-size: 0.86rem;
          font-weight: 650;
          line-height: 1.42;
          margin: 0;
        }

        .club-commercial-modal {
          align-items: center;
          background: rgba(15, 23, 42, 0.62);
          display: flex;
          inset: 0;
          justify-content: center;
          overflow: auto;
          padding: 18px;
          position: fixed;
          z-index: 90;
        }

        .club-commercial-modalCard {
          background: #ffffff;
          border: 1px solid color-mix(in srgb, var(--club-commercial-accent) 18%, transparent);
          border-radius: 22px;
          box-shadow: 0 28px 80px rgba(2, 6, 23, 0.28);
          display: grid;
          gap: 16px;
          max-height: min(760px, calc(100vh - 36px));
          overflow: auto;
          padding: 18px;
          width: min(760px, 100%);
        }

        .club-commercial-modalCard header,
        .club-commercial-modalCard footer {
          align-items: flex-start;
          display: flex;
          gap: 12px;
          justify-content: space-between;
        }

        .club-commercial-modalCard header h2 {
          color: #061b3a;
          font-size: 1.35rem;
          font-weight: 950;
          letter-spacing: -0.035em;
          margin: 2px 0 4px;
        }

        .club-commercial-modalCard header p {
          color: #64748b;
          font-size: 0.86rem;
          font-weight: 720;
          line-height: 1.4;
          margin: 0;
        }

        .club-commercial-modalCard header button,
        .club-commercial-modalCard footer button {
          border-radius: 999px;
          cursor: pointer;
          font: inherit;
          font-size: 0.82rem;
          font-weight: 950;
          padding: 10px 13px;
        }

        .club-commercial-modalCard header button,
        .club-commercial-modalCard footer button:first-child {
          background: #ffffff;
          border: 1px solid #dbe5ef;
          color: #061b3a;
        }

        .club-commercial-modalCard footer button:last-child {
          background: linear-gradient(135deg, #020617, #061b3a);
          border: 1px solid color-mix(in srgb, var(--club-commercial-accent) 38%, transparent);
          box-shadow: 0 14px 28px var(--club-commercial-glow);
          color: #ffffff;
        }

        .club-commercial-modalCard footer button:disabled {
          cursor: wait;
          opacity: 0.72;
        }

        .club-commercial-formGrid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .club-commercial-formGrid label {
          color: #334155;
          display: grid;
          font-size: 0.76rem;
          font-weight: 900;
          gap: 6px;
          min-width: 0;
        }

        .club-commercial-formGrid label.is-wide {
          grid-column: 1 / -1;
        }

        .club-commercial-formGrid input,
        .club-commercial-formGrid select,
        .club-commercial-formGrid textarea {
          background: #f8fafc;
          border: 1px solid #dbe5ef;
          border-radius: 12px;
          color: #061b3a;
          font: inherit;
          font-size: 0.88rem;
          font-weight: 720;
          min-width: 0;
          padding: 11px 12px;
          outline: none;
        }

        .club-commercial-formGrid textarea {
          min-height: 86px;
          resize: vertical;
        }

        .club-commercial-formGrid input:focus,
        .club-commercial-formGrid select:focus,
        .club-commercial-formGrid textarea:focus {
          border-color: color-mix(in srgb, var(--club-commercial-accent) 72%, transparent);
          box-shadow: 0 0 0 4px var(--club-commercial-glow);
        }

        @media (max-width: 1080px) {
          .club-commercial-hero,
          .club-commercial-layout {
            grid-template-columns: 1fr;
          }

          .club-commercial-summary {
            justify-self: stretch;
          }
        }

        @media (max-width: 700px) {
          .club-commercial-summary {
            grid-template-columns: 1fr;
          }

          .club-commercial-detailGrid {
            grid-template-columns: 1fr;
          }

          .mini-hero,
          .mini-news,
          .mini-cards {
            grid-template-columns: 1fr;
          }

          .club-commercial-slot {
            grid-template-columns: 5px minmax(0, 1fr);
          }

          .club-commercial-slotPreview {
            grid-column: 2;
          }

          .club-commercial-slotBody {
            grid-column: 2;
          }

          .club-commercial-slotHead {
            align-items: stretch;
            flex-direction: column;
          }

          .club-commercial-formGrid {
            grid-template-columns: 1fr;
          }

          .club-commercial-modalCard header,
          .club-commercial-modalCard footer {
            align-items: stretch;
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  )
}
