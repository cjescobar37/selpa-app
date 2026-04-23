'use client'

import { useEffect, useState } from 'react'
import { useSession } from '@/components/session/SessionProvider'

type Noticia = {
  id: string
  titulo: string
  contenido: string
  destacada: boolean
  fecha: string
  autor: string
}

// Notas locales (sin tabla en DB — se puede migrar luego a Supabase)
const STORAGE_KEY = 'pamprax_club_noticias'

function loadFromStorage(clubId: string): Noticia[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${clubId}`)
    if (!raw) return []
    return JSON.parse(raw) as Noticia[]
  } catch { return [] }
}

function saveToStorage(clubId: string, data: Noticia[]) {
  localStorage.setItem(`${STORAGE_KEY}_${clubId}`, JSON.stringify(data))
}

function nowISO() { return new Date().toISOString() }
function fmtDate(d: string) {
  try { return new Date(d).toLocaleDateString('es-AR', { day:'2-digit', month:'long', year:'numeric' }) }
  catch { return d }
}

export default function ClubNoticiasPage() {
  const { activeClub, role } = useSession()
  const [noticias, setNoticias] = useState<Noticia[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [titulo, setTitulo] = useState('')
  const [contenido, setContenido] = useState('')
  const [destacada, setDestacada] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const canManage = role === 'club' || role === 'platform'

  useEffect(() => {
    if (!activeClub?.id) return
    setNoticias(loadFromStorage(activeClub.id))
  }, [activeClub?.id])

  function openNew() {
    setEditId(null)
    setTitulo('')
    setContenido('')
    setDestacada(false)
    setShowForm(true)
  }

  function openEdit(n: Noticia) {
    setEditId(n.id)
    setTitulo(n.titulo)
    setContenido(n.contenido)
    setDestacada(n.destacada)
    setShowForm(true)
  }

  function handleSave() {
    if (!titulo.trim() || !contenido.trim() || !activeClub?.id) return
    setSaving(true)
    let updated: Noticia[]
    if (editId) {
      updated = noticias.map(n => n.id === editId ? { ...n, titulo, contenido, destacada } : n)
    } else {
      const nuevo: Noticia = { id: crypto.randomUUID(), titulo, contenido, destacada, fecha: nowISO(), autor: 'Administrador' }
      updated = [nuevo, ...noticias]
    }
    saveToStorage(activeClub.id, updated)
    setNoticias(updated)
    setShowForm(false)
    setSaving(false)
  }

  function handleDelete(id: string) {
    if (!activeClub?.id) return
    const updated = noticias.filter(n => n.id !== id)
    saveToStorage(activeClub.id, updated)
    setNoticias(updated)
    setDeleteId(null)
  }

  function toggleDestacada(id: string) {
    if (!activeClub?.id) return
    const updated = noticias.map(n => n.id === id ? { ...n, destacada: !n.destacada } : n)
    saveToStorage(activeClub.id, updated)
    setNoticias(updated)
  }

  const destacadas = noticias.filter(n => n.destacada)
  const resto = noticias.filter(n => !n.destacada)

  return (
    <div className="px-wrap">
      {/* Modal form */}
      {showForm && (
        <div className="px-overlay" onClick={() => setShowForm(false)}>
          <div className="px-modalCard" onClick={e => e.stopPropagation()} style={{ maxWidth:600 }}>
            <div className="px-modalHead">
              <h2 className="px-modalTitle">{editId ? 'Editar noticia' : 'Nueva noticia'}</h2>
              <button onClick={() => setShowForm(false)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--muted)' }}>✕</button>
            </div>
            <div style={{ display:'grid', gap:12 }}>
              <div>
                <div className="px-sepRow" style={{ marginBottom:6 }}>Título</div>
                <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ej: Torneo de verano 2026 — ¡Inscripciones abiertas!" style={{ width:'100%', height:40, padding:'0 12px', borderRadius:10, border:'1px solid var(--border)', fontSize:14, background:'var(--glass)', outline:'none', boxSizing:'border-box' }} />
              </div>
              <div>
                <div className="px-sepRow" style={{ marginBottom:6 }}>Contenido</div>
                <textarea value={contenido} onChange={e => setContenido(e.target.value)} placeholder="Escribí el contenido de la noticia aquí…" rows={6} style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid var(--border)', fontSize:14, background:'var(--glass)', outline:'none', resize:'vertical', fontFamily:'inherit', boxSizing:'border-box' }} />
              </div>
              <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', fontWeight:700 }}>
                <input type="checkbox" checked={destacada} onChange={e => setDestacada(e.target.checked)} style={{ width:16, height:16 }} />
                Marcar como noticia destacada
              </label>
              <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:4 }}>
                <button onClick={() => setShowForm(false)} className="px-btn px-btn--ghost">Cancelar</button>
                <button onClick={handleSave} disabled={saving || !titulo.trim() || !contenido.trim()} className="px-btn px-btn--magenta">
                  {saving ? 'Guardando…' : editId ? 'Guardar cambios' : 'Publicar noticia'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirm delete */}
      {deleteId && (
        <div className="px-overlay" onClick={() => setDeleteId(null)}>
          <div className="px-modalCard" onClick={e => e.stopPropagation()} style={{ maxWidth:400 }}>
            <h2 className="px-modalTitle">¿Eliminar noticia?</h2>
            <p className="px-modalBodyText" style={{ marginTop:12 }}>Esta acción no se puede deshacer.</p>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:16 }}>
              <button onClick={() => setDeleteId(null)} className="px-btn px-btn--ghost">Cancelar</button>
              <button onClick={() => handleDelete(deleteId)} className="px-btn px-btn--magenta">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      <div className="club-panel">
        <div className="club-head">
          <div>
            <h1 className="club-title">Noticias del club</h1>
            <p className="club-sub">Publicaciones internas · {noticias.length} noticias</p>
          </div>
          {canManage && (
            <button onClick={openNew} className="px-btn px-btn--magenta" style={{ height:36, padding:'0 16px', fontSize:13 }}>+ Nueva noticia</button>
          )}
        </div>

        {noticias.length === 0 ? (
          <div className="px-card px-card--flat" style={{ marginTop:20, textAlign:'center', padding:48 }}>
            <div style={{ fontSize:40 }}>📰</div>
            <div style={{ fontWeight:900, fontSize:16, marginTop:12 }}>No hay noticias publicadas</div>
            <div className="px-help" style={{ marginTop:6 }}>Las noticias del club aparecerán acá.</div>
            {canManage && (
              <button onClick={openNew} className="px-btn px-btn--magenta" style={{ marginTop:16 }}>Publicar primera noticia</button>
            )}
          </div>
        ) : (
          <>
            {destacadas.length > 0 && (
              <div style={{ marginTop:18 }}>
                <div className="px-sepRow" style={{ marginBottom:10 }}>⭐ Destacadas</div>
                <div style={{ display:'grid', gap:10 }}>
                  {destacadas.map(n => (
                    <NoticiaCard key={n.id} n={n} canManage={canManage} onEdit={() => openEdit(n)} onDelete={() => setDeleteId(n.id)} onToggle={() => toggleDestacada(n.id)} />
                  ))}
                </div>
              </div>
            )}
            {resto.length > 0 && (
              <div style={{ marginTop: destacadas.length ? 20 : 18 }}>
                {destacadas.length > 0 && <div className="px-sepRow" style={{ marginBottom:10 }}>Todas las noticias</div>}
                <div style={{ display:'grid', gap:10 }}>
                  {resto.map(n => (
                    <NoticiaCard key={n.id} n={n} canManage={canManage} onEdit={() => openEdit(n)} onDelete={() => setDeleteId(n.id)} onToggle={() => toggleDestacada(n.id)} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function NoticiaCard({ n, canManage, onEdit, onDelete, onToggle }: { n: Noticia; canManage: boolean; onEdit: ()=>void; onDelete: ()=>void; onToggle: ()=>void }) {
  const [expanded, setExpanded] = useState(false)
  function fmtDate(d: string) {
    try { return new Date(d).toLocaleDateString('es-AR', { day:'2-digit', month:'long', year:'numeric' }) }
    catch { return d }
  }
  return (
    <div className="px-card px-card--flat" style={{ padding:'16px 18px', borderLeft: n.destacada ? '3px solid var(--magenta)' : '1px solid var(--border)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            {n.destacada && <span style={{ fontSize:11, fontWeight:900, padding:'2px 8px', borderRadius:999, background:'rgba(255,78,114,.12)', color:'var(--magenta)', border:'1px solid rgba(255,78,114,.3)' }}>⭐ Destacada</span>}
            <span style={{ fontSize:11, color:'var(--muted)' }}>{fmtDate(n.fecha)} · {n.autor}</span>
          </div>
          <div style={{ fontWeight:900, fontSize:16, marginTop:6 }}>{n.titulo}</div>
          <div style={{ marginTop:6, fontSize:14, color:'var(--muted)', lineHeight:1.5, maxHeight: expanded ? 'none' : '3em', overflow:'hidden' }}>{n.contenido}</div>
          {n.contenido.length > 120 && (
            <button onClick={() => setExpanded(e => !e)} style={{ all:'unset', cursor:'pointer', fontSize:12, fontWeight:900, color:'var(--navy)', marginTop:4 }}>
              {expanded ? 'Ver menos ▲' : 'Ver más ▼'}
            </button>
          )}
        </div>
        {canManage && (
          <div style={{ display:'flex', gap:6, flexShrink:0 }}>
            <button onClick={onToggle} title={n.destacada ? 'Quitar destacada' : 'Marcar destacada'} style={{ all:'unset', cursor:'pointer', fontSize:16, opacity:.7 }}>{n.destacada ? '★' : '☆'}</button>
            <button onClick={onEdit} className="px-btn px-btn--ghost" style={{ height:30, padding:'0 10px', fontSize:12 }}>Editar</button>
            <button onClick={onDelete} style={{ height:30, padding:'0 10px', fontSize:12, borderRadius:8, border:'1px solid rgba(239,68,68,.3)', background:'rgba(239,68,68,.08)', color:'#ef4444', fontWeight:900, cursor:'pointer' }}>Eliminar</button>
          </div>
        )}
      </div>
    </div>
  )
}
