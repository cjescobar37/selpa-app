'use client'

import { useMemo, useState } from 'react'

type SportsSettingsCardProps = {
  courtsCount?: string | number | null
  onActivate: () => void
}

type CourtItem = {
  id: string
  name: string
  floor: string
  walls: string
  cover: string
  status: string
  removable?: boolean
}

function buildCourtItems(courtsCount?: string | number | null) {
  const parsed = Number(courtsCount)
  const count = Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.trunc(parsed), 12) : 3
  return Array.from({ length: count }, (_, index) => `Cancha ${index + 1}`)
}

function buildCourtCatalog(courtsCount?: string | number | null): CourtItem[] {
  return buildCourtItems(courtsCount).slice(0, 6).map((name, index) => ({
    id: `base-${index}`,
    name,
    floor: index % 2 === 0 ? 'Sintético' : 'Carpeta',
    walls: index % 3 === 0 ? 'Blindex' : 'Mixta',
    cover: index % 2 === 0 ? 'Descubierta' : 'Semicubierta',
    status: index < 4 ? 'Activa' : 'Preparada',
  }))
}

function SportsChip({ label }: { label: string }) {
  return (
    <span
      style={{
        alignItems: 'center',
        background: '#fff',
        border: '1px solid rgba(6,27,58,.14)',
        borderRadius: 999,
        color: '#061b3a',
        display: 'inline-flex',
        fontSize: 11,
        fontWeight: 900,
        gap: 6,
        minHeight: 28,
        padding: '6px 9px',
        whiteSpace: 'nowrap',
      }}
    >
      <i aria-hidden="true" style={{ background: '#94a3b8', borderRadius: 999, height: 5, width: 5 }} />
      {label}
    </span>
  )
}

const selectOptions = {
  floor: ['Sintético', 'Cemento', 'Carpeta', 'Otro'],
  walls: ['Blindex', 'Cemento', 'Mixta'],
  cover: ['Descubierta', 'Semicubierta', 'Cubierta'],
  status: ['Activa', 'Inactiva'],
}

export function SportsSettingsCard({ courtsCount, onActivate }: SportsSettingsCardProps) {
  const baseCourtCatalog = useMemo(() => buildCourtCatalog(courtsCount), [courtsCount])
  const [draft, setDraft] = useState({
    name: `Cancha ${baseCourtCatalog.length + 1}`,
    floor: 'Sintético',
    walls: 'Blindex',
    cover: 'Descubierta',
    status: 'Activa',
  })
  const [localCourts, setLocalCourts] = useState<CourtItem[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const courtCatalog = [...baseCourtCatalog, ...localCourts]
  const updateDraft = (key: keyof typeof draft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }
  const addCourt = () => {
    const name = draft.name.trim()
    if (!name) return
    setLocalCourts((current) => [
      ...current,
      {
        id: `local-${Date.now()}-${current.length}`,
        ...draft,
        name,
        removable: true,
      },
    ])
    setDraft((current) => ({
      ...current,
      name: `Cancha ${baseCourtCatalog.length + localCourts.length + 2}`,
    }))
    setFormOpen(false)
  }
  const removeCourt = (id: string) => {
    setLocalCourts((current) => current.filter((court) => court.id !== id))
  }
  const sportsGroups = [
    { title: 'Categorías', items: ['3ra', '4ta', '5ta', '6ta', '7ma', '8va'] },
    { title: 'Ramas', items: ['Caballeros', 'Damas', 'Mixto'] },
    { title: 'Segmentos', items: ['Libres', 'Menores', 'Veteranos', 'Suma'] },
    { title: 'Tipos de torneo', items: ['Open', 'Master', 'Challenger', 'Americano'] },
    { title: 'Sistemas', items: ['Zona + Playoff', 'Todos contra todos', 'Eliminación directa'] },
  ]

  return (
    <div className="px-card px-card--flat" style={{ background: '#fff', border: '1px solid rgba(15,23,42,.08)', display: 'grid', gap: 12, padding: 16 }}>
      <div style={{ alignItems: 'flex-start', display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' }}>
        <div>
          <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <div className="px-sectionTitle">Configuración deportiva</div>
            <span style={{ background: 'rgba(6,27,58,.06)', border: '1px solid rgba(6,27,58,.10)', borderRadius: 999, color: '#475569', fontSize: 10, fontWeight: 950, letterSpacing: '.04em', padding: '5px 8px', textTransform: 'uppercase' }}>
              Preparado para configurar
            </span>
          </div>
          <p className="px-help" style={{ marginTop: 4, maxWidth: 620 }}>
            Esta configuración definirá qué opciones aparecen al crear torneos y rankings del club.
          </p>
        </div>
        <button className="px-btn" type="button" onClick={onActivate} style={{ background: '#061b3a', border: '1px solid rgba(6,27,58,.18)', borderRadius: 999, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 900, minHeight: 34, padding: '8px 13px' }}>
          Activar configuración deportiva
        </button>
      </div>

      <section style={{ background: 'rgba(248,250,252,.74)', border: '1px solid rgba(15,23,42,.08)', borderRadius: 16, display: 'grid', gap: 10, padding: 12 }}>
        <div style={{ alignItems: 'baseline', display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }}>
          <strong style={{ color: '#061b3a', fontSize: 14, fontWeight: 950 }}>Oferta deportiva</strong>
          <span className="px-help" style={{ fontSize: 11 }}>Opciones visibles para el futuro módulo real.</span>
        </div>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
          {sportsGroups.map((group) => (
            <section key={group.title} style={{ background: '#fff', border: '1px solid rgba(15,23,42,.07)', borderRadius: 12, display: 'grid', gap: 7, padding: 9 }}>
              <div style={{ alignItems: 'center', display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                <strong style={{ color: '#17253f', fontSize: 12, fontWeight: 950 }}>{group.title}</strong>
                <small style={{ color: '#94a3b8', fontSize: 10, fontWeight: 900 }}>{group.items.length}</small>
              </div>
              <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {group.items.map((item) => <SportsChip key={item} label={item} />)}
              </div>
            </section>
          ))}
        </div>
      </section>

      <section style={{ background: 'rgba(248,250,252,.74)', border: '1px solid rgba(15,23,42,.08)', borderRadius: 16, display: 'grid', gap: 10, padding: 12 }}>
        <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }}>
          <div>
            <strong style={{ color: '#061b3a', display: 'block', fontSize: 14, fontWeight: 950 }}>Catálogo de canchas</strong>
            <span className="px-help" style={{ fontSize: 11 }}>Vista preparada. El guardado real requiere activar el modelo de canchas del club.</span>
          </div>
          <button type="button" onClick={() => setFormOpen((current) => !current)} style={{ background: formOpen ? '#fff' : '#061b3a', border: formOpen ? '1px solid rgba(15,23,42,.14)' : '1px solid rgba(6,27,58,.18)', borderRadius: 999, color: formOpen ? '#061b3a' : '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 950, minHeight: 34, padding: '8px 12px', whiteSpace: 'nowrap' }}>
            {formOpen ? 'Cerrar alta' : 'Agregar cancha'}
          </button>
        </div>

        {formOpen ? (
          <div style={{ alignItems: 'end', background: '#fff', border: '1px solid rgba(15,23,42,.08)', borderRadius: 12, display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(122px, 1fr))', padding: 10 }}>
            <label className="px-field" style={{ gap: 4 }}>
              <span className="px-label" style={{ fontSize: 10 }}>Nombre</span>
              <input className="px-input" value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} style={{ minHeight: 34 }} />
            </label>
            <label className="px-field" style={{ gap: 4 }}>
              <span className="px-label" style={{ fontSize: 10 }}>Piso</span>
              <select className="px-input" value={draft.floor} onChange={(event) => updateDraft('floor', event.target.value)} style={{ minHeight: 34 }}>
                {selectOptions.floor.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            <label className="px-field" style={{ gap: 4 }}>
              <span className="px-label" style={{ fontSize: 10 }}>Paredes</span>
              <select className="px-input" value={draft.walls} onChange={(event) => updateDraft('walls', event.target.value)} style={{ minHeight: 34 }}>
                {selectOptions.walls.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            <label className="px-field" style={{ gap: 4 }}>
              <span className="px-label" style={{ fontSize: 10 }}>Cubierta</span>
              <select className="px-input" value={draft.cover} onChange={(event) => updateDraft('cover', event.target.value)} style={{ minHeight: 34 }}>
                {selectOptions.cover.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            <label className="px-field" style={{ gap: 4 }}>
              <span className="px-label" style={{ fontSize: 10 }}>Estado</span>
              <select className="px-input" value={draft.status} onChange={(event) => updateDraft('status', event.target.value)} style={{ minHeight: 34 }}>
                {selectOptions.status.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            <button type="button" onClick={addCourt} style={{ background: '#061b3a', border: '1px solid rgba(6,27,58,.18)', borderRadius: 999, color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 950, minHeight: 34, padding: '8px 12px', whiteSpace: 'nowrap' }}>
              Guardar en vista
            </button>
          </div>
        ) : null}

        <div style={{ background: '#fff', border: '1px solid rgba(15,23,42,.08)', borderRadius: 12, overflowX: 'auto' }}>
          <div style={{ minWidth: 680 }}>
            <div style={{ background: 'rgba(241,245,249,.84)', borderBottom: '1px solid rgba(15,23,42,.08)', color: '#64748b', display: 'grid', fontSize: 10, fontWeight: 950, gap: 8, gridTemplateColumns: '1.2fr repeat(4, .82fr) 74px', letterSpacing: '.04em', padding: '8px 10px', textTransform: 'uppercase' }}>
              <span>Cancha</span>
              <span>Piso</span>
              <span>Paredes</span>
              <span>Cubierta</span>
              <span>Estado</span>
              <span>Acción</span>
            </div>
            {courtCatalog.map((court) => (
              <div key={court.id} style={{ alignItems: 'center', borderBottom: '1px solid rgba(15,23,42,.06)', color: '#334155', display: 'grid', fontSize: 12, fontWeight: 850, gap: 8, gridTemplateColumns: '1.2fr repeat(4, .82fr) 74px', minHeight: 42, padding: '8px 10px' }}>
                <strong style={{ color: '#061b3a', fontSize: 13 }}>{court.name}</strong>
                <span>{court.floor}</span>
                <span>{court.walls}</span>
                <span>{court.cover}</span>
                <span style={{ background: court.status === 'Activa' ? '#ecfdf3' : '#f8fafc', border: '1px solid rgba(15,23,42,.08)', borderRadius: 999, color: court.status === 'Activa' ? '#166534' : '#64748b', justifySelf: 'start', padding: '4px 8px' }}>
                  {court.status}
                </span>
                {court.removable ? (
                  <button type="button" onClick={() => removeCourt(court.id)} style={{ background: '#fff', border: '1px solid rgba(239,68,68,.22)', borderRadius: 999, color: '#b91c1c', cursor: 'pointer', fontSize: 10, fontWeight: 950, padding: '5px 8px' }}>
                    Quitar
                  </button>
                ) : (
                  <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 800 }}>Base</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
