'use client'

import { ChangeEvent, CSSProperties, useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, ChevronRight, GripVertical, ImagePlus, MapPin, Plus, Trash2, X } from 'lucide-react'
import { useSession } from '@/components/session/SessionProvider'
import { supabase } from '@/lib/supabaseClient'
import { getClubTheme } from '@/lib/clubThemes'
import ClubBackLink from '@/components/club/ClubBackLink'

type Media = { id: string; kind: 'COVER' | 'STORY' | 'GALLERY'; storage_path: string; public_url: string; alt_text: string | null; caption: string | null; sort_order: number; is_visible: boolean }
type Facility = { id?: string; facility_key: string; label: string; description?: string | null; is_available: boolean; sort_order?: number }
type Club = { id: string; name: string; logo_url: string | null; description: string | null; city: string | null; province: string | null; country: string | null; address: string | null; phone: string | null; mobile_phone: string | null; contact_email: string | null; website: string | null; instagram: string | null; opening_hours: string | null; courts_count: number | null; courts_surface: string | null; theme_key: string | null }
type ProfileData = { tagline: string | null; story: string | null; publication_status: 'DRAFT' | 'PUBLISHED'; published_at: string | null }
type Payload = { club: Club; profile: ProfileData; media: Media[]; facilities: Facility[]; metrics: { players: number; courts: number; tournaments: number } }
type Editor = 'identity' | 'story' | 'gallery' | 'facilities' | 'contact' | null

const facilityOptions = [
  ['LOCKER_ROOMS', 'Vestuarios'], ['BAR', 'Bar'], ['PARKING', 'Estacionamiento'], ['SCHOOL', 'Escuela'],
  ['WIFI', 'WiFi'], ['STORE', 'Tienda'], ['RACKET_RENTAL', 'Alquiler de paletas'],
] as const

async function token() {
  return (await supabase.auth.getSession()).data.session?.access_token ?? null
}

export default function ClubPublicProfilePage() {
  const { activeClub } = useSession()
  const clubId = activeClub?.id ?? null
  const [data, setData] = useState<Payload | null>(null)
  const [tagline, setTagline] = useState('')
  const [story, setStory] = useState('')
  const [clubFields, setClubFields] = useState({ name: '', city: '', province: '', description: '', address: '', phone: '', mobile_phone: '', contact_email: '', website: '', instagram: '' })
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [editor, setEditor] = useState<Editor>(null)
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    if (!clubId) return
    const accessToken = await token()
    setLoading(true); setMessage('')
    const response = await fetch(`/api/clubs/${clubId}/profile`, { headers: { Authorization: `Bearer ${accessToken}` } })
    const json = await response.json().catch(() => ({}))
    if (!response.ok) { setMessage(json.error || 'No pudimos cargar el perfil.'); setLoading(false); return }
    setData(json); setTagline(json.profile.tagline ?? ''); setStory(json.profile.story ?? '')
    setClubFields({ name: json.club.name ?? '', city: json.club.city ?? '', province: json.club.province ?? '', description: json.club.description ?? '', address: json.club.address ?? '', phone: json.club.phone ?? '', mobile_phone: json.club.mobile_phone ?? '', contact_email: json.club.contact_email ?? '', website: json.club.website ?? '', instagram: json.club.instagram ?? '' })
    setFacilities(json.facilities ?? []); setDirty(false); setLoading(false)
  }, [clubId])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])
  const media = data?.media ?? []
  const cover = media.find((item) => item.kind === 'COVER')
  const storyImage = media.find((item) => item.kind === 'STORY')
  const gallery = media.filter((item) => item.kind === 'GALLERY').sort((a, b) => a.sort_order - b.sort_order)
  const theme = getClubTheme(data?.club.theme_key)
  const completeness = useMemo(() => {
    if (!data) return 0
    const checks = [data.club.logo_url, cover?.public_url, tagline, story, clubFields.description, data.club.city, clubFields.phone || clubFields.mobile_phone, clubFields.instagram || clubFields.website, facilities.length, gallery.length]
    return Math.round(checks.filter(Boolean).length / checks.length * 100)
  }, [clubFields, cover?.public_url, data, facilities.length, gallery.length, story, tagline])

  function changed<T>(setter: (value: T) => void, value: T) { setter(value); setDirty(true) }
  async function save(nextStatus = data?.profile.publication_status ?? 'DRAFT') {
    if (!activeClub?.id) return
    setSaving(true); setMessage('')
    const accessToken = await token()
    const response = await fetch(`/api/clubs/${activeClub.id}/profile`, { method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ tagline, story, publication_status: nextStatus, club: clubFields, facilities }) })
    const json = await response.json().catch(() => ({}))
    if (!response.ok) setMessage(json.error || 'No pudimos guardar los cambios.')
    else { setMessage(nextStatus === 'PUBLISHED' ? 'Perfil publicado.' : 'Cambios guardados.'); setEditor(null); await load() }
    setSaving(false)
  }
  async function upload(kind: Media['kind'], event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file || !activeClub?.id) return
    setSaving(true); const form = new FormData(); form.append('kind', kind); form.append('file', file)
    const response = await fetch(`/api/clubs/${activeClub.id}/profile-assets`, { method: 'POST', headers: { Authorization: `Bearer ${await token()}` }, body: form })
    const json = await response.json().catch(() => ({})); if (!response.ok) setMessage(json.error || 'No pudimos subir la imagen.'); else await load()
    setSaving(false); event.target.value = ''
  }
  async function uploadLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file || !activeClub?.id) return
    setSaving(true); const form = new FormData(); form.append('clubId', activeClub.id); form.append('assetType', 'logo'); form.append('file', file)
    const response = await fetch('/api/club_assets/upload', { method: 'POST', headers: { Authorization: `Bearer ${await token()}` }, body: form })
    const json = await response.json().catch(() => ({})); if (!response.ok) setMessage(json.error || 'No pudimos subir el logo.'); else await load()
    setSaving(false); event.target.value = ''
  }
  async function removeMedia(id: string) {
    if (!activeClub?.id) return
    setSaving(true); setMessage('')
    const response = await fetch(`/api/clubs/${activeClub.id}/profile-assets`, { method: 'DELETE', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    const json = await response.json().catch(() => ({}))
    if (!response.ok) setMessage(json.error || 'No pudimos quitar la imagen.')
    else await load()
    setSaving(false)
  }
  async function moveGallery(index: number, direction: -1 | 1) {
    if (!activeClub?.id || !gallery[index + direction]) return
    const order = [...gallery]; [order[index], order[index + direction]] = [order[index + direction], order[index]]
    setData((current) => current ? { ...current, media: [...current.media.filter((item) => item.kind !== 'GALLERY'), ...order.map((item, sort_order) => ({ ...item, sort_order }))] } : current)
    const response = await fetch(`/api/clubs/${activeClub.id}/profile-assets`, { method: 'PATCH', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ order: order.map((item) => item.id) }) })
    const json = await response.json().catch(() => ({}))
    if (!response.ok) {
      setMessage(json.error || 'No pudimos ordenar la galería.')
      await load()
    }
  }
  function toggleFacility(key: string, label: string) {
    const current = facilities.find((item) => item.facility_key === key)
    changed(setFacilities, current ? facilities.filter((item) => item.facility_key !== key) : [...facilities, { facility_key: key, label, is_available: true }])
  }

  if (loading) return <main className="clubProfilePage"><ClubBackLink /><div className="clubProfileSkeleton">Cargando perfil del club…</div><Styles /></main>
  if (!data) return <main className="clubProfilePage"><ClubBackLink /><div className="clubProfileError">{message || 'Perfil no disponible.'}</div><Styles /></main>
  const location = [clubFields.city, clubFields.province].filter(Boolean).join(' · ') || data.club.country || 'Ubicación sin completar'
  const status = data.profile.publication_status
  const publicHref = `/clubs/${data.club.id}`
  const style = { '--profile-accent': theme.vars.accent, '--profile-soft': theme.vars.soft } as CSSProperties

  return <main className="clubProfilePage" style={style}>
    <ClubBackLink />
    <header className="clubProfileHead"><div><span>IDENTIDAD PÚBLICA</span><h1>Perfil del club</h1></div><div className="clubProfileHeadActions"><em data-status={status}>{status === 'PUBLISHED' ? 'Publicado' : 'Borrador'}</em><a href={publicHref} target="_blank" rel="noreferrer">Ver perfil público</a></div></header>
    {message ? <p className="clubProfileMessage">{message}</p> : null}
    <section className="clubProfilePreview" style={cover ? { backgroundImage: `linear-gradient(180deg,rgba(4,17,37,.12),rgba(4,17,37,.84)),url(${cover.public_url})` } : undefined}>
      <div className="clubProfileLogo">{data.club.logo_url ? <img src={data.club.logo_url} alt={`Logo de ${data.club.name}`} /> : <Building2 />}</div>
      <div><h2>{clubFields.name || data.club.name}</h2><p><MapPin /> {location}</p><strong>{tagline || 'Agregá una frase que represente al club.'}</strong></div>
    </section>
    <section className="clubProfileCompletion"><div><span>Perfil completo</span><strong>{completeness}%</strong></div><i><b style={{ width: `${completeness}%` }} /></i></section>
    <section className="clubProfileSections" aria-label="Secciones del perfil">
      <Section title="Portada e identidad" detail={cover ? 'Portada y presentación listas' : 'Falta agregar la portada'} onClick={() => setEditor('identity')} />
      <Section title="Nuestra historia" detail={story ? 'Historia cargada' : 'Contá brevemente el recorrido del club'} onClick={() => setEditor('story')} />
      <Section title="Galería" detail={`${gallery.length} ${gallery.length === 1 ? 'foto' : 'fotos'}`} onClick={() => setEditor('gallery')} />
      <Section title="Instalaciones y servicios" detail={`${facilities.length} seleccionados`} onClick={() => setEditor('facilities')} />
      <Section title="Contacto y redes" detail={clubFields.instagram || clubFields.website || clubFields.phone ? 'Información disponible' : 'Sin completar'} onClick={() => setEditor('contact')} />
    </section>
    <section className="clubProfileToday"><header><span>EL CLUB HOY</span><h2>Datos automáticos</h2></header><div><Metric value={data.metrics.players} label="Jugadores activos" /><Metric value={data.metrics.courts} label="Canchas" /><Metric value={data.metrics.tournaments} label="Torneos" /></div></section>
    {status === 'DRAFT' && !dirty ? <button className="clubProfilePublish" type="button" onClick={() => void save('PUBLISHED')} disabled={saving}>Publicar perfil</button> : null}
    {editor ? <div className="clubProfileBackdrop" onMouseDown={() => setEditor(null)}><section className="clubProfileSheet" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><header><div><span>PERFIL DEL CLUB</span><h2>{editorTitle(editor)}</h2></div><button type="button" onClick={() => setEditor(null)} aria-label="Cerrar"><X /></button></header><div className="clubProfileSheetBody">
      {editor === 'identity' ? <><ImageField label="Logo del club" image={data.club.logo_url ?? undefined} onChange={(event) => void uploadLogo(event)} /><ImageField label="Foto de portada" image={cover?.public_url} onChange={(event) => void upload('COVER', event)} onRemove={cover ? () => void removeMedia(cover.id) : undefined} /><Field label="Nombre del club"><input maxLength={120} value={clubFields.name} onChange={(event) => changed(setClubFields, { ...clubFields, name: event.target.value })} /></Field><div className="clubProfileTwo"><Field label="Ciudad"><input value={clubFields.city} onChange={(event) => changed(setClubFields, { ...clubFields, city: event.target.value })} /></Field><Field label="Provincia"><input value={clubFields.province} onChange={(event) => changed(setClubFields, { ...clubFields, province: event.target.value })} /></Field></div><Field label="Lema o frase corta"><input maxLength={120} value={tagline} onChange={(event) => changed(setTagline, event.target.value)} placeholder="Una frase que represente al club" /></Field><Field label="Descripción corta"><textarea rows={3} maxLength={500} value={clubFields.description} onChange={(event) => changed(setClubFields, { ...clubFields, description: event.target.value })} /></Field></> : null}
      {editor === 'story' ? <><Field label="Nuestra historia"><textarea rows={7} maxLength={4000} value={story} onChange={(event) => changed(setStory, event.target.value)} placeholder="Cómo nació el club y qué lo hace especial" /></Field><ImageField label="Imagen destacada opcional" image={storyImage?.public_url} onChange={(event) => void upload('STORY', event)} onRemove={storyImage ? () => void removeMedia(storyImage.id) : undefined} /></> : null}
      {editor === 'gallery' ? <><label className="clubProfileAdd"><Plus /> Agregar fotos<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void upload('GALLERY', event)} /></label><div className="clubProfileGallery">{gallery.map((item, index) => <article key={item.id}><img src={item.public_url} alt={item.alt_text || 'Foto del club'} /><div><GripVertical /><span>Foto {index + 1}</span><button type="button" onClick={() => void moveGallery(index, -1)} disabled={index === 0}>↑</button><button type="button" onClick={() => void moveGallery(index, 1)} disabled={index === gallery.length - 1}>↓</button><button type="button" onClick={() => void removeMedia(item.id)} aria-label="Eliminar"><Trash2 /></button></div></article>)}</div></> : null}
      {editor === 'facilities' ? <div className="clubProfileFacilities">{facilityOptions.map(([key, label]) => <label key={key}><input type="checkbox" checked={facilities.some((item) => item.facility_key === key)} onChange={() => toggleFacility(key, label)} /><span>{label}</span></label>)}</div> : null}
      {editor === 'contact' ? <><Field label="Dirección"><input value={clubFields.address} onChange={(event) => changed(setClubFields, { ...clubFields, address: event.target.value })} /></Field><div className="clubProfileTwo"><Field label="Teléfono"><input value={clubFields.phone} onChange={(event) => changed(setClubFields, { ...clubFields, phone: event.target.value })} /></Field><Field label="WhatsApp / celular"><input value={clubFields.mobile_phone} onChange={(event) => changed(setClubFields, { ...clubFields, mobile_phone: event.target.value })} /></Field></div><Field label="Email público"><input type="email" value={clubFields.contact_email} onChange={(event) => changed(setClubFields, { ...clubFields, contact_email: event.target.value })} /></Field><Field label="Website"><input value={clubFields.website} onChange={(event) => changed(setClubFields, { ...clubFields, website: event.target.value })} /></Field><Field label="Instagram"><input value={clubFields.instagram} onChange={(event) => changed(setClubFields, { ...clubFields, instagram: event.target.value })} /></Field></> : null}
    </div>{dirty ? <footer><button type="button" onClick={() => void load()}>Descartar</button><button type="button" onClick={() => void save()} disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button></footer> : null}</section></div> : null}
    {dirty && !editor ? <div className="clubProfileSticky"><button type="button" onClick={() => void load()}>Descartar</button><button type="button" onClick={() => void save()} disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button></div> : null}
    <Styles />
  </main>
}

function Section({ title, detail, onClick }: { title: string; detail: string; onClick: () => void }) { return <button type="button" onClick={onClick}><span><strong>{title}</strong><small>{detail}</small></span><ChevronRight /></button> }
function Metric({ value, label }: { value: number; label: string }) { return <article><strong>{value}</strong><span>{label}</span></article> }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="clubProfileField"><span>{label}</span>{children}</label> }
function ImageField({ label, image, onChange, onRemove }: { label: string; image?: string; onChange: (event: ChangeEvent<HTMLInputElement>) => void; onRemove?: () => void }) { return <div className="clubProfileImageField"><span>{label}</span>{image ? <img src={image} alt="" /> : <div><ImagePlus /> Sin imagen</div>}<section><label>Seleccionar<input type="file" accept="image/jpeg,image/png,image/webp" onChange={onChange} /></label>{onRemove ? <button type="button" onClick={onRemove}>Quitar</button> : null}</section></div> }
function editorTitle(editor: Exclude<Editor, null>) { return ({ identity: 'Portada e identidad', story: 'Nuestra historia', gallery: 'Galería', facilities: 'Instalaciones y servicios', contact: 'Contacto y redes' })[editor] }

function Styles() { return <style jsx global>{`
  .clubProfilePage{display:grid;gap:12px;margin:0 auto;max-width:1180px;padding:16px;width:100%}.clubProfileHead{align-items:center;background:#fff;border:1px solid #e2e8f0;border-radius:16px;display:flex;justify-content:space-between;padding:13px 15px}.clubProfileHead span,.clubProfileToday header span,.clubProfileSheet header span{color:var(--profile-accent,#16a34a);font-size:10px;font-weight:950;letter-spacing:.08em}.clubProfileHead h1,.clubProfileToday h2,.clubProfileSheet h2{color:#071a35;margin:3px 0 0}.clubProfileHead h1{font-size:25px}.clubProfileHeadActions{align-items:center;display:flex;gap:8px}.clubProfileHeadActions em{border-radius:999px;font-size:11px;font-style:normal;font-weight:900;padding:6px 9px}.clubProfileHeadActions em[data-status=PUBLISHED]{background:#eaf8e3;color:#327b13}.clubProfileHeadActions em[data-status=DRAFT]{background:#fff4d6;color:#946200}.clubProfileHeadActions a,.clubProfilePublish{background:#071a35;border:1px solid #164773;border-radius:10px;color:#fff;font-size:12px;font-weight:900;padding:9px 11px;text-decoration:none}.clubProfilePreview{align-items:end;background:linear-gradient(135deg,#123454,#071a35);background-position:center;background-size:cover;border-radius:18px;color:#fff;display:flex;gap:13px;min-height:190px;padding:16px}.clubProfileLogo{align-items:center;background:#fff;border:3px solid #fff;border-radius:16px;color:#173452;display:flex;height:72px;justify-content:center;overflow:hidden;width:72px}.clubProfileLogo img{height:100%;object-fit:contain;width:100%}.clubProfilePreview h2{font-size:24px;margin:0}.clubProfilePreview p{align-items:center;color:#d9e7f3;display:flex;font-size:12px;gap:4px;margin:3px 0}.clubProfilePreview p svg{height:13px;width:13px}.clubProfilePreview strong{font-size:13px}.clubProfileCompletion{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:10px 12px}.clubProfileCompletion div{display:flex;font-size:12px;justify-content:space-between}.clubProfileCompletion i{background:#e8eef3;border-radius:99px;display:block;height:5px;margin-top:7px;overflow:hidden}.clubProfileCompletion i b{background:var(--profile-accent);display:block;height:100%}.clubProfileSections{background:#fff;border:1px solid #e2e8f0;border-radius:16px;display:grid;padding:4px 12px}.clubProfileSections button{align-items:center;background:none;border:0;border-bottom:1px solid #edf1f5;color:#071a35;cursor:pointer;display:flex;justify-content:space-between;min-height:64px;padding:8px 2px;text-align:left}.clubProfileSections button:last-child{border-bottom:0}.clubProfileSections button span{display:grid;gap:3px}.clubProfileSections strong{font-size:14px}.clubProfileSections small{color:#708094;font-size:11px}.clubProfileSections svg{color:#8291a2;height:18px}.clubProfileToday{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:12px}.clubProfileToday h2{font-size:17px}.clubProfileToday>div{display:grid;gap:7px;grid-template-columns:repeat(3,1fr);margin-top:10px}.clubProfileToday article{background:#f6f8fb;border-radius:11px;display:grid;padding:9px;text-align:center}.clubProfileToday article strong{color:#071a35;font-size:20px}.clubProfileToday article span{color:#65768a;font-size:10px}.clubProfileMessage,.clubProfileError,.clubProfileSkeleton{background:#fff;border:1px solid #dce5ee;border-radius:13px;color:#53657a;margin:0;padding:13px}.clubProfilePublish{justify-self:end}.clubProfileBackdrop{align-items:end;background:#07152599;display:flex;inset:0;justify-content:center;position:fixed;z-index:100}.clubProfileSheet{background:#f7f9fc;border-radius:20px 20px 0 0;max-height:92dvh;overflow:auto;padding:14px 16px calc(14px + env(safe-area-inset-bottom));width:min(620px,100%)}.clubProfileSheet>header{align-items:center;display:flex;justify-content:space-between}.clubProfileSheet>header button{align-items:center;background:#fff;border:1px solid #dbe4ec;border-radius:50%;display:flex;height:38px;justify-content:center;width:38px}.clubProfileSheet h2{font-size:20px}.clubProfileSheetBody{display:grid;gap:11px;margin-top:13px}.clubProfileField{color:#50647a;display:grid;font-size:11px;font-weight:850;gap:5px}.clubProfileField input,.clubProfileField textarea{background:#fff;border:1px solid #d8e2eb;border-radius:11px;color:#071a35;font:inherit;font-size:16px;padding:10px 11px;width:100%}.clubProfileTwo{display:grid;gap:8px;grid-template-columns:1fr 1fr}.clubProfileImageField{display:grid;gap:7px}.clubProfileImageField>span{color:#50647a;font-size:11px;font-weight:850}.clubProfileImageField>img,.clubProfileImageField>div{align-items:center;background:#eaf0f5;border-radius:13px;display:flex;height:150px;justify-content:center;object-fit:cover;width:100%}.clubProfileImageField section{display:flex;gap:8px}.clubProfileImageField label,.clubProfileImageField button,.clubProfileAdd{background:#fff;border:1px solid #d8e2eb;border-radius:10px;color:#173452;cursor:pointer;font-size:12px;font-weight:900;padding:9px 11px}.clubProfileImageField input,.clubProfileAdd input{display:none}.clubProfileAdd{align-items:center;display:flex;gap:6px;justify-content:center}.clubProfileGallery{display:grid;gap:8px;grid-template-columns:1fr 1fr}.clubProfileGallery article{background:#fff;border:1px solid #dde5ed;border-radius:12px;overflow:hidden}.clubProfileGallery img{height:105px;object-fit:cover;width:100%}.clubProfileGallery article div{align-items:center;display:flex;gap:4px;padding:6px}.clubProfileGallery article div span{font-size:10px;margin-right:auto}.clubProfileGallery button{background:none;border:0;height:30px}.clubProfileGallery button svg{height:14px}.clubProfileFacilities{display:grid;gap:7px;grid-template-columns:1fr 1fr}.clubProfileFacilities label{align-items:center;background:#fff;border:1px solid #dce5ed;border-radius:11px;display:flex;font-size:12px;font-weight:800;gap:8px;min-height:44px;padding:8px}.clubProfileSheet footer,.clubProfileSticky{background:#fff;border-top:1px solid #dce5ed;bottom:0;display:flex;gap:8px;margin:12px -16px -14px;padding:10px 16px calc(10px + env(safe-area-inset-bottom));position:sticky}.clubProfileSheet footer button,.clubProfileSticky button{border:1px solid #d8e2eb;border-radius:11px;flex:1;font-weight:900;min-height:44px}.clubProfileSheet footer button:last-child,.clubProfileSticky button:last-child{background:#071a35;color:#fff}.clubProfileSticky{border:1px solid #dce5ed;border-radius:14px;margin:0;z-index:10}
  @media(max-width:760px){.clubProfilePage{gap:9px;padding:0}.clubProfileHead{border-radius:14px;padding:10px 11px}.clubProfileHead h1{font-size:22px}.clubProfileHeadActions{align-items:flex-end;display:grid;justify-items:end}.clubProfileHeadActions a{padding:7px 9px}.clubProfilePreview{border-radius:15px;min-height:154px;padding:12px}.clubProfileLogo{height:60px;width:60px}.clubProfilePreview h2{font-size:21px}.clubProfileSections button{min-height:58px}.clubProfileToday{padding:10px}.clubProfilePublish{min-height:42px;width:100%}}
  @media(max-width:340px){.clubProfileHeadActions a{font-size:10px}.clubProfileLogo{height:54px;width:54px}.clubProfileGallery{grid-template-columns:1fr}.clubProfileTwo{grid-template-columns:1fr}}
`}</style> }
