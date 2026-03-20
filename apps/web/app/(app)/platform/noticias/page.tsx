'use client'

import { useEffect, useMemo, useState } from 'react'
import AuthAlert from '@/components/AuthAlert'
import PlatformModuleShell from '@/components/platform/PlatformModuleShell'
import { supabase } from '@/lib/supabaseClient'

type NewsRow = {
  id: string
  title: string
  slug: string
  excerpt: string | null
  body: string | null
  cover_url: string | null
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  placement: 'HERO' | 'GRID' | 'ARCHIVE'
  published_at: string | null
  created_at: string
}

type AlertState = { variant: 'success' | 'warning' | 'error' | 'info'; title: string; message?: string } | null
const emptyForm = { title: '', slug: '', excerpt: '', body: '', placement: 'GRID', status: 'DRAFT' }

function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export default function PlatformNoticiasPage() {
  const [rows, setRows] = useState<NewsRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [cover, setCover] = useState<File | null>(null)
  const [keepCover, setKeepCover] = useState(true)
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
    if (!token) {
      setAlert({ variant: 'warning', title: 'Sesión expirada', message: 'Volvé a iniciar sesión.' })
      setLoading(false)
      return
    }
    const res = await fetch('/api/platform/news', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (json?.setupRequired) setSetupRequired(json?.detail || json?.error || 'Falta migración de contenido.')
      else setAlert({ variant: 'error', title: 'No pude cargar noticias', message: json?.error || 'Error inesperado.' })
      setLoading(false)
      return
    }
    setSetupRequired(null)
    const nextRows = json.rows || []
    setRows(nextRows)
    setSelectedId((cur) => cur ?? nextRows[0]?.id ?? null)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const selected = useMemo(() => rows.find((row) => row.id === selectedId) ?? null, [rows, selectedId])

  const metrics = [
    { label: 'Publicadas', value: String(rows.filter((row) => row.status === 'PUBLISHED').length) },
    { label: 'Borradores', value: String(rows.filter((row) => row.status === 'DRAFT').length) },
    { label: 'Archivadas', value: String(rows.filter((row) => row.status === 'ARCHIVED').length) },
    { label: 'Hero activo', value: String(rows.filter((row) => row.status === 'PUBLISHED' && row.placement === 'HERO').length) },
  ]

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setCover(null)
    setKeepCover(true)
    setOpen(true)
  }

  function openEdit(row: NewsRow) {
    setEditingId(row.id)
    setForm({
      title: row.title || '',
      slug: row.slug || '',
      excerpt: row.excerpt || '',
      body: row.body || '',
      placement: row.placement || 'GRID',
      status: row.status || 'DRAFT',
    })
    setCover(null)
    setKeepCover(Boolean(row.cover_url))
    setOpen(true)
  }

  function closeModal() {
    if (saving) return
    setOpen(false)
    setEditingId(null)
    setForm(emptyForm)
    setCover(null)
    setKeepCover(true)
  }

  function buildFormData() {
    const fd = new FormData()
    fd.set('title', form.title)
    fd.set('slug', form.slug)
    fd.set('excerpt', form.excerpt)
    fd.set('body', form.body)
    fd.set('placement', form.placement)
    fd.set('status', form.status)
    fd.set('keepCover', keepCover ? '1' : '0')
    if (cover) fd.set('cover', cover)
    return fd
  }

  async function save() {
    const token = await getToken()
    if (!token) return
    setSaving(true)
    const res = await fetch(editingId ? `/api/platform/news/${editingId}` : '/api/platform/news', {
      method: editingId ? 'PATCH' : 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: buildFormData(),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      if (json?.setupRequired) setSetupRequired(json?.detail || json?.error || 'Falta migración de contenido.')
      else setAlert({ variant: 'error', title: editingId ? 'No pude guardar cambios' : 'No pude guardar la noticia', message: json?.error || 'Error inesperado.' })
      return
    }
    setAlert({ variant: 'success', title: editingId ? 'Noticia actualizada' : 'Noticia creada', message: 'Los cambios quedaron guardados.' })
    closeModal()
    await load()
  }

  async function remove(row: NewsRow) {
    const token = await getToken()
    if (!token || !window.confirm(`Eliminar “${row.title}”?`)) return
    const res = await fetch(`/api/platform/news/${row.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (json?.setupRequired) setSetupRequired(json?.detail || json?.error || 'Falta migración de contenido.')
      else setAlert({ variant: 'error', title: 'No pude eliminar la noticia', message: json?.error || 'Error inesperado.' })
      return
    }
    if (selectedId === row.id) setSelectedId(null)
    setAlert({ variant: 'success', title: 'Noticia eliminada' })
    await load()
  }

  return (
    <PlatformModuleShell
      title="Noticias platform"
      subtitle="Administrá noticias reales del home y del archivo público, con imagen de portada y publicación directa."
      metrics={metrics}
      actions={
        <>
          <button className="px-btn" type="button" onClick={openCreate}>Nueva noticia</button>
          <button className="px-btn px-btn--soft" type="button" onClick={load}>Recargar</button>
        </>
      }
      quickActions={[
        { title: 'Hero del index', description: 'La noticia con placement HERO y estado publicado ocupa la portada principal.', tag: 'Home' },
        { title: 'Archivo público', description: 'Todo lo publicado aparece en /noticias y tiene detalle propio.', tag: 'SEO' },
      ]}
      aside={
        <div className="px-platformCard">
          <div className="px-sectionTitle">Editor rápido</div>
          <div className="px-platformChecklist">
            <div>Usá título corto y bajada clara.</div>
            <div>Subí una imagen horizontal para el hero.</div>
            <div>Publicá directo o dejá en borrador.</div>
          </div>
          {selected ? (
            <div style={{ marginTop: 18 }}>
              <div className="px-sectionTitle">Seleccionada</div>
              <div className="px-contentItem" style={{ padding: 12 }}>
                <div className="px-contentItemTitle">{selected.title}</div>
                <div className="px-contentMeta">
                  <span>{selected.placement}</span>
                  <span>{selected.status}</span>
                  <span>{formatDate(selected.published_at || selected.created_at)}</span>
                </div>
                {selected.cover_url ? <img src={selected.cover_url} alt={selected.title} className="px-mediaPreview" /> : null}
              </div>
            </div>
          ) : null}
        </div>
      }
    >
      {alert ? <AuthAlert variant={alert.variant} title={alert.title} message={alert.message} /> : null}
      {setupRequired ? <AuthAlert variant="warning" title="Contenido no inicializado" message={setupRequired} /> : null}

      <div className="px-contentList px-contentList--compact" style={{ marginTop: 14 }}>
        {loading ? <div className="px-empty">Cargando noticias…</div> : null}
        {!loading && !rows.length ? <div className="px-empty">Todavía no hay noticias cargadas.</div> : null}
        {rows.map((row) => (
          <div key={row.id} className={`px-contentItem ${selectedId === row.id ? 'is-selected' : ''}`} style={{ cursor: 'default' }}>
            <div className="px-contentItemHead">
              <div onClick={() => setSelectedId(row.id)} style={{ cursor: 'pointer', flex: 1 }}>
                <div className="px-contentItemTitle">{row.title}</div>
                <div className="px-contentMeta">
                  <span>{row.slug}</span>
                  <span>{row.placement}</span>
                  <span>{row.status}</span>
                  <span>{formatDate(row.published_at || row.created_at)}</span>
                </div>
              </div>
              <div className="px-contentActions">
                <button className="px-btn px-btn--soft px-btn--xs" type="button" onClick={() => openEdit(row)}>Editar</button>
                <button className="px-btn px-btn--danger px-btn--xs" type="button" onClick={() => remove(row)}>Eliminar</button>
              </div>
            </div>
            {row.excerpt ? <div className="px-platformSub">{row.excerpt}</div> : null}
          </div>
        ))}
      </div>

      {open ? (
        <div className="px-overlay" onClick={closeModal}>
          <div className="px-modalCard px-contentModal" onClick={(e) => e.stopPropagation()}>
            <div className="px-modalHead">
              <div>
                <h3 className="px-modalTitle">{editingId ? 'Editar noticia' : 'Nueva noticia'}</h3>
                <div className="px-modalSub">Mismo patrón visual que el resto del panel.</div>
              </div>
              <button className="px-btn px-btn--soft px-btn--xs" type="button" onClick={closeModal}>Cerrar</button>
            </div>
            <div className="px-formGrid">
              <label className="px-field px-formGridSpan2">
                <span>Título</span>
                <input className="px-input" value={form.title} onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))} />
              </label>
              <label className="px-field px-formGridSpan2">
                <span>Slug</span>
                <input className="px-input" placeholder="se genera si lo dejás vacío" value={form.slug} onChange={(e) => setForm((s) => ({ ...s, slug: e.target.value }))} />
              </label>
              <label className="px-field px-formGridSpan2">
                <span>Bajada</span>
                <input className="px-input" value={form.excerpt} onChange={(e) => setForm((s) => ({ ...s, excerpt: e.target.value }))} />
              </label>
              <label className="px-field">
                <span>Placement</span>
                <select className="px-select" value={form.placement} onChange={(e) => setForm((s) => ({ ...s, placement: e.target.value as any }))}>
                  <option value="HERO">Hero</option>
                  <option value="GRID">Grid</option>
                  <option value="ARCHIVE">Archivo</option>
                </select>
              </label>
              <label className="px-field">
                <span>Estado</span>
                <select className="px-select" value={form.status} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value as any }))}>
                  <option value="DRAFT">Borrador</option>
                  <option value="PUBLISHED">Publicado</option>
                  <option value="ARCHIVED">Archivado</option>
                </select>
              </label>
              <label className="px-field px-formGridSpan2">
                <span>Contenido</span>
                <textarea className="px-input px-textarea" value={form.body} onChange={(e) => setForm((s) => ({ ...s, body: e.target.value }))} />
              </label>
              <label className="px-field px-formGridSpan2">
                <span>Portada</span>
                <input type="file" accept="image/*" onChange={(e) => setCover(e.target.files?.[0] || null)} />
              </label>
              {editingId ? (
                <label className="px-checkboxLine px-formGridSpan2">
                  <input type="checkbox" checked={keepCover} onChange={(e) => setKeepCover(e.target.checked)} />
                  Mantener imagen actual si no subo otra.
                </label>
              ) : null}
            </div>
            <div className="px-platformDecisionActions" style={{ marginTop: 18 }}>
              <button className="px-btn px-btn--soft" type="button" onClick={closeModal}>Cancelar</button>
              <button className="px-btn" type="button" onClick={save} disabled={saving}>{saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear noticia'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </PlatformModuleShell>
  )
}
