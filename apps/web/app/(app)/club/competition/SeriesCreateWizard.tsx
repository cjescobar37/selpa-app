'use client'

import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronRight, LoaderCircle, Pencil, Plus, Trash2, Trophy } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ActionFeedbackNotice } from '@/components/ui/ActionFeedbackNotice'
import { CreationSuccess } from '@/components/ui/CreationSuccess'
import type { CompetitionAgeCategory } from '@/features/competition/catalogs/competition-catalogs.types'
import type { PointsScheme, PointsSchemeRule } from '@/features/competition/points-schemes/points-schemes.types'
import { formatCompetitionDateRange } from '@/features/competition/series/competition-series-date'
import { supabase } from '@/lib/supabaseClient'
import styles from './SeriesCreateWizard.module.css'

type Request = <T>(url: string, init?: RequestInit) => Promise<T>
type Season = { id: string; name: string; status: string; starts_on: string; ends_on: string }
type Option = { id: string; name: string; slug: string }
type Category = Option & { legacy_category_id: number | null }
type Division = { id: string; season_id: string; modality: string; branch_id: string; segment_id: string | null; category_id: string | null; is_active: boolean }
type PrizeDraft = { id:string; position:'CHAMPION'|'RUNNER_UP'|'SEMIFINALISTS'|'OTHER'; positionFrom:string; positionTo:string; prizeType:'CASH'|'GOODS'|'SERVICE'|'TROPHY'|'OTHER'; title:string; description:string; amount:string; currencyCode:string }
type Form = { name: string; startsOn: string; endsOn: string; seasonId: string; branchId: string; segmentId: string; categoryId: string; ageCategoryId: string; schemeId: string; accumulation: 'ALL_RESULTS' | 'BEST_N'; bestResults: string; planned: string; prizes:PrizeDraft[] }
type Feedback = { tone: 'error' | 'warning' | 'success'; title: string; message: string }

const steps = ['Presentación', 'Competencia', 'Ranking', 'Fechas', 'Revisión']
const draftVersion = 3
const initialForm: Form = { name: '', startsOn: '', endsOn: '', seasonId: '', branchId: '', segmentId: '', categoryId: '', ageCategoryId: '', schemeId: '', accumulation: 'ALL_RESULTS', bestResults: '4', planned: '6', prizes:[] }
const newKey = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `series-${Date.now()}-${Math.random().toString(16).slice(2)}`
const pointLabels: Record<PointsSchemeRule['rule_key'], string> = { CHAMPION: 'Campeón', RUNNER_UP: 'Finalista', SEMIFINALIST: 'Semifinal', QUARTERFINALIST: 'Cuartos', PARTICIPANT: 'Participación' }
const prizePositions = { CHAMPION:'Campeón', RUNNER_UP:'Finalista', SEMIFINALISTS:'Semifinalistas', OTHER:'Otro rango' } as const
const prizeTypes = { CASH:'Dinero', GOODS:'Producto', SERVICE:'Servicio', TROPHY:'Trofeo', OTHER:'Otro' } as const
const schemeLabel = (scheme:PointsScheme|undefined) => scheme?.display_name?.trim() || scheme?.name || ''
const prizeRange = (prize:PrizeDraft) => prize.position === 'CHAMPION' ? [1,1] : prize.position === 'RUNNER_UP' ? [2,2] : prize.position === 'SEMIFINALISTS' ? [3,4] : [Number(prize.positionFrom),Number(prize.positionTo)]
const money = (value:string,currency:string) => new Intl.NumberFormat('es-AR',{style:'currency',currency:currency || 'ARS',maximumFractionDigits:0}).format(Number(value)||0)

export default function SeriesCreateWizard({ clubId, request }: { clubId: string; request: Request }) {
  const router = useRouter()
  const requestKey = useRef(newKey())
  const draftKey = `selpa:competition-series-wizard:v${draftVersion}:${clubId}`
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [restored, setRestored] = useState(false)
  const [createdSeriesId, setCreatedSeriesId] = useState('')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [seasons, setSeasons] = useState<Season[]>([])
  const [branches, setBranches] = useState<Option[]>([])
  const [segments, setSegments] = useState<Option[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [ages, setAges] = useState<CompetitionAgeCategory[]>([])
  const [schemes, setSchemes] = useState<PointsScheme[]>([])
  const [schemeRules, setSchemeRules] = useState<PointsSchemeRule[]>([])
  const [divisions, setDivisions] = useState<Division[]>([])
  const [form, setForm] = useState<Form>(initialForm)
  const [prizeEditor,setPrizeEditor]=useState<PrizeDraft|null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(draftKey)
        if (raw) {
          const saved = JSON.parse(raw) as { version?: number; step?: number; form?: Partial<Form>; requestKey?: string }
          if (saved.version === draftVersion && saved.form) {
            setForm((current) => ({ ...current, ...saved.form }))
            setStep(Math.max(0, Math.min(4, Number(saved.step) || 0)))
            if (saved.requestKey) requestKey.current = saved.requestKey
          }
        }
      } catch { window.localStorage.removeItem(draftKey) }
      setRestored(true)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [draftKey])

  useEffect(() => {
    if (!restored || createdSeriesId) return
    const timer = window.setTimeout(() => window.localStorage.setItem(draftKey, JSON.stringify({ version: draftVersion, step, form, requestKey: requestKey.current, updatedAt: new Date().toISOString() })), 180)
    return () => window.clearTimeout(timer)
  }, [createdSeriesId, draftKey, form, restored, step])

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const [seasonResult, branchResult, segmentResult, categoryResult, divisionResult, ageResult, schemeResult] = await Promise.all([
          supabase.from('competition_seasons').select('id,name,status,starts_on,ends_on').eq('club_id', clubId).eq('status', 'ACTIVE').order('starts_on'),
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
      } catch (cause) {
        if (alive) setFeedback({ tone: 'error', title: 'No pudimos preparar el circuito', message: cause instanceof Error ? cause.message : 'Intentá nuevamente.' })
      } finally { if (alive) setLoading(false) }
    })()
    return () => { alive = false }
  }, [clubId, request])

  useEffect(() => {
    if (!form.schemeId) {
      const timer = window.setTimeout(() => setSchemeRules([]), 0)
      return () => window.clearTimeout(timer)
    }
    let alive = true
    void request<{ rules: PointsSchemeRule[] }>(`/api/clubs/${clubId}/competition/points-schemes/${form.schemeId}`)
      .then((result) => { if (alive) setSchemeRules((result.rules ?? []).filter((rule) => rule.is_active).sort((a, b) => a.sort_order - b.sort_order)) })
      .catch(() => { if (alive) setSchemeRules([]) })
    return () => { alive = false }
  }, [clubId, form.schemeId, request])

  const selectedSeason = seasons.find((season) => season.id === form.seasonId)
  const segment = segments.find((item) => item.id === form.segmentId)
  const requiresAge = segment?.slug === 'menores' || segment?.slug === 'veteranos'
  const filteredAges = ages.filter((age) => segment?.slug === 'menores' ? age.max_age !== null && age.max_age <= 18 : segment?.slug === 'veteranos' ? age.min_age !== null && age.min_age >= 18 : false)
  const seasonDivisions = divisions.filter((division) => division.season_id === form.seasonId && division.modality === 'PAIRS' && division.segment_id)
  const availableBranches = branches.filter((branch) => seasonDivisions.some((division) => division.branch_id === branch.id))
  const availableSegments = segments.filter((candidate) => seasonDivisions.some((division) => division.branch_id === form.branchId && division.segment_id === candidate.id))
  const availableCategories = categories.filter((category) => seasonDivisions.some((division) => division.branch_id === form.branchId && division.segment_id === form.segmentId && division.category_id === category.id))
  const eligibleDivision = useMemo(() => divisions.find((division) => division.season_id === form.seasonId && division.modality === 'PAIRS' && division.branch_id === form.branchId && division.segment_id === form.segmentId && (requiresAge ? division.category_id === null : division.category_id === form.categoryId)), [divisions, form, requiresAge])
  const summary = [branches.find((item) => item.id === form.branchId)?.name, segment?.name, requiresAge ? ages.find((item) => item.id === form.ageCategoryId)?.name : categories.find((item) => item.id === form.categoryId)?.name].filter(Boolean).join(' · ')
  const validPeriod = Boolean(form.startsOn && form.endsOn && form.endsOn >= form.startsOn)
  const periodInsideSeason = Boolean(!selectedSeason || !form.startsOn || !form.endsOn || (form.startsOn >= selectedSeason.starts_on && form.endsOn <= selectedSeason.ends_on))
  const durationDays = validPeriod ? Math.round((new Date(`${form.endsOn}T12:00:00`).getTime() - new Date(`${form.startsOn}T12:00:00`).getTime()) / 86400000) + 1 : 0
  const humanRange = formatCompetitionDateRange(form.startsOn, form.endsOn)
  const selectedScheme = schemes.find((scheme) => scheme.id === form.schemeId)
  const prizeRanges=form.prizes.map(prizeRange)
  const prizesValid = form.prizes.every((prize) => { const [from,to]=prizeRange(prize); return Boolean(prize.title.trim() && Number.isInteger(from) && Number.isInteger(to) && from > 0 && to >= from && (prize.prizeType !== 'CASH' || (Number(prize.amount) >= 0 && Boolean(prize.amount)))) }) && !prizeRanges.some(([from,to],index)=>prizeRanges.some(([otherFrom,otherTo],otherIndex)=>otherIndex>index&&from<=otherTo&&otherFrom<=to))
  const reviewComplete = [Boolean(form.name && validPeriod && periodInsideSeason), Boolean(eligibleDivision), Boolean(form.schemeId), Number(form.planned) > 0]
  const canContinue = step === 0 ? reviewComplete[0] : step === 1 ? reviewComplete[1] : step === 2 ? Boolean(form.schemeId && prizesValid && (form.accumulation !== 'BEST_N' || Number.isInteger(Number(form.bestResults)) && Number(form.bestResults) > 0)) : step === 3 ? Number.isInteger(Number(form.planned)) && Number(form.planned) > 0 : reviewComplete.every(Boolean) && prizesValid

  function update<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((current) => ({ ...current, [key]: value, ...(key === 'branchId' ? { segmentId: '', categoryId: '', ageCategoryId: '' } : {}), ...(key === 'segmentId' ? { categoryId: '', ageCategoryId: '' } : {}) }))
    setFeedback(null)
  }
  function selectBranch(branchId:string){const validSegments=segments.filter((candidate)=>seasonDivisions.some((division)=>division.branch_id===branchId&&division.segment_id===candidate.id));const segmentId=validSegments.length===1?validSegments[0].id:'';const validCategories=categories.filter((category)=>seasonDivisions.some((division)=>division.branch_id===branchId&&division.segment_id===segmentId&&division.category_id===category.id));setForm((current)=>({...current,branchId,segmentId,categoryId:validCategories.length===1?validCategories[0].id:'',ageCategoryId:''}));setFeedback(null)}
  function selectSegment(segmentId:string){const validCategories=categories.filter((category)=>seasonDivisions.some((division)=>division.branch_id===form.branchId&&division.segment_id===segmentId&&division.category_id===category.id));setForm((current)=>({...current,segmentId,categoryId:validCategories.length===1?validCategories[0].id:'',ageCategoryId:''}));setFeedback(null)}

  function addPrize() {
    const occupied=new Set(form.prizes.map((prize)=>prize.position));
    const position=(['CHAMPION','RUNNER_UP','SEMIFINALISTS'] as const).find((item)=>!occupied.has(item)) ?? 'OTHER'
    setPrizeEditor({id:newKey(),position,positionFrom:'5',positionTo:'5',prizeType:'TROPHY',title:prizePositions[position],description:'',amount:'',currencyCode:'ARS'});setFeedback(null)
  }
  function updatePrize(patch:Partial<PrizeDraft>){setPrizeEditor((current)=>current?{...current,...patch}:current);setFeedback(null)}
  function removePrize(id:string){setForm((current)=>({...current,prizes:current.prizes.filter((prize)=>prize.id!==id)}));setFeedback(null)}
  function savePrize(){if(!prizeEditor)return;const [from,to]=prizeRange(prizeEditor);const overlaps=form.prizes.some((item)=>item.id!==prizeEditor.id&&from<=prizeRange(item)[1]&&prizeRange(item)[0]<=to);const valid=prizeEditor.title.trim()&&Number.isInteger(from)&&Number.isInteger(to)&&from>0&&to>=from&&(prizeEditor.prizeType!=='CASH'||(prizeEditor.amount!==''&&Number(prizeEditor.amount)>=0));if(!valid||overlaps){setFeedback({tone:'warning',title:'Revisá el premio',message:overlaps?'La posición se superpone con otro premio.':'Completá los datos necesarios.'});return}setForm((current)=>({...current,prizes:current.prizes.some((item)=>item.id===prizeEditor.id)?current.prizes.map((item)=>item.id===prizeEditor.id?prizeEditor:item):[...current.prizes,prizeEditor]}));setPrizeEditor(null)}

  function next() {
    if (canContinue && (step !== 2 || prizesValid)) { setFeedback(null); setStep((current) => Math.min(4, current + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    const messages = [periodInsideSeason ? 'Completá el nombre y un período válido.' : 'El período debe estar dentro de la temporada activa.', 'Completá la combinación deportiva con opciones disponibles.', 'Elegí la tabla y definí qué resultados cuentan.', 'Ingresá una cantidad entera mayor que cero.']
    setFeedback({ tone: 'warning', title: 'Revisá este paso', message: step===2&&!prizesValid?'Completá los datos del premio o eliminá la fila incompleta.':messages[step] ?? 'Completá los datos pendientes.' })
  }

  function discard() {
    if ((form.name || form.startsOn || form.branchId || step > 0) && !window.confirm('¿Querés descartar este circuito? Se perderá el borrador guardado.')) return
    window.localStorage.removeItem(draftKey); requestKey.current = newKey(); router.push('/club/competition')
  }

  async function create() {
    if (!eligibleDivision || !reviewComplete.every(Boolean) || !prizesValid) { setFeedback({ tone: 'warning', title: 'Falta completar el circuito', message: prizesValid?'Revisá las secciones pendientes antes de crearlo.':'Revisá los premios: completá los datos y evitá posiciones superpuestas.' }); return }
    setSaving(true); setFeedback(null)
    try {
      const result = await request<{ seriesId: string }>(`/api/clubs/${clubId}/competition/series/wizard`, { method: 'POST', headers: { 'Idempotency-Key': requestKey.current }, body: JSON.stringify({ name: form.name.trim(), season_id: form.seasonId, division_id: eligibleDivision.id, modality:'PAIRS', points_scheme_id: form.schemeId, age_category_id: requiresAge ? form.ageCategoryId : null, starts_on: form.startsOn, ends_on: form.endsOn, planned_events_count: Number(form.planned), accumulation_mode: form.accumulation, best_results_count: form.accumulation === 'BEST_N' ? Number(form.bestResults) : null, prizes:form.prizes.map((prize,index)=>{const [position_from,position_to]=prizeRange(prize);return {position_from,position_to,title:prize.title.trim(),description:prize.description.trim()||null,prize_type:prize.prizeType,amount:prize.prizeType==='CASH'?Number(prize.amount):null,currency_code:prize.prizeType==='CASH'?prize.currencyCode:null,sort_order:index,is_active:true}}) }) })
      window.localStorage.removeItem(draftKey); setCreatedSeriesId(result.seriesId)
    } catch (cause) { setFeedback({ tone: 'error', title: 'No pudimos crear el circuito', message: cause instanceof Error ? cause.message : 'Tus datos siguen guardados. Intentá nuevamente.' }) }
    finally { setSaving(false) }
  }

  if (loading) return <div className={styles.loading}><LoaderCircle size={20} />Preparando circuito…</div>
  if (createdSeriesId) return <CreationSuccess kicker="Circuito creado" title="¡Felicitaciones!" message={<>Acabás de crear <strong>{form.name}</strong>.</>} nextStep="El siguiente paso es preparar su primera fecha." actionLabel="Ir al circuito" onAction={() => router.replace(`/club/competition/series/${createdSeriesId}`)} />

  const previous = step > 0 ? steps[step - 1] : ''
  const following = step < 4 ? steps[step + 1] : 'Listo'
  return <section className={styles.wizard}>
    {feedback ? <ActionFeedbackNotice tone={feedback.tone} title={feedback.title} message={feedback.message} detail="Señalamos el paso que requiere atención." onDismiss={() => setFeedback(null)} /> : null}
    <header className={styles.wizardHead}>
      <div><span>Paso {step + 1} de 5</span><strong>{steps[step]}</strong></div>
      <i><span style={{ width: `${((step + 1) / 5) * 100}%` }} /></i>
      <nav><span>{previous ? `✓ ${previous}` : ''}</span><b>● {steps[step]}</b><span>○ {following}</span></nav>
    </header>
    <main>
      {step === 0 ? <div className={styles.stepBody}>
        <div className={styles.stepTitle}><span>PRESENTACIÓN</span><h1>Crear circuito</h1><p>Definí la identidad y duración del circuito.</p></div>
        <section className={styles.openSection}><h2>Datos principales</h2><label>Nombre del circuito<input value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="Ej. Circuito Apertura 2026" autoFocus /></label></section>
        <section className={styles.openSection}><h2>Período</h2><div className={styles.dateGrid}><label>Inicio<input type="date" value={form.startsOn} min={selectedSeason?.starts_on} max={selectedSeason?.ends_on} onChange={(event) => update('startsOn', event.target.value)} /></label><label>Fin<input type="date" min={form.startsOn || selectedSeason?.starts_on} max={selectedSeason?.ends_on} value={form.endsOn} onChange={(event) => update('endsOn', event.target.value)} /></label></div></section>
        <aside className={styles.contextLine}><CalendarDays size={18}/><div><strong>✓ {selectedSeason?.name ?? 'Temporada pendiente'}</strong><span>{validPeriod ? `${humanRange} · ${durationDays} ${durationDays === 1 ? 'día' : 'días'}` : 'Elegí el período del circuito'}</span></div></aside>
      </div> : null}

      {step === 1 ? <div className={styles.stepBody}>
        <div className={styles.stepTitle}><span>COMPETENCIA</span><h1>¿Quiénes compiten?</h1><p>Solo mostramos combinaciones disponibles en esta temporada.</p></div>
        <Choice label="Género" value={form.branchId} options={availableBranches.map((item) => ({ value: item.id, label: item.name }))} onChange={selectBranch} />
        {form.branchId ? <Choice label="Grupo" value={form.segmentId} options={availableSegments.map((item) => ({ value: item.id, label: item.name }))} onChange={selectSegment} /> : null}
        {form.segmentId ? <Choice label="Categoría" value={requiresAge ? form.ageCategoryId : form.categoryId} options={(requiresAge ? filteredAges : availableCategories).map((item) => ({ value: item.id, label: item.name }))} onChange={(value) => requiresAge ? update('ageCategoryId', value) : update('categoryId', value)} /> : null}
        <aside className={styles.liveSummary}>{summary || 'Elegí una opción para comenzar.'}</aside>
      </div> : null}

      {step === 2 ? <div className={styles.stepBody}>
        <div className={styles.stepTitle}><span>RANKING</span><h1>Ranking, puntos y premios</h1><p>Definí cómo suma cada fecha y qué reconocimientos entrega el circuito.</p></div>
        <section className={`${styles.secondaryCard} ${styles.pointsCard}`}><Trophy size={20}/><label><span>Tabla de puntos</span><select value={form.schemeId} onChange={(event) => update('schemeId', event.target.value)}><option value="">Elegir tabla</option>{schemes.map((item) => <option value={item.id} key={item.id}>{schemeLabel(item)}</option>)}</select></label>{selectedScheme ? <div className={styles.pointsSummary}><strong>{schemeLabel(selectedScheme)}</strong>{schemeRules.slice(0, 3).map((rule) => <span key={rule.id}>{pointLabels[rule.rule_key]} <b>{rule.points} pts</b></span>)}<a href={`/club/competition/points-schemes/${selectedScheme.id}`}>Ver tabla →</a></div> : null}</section>
        <section className={styles.openSection}><h2>Resultados que cuentan</h2><div className={styles.modeCards}><button className={form.accumulation === 'ALL_RESULTS' ? styles.selected : ''} type="button" onClick={() => update('accumulation', 'ALL_RESULTS')}><strong>Todos</strong><span>Cada fecha suma al ranking.</span></button><button className={form.accumulation === 'BEST_N' ? styles.selected : ''} type="button" onClick={() => update('accumulation', 'BEST_N')}><strong>Mejores resultados</strong><span>Solo cuentan los mejores resultados.</span></button></div>{form.accumulation === 'BEST_N' ? <label className={styles.compactInput}>Cantidad de resultados<input inputMode="numeric" type="number" min="1" value={form.bestResults} onChange={(event) => update('bestResults', event.target.value)} /><small>Se tomarán los {form.bestResults || '—'} mejores resultados de cada participante.</small></label> : null}</section>
        <section className={styles.prizesSection}><div className={styles.prizesHead}><div><h2>Premios del circuito</h2><p>{form.prizes.length?`${form.prizes.length} ${form.prizes.length===1?'premio configurado':'premios configurados'}`:'Sin premios configurados'}</p></div>{!prizeEditor?<button type="button" onClick={addPrize}><Plus size={15}/>Agregar premio</button>:null}</div>{form.prizes.length?<div className={styles.prizeList}>{form.prizes.map((prize)=><article key={prize.id}><Trophy size={17}/><div><strong>{prizePositions[prize.position]}</strong><span>{prize.prizeType==='CASH'?`${money(prize.amount,prize.currencyCode)} ${prize.currencyCode}`:`${prizeTypes[prize.prizeType]} · ${prize.title}`}</span>{prize.description?<small>{prize.description}</small>:null}</div><button aria-label={`Editar ${prize.title}`} type="button" onClick={()=>setPrizeEditor({...prize})}><Pencil size={15}/></button><button aria-label={`Eliminar ${prize.title}`} type="button" onClick={()=>removePrize(prize.id)}><Trash2 size={15}/></button></article>)}</div>:null}{prizeEditor?<article className={styles.prizeEditor}><div className={styles.prizeGrid}><label>Posición<select value={prizeEditor.position} onChange={(event)=>{const position=event.target.value as PrizeDraft['position'];updatePrize({position,title:prizePositions[position]})}}>{Object.entries(prizePositions).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><label>Tipo<select value={prizeEditor.prizeType} onChange={(event)=>updatePrize({prizeType:event.target.value as PrizeDraft['prizeType']})}>{Object.entries(prizeTypes).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>{prizeEditor.position==='OTHER'?<><label>Desde<input type="number" min="1" inputMode="numeric" value={prizeEditor.positionFrom} onChange={(event)=>updatePrize({positionFrom:event.target.value})}/></label><label>Hasta<input type="number" min={prizeEditor.positionFrom||'1'} inputMode="numeric" value={prizeEditor.positionTo} onChange={(event)=>updatePrize({positionTo:event.target.value})}/></label></>:null}<label className={styles.wide}>Título<input value={prizeEditor.title} onChange={(event)=>updatePrize({title:event.target.value})}/></label><label className={styles.wide}>Descripción <small>Opcional</small><input value={prizeEditor.description} onChange={(event)=>updatePrize({description:event.target.value})}/></label>{prizeEditor.prizeType==='CASH'?<><label>Monto<input type="number" min="0" inputMode="decimal" value={prizeEditor.amount} onChange={(event)=>updatePrize({amount:event.target.value})}/></label><label>Moneda<select value={prizeEditor.currencyCode} onChange={(event)=>updatePrize({currencyCode:event.target.value})}><option value="ARS">ARS</option><option value="USD">USD</option></select></label></>:null}</div><footer><button type="button" onClick={()=>setPrizeEditor(null)}>Cancelar</button><button type="button" onClick={savePrize}>Guardar premio</button></footer></article>:null}</section>
        <details className={styles.advanced}><summary>Opciones avanzadas <ChevronRight size={17}/></summary><p>La elegibilidad y el alcance de puntos se configuran con las reglas canónicas del circuito.</p></details>
      </div> : null}

      {step === 3 ? <div className={styles.stepBody}>
        <div className={styles.stepTitle}><span>FECHAS</span><h1>¿Cuántas fechas tendrá?</h1><p>Planificá la cantidad. Cada fecha se crea después como un torneo real.</p></div>
        <Choice label="Fechas previstas" value={['4','6','8','10'].includes(form.planned) ? form.planned : 'OTHER'} options={[4,6,8,10].map((value) => ({ value: String(value), label: String(value) })).concat([{ value: 'OTHER', label: 'Otro' }])} onChange={(value) => update('planned', value === 'OTHER' ? '' : value)} />
        {!['4','6','8','10'].includes(form.planned) ? <label className={styles.compactInput}>Cantidad personalizada<input inputMode="numeric" type="number" min="1" value={form.planned} onChange={(event) => update('planned', event.target.value)} /></label> : null}
        <section className={styles.datePlan}><CalendarDays size={22}/><strong>{Number(form.planned) || 0} fechas previstas</strong><div>{Array.from({ length: Math.min(Number(form.planned) || 0, 20) }, (_, index) => <i key={index}/>)}</div><p>Cada fecha se creará después como un torneo real del circuito.</p></section>
      </div> : null}

      {step === 4 ? <div className={styles.stepBody}>
        <div className={styles.readiness}><div><strong>{reviewComplete.every(Boolean) ? '✓ Todo listo para crear el circuito' : 'Hay datos para revisar'}</strong><span>{reviewComplete.filter(Boolean).length}/4 secciones completas</span></div></div>
        <article className={styles.reviewHero}><span className={styles.reviewBadge}>Borrador</span><small>RESUMEN DEL CIRCUITO</small><h1>{form.name || 'Circuito sin nombre'}</h1><p>{summary || 'Competencia pendiente'}</p><div><span>{humanRange} · {selectedSeason?.name ?? 'Temporada pendiente'}</span><span>{form.planned || 0} fechas · {form.accumulation === 'ALL_RESULTS' ? 'Todos los resultados' : `Mejores ${form.bestResults} resultados`}</span><span>{schemeLabel(selectedScheme) || 'Tabla pendiente'}</span></div></article>
        <div className={styles.reviewRows}>
          <ReviewRow title="Presentación" lines={[form.name || 'Sin nombre', `${humanRange} · ${selectedSeason?.name ?? 'Temporada pendiente'}`]} onClick={() => setStep(0)}/>
          <ReviewRow title="Competencia" lines={[summary || 'Pendiente']} onClick={() => setStep(1)}/>
          <ReviewRow title="Ranking y puntos" lines={[`${schemeLabel(selectedScheme) || 'Tabla pendiente'} · ${form.accumulation === 'ALL_RESULTS' ? 'Todos los resultados' : `Mejores ${form.bestResults}`}`]} onClick={() => setStep(2)}/>
          {form.prizes.length?<ReviewRow title="Premios" lines={form.prizes.map((prize)=>`${prizePositions[prize.position]} · ${prize.prizeType==='CASH'?money(prize.amount,prize.currencyCode):prize.title}`)} onClick={() => setStep(2)}/>:null}
          <ReviewRow title="Fechas" lines={[`${form.planned || 0} previstas`, 'Se crearán posteriormente']} onClick={() => setStep(3)}/>
        </div>
      </div> : null}
    </main>
    <footer><button type="button" className={styles.back} onClick={() => step ? setStep(step - 1) : discard()}><ArrowLeft size={16}/>{step ? 'Atrás' : 'Cancelar'}</button>{step < 4 ? <button type="button" onClick={next}>Siguiente<ArrowRight size={16}/></button> : <button type="button" disabled={!canContinue || saving} onClick={() => void create()}>{saving ? 'Creando…' : <><Check size={16}/>Crear circuito</>}</button>}</footer>
  </section>
}

function Choice({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return <fieldset className={styles.choice}><legend>{label}</legend><div>{options.map((option) => <button className={value === option.value ? styles.selected : ''} type="button" onClick={() => onChange(option.value)} key={option.value}>{option.label}</button>)}</div></fieldset>
}

function ReviewRow({ title, lines, onClick }: { title: string; lines: string[]; onClick: () => void }) {
  return <button type="button" className={styles.reviewRow} onClick={onClick}><div><strong>{title}</strong>{lines.map((line) => <span key={line}>{line}</span>)}</div><ChevronRight size={18}/></button>
}
