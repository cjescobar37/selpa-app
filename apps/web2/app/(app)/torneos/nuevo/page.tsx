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
  }, [
    activeClub?.id,
    name,
    startDate,
    categoryId,
    minPairs,
    maxPairs,
    pricePerPlayer,
    pointsTotal,
    endDate,
    registrationDeadline,
  ])

  const canSave = useMemo(() => Object.keys(errors).length === 0, [errors])

  async function crearTorneo() {
    setMsg('')

    setTouched({
      name: true,
      startDate: true,
      categoryId: true,
      minPairs: true,
      maxPairs: true,
      pricePerPlayer: true,
      pointsTotal: true,
      endDate: true,
      registrationDeadline: true,
      form: true,
    })

    if (!canSave) {
      setMsg('❌ Revisá los campos marcados en rojo.')
      return
    }
    if (!activeClub) {
      setMsg('❌ Seleccioná un club.')
      return
    }

    setSaving(true)
    setMsg('Creando...')

    const rulesPayload = {
      wo_tolerance_minutes: 10,
      wo_score: '6-0 6-0',
    }

    const payload: any = {
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

    if (endDate) {
      payload.end_date = endDate
      payload.ends_on = endDate
    }
    if (registrationDeadline) {
      payload.registration_deadline = registrationDeadline
      payload.signup_deadline = registrationDeadline
    }
    if (maxPairs.trim() !== '') payload.max_pairs = Math.max(2, Math.trunc(toNumberSafe(maxPairs, 0)))

    const { data, error } = await supabase.from('tournaments').insert(payload).select('id').single()

    setSaving(false)

    if (error) {
      setMsg(`❌ ${error.message}`)
      return
    }

    setMsg('✅ Torneo creado.')
    router.replace(`/torneos/${data.id}`)
  }

  if (clubLoading) return <div>Cargando...</div>

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Crear torneo</h1>
      <div style={{ opacity: 0.75, marginTop: 6 }}>
        Club activo: <b>{activeClub?.name ?? '(seleccionar en la barra)'}</b>
      </div>

      {(touched.form && errors.form) ? (
        <div style={{ marginTop: 10, color: '#ff6b6b' }}>{errors.form}</div>
      ) : null}

      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        <label style={label}>
          Nombre
          <input
            style={inputErr(!!(touched.name && errors.name))}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => markTouched('name')}
            placeholder="Ej: Open Verano 6ta"
          />
          {touched.name && errors.name ? <div style={errText}>{errors.name}</div> : null}
        </label>

        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr 1fr' }}>
          <label style={label}>
            Tipo (reparte puntos)
            <select style={input} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="OPEN">OPEN</option>
              <option value="CHALLENGER">CHALLENGER</option>
              <option value="MASTER">MASTER</option>
              <option value="MASTER_FINAL">MASTER FINAL</option>
              <option value="EXHIBITION">EXHIBITION</option>
            </select>
          </label>

          <label style={label}>
            Género
            <select style={input} value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="MALE">Masculino</option>
              <option value="FEMALE">Femenino</option>
              <option value="MIXED">Mixto</option>
            </select>
          </label>

          <label style={label}>
            Formato
            <select style={input} value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="GROUPS_ELIMINATION">Zonas + Eliminación</option>
              <option value="ELIMINATION">Eliminación directa</option>
              <option value="GROUPS">Solo zonas</option>
            </select>
          </label>
        </div>

        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
          <label style={label}>
            Categoría
            <select
              style={inputErr(!!(touched.categoryId && errors.categoryId))}
              value={String(categoryId || '')}
              onChange={(e) => setCategoryId(Number(e.target.value))}
              onBlur={() => markTouched('categoryId')}
            >
              <option value="">(seleccionar)</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {touched.categoryId && errors.categoryId ? <div style={errText}>{errors.categoryId}</div> : null}
          </label>

          <label style={label}>
            Puntos totales a repartir
            <input
              style={inputErr(!!(touched.pointsTotal && errors.pointsTotal))}
              value={pointsTotal}
              onChange={(e) => setPointsTotal(e.target.value)}
              onBlur={() => markTouched('pointsTotal')}
              placeholder="Ej: 1000"
            />
            {touched.pointsTotal && errors.pointsTotal ? <div style={errText}>{errors.pointsTotal}</div> : null}
          </label>
        </div>

        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr 1fr' }}>
          <label style={label}>
            Fecha inicio (obligatoria)
            <input
              style={inputErr(!!(touched.startDate && errors.startDate))}
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              onBlur={() => markTouched('startDate')}
            />
            {touched.startDate && errors.startDate ? <div style={errText}>{errors.startDate}</div> : null}
          </label>

          <label style={label}>
            Fecha fin (opcional)
            <input
              style={inputErr(!!(touched.endDate && errors.endDate))}
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              onBlur={() => markTouched('endDate')}
            />
            {touched.endDate && errors.endDate ? <div style={errText}>{errors.endDate}</div> : null}
          </label>

          <label style={label}>
            Cierre inscripción (opcional)
            <input
              style={inputErr(!!(touched.registrationDeadline && errors.registrationDeadline))}
              type="datetime-local"
              value={registrationDeadline}
              onChange={(e) => setRegistrationDeadline(e.target.value)}
              onBlur={() => markTouched('registrationDeadline')}
            />
            {touched.registrationDeadline && errors.registrationDeadline ? (
              <div style={errText}>{errors.registrationDeadline}</div>
            ) : null}
          </label>
        </div>

        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
          <label style={label}>
            $ por jugador
            <input
              style={inputErr(!!(touched.pricePerPlayer && errors.pricePerPlayer))}
              value={pricePerPlayer}
              onChange={(e) => setPricePerPlayer(e.target.value)}
              onBlur={() => markTouched('pricePerPlayer')}
            />
            {touched.pricePerPlayer && errors.pricePerPlayer ? <div style={errText}>{errors.pricePerPlayer}</div> : null}
          </label>

          <label style={label}>
            Mín. parejas
            <input
              style={inputErr(!!(touched.minPairs && errors.minPairs))}
              value={minPairs}
              onChange={(e) => setMinPairs(e.target.value)}
              onBlur={() => markTouched('minPairs')}
            />
            {touched.minPairs && errors.minPairs ? <div style={errText}>{errors.minPairs}</div> : null}
          </label>

          <label style={label}>
            Máx. parejas (opcional)
            <input
              style={inputErr(!!(touched.maxPairs && errors.maxPairs))}
              value={maxPairs}
              onChange={(e) => setMaxPairs(e.target.value)}
              onBlur={() => markTouched('maxPairs')}
            />
            {touched.maxPairs && errors.maxPairs ? <div style={errText}>{errors.maxPairs}</div> : null}
          </label>

          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button onClick={crearTorneo} style={btn} disabled={saving}>
              {saving ? 'Creando…' : 'Crear Torneo'}
            </button>
          </div>
        </div>

        {msg && <div style={{ marginTop: 8, opacity: 0.95, color: msg.startsWith('❌') ? '#ff6b6b' : 'white' }}>{msg}</div>}
      </div>
    </div>
  )
}

const label: React.CSSProperties = { display: 'grid', gap: 6, fontSize: 13, opacity: 0.95 }

const inputBase: React.CSSProperties = {
  width: '100%',
  padding: 10,
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.06)',
  color: 'white',
  outline: 'none',
}

const input: React.CSSProperties = inputBase

function inputErr(isErr: boolean): React.CSSProperties {
  if (!isErr) return inputBase
  return {
    ...inputBase,
    border: '1px solid rgba(255,107,107,0.75)',
    boxShadow: '0 0 0 3px rgba(255,107,107,0.12)',
  }
}

const errText: React.CSSProperties = {
  fontSize: 12,
  color: '#ff6b6b',
  opacity: 0.95,
}

const btn: React.CSSProperties = {
  width: '100%',
  padding: 10,
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(255,255,255,0.10)',
  color: 'white',
  cursor: 'pointer',
}