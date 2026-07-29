'use client'

import { FormEvent, type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Edit3, Eye, FileText, ImageIcon, MoreVertical, Plus, Send, Trash2, X } from 'lucide-react'
import { useSession } from '@/components/session/SessionProvider'
import { supabase } from '@/lib/supabaseClient'
import { getClubTheme } from '@/lib/clubThemes'

type NewsStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'

type ClubNewsRow = {
  id: string
  club_id: string | null
  title: string
  slug: string
  excerpt: string | null
  body: string | null
  cover_url: string | null
  status: NewsStatus
  metadata: {
    inline_images?: string[] | null
    featured_rank?: 1 | 2 | 3 | null
  } | null
  published_at: string | null
  created_at: string
  updated_at: string
}

type NewsFormState = {
  title: string
  excerpt: string
  body: string
  cover_url: string
  inline_image_1: string
  inline_image_2: string
  featured_rank: '' | '1' | '2' | '3'
  status: NewsStatus
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

const emptyForm: NewsFormState = {
  title: '',
  excerpt: '',
  body: '',
  cover_url: '',
  inline_image_1: '',
  inline_image_2: '',
  featured_rank: '',
  status: 'DRAFT',
}

function formatDate(value?: string | null) {
  if (!value) return 'Sin publicar'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin publicar'
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date).replace('.', '')
}

function statusLabel(status?: string | null) {
  if (status === 'PUBLISHED') return 'Publicada'
  if (status === 'ARCHIVED') return 'Archivada'
  return 'Borrador'
}

function statusClass(status?: string | null) {
  if (status === 'PUBLISHED') return 'is-published'
  if (status === 'ARCHIVED') return 'is-archived'
  return 'is-draft'
}

export default function ClubNoticiasPage() {
  const { activeClub } = useSession()
  const clubId = activeClub?.id ?? null
  const clubName = activeClub?.name ?? 'tu club'
  const [themeKey, setThemeKey] = useState<string | null>(null)
  const [themeLoaded, setThemeLoaded] = useState(false)
  const theme = getClubTheme(themeKey)
  const themeReady = !clubId || themeLoaded

  const [rows, setRows] = useState<ClubNewsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ClubNewsRow | null>(null)
  const [form, setForm] = useState<NewsFormState>(emptyForm)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [middleImageFile, setMiddleImageFile] = useState<File | null>(null)
  const [finalImageFile, setFinalImageFile] = useState<File | null>(null)
  const [keepCover, setKeepCover] = useState(true)
  const [keepInlineImages, setKeepInlineImages] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const stats = useMemo(() => {
    const published = rows.filter((row) => row.status === 'PUBLISHED').length
    const drafts = rows.filter((row) => row.status === 'DRAFT').length
    const archived = rows.filter((row) => row.status === 'ARCHIVED').length
    return [
      { label: 'Publicadas', value: published, detail: 'Visibles en la home del club' },
      { label: 'Borradores', value: drafts, detail: 'En preparación' },
      { label: 'Archivadas', value: archived, detail: 'Fuera de portada' },
      { label: 'Total', value: rows.length, detail: 'Noticias del club' },
    ]
  }, [rows])
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const visiblePage = Math.min(currentPage, totalPages)
  const paginatedRows = useMemo(() => {
    const start = (visiblePage - 1) * pageSize
    return rows.slice(start, start + pageSize)
  }, [pageSize, rows, visiblePage])

  const previewCover = useMemo(() => {
    if (coverFile) return URL.createObjectURL(coverFile)
    if (form.cover_url) return form.cover_url
    if (editing?.cover_url && keepCover) return editing.cover_url
    return null
  }, [coverFile, editing, form.cover_url, keepCover])

  useEffect(() => {
    return () => {
      if (previewCover && coverFile) URL.revokeObjectURL(previewCover)
    }
  }, [coverFile, previewCover])

  async function getToken() {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  }

  const loadRows = useCallback(async () => {
    if (!clubId) {
      setRows([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const token = await getToken()
      if (!token) throw new Error('Sesión inválida.')
      const res = await fetch(`/api/clubs/${clubId}/news`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload?.error || 'No pude cargar las noticias.')
      setRows(Array.isArray(payload.rows) ? payload.rows : [])
    } catch (err: unknown) {
      setError(errorMessage(err, 'No pude cargar las noticias.'))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [clubId])

  useEffect(() => {
    void Promise.resolve().then(loadRows)
  }, [loadRows])

  useEffect(() => {
    let mounted = true
    async function loadTheme() {
      setThemeLoaded(false)
      if (!clubId) {
        setThemeKey(null)
        setThemeLoaded(true)
        return
      }
      const { data } = await supabase.from('clubs').select('theme_key').eq('id', clubId).maybeSingle()
      if (mounted) {
        setThemeKey(typeof data?.theme_key === 'string' ? data.theme_key : null)
        setThemeLoaded(true)
      }
    }
    loadTheme()
    return () => {
      mounted = false
    }
  }, [clubId])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setCoverFile(null)
    setMiddleImageFile(null)
    setFinalImageFile(null)
    setKeepCover(true)
    setKeepInlineImages(true)
    setFeedback(null)
    setError(null)
    setModalOpen(true)
  }

  function openEdit(row: ClubNewsRow) {
    setEditing(row)
    setForm({
      title: row.title,
      excerpt: row.excerpt ?? '',
      body: row.body ?? '',
      cover_url: '',
      inline_image_1: '',
      inline_image_2: '',
      featured_rank: row.metadata?.featured_rank ? String(row.metadata.featured_rank) as NewsFormState['featured_rank'] : '',
      status: row.status,
    })
    setCoverFile(null)
    setMiddleImageFile(null)
    setFinalImageFile(null)
    setKeepCover(Boolean(row.cover_url))
    setKeepInlineImages(Boolean(row.metadata?.inline_images?.length))
    setFeedback(null)
    setError(null)
    setModalOpen(true)
  }

  function buildFormData(nextStatus = form.status) {
    const data = new FormData()
    data.set('title', form.title)
    data.set('excerpt', form.excerpt)
    data.set('body', form.body)
    data.set('cover_url', form.cover_url)
    data.set('inline_image_1', form.inline_image_1)
    data.set('inline_image_2', form.inline_image_2)
    data.set('featured_rank', form.featured_rank)
    data.set('status', nextStatus)
    data.set('keepCover', keepCover ? '1' : '0')
    data.set('keepInlineImages', keepInlineImages ? '1' : '0')
    data.set('existingInlineImages', JSON.stringify(editing?.metadata?.inline_images ?? []))
    if (coverFile) data.append('cover', coverFile)
    if (middleImageFile) data.append('inlineImages', middleImageFile)
    if (finalImageFile) data.append('inlineImages', finalImageFile)
    return data
  }

  async function saveNews(event?: FormEvent<HTMLFormElement>, forcedStatus?: NewsStatus) {
    event?.preventDefault()
    if (!clubId || saving) return
    setSaving(true)
    setError(null)
    setFeedback(null)
    try {
      const token = await getToken()
      if (!token) throw new Error('Sesión inválida.')
      const endpoint = editing ? `/api/clubs/${clubId}/news/${editing.id}` : `/api/clubs/${clubId}/news`
      const res = await fetch(endpoint, {
        method: editing ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: buildFormData(forcedStatus ?? form.status),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload?.error || 'No pude guardar la noticia.')
      setModalOpen(false)
      setFeedback(forcedStatus === 'PUBLISHED' || form.status === 'PUBLISHED' ? 'Noticia publicada.' : 'Noticia guardada.')
      await loadRows()
    } catch (err: unknown) {
      setError(errorMessage(err, 'No pude guardar la noticia.'))
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(row: ClubNewsRow, status: NewsStatus) {
    if (!clubId || saving) return
    setSaving(true)
    setError(null)
    setFeedback(null)
    try {
      const token = await getToken()
      if (!token) throw new Error('Sesión inválida.')
      const data = new FormData()
      data.set('title', row.title)
      data.set('excerpt', row.excerpt ?? '')
      data.set('body', row.body ?? '')
      data.set('cover_url', row.cover_url ?? '')
      data.set('featured_rank', row.metadata?.featured_rank ? String(row.metadata.featured_rank) : '')
      data.set('status', status)
      data.set('keepCover', '1')
      data.set('keepInlineImages', '1')
      data.set('existingInlineImages', JSON.stringify(row.metadata?.inline_images ?? []))
      const res = await fetch(`/api/clubs/${clubId}/news/${row.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: data,
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload?.error || 'No pude actualizar el estado.')
      setFeedback(status === 'PUBLISHED' ? 'Noticia publicada.' : 'Noticia despublicada.')
      await loadRows()
    } catch (err: unknown) {
      setError(errorMessage(err, 'No pude actualizar el estado.'))
    } finally {
      setSaving(false)
    }
  }

  async function deleteNews(row: ClubNewsRow) {
    if (!clubId || saving) return
    const confirmed = window.confirm(`¿Eliminar "${row.title}"? Esta acción no se puede deshacer.`)
    if (!confirmed) return
    setSaving(true)
    setError(null)
    setFeedback(null)
    try {
      const token = await getToken()
      if (!token) throw new Error('Sesión inválida.')
      const res = await fetch(`/api/clubs/${clubId}/news/${row.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload?.error || 'No pude eliminar la noticia.')
      setFeedback('Noticia eliminada.')
      await loadRows()
    } catch (err: unknown) {
      setError(errorMessage(err, 'No pude eliminar la noticia.'))
    } finally {
      setSaving(false)
    }
  }

  const style = {
    '--club-accent': theme.vars.accent,
    '--club-accent-2': theme.vars.accent2,
    '--club-glow': theme.vars.glow,
    '--club-soft': theme.vars.soft,
    opacity: themeReady ? 1 : 0,
  } as CSSProperties

  return (
    <div className="clubNewsShell" style={style}>
      <section className="clubNewsHero">
        <div>
          <span className="clubNewsKicker">Contenido del club</span>
          <h1>Noticias del club</h1>
          <p>Publicá novedades, comunicados y coberturas propias de {clubName}.</p>
        </div>
        <button className="clubNewsPrimary" type="button" onClick={openCreate}>
          <Plus size={18} />
          Nueva noticia
        </button>
      </section>

      {error ? <div className="clubNewsAlert is-error">{error}</div> : null}
      {feedback ? <div className="clubNewsAlert is-ok">{feedback}</div> : null}

      <section className="clubNewsStats" aria-label="Resumen editorial">
        {stats.map((stat) => (
          <article className="clubNewsStat" key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>{stat.detail}</small>
          </article>
        ))}
      </section>

      <section className="clubNewsBoard">
        <div className="clubNewsBoardHead">
          <div>
            <span className="clubNewsKicker">Editorial</span>
            <h2>Noticias cargadas</h2>
          </div>
          <div className="clubNewsBoardTools">
            <label>
              <span>Mostrar</span>
              <select value={pageSize} onChange={(event) => {
                setPageSize(Number(event.target.value))
                setCurrentPage(1)
              }}>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </label>
            <span>{loading ? 'Cargando...' : `${rows.length} registros`}</span>
          </div>
        </div>

        {loading ? (
          <div className="clubNewsSkeletons" aria-busy="true" aria-label="Cargando noticias">
            {[0, 1, 2].map((item) => <span key={item} />)}
          </div>
        ) : rows.length ? (
          <div className="clubNewsList">
            {paginatedRows.map((row) => (
              <article className="clubNewsRow" key={row.id}>
                <button className="clubNewsRowLink" type="button" onClick={() => openEdit(row)} aria-label={`Editar ${row.title}`} />
                <div className="clubNewsThumb">
                  {row.cover_url ? <img src={row.cover_url} alt={row.title} /> : <ImageIcon size={20} />}
                </div>
                <div className="clubNewsInfo">
                  <div>
                    <h3>{row.title}</h3>
                    <span className={`clubNewsBadge ${statusClass(row.status)}`}>{statusLabel(row.status)}</span>
                  </div>
                  <p>{row.excerpt || 'Sin bajada cargada.'}</p>
                  <small>
                    <CalendarDays size={13} />
                    {row.status === 'PUBLISHED' ? `Publicada: ${formatDate(row.published_at)}` : `Última edición: ${formatDate(row.updated_at)}`}
                  </small>
                </div>
                <details className="clubNewsActions">
                  <summary aria-label={`Acciones para ${row.title}`}><MoreVertical size={18} /></summary>
                  <div>
                  <button type="button" onClick={() => openEdit(row)}>
                    <Edit3 size={15} />
                    Editar
                  </button>
                  {row.status === 'PUBLISHED' ? (
                    <button type="button" onClick={() => changeStatus(row, 'DRAFT')} disabled={saving}>
                      <Eye size={15} />
                      Despublicar
                    </button>
                  ) : (
                    <button type="button" onClick={() => changeStatus(row, 'PUBLISHED')} disabled={saving}>
                      <Send size={15} />
                      Publicar
                    </button>
                  )}
                  <button className="is-danger" type="button" onClick={() => deleteNews(row)} disabled={saving}>
                    <Trash2 size={15} />
                    Eliminar
                  </button>
                  </div>
                </details>
              </article>
            ))}
            {rows.length ? (
              <div className="clubNewsPagination" aria-label="Paginación de noticias">
                <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1}>
                  Anterior
                </button>
                <span>Página {visiblePage} de {totalPages}</span>
                <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages}>
                  Siguiente
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="clubNewsEmpty">
            <FileText size={26} />
            <strong>Todavía no hay noticias del club</strong>
            <p>Creá la primera novedad para que aparezca en la home pública del club.</p>
            <button type="button" onClick={openCreate}>Crear noticia</button>
          </div>
        )}
      </section>

      {modalOpen ? (
        <div className="clubNewsModal" role="dialog" aria-modal="true">
          <form className="clubNewsModalCard" onSubmit={(event) => saveNews(event)}>
            <header className="clubNewsModalHead">
              <div>
                <span className="clubNewsKicker">{editing ? 'Editar noticia' : 'Nueva noticia'}</span>
                <h2>{editing ? editing.title : 'Contenido del club'}</h2>
              </div>
              <button type="button" className="clubNewsIconBtn" onClick={() => setModalOpen(false)} aria-label="Cerrar">
                <X size={18} />
              </button>
            </header>

            <div className="clubNewsEditorGrid">
              <section className="clubNewsFormBlock">
                <label>
                  <span>Título</span>
                  <input value={form.title} onChange={(event) => setForm((state) => ({ ...state, title: event.target.value }))} required maxLength={120} />
                </label>
                <label>
                  <span>Bajada</span>
                  <textarea rows={3} value={form.excerpt} onChange={(event) => setForm((state) => ({ ...state, excerpt: event.target.value }))} placeholder="Resumen breve para cards y destacados." />
                </label>
                <label>
                  <span>Cuerpo</span>
                  <textarea rows={10} value={form.body} onChange={(event) => setForm((state) => ({ ...state, body: event.target.value }))} placeholder="Escribí el comunicado o la cobertura del club." />
                </label>
              </section>

              <aside className="clubNewsFormBlock">
                <div className="clubNewsPreview">
                  {previewCover ? <img src={previewCover} alt="Preview noticia" /> : <div><ImageIcon size={24} />Sin imagen</div>}
                  <span>{statusLabel(form.status)}</span>
                  <strong>{form.title || 'Título de la noticia'}</strong>
                  <p>{form.excerpt || 'La bajada va a aparecer en las cards públicas del club.'}</p>
                </div>
                <label>
                  <span>Estado</span>
                  <select value={form.status} onChange={(event) => setForm((state) => ({ ...state, status: event.target.value as NewsStatus }))}>
                    <option value="DRAFT">Borrador</option>
                    <option value="PUBLISHED">Publicada</option>
                  </select>
                </label>
                <label>
                  <span>Destacada en home pública</span>
                  <select value={form.featured_rank} onChange={(event) => setForm((state) => ({ ...state, featured_rank: event.target.value as NewsFormState['featured_rank'] }))}>
                    <option value="">Automático</option>
                    <option value="1">Principal</option>
                    <option value="2">Secundaria 1</option>
                    <option value="3">Secundaria 2</option>
                  </select>
                </label>
                <label>
                  <span>Imagen principal</span>
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => setCoverFile(event.target.files?.[0] ?? null)} />
                </label>
                <label>
                  <span>O pegar URL de imagen</span>
                  <input value={form.cover_url} onChange={(event) => setForm((state) => ({ ...state, cover_url: event.target.value }))} placeholder="https://..." />
                </label>
                {editing?.cover_url ? (
                  <label className="clubNewsCheck">
                    <input type="checkbox" checked={keepCover} onChange={(event) => setKeepCover(event.target.checked)} />
                    Mantener imagen actual
                  </label>
                ) : null}
                <label>
                  <span>Imagen media de la noticia</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={(event) => setMiddleImageFile(event.target.files?.[0] ?? null)}
                  />
                </label>
                <label>
                  <span>Imagen final de la noticia</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={(event) => setFinalImageFile(event.target.files?.[0] ?? null)}
                  />
                </label>
                {editing?.metadata?.inline_images?.length ? (
                  <label className="clubNewsCheck">
                    <input type="checkbox" checked={keepInlineImages} onChange={(event) => setKeepInlineImages(event.target.checked)} />
                    Mantener imágenes internas actuales
                  </label>
                ) : null}
              </aside>
            </div>

            <footer className="clubNewsModalActions">
              <button type="button" className="clubNewsSecondary" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button type="submit" className="clubNewsSecondary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar borrador'}</button>
              <button type="button" className="clubNewsPrimary" onClick={() => saveNews(undefined, 'PUBLISHED')} disabled={saving}>
                <Send size={16} />
                Publicar
              </button>
            </footer>
          </form>
        </div>
      ) : null}

      <style jsx>{`
        .clubNewsShell { display: grid; gap: 16px; overflow-x: hidden; }
        .clubNewsHero, .clubNewsBoard, .clubNewsModalCard {
          background: rgba(255,255,255,.94);
          border: 1px solid rgba(15,23,42,.08);
          border-radius: 20px;
          box-shadow: 0 18px 44px rgba(15,23,42,.08);
          overflow: hidden;
          position: relative;
        }
        .clubNewsHero::before, .clubNewsBoard::before, .clubNewsModalCard::before {
          background: linear-gradient(90deg, var(--club-accent), var(--club-accent-2));
          content: "";
          height: 4px;
          left: 0;
          position: absolute;
          right: 0;
          top: 0;
        }
        .clubNewsHero { align-items: center; display: flex; gap: 14px; justify-content: space-between; padding: 16px 18px; }
        .clubNewsKicker { color: var(--club-accent); display: inline-block; font-size: 11px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
        .clubNewsHero h1, .clubNewsModalHead h2 { color: #061b3a; font-size: clamp(26px, 3.4vw, 38px); font-weight: 950; letter-spacing: -.04em; line-height: .98; margin: 4px 0 5px; }
        .clubNewsHero p { color: rgba(23,37,63,.68); font-size: 13px; font-weight: 740; margin: 0; max-width: 680px; }
        .clubNewsPrimary, .clubNewsSecondary, .clubNewsActions button, .clubNewsEmpty button {
          align-items: center;
          border-radius: 999px;
          cursor: pointer;
          display: inline-flex;
          font: inherit;
          font-size: 13px;
          font-weight: 900;
          gap: 8px;
          justify-content: center;
          min-height: 40px;
          padding: 0 16px;
          transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease;
        }
        .clubNewsPrimary {
          background: #061b3a;
          border: 1px solid color-mix(in srgb, var(--club-accent) 58%, #061b3a);
          box-shadow: 0 14px 30px var(--club-glow);
          color: #fff;
        }
        .clubNewsPrimary:hover, .clubNewsActions button:hover, .clubNewsEmpty button:hover { transform: translateY(-1px); box-shadow: 0 18px 34px var(--club-glow); }
        .clubNewsSecondary, .clubNewsActions button {
          background: #fff;
          border: 1px solid rgba(15,23,42,.12);
          color: #061b3a;
        }
        .clubNewsSecondary:hover { border-color: var(--club-accent); transform: translateY(-1px); }
        .clubNewsStats { display: grid; gap: 12px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .clubNewsStat {
          background: rgba(255,255,255,.9);
          border: 1px solid rgba(15,23,42,.08);
          border-radius: 16px;
          box-shadow: 0 12px 26px rgba(15,23,42,.05);
          display: grid;
          gap: 5px;
          padding: 15px;
        }
        .clubNewsStat span, .clubNewsStat small { color: rgba(23,37,63,.62); font-size: 12px; font-weight: 800; }
        .clubNewsStat strong { color: #061b3a; font-size: 30px; font-weight: 950; line-height: 1; }
        .clubNewsBoard { padding: 20px; }
        .clubNewsBoardHead { align-items: center; display: flex; gap: 12px; justify-content: space-between; margin-bottom: 14px; }
        .clubNewsBoardHead h2 { color: #061b3a; font-size: 20px; font-weight: 950; margin: 4px 0 0; }
        .clubNewsBoardTools { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
        .clubNewsBoardTools > span, .clubNewsBoardTools label { background: var(--club-soft); border: 1px solid rgba(15,23,42,.08); border-radius: 999px; color: #334155; font-size: 12px; font-weight: 850; padding: 7px 10px; }
        .clubNewsBoardTools label { align-items: center; display: inline-flex; gap: 7px; }
        .clubNewsBoardTools select { background: #fff; border: 1px solid rgba(15,23,42,.12); border-radius: 999px; color: #061b3a; font: inherit; font-size: 12px; font-weight: 900; padding: 3px 7px; }
        .clubNewsList { display: grid; gap: 10px; }
        .clubNewsSkeletons { display:grid; gap:8px }
        .clubNewsSkeletons span { animation:clubNewsPulse 1.2s ease-in-out infinite alternate; background:#e8edf2; border-radius:12px; min-height:72px }
        @keyframes clubNewsPulse { to { opacity:.48 } }
        .clubNewsPagination {
          align-items: center;
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          padding-top: 6px;
        }
        .clubNewsPagination span {
          color: rgba(23,37,63,.62);
          font-size: 12px;
          font-weight: 850;
        }
        .clubNewsPagination button {
          background: #fff;
          border: 1px solid rgba(15,23,42,.12);
          border-radius: 999px;
          color: #061b3a;
          cursor: pointer;
          font: inherit;
          font-size: 12px;
          font-weight: 900;
          min-height: 32px;
          padding: 0 12px;
          transition: transform .18s ease, border-color .18s ease;
        }
        .clubNewsPagination button:hover:not(:disabled) {
          border-color: var(--club-accent);
          transform: translateY(-1px);
        }
        .clubNewsPagination button:disabled {
          cursor: not-allowed;
          opacity: .52;
        }
        .clubNewsRow {
          align-items: center;
          background: #fff;
          border: 1px solid rgba(15,23,42,.08);
          border-radius: 16px;
          display: grid;
          gap: 12px;
          grid-template-columns: 82px minmax(0, 1fr) auto;
          padding: 10px;
          position: relative;
          transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease;
        }
        .clubNewsRowLink { display: none; }
        .clubNewsRow:hover { border-color: color-mix(in srgb, var(--club-accent) 36%, rgba(15,23,42,.1)); box-shadow: 0 14px 28px rgba(15,23,42,.08); transform: translateY(-1px); }
        .clubNewsThumb {
          align-items: center;
          aspect-ratio: 4 / 3;
          background: var(--club-soft);
          border-radius: 12px;
          color: var(--club-accent);
          display: flex;
          justify-content: center;
          overflow: hidden;
          width: 82px;
        }
        .clubNewsThumb img, .clubNewsPreview img { display: block; height: 100%; object-fit: cover; width: 100%; }
        .clubNewsInfo { display: grid; gap: 5px; min-width: 0; }
        .clubNewsInfo > div { align-items: center; display: flex; gap: 8px; min-width: 0; }
        .clubNewsInfo h3 { color: #061b3a; font-size: 16px; font-weight: 950; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .clubNewsInfo p { color: rgba(23,37,63,.64); font-size: 13px; font-weight: 650; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .clubNewsInfo small { align-items: center; color: rgba(23,37,63,.54); display: inline-flex; font-size: 12px; font-weight: 800; gap: 5px; }
        .clubNewsBadge {
          border-radius: 999px;
          flex: 0 0 auto;
          font-size: 11px;
          font-weight: 900;
          padding: 5px 8px;
        }
        .clubNewsBadge.is-published { background: rgba(16,185,129,.14); color: #047857; }
        .clubNewsBadge.is-draft { background: rgba(245,158,11,.16); color: #b45309; }
        .clubNewsBadge.is-archived { background: rgba(100,116,139,.14); color: #475569; }
        .clubNewsActions { justify-self: end; position: relative; }
        .clubNewsActions summary { align-items:center; background:#fff; border:1px solid rgba(15,23,42,.12); border-radius:10px; cursor:pointer; display:flex; height:40px; justify-content:center; list-style:none; width:40px; }
        .clubNewsActions summary::-webkit-details-marker { display:none; }
        .clubNewsActions > div { background:#fff; border:1px solid rgba(15,23,42,.1); border-radius:12px; box-shadow:0 16px 38px rgba(15,23,42,.14); display:grid; gap:4px; padding:6px; position:absolute; right:0; top:44px; width:170px; z-index:4; }
        .clubNewsActions button { min-height: 34px; padding: 0 11px; }
        .clubNewsActions button.is-danger { border-color: rgba(225,29,72,.22); color: #be123c; }
        .clubNewsActions button:disabled, .clubNewsPrimary:disabled, .clubNewsSecondary:disabled { cursor: not-allowed; opacity: .62; transform: none; }
        .clubNewsEmpty {
          align-items: center;
          background: radial-gradient(circle at 12% 0%, var(--club-soft), transparent 36%), #fff;
          border: 1px dashed rgba(15,23,42,.16);
          border-radius: 18px;
          color: rgba(23,37,63,.64);
          display: grid;
          justify-items: center;
          gap: 8px;
          padding: 34px 18px;
          text-align: center;
        }
        .clubNewsEmpty strong { color: #061b3a; font-size: 20px; font-weight: 950; }
        .clubNewsEmpty p { margin: 0; max-width: 560px; }
        .clubNewsEmpty button { background: #061b3a; border: 1px solid var(--club-accent); color: #fff; margin-top: 4px; }
        .clubNewsAlert { border-radius: 14px; font-size: 13px; font-weight: 850; padding: 12px 14px; }
        .clubNewsAlert.is-error { background: rgba(244,63,94,.1); border: 1px solid rgba(244,63,94,.22); color: #be123c; }
        .clubNewsAlert.is-ok { background: rgba(16,185,129,.1); border: 1px solid rgba(16,185,129,.2); color: #047857; }
        .clubNewsModal { background: rgba(15,23,42,.58); inset: 72px 0 0; overflow: auto; padding: 16px; position: fixed; z-index: 80; }
        .clubNewsModalCard { margin: 0 auto; padding: 18px; width: min(1040px, 100%); }
        .clubNewsModalHead, .clubNewsModalActions { align-items: center; display: flex; gap: 12px; justify-content: space-between; }
        .clubNewsModalHead h2 { font-size: 28px; }
        .clubNewsIconBtn {
          align-items: center;
          background: #fff;
          border: 1px solid rgba(15,23,42,.12);
          border-radius: 999px;
          color: #061b3a;
          cursor: pointer;
          display: inline-flex;
          height: 38px;
          justify-content: center;
          width: 38px;
        }
        .clubNewsEditorGrid { display: grid; gap: 14px; grid-template-columns: minmax(0, 1.1fr) minmax(300px, .9fr); margin: 14px 0; }
        .clubNewsFormBlock {
          background: #fff;
          border: 1px solid rgba(15,23,42,.08);
          border-radius: 16px;
          display: grid;
          gap: 12px;
          padding: 14px;
        }
        .clubNewsFormBlock label { color: rgba(23,37,63,.72); display: grid; font-size: 13px; font-weight: 850; gap: 6px; }
        .clubNewsFormBlock input, .clubNewsFormBlock textarea, .clubNewsFormBlock select {
          background: #fff;
          border: 1px solid rgba(15,23,42,.14);
          border-radius: 12px;
          color: #061b3a;
          font: inherit;
          font-size: 14px;
          padding: 10px 12px;
          width: 100%;
        }
        .clubNewsFormBlock input:focus, .clubNewsFormBlock textarea:focus, .clubNewsFormBlock select:focus { border-color: var(--club-accent); box-shadow: 0 0 0 3px var(--club-glow); outline: none; }
        .clubNewsCheck { align-items: center !important; display: flex !important; flex-direction: row; gap: 8px !important; }
        .clubNewsCheck input { width: auto; }
        .clubNewsPreview {
          background: #061b3a;
          border-radius: 16px;
          color: #fff;
          display: grid;
          gap: 8px;
          overflow: hidden;
          padding: 12px;
        }
        .clubNewsPreview img, .clubNewsPreview > div { aspect-ratio: 16 / 9; border-radius: 12px; overflow: hidden; }
        .clubNewsPreview > div { align-items: center; background: rgba(255,255,255,.08); color: rgba(255,255,255,.72); display: grid; gap: 6px; justify-items: center; }
        .clubNewsPreview span { color: var(--club-accent-2); font-size: 11px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
        .clubNewsPreview strong { font-size: 20px; font-weight: 950; line-height: 1.05; }
        .clubNewsPreview p { color: rgba(255,255,255,.76); font-size: 13px; margin: 0; }
        .clubNewsModalActions { border-top: 1px solid rgba(15,23,42,.08); justify-content: flex-end; padding-top: 14px; }
        @media (max-width: 980px) {
          .clubNewsHero, .clubNewsBoardHead, .clubNewsModalHead, .clubNewsModalActions { align-items: stretch; flex-direction: column; }
          .clubNewsStats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .clubNewsRow { grid-template-columns: 72px minmax(0, 1fr); }
          .clubNewsActions { grid-column: auto; grid-row: 1; }
          .clubNewsEditorGrid { grid-template-columns: 1fr; }
          .clubNewsPrimary, .clubNewsSecondary { width: 100%; }
        }
        @media (max-width: 560px) {
          .clubNewsHero, .clubNewsBoard, .clubNewsModalCard { border-radius: 16px; }
          .clubNewsShell { gap:10px; }
          .clubNewsHero, .clubNewsBoard { padding: 12px; }
          .clubNewsHero { gap:10px; }
          .clubNewsHero p { display:none; }
          .clubNewsHero h1 { font-size: 24px; }
          .clubNewsPrimary { min-height:38px; }
          .clubNewsStats { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 5px; }
          .clubNewsStat { border-radius:12px; gap:2px; min-width:0; padding:7px 5px; text-align:center; }
          .clubNewsStat span { font-size:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
          .clubNewsStat strong { font-size:18px; }
          .clubNewsStat small { display:none; }
          .clubNewsBoardHead { gap:8px; margin-bottom:10px; }
          .clubNewsBoardHead .clubNewsKicker { display:none; }
          .clubNewsBoardHead h2 { font-size:18px; margin:0; }
          .clubNewsBoardTools { justify-content:space-between; width:100%; }
          .clubNewsBoardTools > span, .clubNewsBoardTools label { font-size:11px; padding:4px 7px; }
          .clubNewsBoardTools select { min-height:30px; padding:2px 6px; }
          .clubNewsList { gap:8px; }
          .clubNewsRow { align-items: start; gap:8px; grid-template-columns: 80px minmax(0, 1fr) 36px; min-height:100px; padding:9px; }
          .clubNewsRowLink { background:transparent; border:0; cursor:pointer; display:block; inset:0; padding:0; position:absolute; z-index:1; }
          .clubNewsRowLink:focus-visible { border-radius:15px; box-shadow:inset 0 0 0 2px var(--club-accent); outline:none; }
          .clubNewsThumb { aspect-ratio: 1; border-radius:10px; width:80px; }
          .clubNewsInfo { align-content:start; gap:3px; grid-template-columns:minmax(0,1fr) auto; }
          .clubNewsInfo > div { display:contents; }
          .clubNewsInfo h3 { display:-webkit-box; font-size:14px; grid-column:1 / -1; line-height:1.15; overflow:hidden; white-space:normal; -webkit-box-orient:vertical; -webkit-line-clamp:2; }
          .clubNewsBadge { align-self:center; font-size:9px; grid-column:2; grid-row:3; justify-self:end; min-height:18px; padding:3px 6px; }
          .clubNewsInfo p { display: -webkit-box; font-size:12px; grid-column:1 / -1; line-height:1.25; overflow: hidden; white-space: normal; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
          .clubNewsInfo small { font-size:10px; gap:3px; grid-column:1; grid-row:3; line-height:1.2; min-width:0; overflow:hidden; white-space:nowrap; }
          .clubNewsInfo small svg { height:11px; width:11px; }
          .clubNewsActions { align-self:start; grid-column:3; grid-row:1; z-index:2; }
          .clubNewsActions summary { background:transparent; border:0; height:36px; width:36px; }
          .clubNewsActions button { justify-content: flex-start; width: 100%; }
          .clubNewsPagination { align-items: stretch; flex-direction: column; }
          .clubNewsPagination button { width: 100%; }
          .clubNewsModal { inset: 64px 0 0; padding: 10px; }
        }
        @media (prefers-reduced-motion: reduce) { .clubNewsSkeletons span { animation:none } }
      `}</style>
    </div>
  )
}
