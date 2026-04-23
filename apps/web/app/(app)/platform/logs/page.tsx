'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import AuthAlert from '@/components/AuthAlert'

type AuditRow = {
  id: string
  actor_user_id: string | null
  actor_name: string
  actor_email: string | null
  action: string
  entity_type: string
  entity_id: string | null
  entity_label: string | null
  metadata: Record<string, unknown>
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

type ActorOption = {
  id: string
  name: string
  email: string | null
}

function formatDateTime(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function shortId(value: string | null) {
  if (!value) return '—'
  return value.slice(0, 8)
}

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2)
  } catch {
    return '{}'
  }
}

export default function PlatformLogsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [auditReady, setAuditReady] = useState(true)
  const [rows, setRows] = useState<AuditRow[]>([])
  const [actions, setActions] = useState<string[]>([])
  const [entities, setEntities] = useState<string[]>([])
  const [actors, setActors] = useState<ActorOption[]>([])
  const [actionFilter, setActionFilter] = useState('all')
  const [entityFilter, setEntityFilter] = useState('all')
  const [actorFilter, setActorFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)

    const { data: sess } = await supabase.auth.getSession()
    const token = sess?.session?.access_token
    if (!token) {
      setError('Sesión expirada.')
      setLoading(false)
      return
    }

    const params = new URLSearchParams({ limit: '120' })
    if (actionFilter !== 'all') params.set('action', actionFilter)
    if (entityFilter !== 'all') params.set('entity_type', entityFilter)
    if (actorFilter !== 'all') params.set('actor_user_id', actorFilter)
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    if (query.trim()) params.set('q', query.trim())

    const res = await fetch(`/api/platform/logs?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const json = await res.json().catch(() => ({}))

    if (json?.code === 'AUDIT_NOT_INITIALIZED') {
      setAuditReady(false)
      setRows([])
      setSelectedId(null)
      setLoading(false)
      return
    }

    if (!res.ok) {
      setError(json?.error ?? 'No pude traer auditoría.')
      setLoading(false)
      return
    }

    const nextRows = (json?.rows ?? []) as AuditRow[]
    setAuditReady(true)
    setRows(nextRows)
    setActions(json?.actions ?? [])
    setEntities(json?.entities ?? [])
    setActors(json?.actors ?? [])
    setSelectedId((current) => current ?? nextRows[0]?.id ?? null)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const selected = useMemo(() => rows.find((row) => row.id === selectedId) ?? rows[0] ?? null, [rows, selectedId])
  const compactSummary = `${rows.length} eventos`

  return (
    <div className="platform-shell">
      <div className="px-platform px-platform--logs">
        <div className="px-platformHead">
          <div>
            <h1 className="px-platformTitle">Auditoría</h1>
            <div className="px-platformSub">Eventos críticos de Platform con actor, entidad y metadata técnica.</div>
          </div>
          <div className="px-toolbar">
            <button className="px-btn px-btn--ghost" type="button" onClick={load} disabled={loading}>
              {loading ? (<><span className="px-spinner" /> Recargando…</>) : 'Recargar'}
            </button>
          </div>
        </div>

        {!auditReady ? (
          <div style={{ marginTop: 14 }}>
            <AuthAlert variant="info" title="Auditoría aún no inicializada" message="Aplicá la migración de platform_audit_logs y recargá esta pantalla." />
          </div>
        ) : null}
        {error ? <div style={{ marginTop: 14 }}><AuthAlert variant="error" title="No pude traer auditoría" message={error} /></div> : null}

        <div className="px-platformAdminLayout">
          <section className="px-platformCard px-platformAdminMain">
            <div className="px-platformFilters px-platformFilters--logs">
              <label className="px-platformFilterField">
                <span>Buscar</span>
                <input className="px-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Acción, entidad o label" />
              </label>
              <label className="px-platformFilterField px-platformFilterField--sm">
                <span>Acción</span>
                <select className="px-input" value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
                  <option value="all">Todas</option>
                  {actions.map((action) => <option key={action} value={action}>{action}</option>)}
                </select>
              </label>
              <label className="px-platformFilterField px-platformFilterField--sm">
                <span>Entidad</span>
                <select className="px-input" value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)}>
                  <option value="all">Todas</option>
                  {entities.map((entity) => <option key={entity} value={entity}>{entity}</option>)}
                </select>
              </label>
              <label className="px-platformFilterField px-platformFilterField--sm">
                <span>Actor</span>
                <select className="px-input" value={actorFilter} onChange={(event) => setActorFilter(event.target.value)}>
                  <option value="all">Todos</option>
                  {actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.name}</option>)}
                </select>
              </label>
              <label className="px-platformFilterField px-platformFilterField--sm">
                <span>Desde</span>
                <input className="px-input" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
              </label>
              <label className="px-platformFilterField px-platformFilterField--sm">
                <span>Hasta</span>
                <input className="px-input" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
              </label>
              <button className="px-btn" type="button" onClick={load} disabled={loading}>
                Filtrar
              </button>
            </div>

            <div className="px-platformTableMeta">{compactSummary}</div>

            <div className="px-platformTableWrap">
              {loading ? (
                <div className="px-empty">Cargando auditoría…</div>
              ) : rows.length ? (
                <table className="px-table px-table--platform px-table--logs">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Actor</th>
                      <th>Acción</th>
                      <th>Entidad / label</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className={selected?.id === row.id ? 'is-selected' : ''} onClick={() => setSelectedId(row.id)}>
                        <td>{formatDateTime(row.created_at)}</td>
                        <td><strong>{row.actor_name}</strong><small>{row.actor_email || shortId(row.actor_user_id)}</small></td>
                        <td><span className="px-auditAction">{row.action}</span></td>
                        <td><strong>{row.entity_label || shortId(row.entity_id)}</strong><small>{row.entity_type}</small></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="px-empty">No hay eventos para estos filtros.</div>
              )}
            </div>
          </section>

          <aside className="px-platformCard px-platformAdminAside">
            {selected ? (
              <>
                <div className="px-sectionTitle">Detalle</div>
                <div className="px-platformDetailHero">
                  <strong>{selected.action}</strong>
                  <span className="px-statusBadge is-neutral">{selected.entity_type}</span>
                </div>
                <div className="px-platformDetailGrid">
                  <div><span>Fecha</span><strong>{formatDateTime(selected.created_at)}</strong></div>
                  <div><span>Actor</span><strong>{selected.actor_name}</strong></div>
                  <div><span>Entidad ID</span><strong>{selected.entity_id || '—'}</strong></div>
                  <div><span>IP</span><strong>{selected.ip_address || '—'}</strong></div>
                </div>
                <div className="px-auditMetadata">
                  <div className="px-sectionTitle">Metadata</div>
                  <pre>{prettyJson(selected.metadata)}</pre>
                </div>
              </>
            ) : (
              <div className="px-empty">Seleccioná un evento.</div>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}
