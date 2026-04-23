'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useActiveClub } from '@/lib/useActiveClub'

type Category = { id: number; name: string }

type Errors = Partial<{
  name: string
  startDate: string
  categoryId: string
  minPairs: string
  maxPairs: string
  pricePerPlayer: string
  pointsTotal: string
  registrationDeadline: string
  endDate: string
  form: string
}>

export default function NuevoTorneoPage() {
  const router = useRouter()
  const { activeClub, loading: clubLoading } = useActiveClub()

  const [name, setName] = useState('')
  const [type, setType] = useState<string>('OPEN')
  const [format, setFormat] = useState<string>('GROUPS_ELIMINATION')
  const [gender, setGender] = useState<string>('MALE')

  const [categories, setCategories] = useState<Category[]>([])
  const [categoryId, setCategoryId] = useState<number>(0)

  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [registrationDeadline, setRegistrationDeadline] = useState<string>('')

  const [pricePerPlayer, setPricePerPlayer] = useState<string>('0')
  const [minPairs, setMinPairs] = useState<string>('6')
  const [maxPairs, setMaxPairs] = useState<string>('')
  const [pointsTotal, setPointsTotal] = useState<string>('0')

  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string>('')

  useEffect(() => {
    ;(async () => {
      const { data, error } = await supabase.from('categories').select('id, name').order('id', { ascending: false })
      if (error) return
      const rows = (data ?? []) as any as Category[]
      setCategories(rows)
      if (rows.find((c) => c.id === 7)) setCategoryId(7)
      else if (rows[0]) setCategoryId(rows[0].id)
      else setCategoryId(0)
    })()
  }, [])

  function markTouched(key: string) {
    setTouched((p) => ({ ...p, [key]: true }))
  }

  function toNumberSafe(v: string, fallback: number) {
    const n = Number(String(v).replace(',', '.'))
    return Number.isFinite(n) ? n : fallback
  }

  const errors: Errors = useMemo(() => {
    const e: Errors = {}

    if (!activeClub?.id) e.form = 'Seleccioná un club en el selector de arriba.'
    if (!name.trim()) e.name = 'El nombre es obligatorio.'
    if (!startDate) e.startDate = 'La fecha de inicio es obligatoria.'
    if (!categoryId) e.categoryId = 'Seleccioná una categoría.'

    const minP = Math.trunc(toNumberSafe(minPairs, NaN))
    if (!Number.isFinite(minP)) e.minPairs = 'Mín. parejas debe ser un número.'
    else if (minP < 2) e.minPairs = 'Mín. parejas debe ser al menos 2.'

    if (maxPairs.trim() !== '') {
      const maxP = Math.trunc(toNumberSafe(maxPairs, NaN))
      if (!Number.isFinite(maxP)) e.maxPairs = 'Máx. parejas debe ser un número.'
      else if (maxP < 2) e.maxPairs = 'Máx. parejas debe ser al menos 2.'
      else if (Number.isFinite(minP) && maxP < minP) e.maxPairs = 'Máx. parejas no puede ser menor que Mín. parejas.'
    }

    const price = toNumberSafe(pricePerPlayer, NaN)
    if (!Number.isFinite(price)) e.pricePerPlayer = 'Precio debe ser un número.'
    else if (price < 0) e.pricePerPlayer = 'Precio no puede ser negativo.'

    const pts = Math.trunc(toNumberSafe(pointsTotal, NaN))
    if (!Number.isFinite(pts)) e.pointsTotal = 'Puntos debe ser un número.'
    else if (pts < 0) e.pointsTotal = 'Puntos no puede ser negativo.'

    if (endDate && startDate && endDate < startDate) e.endDate = 'La fecha fin no puede ser anterior al inicio.'

    if (registrationDeadline && startDate) {
      const dlDate = registrationDeadline.split('T')[0]
      if (dlDate < startDate) e.registrationDeadline = 'El cierre no puede ser antes del inicio.'
    }

    return e
  }, [activeClub?.id, name, startDate, categoryId, minPairs, maxPairs, pricePerPlayer, pointsTotal, endDate, registrationDeadline])

  const canSave = useMemo(() => Object.keys(errors).length === 0, [errors])

  async function crearTorneo() {
    setMsg('')

    setTouched({
      name: true, startDate: true, categoryId: true, minPairs: true,
      maxPairs: true, pricePerPlayer: true, pointsTotal: true,
      endDate: true, registrationDeadline: true, form: true,
    })

    if (!canSave) {
      setMsg('❌ Revisá los campos marcados.')
      return
    }
    if (!activeClub) {
      setMsg('❌ Seleccioná un club.')
      return
    }

    setSaving(true)
    setMsg('Creando torneo…')

    // Obtener el access token de la sesión activa
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData?.session?.access_token

    if (!accessToken) {
      setMsg('❌ Sesión expirada. Volvé a iniciar sesión.')
      setSaving(false)
      return
    }

    const rulesPayload = { wo_tolerance_minutes: 10, wo_score: '6-0 6-0' }

    const tournamentPayload: any = {
      club_id: activeClub.id,
      name: name.trim(),
      type,
      tournament_type: type,
      format,
      gender,
      category_id: categoryId,
      category: categoryId,
      start_date: startDate,
      starts_on: startDate,
      status: 'DRAFT',
      price_per_player: toNumberSafe(pricePerPlayer, 0),
      min_pairs: Math.max(2, Math.trunc(toNumberSafe(minPairs, 6))),
      points_total: Math.max(0, Math.trunc(toNumberSafe(pointsTotal, 0))),
      rules: rulesPayload,
      rules_json: rulesPayload,
    }

    if (endDate) { tournamentPayload.end_date = endDate; tournamentPayload.ends_on = endDate }
    if (registrationDeadline) { tournamentPayload.registration_deadline = registrationDeadline; tournamentPayload.signup_deadline = registrationDeadline }
    if (maxPairs.trim() !== '') tournamentPayload.max_pairs = Math.max(2, Math.trunc(toNumberSafe(maxPairs, 0)))

    // Llamar a la API route (usa service_role, evita RLS)
    const res = await fetch('/api/tournaments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken, tournament: tournamentPayload }),
    })

    const json = await res.json()
    setSaving(false)

    if (!res.ok || json.error) {
      setMsg(`❌ ${json.error ?? 'Error al crear el torneo'}`)
      return
    }

    setMsg('✅ Torneo creado correctamente.')
    router.replace(`/torneos/${json.id}`)
  }

  if (clubLoading) return <div className="px-wrap"><div className="px-help">Cargando…</div></div>

  // Estilos consistentes con el resto de la app
  const fieldStyle: React.CSSProperties = { display: 'grid', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--text)' }
  const inputStyle: React.CSSProperties = { width: '100%', height: 40, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--glass)', fontSize: 13, outline: 'none', boxSizing: 'border-box', color: 'var(--text)' }
  const inputErrStyle: React.CSSProperties = { ...inputStyle, border: '1.5px solid #ef4444', boxShadow: '0 0 0 3px rgba(239,68,68,.1)' }
  const errText: React.CSSProperties = { fontSize: 12, color: '#ef4444', fontWeight: 600 }

  function inp(key: string) { return touched[key] && (errors as any)[key] ? inputErrStyle : inputStyle }

  return (
    <div className="px-wrap" style={{ maxWidth: 760 }}>
      <div className="club-panel">
        <div className="club-head" style={{ marginBottom: 20 }}>
          <div>
            <h1 className="club-title">Crear torneo</h1>
            <p className="club-sub">Club activo: <b>{activeClub?.name ?? '— seleccioná un club arriba'}</b></p>
          </div>
        </div>

        {touched.form && errors.form && (
          <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)', color: '#ef4444', fontSize: 13, fontWeight: 700 }}>
            {errors.form}
          </div>
        )}

        <div style={{ display: 'grid', gap: 16 }}>
          {/* Nombre */}
          <label style={fieldStyle}>
            Nombre del torneo *
            <input style={inp('name')} value={name} onChange={e => setName(e.target.value)} onBlur={() => markTouched('name')} placeholder="Ej: Open Verano 2026 — 6ª Categoría" />
            {touched.name && errors.name && <div style={errText}>{errors.name}</div>}
          </label>

          {/* Tipo / Género / Formato */}
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr 1fr' }}>
            <label style={fieldStyle}>
              Tipo de torneo
              <select style={inputStyle} value={type} onChange={e => setType(e.target.value)}>
                <option value="OPEN">OPEN</option>
                <option value="CHALLENGER">CHALLENGER</option>
                <option value="MASTER">MASTER</option>
                <option value="MASTER_FINAL">MASTER FINAL</option>
                <option value="EXHIBITION">EXHIBITION (sin puntos)</option>
              </select>
            </label>
            <label style={fieldStyle}>
              Género
              <select style={inputStyle} value={gender} onChange={e => setGender(e.target.value)}>
                <option value="MALE">Masculino</option>
                <option value="FEMALE">Femenino</option>
                <option value="MIXED">Mixto</option>
              </select>
            </label>
            <label style={fieldStyle}>
              Formato
              <select style={inputStyle} value={format} onChange={e => setFormat(e.target.value)}>
                <option value="GROUPS_ELIMINATION">Zonas + Eliminación</option>
                <option value="ELIMINATION">Eliminación directa</option>
                <option value="GROUPS">Solo zonas</option>
              </select>
            </label>
          </div>

          {/* Categoría / Puntos */}
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
            <label style={fieldStyle}>
              Categoría *
              <select style={inp('categoryId')} value={String(categoryId || '')} onChange={e => setCategoryId(Number(e.target.value))} onBlur={() => markTouched('categoryId')}>
                <option value="">(seleccionar)</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {touched.categoryId && errors.categoryId && <div style={errText}>{errors.categoryId}</div>}
            </label>
            <label style={fieldStyle}>
              Puntos totales a repartir
              <input style={inp('pointsTotal')} value={pointsTotal} onChange={e => setPointsTotal(e.target.value)} onBlur={() => markTouched('pointsTotal')} placeholder="Ej: 1000" />
              {touched.pointsTotal && errors.pointsTotal && <div style={errText}>{errors.pointsTotal}</div>}
            </label>
          </div>

          {/* Fechas */}
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr 1fr' }}>
            <label style={fieldStyle}>
              Fecha de inicio *
              <input style={inp('startDate')} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} onBlur={() => markTouched('startDate')} />
              {touched.startDate && errors.startDate && <div style={errText}>{errors.startDate}</div>}
            </label>
            <label style={fieldStyle}>
              Fecha de fin (opcional)
              <input style={inp('endDate')} type="date" value={endDate} onChange={e => setEndDate(e.target.value)} onBlur={() => markTouched('endDate')} />
              {touched.endDate && errors.endDate && <div style={errText}>{errors.endDate}</div>}
            </label>
            <label style={fieldStyle}>
              Cierre de inscripción (opcional)
              <input style={inp('registrationDeadline')} type="datetime-local" value={registrationDeadline} onChange={e => setRegistrationDeadline(e.target.value)} onBlur={() => markTouched('registrationDeadline')} />
              {touched.registrationDeadline && errors.registrationDeadline && <div style={errText}>{errors.registrationDeadline}</div>}
            </label>
          </div>

          {/* Precio / Parejas */}
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr 1fr' }}>
            <label style={fieldStyle}>
              Precio por jugador ($)
              <input style={inp('pricePerPlayer')} value={pricePerPlayer} onChange={e => setPricePerPlayer(e.target.value)} onBlur={() => markTouched('pricePerPlayer')} placeholder="Ej: 5000" />
              {touched.pricePerPlayer && errors.pricePerPlayer && <div style={errText}>{errors.pricePerPlayer}</div>}
            </label>
            <label style={fieldStyle}>
              Mínimo de parejas
              <input style={inp('minPairs')} value={minPairs} onChange={e => setMinPairs(e.target.value)} onBlur={() => markTouched('minPairs')} placeholder="Ej: 6" />
              {touched.minPairs && errors.minPairs && <div style={errText}>{errors.minPairs}</div>}
            </label>
            <label style={fieldStyle}>
              Máximo de parejas (opcional)
              <input style={inp('maxPairs')} value={maxPairs} onChange={e => setMaxPairs(e.target.value)} onBlur={() => markTouched('maxPairs')} placeholder="Ej: 16" />
              {touched.maxPairs && errors.maxPairs && <div style={errText}>{errors.maxPairs}</div>}
            </label>
          </div>

          {/* Info */}
          <div className="px-card px-card--flat" style={{ padding: '12px 14px', background: 'rgba(46,84,147,.05)', border: '1px solid rgba(46,84,147,.15)', fontSize: 13, color: 'var(--muted)' }}>
            💡 El torneo se crea en estado <b>DRAFT</b>. Podés editarlo y cambiar su estado a <b>OPEN</b> para abrir las inscripciones.
          </div>

          {msg && (
            <div style={{ padding: '12px 14px', borderRadius: 10, background: msg.startsWith('❌') ? 'rgba(239,68,68,.08)' : 'rgba(16,185,129,.08)', border: `1px solid ${msg.startsWith('❌') ? 'rgba(239,68,68,.3)' : 'rgba(16,185,129,.3)'}`, color: msg.startsWith('❌') ? '#ef4444' : '#065f46', fontSize: 13, fontWeight: 700 }}>
              {msg}
            </div>
          )}

          {/* Botón */}
          <button
            onClick={crearTorneo}
            disabled={saving || !activeClub}
            className="px-btn px-btn--magenta"
            style={{ height: 46, fontSize: 15, width: '100%', opacity: (!activeClub || saving) ? 0.6 : 1 }}
          >
            {saving ? 'Creando torneo…' : '+ Crear torneo'}
          </button>
        </div>
      </div>
    </div>
  )
}
