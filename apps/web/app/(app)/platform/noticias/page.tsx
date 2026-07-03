'use client'

import { useEffect, useMemo, useState } from 'react'
import AuthAlert from '@/components/AuthAlert'
import PlatformModuleShell from '@/components/platform/PlatformModuleShell'
import { supabase } from '@/lib/supabaseClient'
import { BRAND } from '@/lib/branding'

type NewsStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
type NewsPlacement = 'HERO' | 'GRID' | 'ARCHIVE'

type NewsRow = {
  id: string
  title: string
  slug: string
  excerpt: string | null
  body: string | null
  cover_url: string | null
  gallery_urls: string[] | null
  placement: NewsPlacement
  status: NewsStatus
  published_at: string | null
  created_at: string
  updated_at: string
}

type EditorForm = {
  title: string
  slug: string
  excerpt: string
  body: string
  placement: NewsPlacement
  status: NewsStatus
}

const EMPTY_FORM: EditorForm = {
  title: '',
  slug: '',
  excerpt: '',
  body: '',
  placement: 'GRID',
  status: 'DRAFT',
}

const DRAFT_STORAGE_KEY = 'pamprax_news_draft'

function formatDate(value?: string | null) {
  if (!value) return 'Sin fecha'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function statusLabel(status: NewsStatus) {
  if (status === 'PUBLISHED') return 'Publicada'
  if (status === 'ARCHIVED') return 'Archivada'
  return 'Borrador'
}

function placementLabel(placement: NewsPlacement) {
  if (placement === 'HERO') return 'Destacada'
  if (placement === 'ARCHIVE') return 'Archivo'
  return 'Grilla'
}

function placementBadgeClass(placement: NewsPlacement) {
  if (placement === 'HERO') return 'px-placementBadge px-placementBadge--hero'
  if (placement === 'ARCHIVE') return 'px-placementBadge px-placementBadge--archive'
  return 'px-placementBadge px-placementBadge--grid'
}

function statusBadgeClass(status: NewsStatus) {
  if (status === 'PUBLISHED') return 'px-statusBadge px-statusBadge--success'
  if (status === 'ARCHIVED') return 'px-statusBadge px-statusBadge--muted'
  return 'px-statusBadge px-statusBadge--warning'
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function dataUrlToFile(dataUrl: string, fileName: string) {
  const [header, body] = dataUrl.split(',')
  const mimeMatch = header.match(/data:(.*?);base64/)
  const mime = mimeMatch?.[1] || 'application/octet-stream'
  const binary = atob(body || '')
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  const extension = mime.split('/')[1] || 'bin'
  return new File([bytes], `${fileName}.${extension}`, { type: mime })
}

export default function PlatformNewsPage() {
  const [rows, setRows] = useState<NewsRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [setupRequired, setSetupRequired] = useState(false)
  const [alert, setAlert] = useState<{ variant: 'success' | 'warning' | 'error' | 'info'; title: string; message?: string } | null>(null)
  const [form, setForm] = useState<EditorForm>(EMPTY_FORM)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [keepCover, setKeepCover] = useState(true)
  const [existingCoverUrl, setExistingCoverUrl] = useState<string | null>(null)
  const [existingGalleryUrls, setExistingGalleryUrls] = useState<string[]>([])
  const [galleryFiles, setGalleryFiles] = useState<File[]>([])
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null)
  const [galleryPreviewUrls, setGalleryPreviewUrls] = useState<string[]>([])
  const [draftReady, setDraftReady] = useState(false)
  const [page, setPage] = useState(1)
  const [feedPreviewOpen, setFeedPreviewOpen] = useState(false)
  const [articlePreview, setArticlePreview] = useState<NewsRow | null>(null)

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || null
  }

  function buildErrorAlert(status: number, fallbackTitle: string, fallbackMessage: string, payload?: any) {
    if (status === 401) {
      return {
        variant: 'warning' as const,
        title: 'Sesión expirada',
        message: 'Volvé a iniciar sesión para seguir gestionando noticias.',
      }
    }

    if (status === 403) {
      return {
        variant: 'warning' as const,
        title: 'No autorizado',
        message: payload?.error || 'Tu usuario no tiene permisos de platform admin para este módulo.',
      }
    }

    return {
      variant: 'error' as const,
      title: fallbackTitle,
      message: payload?.error || fallbackMessage,
    }
  }

  async function loadRows() {
    setLoading(true)
    setAlert(null)
    try {
      const token = await getAccessToken()
      if (!token) {
        setAlert({
          variant: 'warning',
          title: 'Sesión expirada',
          message: 'Volvé a iniciar sesión para cargar las noticias de Platform.',
        })
        setRows([])
        setSelectedId(null)
        setLoading(false)
        return
      }

      const res = await fetch('/api/platform/news', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSetupRequired(Boolean(payload?.setupRequired))
        throw Object.assign(new Error(payload?.error || 'No pude cargar las noticias.'), { status: res.status, payload })
      }
      const nextRows = Array.isArray(payload?.rows) ? payload.rows : []
      setRows(nextRows)
      setSelectedId((current) => current ?? nextRows[0]?.id ?? null)
      setPage(1)
      setSetupRequired(false)
    } catch (error: any) {
      const nextAlert = buildErrorAlert(
        Number(error?.status || 500),
        'No pude cargar noticias',
        'Revisá la conexión e intentá de nuevo.',
        error?.payload,
      )
      setAlert(nextAlert)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRows()
  }, [])

  useEffect(() => {
    let cancelled = false

    async function restoreDraft() {
      try {
        const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY)
        if (!raw) return

        const draft = JSON.parse(raw)
        if (!draft || typeof draft !== 'object') return

        setForm({
          title: String(draft.title || ''),
          slug: String(draft.slug || ''),
          excerpt: String(draft.excerpt || ''),
          body: String(draft.body || ''),
          placement: draft.placement === 'HERO' || draft.placement === 'ARCHIVE' ? draft.placement : 'GRID',
          status: draft.status === 'PUBLISHED' || draft.status === 'ARCHIVED' ? draft.status : 'DRAFT',
        })
        setExistingCoverUrl(typeof draft.existingCoverUrl === 'string' ? draft.existingCoverUrl : null)
        setKeepCover(Boolean(draft.keepCover ?? draft.existingCoverUrl))
        setExistingGalleryUrls(Array.isArray(draft.existingGalleryUrls) ? draft.existingGalleryUrls.filter(Boolean) : [])

        if (typeof draft.coverDataUrl === 'string' && draft.coverDataUrl) {
          setCoverFile(dataUrlToFile(draft.coverDataUrl, 'news-cover-draft'))
        }

        if (Array.isArray(draft.galleryDataUrls) && draft.galleryDataUrls.length) {
          const restoredGallery = draft.galleryDataUrls
            .filter((item: unknown) => typeof item === 'string' && item)
            .map((item: string, index: number) => dataUrlToFile(item, `news-gallery-draft-${index + 1}`))
          if (!cancelled) setGalleryFiles(restoredGallery)
        }
      } catch {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY)
      } finally {
        if (!cancelled) setDraftReady(true)
      }
    }

    restoreDraft()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!coverFile) {
      setCoverPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(coverFile)
    setCoverPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [coverFile])

  useEffect(() => {
    if (!galleryFiles.length) {
      setGalleryPreviewUrls([])
      return
    }
    const urls = galleryFiles.map((file) => URL.createObjectURL(file))
    setGalleryPreviewUrls(urls)
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [galleryFiles])

  useEffect(() => {
    if (!draftReady) return

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const draftPayload = {
            title: form.title,
            slug: form.slug,
            excerpt: form.excerpt,
            body: form.body,
            placement: form.placement,
            status: form.status,
            keepCover,
            existingCoverUrl,
            existingGalleryUrls,
            coverDataUrl: coverFile ? await fileToDataUrl(coverFile) : null,
            galleryDataUrls: galleryFiles.length ? await Promise.all(galleryFiles.map((file) => fileToDataUrl(file))) : [],
          }
          window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftPayload))
        } catch {
          // Keep editing usable even if draft persistence fails.
        }
      })()
    }, 350)

    return () => window.clearTimeout(timeoutId)
  }, [draftReady, form, keepCover, existingCoverUrl, existingGalleryUrls, coverFile, galleryFiles])

  const selected = useMemo(() => rows.find((row) => row.id === selectedId) ?? null, [rows, selectedId])
  const previewCoverUrl = coverPreviewUrl || (keepCover ? existingCoverUrl : null)
  const previewGalleryUrls = [...existingGalleryUrls, ...galleryPreviewUrls]
  const previewParagraphs = form.body.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean)
  const pageSize = 10

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return rows.slice(start, start + pageSize)
  }, [rows, currentPage])

  const metrics = useMemo(
    () => [
      { label: 'Total', value: String(rows.length) },
      { label: 'Publicadas', value: String(rows.filter((row) => row.status === 'PUBLISHED').length) },
      { label: 'Borradores', value: String(rows.filter((row) => row.status === 'DRAFT').length) },
      { label: 'Archivadas', value: String(rows.filter((row) => row.status === 'ARCHIVED').length) },
    ],
    [rows],
  )

  const previewFeedRows = useMemo(() => {
    const published = rows.filter((row) => row.status === 'PUBLISHED')
    return published.length ? published : rows
  }, [rows])

  const previewHero = useMemo(
    () => previewFeedRows.find((row) => row.placement === 'HERO') ?? previewFeedRows[0] ?? null,
    [previewFeedRows],
  )
  const previewGrid = useMemo(
    () =>
      previewFeedRows
        .filter((row) => row.id !== previewHero?.id)
        .filter((row) => row.placement === 'GRID' || row.placement === 'HERO')
        .slice(0, 6),
    [previewFeedRows, previewHero],
  )
  const previewArchive = useMemo(
    () =>
      previewFeedRows
        .filter((row) => row.id !== previewHero?.id)
        .filter((row) => row.placement === 'ARCHIVE')
        .slice(0, 8),
    [previewFeedRows, previewHero],
  )
  const previewUsedTopIds = useMemo(
    () => new Set([previewHero?.id, ...previewGrid.map((row) => row.id)].filter(Boolean)),
    [previewHero?.id, previewGrid],
  )
  const previewLatest = useMemo(
    () => previewFeedRows.filter((row) => !previewUsedTopIds.has(row.id)).slice(0, 6),
    [previewFeedRows, previewUsedTopIds],
  )

  function resetEditor() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setCoverFile(null)
    setKeepCover(true)
    setExistingCoverUrl(null)
    setExistingGalleryUrls([])
    setGalleryFiles([])
    if (typeof window !== 'undefined') window.localStorage.removeItem(DRAFT_STORAGE_KEY)
  }

  function openCreate() {
    resetEditor()
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
    setCoverFile(null)
    setKeepCover(Boolean(row.cover_url))
    setExistingCoverUrl(row.cover_url || null)
    setExistingGalleryUrls(Array.isArray(row.gallery_urls) ? row.gallery_urls : [])
    setGalleryFiles([])
    setOpen(true)
  }

  function closeEditor() {
    setOpen(false)
    resetEditor()
  }

  function buildFormData() {
    const data = new FormData()
    data.set('title', form.title)
    data.set('slug', form.slug)
    data.set('excerpt', form.excerpt)
    data.set('body', form.body)
    data.set('placement', form.placement)
    data.set('status', form.status)
    data.set('keepCover', keepCover ? '1' : '0')
    data.set('existingGalleryUrls', JSON.stringify(existingGalleryUrls))
    if (coverFile) data.append('cover', coverFile)
    galleryFiles.forEach((file) => data.append('gallery', file))
    return data
  }

  async function saveNews() {
    setSaving(true)
    setAlert(null)
    try {
      const token = await getAccessToken()
      if (!token) {
        setAlert({
          variant: 'warning',
          title: 'Sesión expirada',
          message: 'Volvé a iniciar sesión antes de guardar la noticia.',
        })
        setSaving(false)
        return
      }

      const res = await fetch(editingId ? `/api/platform/news/${editingId}` : '/api/platform/news', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: buildFormData(),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        const nextAlert = buildErrorAlert(
          res.status,
          'No pude guardar la noticia',
          'Revisá los datos e intentá de nuevo.',
          payload,
        )
        setAlert(nextAlert)
        return
      }
      await loadRows()
      closeEditor()
      setAlert({ variant: 'success', title: editingId ? 'Noticia actualizada' : 'Noticia creada', message: 'Los cambios quedaron guardados correctamente.' })
    } catch (error: any) {
      setAlert({ variant: 'error', title: 'No pude guardar la noticia', message: error?.message || 'Revisá los datos e intentá de nuevo.' })
    } finally {
      setSaving(false)
    }
  }

  async function removeNews(row: NewsRow) {
    if (!window.confirm(`Vas a eliminar "${row.title}".`)) return
    setAlert(null)
    try {
      const token = await getAccessToken()
      if (!token) {
        setAlert({
          variant: 'warning',
          title: 'Sesión expirada',
          message: 'Volvé a iniciar sesión antes de eliminar la noticia.',
        })
        return
      }

      const res = await fetch(`/api/platform/news/${row.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        const nextAlert = buildErrorAlert(
          res.status,
          'No pude eliminar la noticia',
          'Intentá de nuevo en unos segundos.',
          payload,
        )
        setAlert(nextAlert)
        return
      }
      if (selectedId === row.id) setSelectedId(null)
      await loadRows()
      setAlert({ variant: 'success', title: 'Noticia eliminada' })
    } catch (error: any) {
      setAlert({ variant: 'error', title: 'No pude eliminar la noticia', message: error?.message || 'Intentá de nuevo en unos segundos.' })
    }
  }

  return (
    <PlatformModuleShell
      title={`Noticias ${BRAND.name}`}
      subtitle="Gestioná contenido institucional con hero, galería y previews reales antes de publicar."
      metrics={metrics}
      actions={
        <div className="px-newsTopActions">
          <button type="button" className="px-btn px-btn--ghost" onClick={() => setFeedPreviewOpen(true)}>
            Previsualizar
          </button>
          <button type="button" className="px-btn px-btn--primary" onClick={openCreate}>
            Nueva noticia
          </button>
        </div>
      }
      aside={
        <div className="px-platformCard px-newsAside">
          <div className="px-newsAsideHead">
            <h3>Resumen editorial</h3>
            {selected ? <span className={statusBadgeClass(selected.status)}>{statusLabel(selected.status)}</span> : null}
          </div>
          {selected ? (
            <div className="px-newsAsideCard">
              {selected.cover_url ? <img src={selected.cover_url} alt={selected.title} className="px-newsAsideImage" /> : null}
                <div className="px-newsAsideBody">
                  <strong>{selected.title}</strong>
                  <div className="px-newsAsideMeta">
                    <span className={placementBadgeClass(selected.placement)}>{placementLabel(selected.placement)}</span>
                    <span>{formatDate(selected.published_at || selected.updated_at)}</span>
                  </div>
                  {selected.excerpt ? <p>{selected.excerpt}</p> : null}
                </div>
            </div>
          ) : (
            <p className="px-muted">Seleccioná una noticia.</p>
          )}
        </div>
      }
    >
      <div className="px-newsStack">
        {alert ? (
          <div className={`px-newsFlash px-newsFlash--${alert.variant}`}>
            <strong>{alert.title}</strong>
            {alert.message ? <span>{alert.message}</span> : null}
          </div>
        ) : null}
        {setupRequired ? (
          <div className="px-newsFlash px-newsFlash--warning">
            <strong>Contenido no disponible</strong>
            <span>Hay una configuración pendiente para este módulo.</span>
          </div>
        ) : null}

        <div className="px-newsToolbar">
          <div className="px-newsToolbarCopy">
            <h2>
              Listado editorial
              <span className="px-newsToolbarTag">Platform</span>
            </h2>
          </div>
          <button type="button" className="px-btn px-btn--ghost" onClick={() => void loadRows()}>
            Actualizar
          </button>
        </div>

        {loading ? (
          <div className="px-emptyState">Cargando noticias...</div>
        ) : pagedRows.length ? (
          <div className="px-newsList">
            {pagedRows.map((row) => (
              <article key={row.id} className={`px-newsRow ${selectedId === row.id ? 'is-active' : ''}`} onClick={() => setSelectedId(row.id)}>
                <div className="px-newsThumb">{row.cover_url ? <img src={row.cover_url} alt={row.title} /> : <span>Sin imagen</span>}</div>
                <div className="px-newsMain">
                  <div className="px-newsRowTop">
                    <div className="px-newsTitleBlock">
                      <strong>{row.title}</strong>
                      <span>{row.excerpt || 'Sin bajada'}</span>
                    </div>
                    <div className="px-newsRowBadges">
                      <span className={placementBadgeClass(row.placement)}>{placementLabel(row.placement)}</span>
                      <span className={statusBadgeClass(row.status)}>{statusLabel(row.status)}</span>
                    </div>
                  </div>
                  <div className="px-newsMeta">
                    <span>{formatDate(row.published_at || row.updated_at)}</span>
                    <span>{(row.gallery_urls || []).length} galería</span>
                  </div>
                </div>
                <div className="px-newsRowActions">
                  <button type="button" className="px-btn px-btn--ghost" onClick={(event) => { event.stopPropagation(); openEdit(row) }}>
                    Editar
                  </button>
                  <button type="button" className="px-btn px-btn--dangerGhost" onClick={(event) => { event.stopPropagation(); void removeNews(row) }}>
                    Eliminar
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="px-emptyState">Todavía no hay noticias creadas.</div>
        )}
        {!loading && rows.length > pageSize ? (
          <div className="px-newsPagination">
            <button
              type="button"
              className="px-btn px-btn--ghost"
              disabled={currentPage <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              Anterior
            </button>
            <span>Página {currentPage} de {totalPages}</span>
            <button
              type="button"
              className="px-btn px-btn--ghost"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            >
              Siguiente
            </button>
          </div>
        ) : null}

        {open ? (
          <div className="px-newsModal" role="dialog" aria-modal="true">
            <div className="px-newsModalCard">
              <div className="px-newsModalHead">
                <div className="px-newsModalIntro">
                  <h2>{editingId ? 'Editar noticia' : 'Nueva noticia'}</h2>
                  <p className="px-muted">Cargá hero, galería y texto en un flujo único con preview inmediato.</p>
                </div>
              </div>

              <div className="px-newsEditorGrid">
                <div className="px-newsEditorBlocks">
                  <section className="px-newsBlock">
                    <h3>Identidad editorial</h3>
                    <label>
                      <span>Título</span>
                      <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Título principal de la noticia" />
                    </label>
                    <label>
                      <span>Bajada</span>
                      <textarea rows={3} value={form.excerpt} onChange={(event) => setForm((current) => ({ ...current, excerpt: event.target.value }))} placeholder="Resumen corto para cards y destacados" />
                    </label>
                  </section>

                  <section className="px-newsBlock">
                    <h3>Media</h3>
                    <label className="px-newsUploadField">
                      <span>Imagen principal / hero</span>
                      <input type="file" accept="image/*" onChange={(event) => setCoverFile(event.target.files?.[0] ?? null)} />
                    </label>
                    {existingCoverUrl ? (
                      <label className="px-checkRow">
                        <input type="checkbox" checked={keepCover} onChange={(event) => setKeepCover(event.target.checked)} />
                        <span>Conservar imagen principal actual</span>
                      </label>
                    ) : null}
                    <label className="px-newsUploadField">
                      <span>Galería interna</span>
                      <input type="file" accept="image/*" multiple onChange={(event) => setGalleryFiles(Array.from(event.target.files ?? []))} />
                    </label>
                    {existingGalleryUrls.length ? (
                      <div className="px-chipGroup">
                        {existingGalleryUrls.map((url, index) => (
                          <button key={`${url}-${index}`} type="button" className="px-chip" onClick={() => setExistingGalleryUrls((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                            Quitar imagen {index + 1}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {galleryFiles.length ? (
                      <div className="px-chipGroup">
                        {galleryFiles.map((file, index) => (
                          <button key={`${file.name}-${index}`} type="button" className="px-chip" onClick={() => setGalleryFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                            {file.name}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </section>

                  <section className="px-newsBlock">
                    <h3>Publicación</h3>
                    <div className="px-newsSplit">
                      <label>
                        <span>Estado</span>
                        <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as NewsStatus }))}>
                          <option value="DRAFT">Borrador</option>
                          <option value="PUBLISHED">Publicada</option>
                          <option value="ARCHIVED">Archivada</option>
                        </select>
                      </label>
                      <label>
                        <span>Placement</span>
                        <select value={form.placement} onChange={(event) => setForm((current) => ({ ...current, placement: event.target.value as NewsPlacement }))}>
                          <option value="HERO">Destacada</option>
                          <option value="GRID">Grilla</option>
                          <option value="ARCHIVE">Archivo</option>
                        </select>
                      </label>
                    </div>
                  </section>

                  <section className="px-newsBlock">
                    <h3>Contenido</h3>
                    <label>
                      <span>Cuerpo</span>
                      <textarea rows={12} value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} placeholder="Escribí el contenido completo. Separá párrafos con línea en blanco." />
                    </label>
                  </section>
                </div>

                <div className="px-newsPreviewStack">
                  <section className="px-newsBlock">
                    <h3>Preview de card</h3>
                    <article className="px-cardPreview">
                      {previewCoverUrl ? <img src={previewCoverUrl} alt={form.title || 'Preview'} className="px-cardPreviewImage" /> : <div className="px-cardPreviewFallback">Imagen principal</div>}
                      <div className="px-cardPreviewBody">
                        <span className={statusBadgeClass(form.status)}>{statusLabel(form.status)}</span>
                        <strong>{form.title || 'Título de la noticia'}</strong>
                        <p>{form.excerpt || 'La bajada aparece acá y ayuda a validar tono, longitud y jerarquía.'}</p>
                      </div>
                    </article>
                  </section>

                  <section className="px-newsBlock">
                    <h3>Preview de noticia completa</h3>
                    <article className="px-articlePreview">
                      {previewCoverUrl ? (
                        <div className="px-articleHero">
                          <img src={previewCoverUrl} alt={form.title || 'Hero'} className="px-articlePreviewHero" />
                        </div>
                      ) : null}
                      <div className="px-articlePreviewBody">
                        <div className="px-articlePreviewMeta">
                          <span className={statusBadgeClass(form.status)}>{statusLabel(form.status)}</span>
                          <span>{placementLabel(form.placement)}</span>
                        </div>
                        <h2>{form.title || 'Título de la noticia'}</h2>
                        <p className="px-articleLead">{form.excerpt || 'La bajada acompaña al título y ordena la lectura.'}</p>
                        <div className="px-articleCopy">
                          {(previewParagraphs.length ? previewParagraphs : ['El cuerpo de la noticia va a aparecer acá en formato final.']).map((paragraph, index) => (
                            <p key={index}>{paragraph}</p>
                          ))}
                        </div>
                        {previewGalleryUrls.length ? (
                          <div className="px-articleGallery">
                            {previewGalleryUrls.map((url, index) => (
                              <img key={`${url}-${index}`} src={url} alt={`Galería ${index + 1}`} />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </article>
                  </section>
                </div>
              </div>

              <div className="px-newsModalActions">
                <button type="button" className="px-btn px-btn--ghost" onClick={closeEditor}>
                  Cerrar
                </button>
                <button type="button" className="px-btn px-btn--primary" onClick={() => void saveNews()} disabled={saving || !form.title.trim()}>
                  {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear noticia'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {feedPreviewOpen ? (
        <div className="px-previewOverlay" role="dialog" aria-modal="true">
          <div className="px-previewShell">
            <div className="px-previewHead">
              <div>
                <h2>Previsualizar</h2>
                <p>Vista pública de noticias</p>
              </div>
              <button type="button" className="px-btn px-btn--ghost" onClick={() => { setFeedPreviewOpen(false); setArticlePreview(null) }}>
                Volver al editor
              </button>
            </div>

            <div className="px-previewBody">
              <div className="px-previewFeedViewport">
                <div className="px-page">
                  <div className="px-pageHead px-previewPageHead">
                    <h1 className="px-pageTitle">Noticias</h1>
                    <p className="px-pageSub">Últimas noticias, comunicados y archivo histórico real cargado desde {BRAND.name}.</p>
                  </div>

                  <div className="px-previewPublicStack">
                    {previewHero ? (
                      <article className="publicNewsTile px-previewPublicHero px-previewInteractive" onClick={() => setArticlePreview(previewHero)}>
                        {previewHero.cover_url ? <img src={previewHero.cover_url} alt={previewHero.title} className="publicNewsTileImage" /> : <div className="publicNewsTileImage publicNewsTileFallback" />}
                        <div className="publicNewsTileOverlay px-previewHeroOverlay">
                          <span className="px-placementBadge px-placementBadge--hero">Destacada</span>
                          <h3>{previewHero.title}</h3>
                          <div>{formatDate(previewHero.published_at || previewHero.updated_at)}</div>
                        </div>
                      </article>
                    ) : null}

                    {previewGrid.length ? (
                      <section className="px-previewPublicSection">
                        <div className="px-previewSectionHead">
                          <h3>Grilla</h3>
                        </div>
                        <div className="publicNewsGrid px-previewPublicGrid">
                          {previewGrid.map((row) => (
                            <article key={row.id} className="publicNewsTile px-previewPublicGridCard px-previewInteractive" onClick={() => setArticlePreview(row)}>
                              {row.cover_url ? <img src={row.cover_url} alt={row.title} className="publicNewsTileImage" /> : <div className="publicNewsTileImage publicNewsTileFallback" />}
                              <div className="publicNewsTileOverlay">
                                <span className="px-placementBadge px-placementBadge--grid">Grilla</span>
                                <h3>{row.title}</h3>
                                <div>{formatDate(row.published_at || row.updated_at)}</div>
                              </div>
                            </article>
                          ))}
                        </div>
                      </section>
                    ) : null}

                    {previewArchive.length ? (
                      <section className="px-previewPublicSection">
                        <div className="px-previewSectionHead">
                          <h3>Archivo</h3>
                        </div>
                        <div className="px-previewArchiveList">
                          {previewArchive.map((row) => (
                            <article key={row.id} className="px-previewArchiveItem px-previewInteractive" onClick={() => setArticlePreview(row)}>
                              <div className="px-previewArchiveMeta">
                                <span className="px-placementBadge px-placementBadge--archive">Archivo</span>
                                <strong>{row.title}</strong>
                                <p>{row.excerpt || 'Sin bajada.'}</p>
                              </div>
                              <span>{formatDate(row.published_at || row.updated_at)}</span>
                            </article>
                          ))}
                        </div>
                      </section>
                    ) : null}

                    {previewLatest.length ? (
                      <section className="px-previewPublicSection">
                        <div className="px-previewSectionHead">
                          <h3>Últimas noticias</h3>
                        </div>
                        <div className="publicNewsGrid px-previewPublicGrid px-previewPublicGrid--latest">
                          {previewLatest.map((row) => (
                            <article key={row.id} className="publicNewsTile px-previewPublicGridCard px-previewInteractive" onClick={() => setArticlePreview(row)}>
                              {row.cover_url ? <img src={row.cover_url} alt={row.title} className="publicNewsTileImage" /> : <div className="publicNewsTileImage publicNewsTileFallback" />}
                              <div className="publicNewsTileOverlay">
                                <span className={placementBadgeClass(row.placement)}>{placementLabel(row.placement)}</span>
                                <h3>{row.title}</h3>
                                <div>{formatDate(row.published_at || row.updated_at)}</div>
                              </div>
                            </article>
                          ))}
                        </div>
                      </section>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {articlePreview ? (
        <div className="px-articleOverlay" role="dialog" aria-modal="true">
          <div className="px-articleOverlayShell">
            <div className="px-articleOverlayHead">
              <div>
                <span className={placementBadgeClass(articlePreview.placement)}>{placementLabel(articlePreview.placement)}</span>
              </div>
              <button type="button" className="px-btn px-btn--ghost" onClick={() => setArticlePreview(null)}>
                Cerrar noticia
              </button>
            </div>
            <article className="px-articleOverlayArticle">
              {articlePreview.cover_url ? <img src={articlePreview.cover_url} alt={articlePreview.title} className="px-articleOverlayHero" /> : null}
              <div className="px-articleOverlayBody">
                <h2>{articlePreview.title}</h2>
                {articlePreview.excerpt ? <p className="px-articleOverlayLead">{articlePreview.excerpt}</p> : null}
                <div className="px-articleOverlayCopy">
                  {String(articlePreview.body || 'Sin contenido cargado.')
                    .split(/\n{2,}/)
                    .map((paragraph) => paragraph.trim())
                    .filter(Boolean)
                    .map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                </div>
                {Array.isArray(articlePreview.gallery_urls) && articlePreview.gallery_urls.length ? (
                  <div className="px-articleOverlayGallery">
                    {articlePreview.gallery_urls.map((url, index) => (
                      <img key={`${url}-${index}`} src={url} alt={`Galería ${index + 1}`} />
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .px-newsStack { display: grid; gap: 6px; min-height: 100vh; overflow-x: hidden; margin: -10px -8px 0; }
        .px-newsToolbar, .px-newsRow, .px-newsModalHead, .px-newsModalActions, .px-newsSplit { display: flex; gap: 10px; }
        .px-newsToolbar, .px-newsModalHead, .px-newsModalActions { align-items: center; justify-content: space-between; }
        .px-newsToolbar h2, .px-newsBlock h3, .px-newsModalHead h2 { margin: 0; }
        .px-newsTopActions { display: flex; align-items: center; gap: 8px; }
        .px-muted { color: rgba(23, 37, 63, 0.62); font-size: 13px; }
        .px-emptyState { border: 1px dashed rgba(15, 23, 42, 0.12); border-radius: 8px; padding: 18px; text-align: center; background: #fff; font-size: 14px; }
        .px-newsFlash { display: inline-flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; font-size: 12px; line-height: 1.35; border: 1px solid transparent; background: #fff; max-width: 760px; }
        .px-newsFlash strong { font-size: 12px; }
        .px-newsFlash span { color: rgba(23, 37, 63, 0.72); }
        .px-newsFlash--success { border-color: rgba(16, 185, 129, 0.18); background: rgba(16, 185, 129, 0.06); color: #047857; }
        .px-newsFlash--warning { border-color: rgba(245, 158, 11, 0.2); background: rgba(245, 158, 11, 0.08); color: #b45309; }
        .px-newsFlash--error { border-color: rgba(220, 38, 38, 0.18); background: rgba(220, 38, 38, 0.06); color: #b91c1c; }
        .px-newsFlash--info { border-color: rgba(59, 130, 246, 0.18); background: rgba(59, 130, 246, 0.06); color: #1d4ed8; }
        .px-newsToolbar { position: relative; padding: 0 0 3px; min-height: 18px; margin: 0; }
        .px-newsToolbar::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 2px; border-radius: 999px; background: linear-gradient(90deg, rgba(255,78,114,.78), rgba(83,199,217,.78)); opacity: .75; }
        .px-newsToolbarCopy { display: grid; gap: 0; }
        .px-newsToolbar h2 { font-size: 14px; line-height: 1; display: inline-flex; align-items: center; gap: 6px; }
        .px-newsToolbarTag { display: inline-flex; align-items: center; min-height: 16px; padding: 0 5px; border-radius: 999px; background: rgba(15,23,42,.06); color: rgba(23,37,63,.62); font-size: 10px; font-weight: 700; }
        .px-newsToolbar :global(.px-btn) { min-height: 28px; height: 28px; padding: 0 10px; }
        .px-newsList { display: grid; gap: 3px; }
        .px-newsRow { border: 1px solid rgba(15, 23, 42, 0.08); border-radius: 8px; padding: 2px 6px; background: #fff; cursor: pointer; align-items: center; min-height: 42px; transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease; }
        .px-newsRow:hover, .px-newsRow.is-active { border-color: rgba(16, 185, 129, 0.45); box-shadow: 0 12px 24px rgba(15, 23, 42, 0.08); transform: translateY(-1px); }
        .px-newsThumb { width: 44px; min-width: 44px; height: 32px; border-radius: 6px; overflow: hidden; background: rgba(148, 163, 184, 0.16); display: grid; place-items: center; color: rgba(23, 37, 63, 0.7); font-size: 9px; }
        .px-newsThumb img, .px-newsAsideImage, .px-cardPreviewImage, .px-articlePreviewHero, .px-articleGallery img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .px-newsMain { min-width: 0; flex: 1; display: grid; gap: 1px; }
        .px-newsRowTop { display: flex; gap: 6px; align-items: center; justify-content: space-between; }
        .px-newsTitleBlock { min-width: 0; display: grid; gap: 1px; }
        .px-newsTitleBlock strong { font-size: 12px; line-height: 1.1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .px-newsTitleBlock span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; color: rgba(23, 37, 63, 0.62); }
        .px-newsRowBadges { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .px-newsMeta { display: flex; flex-wrap: wrap; gap: 4px; color: rgba(23, 37, 63, 0.62); font-size: 9px; }
        .px-newsRowActions { display: flex; flex-direction: row; align-items: center; gap: 4px; }
        .px-newsRowActions :global(.px-btn) { min-height: 24px; padding: 0 7px; font-size: 10px; }
        .px-newsPagination { display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding-top: 2px; font-size: 12px; color: rgba(23, 37, 63, 0.66); }
        .px-newsAside { display: grid; gap: 10px; padding: 14px; }
        .px-newsAsideHead { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .px-newsAside h3 { margin: 0; }
        .px-newsAsideCard { display: grid; gap: 10px; }
        .px-newsAsideImage { aspect-ratio: 16 / 9; border-radius: 8px; overflow: hidden; }
        .px-newsAsideBody { display: grid; gap: 6px; }
        .px-newsAsideBody strong { font-size: 14px; line-height: 1.3; }
        .px-newsAsideBody p { margin: 0; font-size: 12px; color: rgba(23, 37, 63, 0.68); line-height: 1.45; }
        .px-newsAsideMeta { display: flex; flex-wrap: wrap; gap: 8px; font-size: 11px; color: rgba(23, 37, 63, 0.6); }
        .px-newsModal { position: fixed; inset: 72px 0 0 0; background: rgba(15, 23, 42, 0.55); padding: 16px 16px 20px; overflow-y: auto; overflow-x: hidden; z-index: 60; }
        .px-newsModalCard { width: min(1120px, 100%); margin: 0 auto; background: #f8fafc; border-radius: 8px; padding: 16px; display: grid; gap: 14px; overflow: visible; min-height: calc(100vh - 108px); }
        .px-newsModalHead { position: sticky; top: 0; z-index: 2; background: #f8fafc; padding: 4px 0 2px; }
        .px-newsModalIntro { display: flex; align-items: center; justify-content: flex-start; gap: 12px; width: 100%; min-width: 0; }
        .px-newsModalIntro h2 { font-size: 20px; }
        .px-newsModalIntro p { margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .px-newsEditorGrid { display: grid; gap: 12px; grid-template-columns: minmax(0, 1.12fr) minmax(320px, 0.88fr); align-items: start; }
        .px-newsEditorBlocks, .px-newsPreviewStack { display: grid; gap: 12px; }
        .px-newsEditorBlocks { min-height: 0; overflow: visible; padding-right: 0; }
        .px-newsPreviewStack { min-height: 0; max-height: calc(100vh - 120px); overflow-y: auto; padding-right: 4px; position: sticky; top: 72px; align-self: start; }
        .px-newsBlock { background: #fff; border: 1px solid rgba(15, 23, 42, 0.08); border-radius: 8px; padding: 12px; display: grid; gap: 10px; }
        .px-newsBlock h3 { font-size: 14px; }
        .px-newsBlock label { display: grid; gap: 5px; color: rgba(23, 37, 63, 0.88); font-size: 13px; }
        .px-newsBlock input, .px-newsBlock select, .px-newsBlock textarea { width: 100%; border: 1px solid rgba(15, 23, 42, 0.14); border-radius: 8px; padding: 9px 10px; background: #fff; color: #0f172a; font-size: 13px; }
        .px-newsUploadField input { padding: 8px; }
        .px-checkRow { display: flex !important; align-items: center; gap: 8px; }
        .px-checkRow input { width: auto; }
        .px-chipGroup { display: flex; flex-wrap: wrap; gap: 8px; }
        .px-chip { border: 1px solid rgba(15, 23, 42, 0.12); background: rgba(15, 23, 42, 0.04); border-radius: 999px; padding: 5px 8px; font-size: 11px; color: #0f172a; }
        .px-cardPreview { overflow: hidden; border-radius: 8px; background: #0f172a; color: #fff; display: grid; min-height: 240px; }
        .px-cardPreviewImage { height: 150px; }
        .px-cardPreviewFallback { height: 150px; display: grid; place-items: center; background: linear-gradient(135deg, #0f172a, #1d4ed8); }
        .px-cardPreviewBody { display: grid; gap: 8px; padding: 12px; }
        .px-cardPreviewBody strong { font-size: 18px; line-height: 1.18; }
        .px-cardPreviewBody p { margin: 0; color: rgba(255, 255, 255, 0.84); font-size: 13px; }
        .px-articlePreview { overflow: hidden; border-radius: 8px; border: 1px solid rgba(15, 23, 42, 0.08); background: #fff; }
        .px-articleHero { padding: 14px 14px 0; }
        .px-articlePreviewHero { width: 100%; height: 240px; object-fit: cover; display: block; border-radius: 12px; }
        .px-articlePreviewBody { display: grid; gap: 12px; padding: 14px; }
        .px-articlePreviewMeta { display: flex; gap: 8px; flex-wrap: wrap; }
        .px-articlePreviewBody h2, .px-articleLead, .px-articleCopy p { margin: 0; }
        .px-articlePreviewBody h2 { font-size: 22px; line-height: 1.2; }
        .px-articleLead { font-size: 15px; color: rgba(23, 37, 63, 0.72); }
        .px-articleCopy { display: grid; gap: 10px; color: #0f172a; line-height: 1.58; font-size: 14px; }
        .px-articleGallery { display: grid; gap: 8px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .px-articleGallery img { aspect-ratio: 4 / 3; border-radius: 8px; }
        :global(.px-statusBadge) { display: inline-flex; align-items: center; justify-content: center; min-height: 24px; padding: 0 8px; border-radius: 999px; font-size: 11px; font-weight: 700; }
        :global(.px-statusBadge--success) { background: rgba(16, 185, 129, 0.16); color: #047857; }
        :global(.px-statusBadge--warning) { background: rgba(245, 158, 11, 0.18); color: #b45309; }
        :global(.px-statusBadge--muted) { background: rgba(148, 163, 184, 0.16); color: #475569; }
        .px-placementBadge { display: inline-flex; align-items: center; justify-content: center; min-height: 24px; padding: 0 8px; border-radius: 999px; font-size: 11px; font-weight: 700; }
        .px-placementBadge--grid { background: rgba(59, 130, 246, 0.12); color: #1d4ed8; }
        .px-placementBadge--hero { background: rgba(236, 72, 153, 0.14); color: #be185d; }
        .px-placementBadge--archive { background: rgba(100, 116, 139, 0.14); color: #475569; }
        .px-previewOverlay { position: fixed; inset: 72px 0 0 0; background: rgba(15, 23, 42, 0.62); z-index: 70; padding: 16px; overflow-y: auto; overflow-x: hidden; }
        .px-previewShell { width: min(1280px, 100%); min-height: calc(100vh - 104px); margin: 0 auto; background: #f8fafc; border-radius: 10px; padding: 14px; display: grid; gap: 12px; overflow: hidden; }
        .px-previewHead { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .px-previewHead h2, .px-previewSectionHead h3, .px-previewArticleBody h2 { margin: 0; }
        .px-previewHead p { margin: 2px 0 0; font-size: 12px; color: rgba(23, 37, 63, 0.62); }
        .px-previewBody { display: grid; grid-template-columns: 1fr; gap: 14px; min-height: 0; }
        .px-previewFeedViewport { min-height: 0; overflow-y: auto; background: #fff; border-radius: 10px; border: 1px solid rgba(15, 23, 42, 0.08); padding: 10px; }
        .px-previewInteractive { transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease, filter 180ms ease; cursor: pointer; }
        .px-previewInteractive:hover { transform: translateY(-2px); box-shadow: 0 16px 30px rgba(15, 23, 42, 0.12); }
        .px-previewInteractive :global(.publicNewsTileImage),
        .px-previewInteractive :global(img) { transition: transform 220ms ease, filter 220ms ease; }
        .px-previewInteractive :global(.publicNewsTileOverlay) { transition: background 220ms ease, opacity 220ms ease; }
        .px-previewInteractive:hover :global(.publicNewsTileImage),
        .px-previewInteractive:hover :global(img) { transform: scale(1.035); filter: saturate(1.06) contrast(1.02); }
        .px-previewInteractive:hover :global(.publicNewsTileOverlay) { background: linear-gradient(180deg, rgba(15,23,42,0.02) 0%, rgba(15,23,42,0.7) 58%, rgba(15,23,42,0.94) 100%); }
        .px-previewFeedViewport :global(.px-page) { padding: 0; }
        .px-previewPageHead { padding-bottom: 8px; margin-bottom: 8px; }
        .px-previewPublicStack { display: grid; gap: 18px; }
        .px-previewPublicHero { min-height: 360px; }
        .px-previewHeroOverlay { padding: 18px 18px 16px; background: linear-gradient(180deg, rgba(15,23,42,0.02) 0%, rgba(15,23,42,0.74) 58%, rgba(15,23,42,0.92) 100%); }
        .px-previewPublicHero :global(h3) { max-width: 76%; font-size: clamp(24px, 3.6vw, 38px); line-height: 1.06; margin: 0 0 6px; text-wrap: balance; }
        .px-previewPublicHero :global(.publicNewsTileOverlay > div:last-child) { font-size: 13px; }
        .px-previewPublicGrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
        .px-previewPublicGridCard { min-height: 220px; }
        .px-previewSectionHead { display: flex; align-items: center; justify-content: space-between; }
        .px-previewArchiveList { display: grid; gap: 8px; }
        .px-previewArchiveItem { display: flex; align-items: center; justify-content: space-between; gap: 12px; border: 1px solid rgba(15, 23, 42, 0.08); border-radius: 10px; padding: 10px 12px; background: rgba(255,255,255,0.84); }
        .px-previewArchiveItem:hover { border-color: rgba(16, 185, 129, 0.22); }
        .px-previewArchiveMeta { min-width: 0; display: grid; gap: 4px; }
        .px-previewArchiveMeta strong { font-size: 14px; line-height: 1.2; }
        .px-previewArchiveMeta p { margin: 0; font-size: 12px; color: rgba(23,37,63,.62); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 520px; }
        .px-articleOverlay { position: fixed; inset: 72px 0 0 0; background: rgba(15, 23, 42, 0.72); z-index: 80; padding: 16px; overflow-y: auto; overflow-x: hidden; }
        .px-articleOverlayShell { width: min(900px, 100%); margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; min-height: calc(100vh - 104px); display: grid; grid-template-rows: auto minmax(0, 1fr); }
        .px-articleOverlayHead { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; border-bottom: 1px solid rgba(15, 23, 42, 0.08); background: #fff; position: sticky; top: 0; z-index: 1; }
        .px-articleOverlayArticle { min-height: 0; overflow-y: auto; }
        .px-articleOverlayHero, .px-articleOverlayGallery img { width: 100%; display: block; object-fit: cover; }
        .px-articleOverlayHero { height: 280px; }
        .px-articleOverlayBody { display: grid; gap: 14px; padding: 18px; }
        .px-articleOverlayBody h2 { margin: 0; font-size: 32px; line-height: 1.08; }
        .px-articleOverlayLead { margin: 0; font-size: 18px; line-height: 1.45; color: rgba(23,37,63,.74); }
        .px-articleOverlayCopy { display: grid; gap: 12px; color: #0f172a; font-size: 15px; line-height: 1.72; }
        .px-articleOverlayCopy p { margin: 0; }
        .px-articleOverlayGallery { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        .px-articleOverlayGallery img { aspect-ratio: 4 / 3; border-radius: 8px; }
        :global(.px-btn--dangerGhost) { color: #b91c1c; border-color: rgba(185, 28, 28, 0.18); background: rgba(185, 28, 28, 0.04); }
        @media (max-width: 980px) {
          .px-newsEditorGrid { grid-template-columns: 1fr; }
          .px-newsRow { grid-template-columns: 1fr; align-items: stretch; }
          .px-newsRowActions { flex-direction: row; }
          .px-newsPreviewStack { max-height: none; overflow: visible; padding-right: 0; position: static; top: auto; }
          .px-newsEditorBlocks { overflow: visible; padding-right: 0; }
          .px-newsModalIntro { align-items: center; }
          .px-previewPublicGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 720px) {
          .px-newsModal { inset: 64px 0 0 0; padding: 10px 0 14px; }
          .px-newsModalCard { min-height: calc(100vh - 78px); border-radius: 0; padding: 16px; }
          .px-newsStack { margin: -6px -6px 0; }
          .px-newsToolbar, .px-newsModalHead, .px-newsModalActions, .px-newsSplit, .px-newsRowTop { flex-direction: column; align-items: stretch; }
          .px-newsModalIntro { flex-direction: row; align-items: center; }
          .px-newsModalIntro p { white-space: normal; }
          .px-newsRow { align-items: stretch; }
          .px-newsThumb { width: 100%; min-width: 0; height: 180px; }
          .px-newsRowActions { width: 100%; }
          .px-newsPagination { justify-content: space-between; }
          .px-articleGallery { grid-template-columns: 1fr; }
          .px-previewOverlay { inset: 64px 0 0 0; padding: 0; }
          .px-previewShell { width: 100%; min-height: calc(100vh - 64px); border-radius: 0; padding: 12px; }
          .px-previewHead { align-items: flex-start; }
          .px-previewPublicGrid { grid-template-columns: 1fr; }
          .px-previewPublicHero { min-height: 250px; }
          .px-previewPublicHero :global(h3) { max-width: 100%; font-size: clamp(22px, 7vw, 30px); }
          .px-previewArchiveItem { flex-direction: column; align-items: flex-start; }
          .px-previewArchiveMeta p { max-width: 100%; white-space: normal; }
          .px-articleOverlay { inset: 64px 0 0 0; padding: 0; }
          .px-articleOverlayShell { min-height: calc(100vh - 64px); border-radius: 0; }
          .px-articleOverlayHero { height: 220px; }
          .px-articleOverlayBody { padding: 14px; }
          .px-articleOverlayBody h2 { font-size: 26px; }
          .px-articleOverlayLead { font-size: 16px; }
          .px-articleOverlayGallery { grid-template-columns: 1fr; }
        }
      `}</style>
    </PlatformModuleShell>
  )
}
