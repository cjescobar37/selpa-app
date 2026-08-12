'use client'

import { ArrowLeft, ArrowRight, Check, ChevronDown, LoaderCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import type { CompetitionAgeCategory } from '@/features/competition/catalogs/competition-catalogs.types'
import type { PointsScheme } from '@/features/competition/points-schemes/points-schemes.types'
import styles from './SeriesCreateWizard.module.css'

type Request = <T>(url: string, init?: RequestInit) => Promise<T>
type Season = { id: string; name: string; status: string }
type Option = { id: string; name: string; slug: string }
type Category = Option & { legacy_category_id: number | null }
type Division = { id: string; season_id: string; modality: string; branch_id: string; segment_id: string | null; category_id: string | null; is_active: boolean }
type Form = { name: string; startsOn: string; endsOn: string; seasonId: string; branchId: string; segmentId: string; modality: 'INDIVIDUAL' | 'PAIRS'; categoryId: string; ageCategoryId: string; schemeId: string; accumulation: 'ALL_RESULTS' | 'BEST_N'; bestResults: string; planned: string }

const steps = ['Presentación', 'Competencia', 'Ranking y puntos', 'Fechas', 'Revisión']
const newKey = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `series-${Date.now()}-${Math.random().toString(16).slice(2)}`

export default function SeriesCreateWizard({ clubId, request }: { clubId: string; request: Request }) {
  const router = useRouter()
  const requestKey = useRef(newKey())
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [seasons, setSeasons] = useState<Season[]>([])
  const [branches, setBranches] = useState<Option[]>([])
  const [segments, setSegments] = useState<Option[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [ages, setAges] = useState<CompetitionAgeCategory[]>([])
  const [schemes, setSchemes] = useState<PointsScheme[]>([])
  const [divisions, setDivisions] = useState<Division[]>([])
  const [form, setForm] = useState<Form>({ name: '', startsOn: '', endsOn: '', seasonId: '', branchId: '', segmentId: '', modality: 'INDIVIDUAL', categoryId: '', ageCategoryId: '', schemeId: '', accumulation: 'ALL_RESULTS', bestResults: '1', planned: '6' })

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const [seasonResult, branchResult, segmentResult, categoryResult, divisionResult, ageResult, schemeResult] = await Promise.all([
          supabase.from('competition_seasons').select('id,name,status').eq('club_id', clubId).eq('status', 'ACTIVE').order('starts_on'),
          supabase.from('competition_branches').select('id,name,slug').eq('club_id', clubId).eq('is_active', true).order('sort_order'),
          supabase.from('competition_segments').select('id,name,slug').eq('club_id', clubId).eq('is_active', true).order('sort_order'),
          supabase.from('competition_categories').select('id,name,slug,legacy_category_id').eq('club_id', clubId).eq('is_active', true).order('sort_order'),
          supabase.from('competition_divisions').select('id,season_id,modality,branch_id,segment_id,category_id,is_active').eq('club_id', clubId).eq('is_active', true),
          request<{ ageCategories: CompetitionAgeCategory[] }>(`/api/clubs/${clubId}/competition/age-categories`),
          request<{ schemes: PointsScheme[] }>(`/api/clubs/${clubId}/competition/points-schemes`),
        ])
        if (seasonResult.error || branchResult.error || segmentResult.error || categoryResult.error || divisionResult.error) throw new Error('No pudimos preparar la configuración del circuito.')
        if (!alive) return
        const activeSeasons = (seasonResult.data ?? []) as Season[]
        setSeasons(activeSeasons); setBranches((branchResult.data ?? []) as Option[]); setSegments((segmentResult.data ?? []) as Option[]); setCategories((categoryResult.data ?? []) as Category[]); setDivisions((divisionResult.data ?? []) as Division[])
        setAges((ageResult.ageCategories ?? []).filter((age) => age.is_active)); setSchemes((schemeResult.schemes ?? []).filter((scheme) => scheme.is_active))
        setForm((current) => ({ ...current, seasonId: current.seasonId || activeSeasons[0]?.id || '' }))
      } catch (cause) { if (alive) setError(cause instanceof Error ? cause.message : 'No pudimos preparar el wizard.') }
      finally { if (alive) setLoading(false) }
    })()
    return () => { alive = false }
  }, [clubId, request])

  const segment = segments.find((item) => item.id === form.segmentId)
  const requiresAge = segment?.slug === 'menores' || segment?.slug === 'veteranos'
  const filteredAges = ages.filter((age) => segment?.slug === 'menores' ? age.max_age !== null && age.max_age <= 18 : segment?.slug === 'veteranos' ? age.min_age !== null && age.min_age >= 18 : false)
  const eligibleDivision = useMemo(() => divisions.find((division) => division.season_id === form.seasonId && division.modality === form.modality && division.branch_id === form.branchId && division.segment_id === form.segmentId && (requiresAge ? division.category_id === null : division.category_id === form.categoryId)), [divisions, form, requiresAge])
  const summary = [branches.find((item) => item.id === form.branchId)?.name, segment?.name, requiresAge ? ages.find((item) => item.id === form.ageCategoryId)?.name : categories.find((item) => item.id === form.categoryId)?.name].filter(Boolean).join(' · ')
  const update = <K extends keyof Form>(key: K, value: Form[K]) => setForm((current) => ({ ...current, [key]: value, ...(key === 'segmentId' ? { categoryId: '', ageCategoryId: '' } : {}) }))
  const canContinue = step === 0 ? Boolean(form.name.trim() && form.seasonId && form.startsOn && form.endsOn) : step === 1 ? Boolean(form.branchId && form.segmentId && (requiresAge ? form.ageCategoryId : form.categoryId) && eligibleDivision) : step === 2 ? Boolean(form.schemeId && (form.accumulation !== 'BEST_N' || Number(form.bestResults) > 0)) : true

  async function create() {
    if (!eligibleDivision || !canContinue) return
    setSaving(true); setError('')
    try {
      const result = await request<{ seriesId: string }>(`/api/clubs/${clubId}/competition/series/wizard`, {
        method: 'POST', headers: { 'Idempotency-Key': requestKey.current }, body: JSON.stringify({ name: form.name.trim(), season_id: form.seasonId, division_id: eligibleDivision.id, points_scheme_id: form.schemeId, age_category_id: requiresAge ? form.ageCategoryId : null, starts_on: form.startsOn, ends_on: form.endsOn, planned_events_count: Number(form.planned), accumulation_mode: form.accumulation, best_results_count: form.accumulation === 'BEST_N' ? Number(form.bestResults) : null }),
      })
      router.replace(`/club/competition/series/${result.seriesId}`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos crear el circuito. Tus datos siguen acá.') }
    finally { setSaving(false) }
  }

  if (loading) return <div className={styles.loading}><LoaderCircle size={20} />Preparando circuito…</div>
  return <section className={styles.wizard}>
    <header><div><span>PASO {step + 1} DE 5</span><h1>Crear circuito</h1></div><p>{steps[step]}</p></header>
    <ol className={styles.progress} aria-label="Progreso">{steps.map((label, index) => <li className={index === step ? styles.current : index < step ? styles.done : ''} key={label}><i /> <span>{label}</span></li>)}</ol>
    {error ? <p className={styles.error}>{error}</p> : null}
    <main>
      {step === 0 ? <div className={styles.fields}><label>Nombre del circuito<input value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="Ej. Circuito Apertura 2026" autoFocus /></label><label>Inicio<input type="date" value={form.startsOn} onChange={(event) => update('startsOn', event.target.value)} /></label><label>Fin<input type="date" min={form.startsOn} value={form.endsOn} onChange={(event) => update('endsOn', event.target.value)} /></label>{seasons.length > 1 ? <label>Temporada<select value={form.seasonId} onChange={(event) => update('seasonId', event.target.value)}>{seasons.map((season) => <option value={season.id} key={season.id}>{season.name}</option>)}</select></label> : <p className={styles.note}>Temporada {seasons[0]?.name ?? 'sin configurar'} · asignada automáticamente</p>}</div> : null}
      {step === 1 ? <div className={styles.fields}><fieldset><legend>Género</legend><div className={styles.chips}>{branches.map((item) => <button className={form.branchId === item.id ? styles.selected : ''} type="button" onClick={() => update('branchId', item.id)} key={item.id}>{item.name}</button>)}</div></fieldset><fieldset><legend>Grupo</legend><div className={styles.chips}>{segments.map((item) => <button className={form.segmentId === item.id ? styles.selected : ''} type="button" onClick={() => update('segmentId', item.id)} key={item.id}>{item.name}</button>)}</div></fieldset><fieldset><legend>Modalidad</legend><div className={styles.chips}>{(['INDIVIDUAL', 'PAIRS'] as const).map((item) => <button className={form.modality === item ? styles.selected : ''} type="button" onClick={() => update('modality', item)} key={item}>{item === 'PAIRS' ? 'Parejas' : 'Individual'}</button>)}</div></fieldset>{requiresAge ? <label>Categoría de edad<select value={form.ageCategoryId} onChange={(event) => update('ageCategoryId', event.target.value)}><option value="">Elegir categoría</option>{filteredAges.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label> : <label>Categoría<select value={form.categoryId} onChange={(event) => update('categoryId', event.target.value)}><option value="">Elegir categoría</option>{categories.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}<p className={styles.live}>{summary || 'Elegí los datos deportivos'}</p>{form.branchId && form.segmentId && !eligibleDivision ? <p className={styles.error}>Esta combinación todavía no está disponible en la temporada seleccionada.</p> : null}</div> : null}
      {step === 2 ? <div className={styles.fields}><label>Tabla de puntos<select value={form.schemeId} onChange={(event) => update('schemeId', event.target.value)}><option value="">Elegir tabla</option>{schemes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><fieldset><legend>Resultados que cuentan</legend><div className={styles.chips}><button className={form.accumulation === 'ALL_RESULTS' ? styles.selected : ''} type="button" onClick={() => update('accumulation', 'ALL_RESULTS')}>Todos</button><button className={form.accumulation === 'BEST_N' ? styles.selected : ''} type="button" onClick={() => update('accumulation', 'BEST_N')}>Mejores resultados</button></div></fieldset>{form.accumulation === 'BEST_N' ? <label>Cuántos resultados cuentan<input inputMode="numeric" type="number" min="1" value={form.bestResults} onChange={(event) => update('bestResults', event.target.value)} /></label> : null}<details><summary>Opciones avanzadas <ChevronDown size={15} /></summary><p>Los puntos se asignan a participantes con entrada activa en la categoría del circuito.</p></details></div> : null}
      {step === 3 ? <div className={styles.fields}><fieldset><legend>Fechas previstas</legend><div className={styles.chips}>{['4', '6', '8', '10'].map((value) => <button type="button" className={form.planned === value ? styles.selected : ''} onClick={() => update('planned', value)} key={value}>{value}</button>)}<input aria-label="Otra cantidad" inputMode="numeric" type="number" min="0" value={['4', '6', '8', '10'].includes(form.planned) ? '' : form.planned} onChange={(event) => update('planned', event.target.value)} placeholder="Otro" /></div></fieldset><p className={styles.note}>Vas a poder agregar cada fecha cuando esté lista. No se crea ningún torneo ahora.</p><div className={styles.preview}>{Array.from({ length: Math.min(Number(form.planned) || 0, 6) }, (_, index) => <span key={index}>Fecha {index + 1} · Pendiente</span>)}</div></div> : null}
      {step === 4 ? <div className={styles.review}><section><strong>Presentación</strong><span>{form.name || 'Sin nombre'} · {form.startsOn || 'Sin inicio'} → {form.endsOn || 'Sin fin'}</span><button type="button" onClick={() => setStep(0)}>Editar</button></section><section><strong>Competencia</strong><span>{summary || 'Pendiente'}</span><button type="button" onClick={() => setStep(1)}>Editar</button></section><section><strong>Ranking y puntos</strong><span>{schemes.find((item) => item.id === form.schemeId)?.name ?? 'Pendiente'} · {form.accumulation === 'ALL_RESULTS' ? 'Todos los resultados' : `Mejores ${form.bestResults}`}</span><button type="button" onClick={() => setStep(2)}>Editar</button></section><section><strong>Fechas</strong><span>{form.planned || 0} previstas · se crearán más adelante</span><button type="button" onClick={() => setStep(3)}>Editar</button></section></div> : null}
    </main>
    <footer><button type="button" className={styles.back} onClick={() => step ? setStep(step - 1) : router.push('/club/competition')}><ArrowLeft size={16} />Atrás</button>{step < 4 ? <button type="button" disabled={!canContinue} onClick={() => setStep(step + 1)}>Siguiente<ArrowRight size={16} /></button> : <button type="button" disabled={!canContinue || saving} onClick={() => void create()}>{saving ? 'Creando…' : <><Check size={16} />Crear circuito</>}</button>}</footer>
  </section>
}
