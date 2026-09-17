'use client'

import { toast } from '@/lib/toastStore'
import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { normalizeScheduleConfig, normalizeTournamentCourts, type ScheduleConfig, type TournamentCourtConfig } from '@/lib/tournamentSchedule'
import { competitionWallTime, competitionWallTimeToInstant } from '@/lib/competitionTimezone'
import { registrationDeadlineState, type TournamentConfigurationDetail } from '@/lib/tournamentOperationalConfiguration'
import { formatTournamentSystemLabel as competitionSystemLabel } from '@/lib/tournamentLabels'
import styles from './SeriesEventsAdmin.module.css'

type Request = <T>(url:string,init?:RequestInit)=>Promise<T>
type Complex = {id:string;name:string;courts_count:number|null}
export default function EventTournamentConfiguration({clubId,tournamentId,timezone,request,onSaved}: {
  clubId:string;tournamentId:string;timezone:string|null;request:Request;onSaved:()=>Promise<void>
}) {
  const [detail,setDetail]=useState<TournamentConfigurationDetail|null>(null)
  const [message,setMessage]=useState('')
  const [busy,setBusy]=useState(false)
  const [schedule,setSchedule]=useState<ScheduleConfig|null>(null)
  const [courts,setCourts]=useState<TournamentCourtConfig[]>([])
  const [complexes,setComplexes]=useState<Complex[]>([])
  const [complexId,setComplexId]=useState('')
  const [courtName,setCourtName]=useState('')
  const [draftSystem,setDraftSystem]=useState('')
  const base=`/api/clubs/${clubId}/tournaments/${tournamentId}`
  useEffect(()=>{
    let active=true
    void request<TournamentConfigurationDetail>(`${base}/configuration`).then(next=>{
      if(!active)return
      setDetail(next)
      setDraftSystem(typeof next.tournament.rules_json?.competition_system==='string'?next.tournament.rules_json.competition_system:'')
      setSchedule(normalizeScheduleConfig(next.tournament.rules_json?.schedule_config,{startDate:next.tournament.start_date,endDate:next.tournament.end_date}))
      setCourts(normalizeTournamentCourts(next.tournament.rules_json?.tournament_courts))
    }).catch(cause=>{if(active)setMessage(cause instanceof Error?cause.message:'No pudimos cargar el torneo.')})
    return()=>{active=false}
  },[base,request])
  const loadComplexes=async()=>{
    if(complexes.length)return
    const result=await supabase.from('clubs').select('id,name,courts_count,is_active').eq('is_active',true).order('name')
    if(result.error){setMessage('No pudimos cargar las canchas. Los valores existentes se conservan.');return}
    setComplexes((result.data??[]) as Complex[])
  }
  const tournament=detail?.tournament
  const rules=tournament?.rules_json??{}
  const system=typeof rules.competition_system==='string'?rules.competition_system:null
  const deadline=tournament?competitionWallTime(tournament.registration_deadline,timezone):''
  const deadlineDate=deadline?deadline.slice(0,10).split('-').reverse().join('/'):''
  const deadlineLabel=tournament?registrationDeadlineState(tournament.registration_deadline):'Cargando torneo…'
  const selectedComplex=complexes.find(complex=>complex.id===complexId)
  const save=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault()
    if(!detail||!schedule||!timezone)return
    const data=new FormData(event.currentTarget)
    const systemChanged=draftSystem!==String(detail.tournament.rules_json?.competition_system??'')
    const confirmation=detail.capabilities.competitionSystem.confirmation
    if(systemChanged&&confirmation&&!window.confirm(confirmation))return
    setBusy(true);setMessage('')
    try{
      const closing=detail.capabilities.registrationDeadline.editable?String(data.get('registration_deadline')??''):competitionWallTime(detail.tournament.registration_deadline,timezone)
      await request(base,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        action:'update_operational_configuration',expected_updated_at:detail.tournament.updated_at,
        registration_deadline:detail.capabilities.registrationDeadline.editable?(closing?competitionWallTimeToInstant(closing,timezone):null):detail.tournament.registration_deadline,
        confirm_competition_system_change:systemChanged&&Boolean(confirmation),
        competition_system:draftSystem,
        min_pairs:detail.capabilities.minimumPairs.editable?Number(data.get('min_pairs')):detail.tournament.min_pairs,
        max_pairs:detail.capabilities.capacity.editable?(data.get('max_pairs')?Number(data.get('max_pairs')):null):detail.tournament.max_pairs,
        price_per_player:detail.capabilities.price.editable?Number(data.get('price_per_player')):Number(detail.tournament.price_per_player??0),schedule_config:schedule,tournament_courts:courts,
      })})
      const next=await request<TournamentConfigurationDetail>(`${base}/configuration`)
      setDetail(next);toast.success('Configuración del torneo guardada.');await onSaved()
    }catch(cause){toast.error(cause instanceof Error?cause.message:'No pudimos guardar el torneo.')}
    finally{setBusy(false)}
  }
  const lock=(key:keyof NonNullable<typeof detail>['capabilities'])=>detail&&!detail.capabilities[key].editable?<small className={styles.fieldLock}>🔒 {detail.capabilities[key].reason}</small>:null
  const anyEditable=detail?Object.values(detail.capabilities).some(value=>value.editable):false
  return <details className={styles.disclosure}><summary><div>Torneo<small className={styles.configurationSummary}>{system?competitionSystemLabel(system):'Pendiente'}{detail?` · ${detail.teams} parejas`:''}</small></div><span>{deadline ? `Cierre: ${deadlineDate.slice(0,5)} · ${deadline.slice(11)}` : 'Cierre pendiente'}</span></summary><div>
    <p className={styles.autoSave}>{deadlineLabel}{deadlineLabel==='Abiertas hasta'&&deadline?` ${deadlineDate} · ${deadline.slice(11)}`:''}{detail?` · ${detail.teams} parejas`:''}</p>
    {message?<p role="status" className={styles.autoSave}>{message}</p>:null}
    {tournament&&schedule?<form className={styles.form} onSubmit={event=>void save(event)} key={tournament.id}><fieldset disabled={busy} className={styles.operationalFields}>
      <label>Cierre de inscripciones<input name="registration_deadline" type="datetime-local" defaultValue={deadline} disabled={!detail?.capabilities.registrationDeadline.editable}/>{lock('registrationDeadline')}</label>
      <label>Sistema<select name="competition_system" value={draftSystem} onChange={event=>setDraftSystem(event.target.value)} required disabled={!detail?.capabilities.competitionSystem.editable}><option value="">Elegir sistema</option><option value="GROUPS_PLAYOFF">Zona + Playoff</option><option value="SINGLE_ELIMINATION">Eliminación directa</option><option value="ROUND_ROBIN">Todos contra todos</option></select>{lock('competitionSystem')}</label>
      <details className={styles.disclosure}><summary>Más opciones</summary><div>
        <label>Mínimo de parejas<input name="min_pairs" type="number" min="2" required defaultValue={tournament.min_pairs} disabled={!detail?.capabilities.minimumPairs.editable}/>{lock('minimumPairs')}</label>
        <label>Máximo de parejas<input name="max_pairs" type="number" min="2" defaultValue={tournament.max_pairs??''} disabled={!detail?.capabilities.capacity.editable}/>{lock('capacity')}</label>
        <label>Precio por jugador<input name="price_per_player" type="number" min="0" step="0.01" required defaultValue={tournament.price_per_player??0} disabled={!detail?.capabilities.price.editable}/>{lock('price')}</label>
        <strong className={styles.autoSave}>Cronograma deportivo</strong>
        <label>Planificación<select disabled={!detail?.capabilities.schedule.editable} value={schedule.mode} onChange={event=>setSchedule({...schedule,mode:event.target.value==='MANUAL'?'MANUAL':'AUTO'})}><option value="AUTO">Automática</option><option value="MANUAL">Manual</option></select>{lock('schedule')}</label>
        <label>Duración del partido (minutos)<input disabled={!detail?.capabilities.schedule.editable} type="number" min="1" value={schedule.match_duration_minutes} onChange={event=>setSchedule({...schedule,match_duration_minutes:Number(event.target.value)})}/></label>
        {(['groups','playoff'] as const).filter(phase=>phase!=='groups'||draftSystem!=='SINGLE_ELIMINATION').map(phase=><div key={phase} className={styles.scheduleFields}><strong>{phase==='groups'?'Grupos':'Playoff'}</strong>{(['date','start_time','end_time'] as const).map(key=><label key={key}>{key==='date'?'Día':key==='start_time'?'Desde':'Hasta'}<input disabled={!detail?.capabilities.schedule.editable} type={key==='date'?'date':'time'} required value={schedule[phase][key]} onChange={event=>setSchedule({...schedule,[phase]:{...schedule[phase],[key]:event.target.value}})}/></label>)}</div>)}
        <details onToggle={event=>{if(event.currentTarget.open)void loadComplexes()}}><summary>Canchas · {courts.length}</summary><div>
          {courts.map((court,index)=><p key={`${court.complex_name}:${court.name}`} className={styles.courtRow}><span>{court.complex_name} · {court.name}</span><button disabled={!detail?.capabilities.courts.editable} type="button" aria-label={`Quitar ${court.name}`} onClick={()=>setCourts(courts.filter((_,i)=>i!==index))}>Quitar</button></p>)}
          <label>Complejo<select disabled={!detail?.capabilities.courts.editable} value={complexId} onChange={event=>{setComplexId(event.target.value);setCourtName('')}}><option value="">Elegir complejo</option>{complexes.map(complex=><option value={complex.id} key={complex.id}>{complex.name}</option>)}</select></label>
          <label>Cancha<select disabled={!detail?.capabilities.courts.editable} value={courtName} onChange={event=>setCourtName(event.target.value)}><option value="">Elegir cancha</option>{Array.from({length:Math.max(0,selectedComplex?.courts_count??0)},(_,i)=>`Cancha ${i+1}`).map(name=><option key={name}>{name}</option>)}</select></label>
          {lock('courts')}<button type="button" disabled={!detail?.capabilities.courts.editable||!selectedComplex||!courtName} onClick={()=>{if(selectedComplex&&courtName&&!courts.some(court=>court.name===courtName&&court.complex_name===selectedComplex.name)){setCourts([...courts,{name:courtName,complex_name:selectedComplex.name,source:complexId===clubId?'OWN_CLUB':'EXTERNAL_COMPLEX'}]);setCourtName('')}}}>Agregar cancha</button>
        </div></details>
      </div></details>
      {anyEditable?<button type="submit" className={styles.operationalSave} disabled={busy||!timezone}>{busy?'Guardando…':'Guardar torneo'}</button>:null}
    </fieldset></form>:null}
  </div></details>
}
