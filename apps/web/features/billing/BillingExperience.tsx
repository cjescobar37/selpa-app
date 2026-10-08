'use client'

import PageHeader from '@/components/navigation/PageHeader'
import { useSession } from '@/components/session/SessionProvider'
import { ConfirmedWriteRejection, readWriteIntent, prepareWriteIntent, type WriteIntent } from '@/lib/writeIntentRecovery'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Download, Plus, RotateCcw, X } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { humanizeUiError } from '@/lib/productPresentation'
import { billingDate, billingLabels, billingMoney, type BillingCursor, type BillingOverview, type BillingPage, type BillingRow } from '@/lib/platformBillingF2'
import styles from './BillingExperience.module.css'

type Action={operation:string;row?:BillingRow;key:string}
type Requester=(kind:string,club?:string,cursor?:BillingCursor|null,search?:string)=>Promise<BillingPage>
const label=(s?:string)=>billingLabels[s??'']??s??'—'
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Argentina/Buenos_Aires'}).format(new Date())
function Badge({row}:{row:BillingRow}) {
  const state=row.financial_status??row.status??(row.active?'ACTIVE':'SUSPENDED')
  return <span className={`${styles.badge} ${['OVERDUE','PAST_DUE','SUSPENDED'].includes(state)?styles.warning:['PAID','POSTED','ACTIVE'].includes(state)?styles.good:''}`}>{label(state)}</span>
}

function BillingAction({action,request,onSave,onClose,saving,error,pending,onRetry}:{action:Action;request:Requester;onSave:(payload:Record<string,unknown>)=>Promise<void>;onClose:()=>void;saving:boolean;error:string;pending:boolean;onRetry:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null); const [plans,setPlans]=useState<BillingPage>({items:[],nextCursor:null}); const [clubs,setClubs]=useState<BillingPage>({items:[],nextCursor:null})
  const [invoices,setInvoices]=useState<BillingPage>({items:[],nextCursor:null}); const [lookupError,setLookupError]=useState(''); const [lookupBusy,setLookupBusy]=useState(false)
  const [club,setClub]=useState(action.row?.club_id??''); const [allocations,setAllocations]=useState<Record<string,string>>({}); const [search,setSearch]=useState('')
  const [defaultPaidAt]=useState(()=>{const now=new Date();return new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,16)})
  const row=action.row; const op=action.operation; const planForm=op==='SAVE_PLAN'; const planChoice=['ASSIGN_PLAN','CHANGE_PLAN'].includes(op)
  const emissionPrice=row?.generated_current?row.next_plan_price??row.catalog_price??row.price:row?.catalog_price??row?.price
  const emissionInterval=row?.generated_current?row.next_plan_interval??row.catalog_interval??row.billing_interval:row?.catalog_interval??row?.billing_interval
  const titles:Record<string,string>={SAVE_PLAN:row?'Editar plan':'Crear plan',ASSIGN_PLAN:'Asignar plan',CHANGE_PLAN:'Cambiar plan',GENERATE_PERIOD:'Generar período',REGISTER_PAYMENT:'Registrar cobro confirmado',REVERSE_PAYMENT:'Revertir pago',VOID_INVOICE:'Anular comprobante',SUSPEND:'Suspender suscripción',REACTIVATE:'Reactivar suscripción',CANCEL_AT_END:row?.cancel_at_period_end?'Continuar suscripción':'Cancelar al finalizar el período'}
  useEffect(()=>{
    const previousOverflow=document.body.style.overflow
    dialog.current?.showModal()
    document.body.style.overflow='hidden'
    return()=>{document.body.style.overflow=previousOverflow}
  },[])
  useEffect(()=>{
    let alive=true
    const load=async()=>{
      try{
        if(planChoice){const p=await request('plans');if(alive)setPlans(p)}
        if(op==='ASSIGN_PLAN'){const c=await request('clubs');if(alive)setClubs(c)}
        if(op==='REGISTER_PAYMENT' && club){const p=await request('invoices',club);if(alive)setInvoices(p)}
      }catch(cause){if(alive)setLookupError(cause instanceof Error?cause.message:'No pudimos cargar las opciones.')}
    };void load();return()=>{alive=false}
  },[club,op,planChoice,request])
  const more=async(kind:string,page:BillingPage,set:(p:BillingPage)=>void)=>{
    if(lookupBusy)return
    setLookupBusy(true)
    try{const next=await request(kind,kind==='invoices'?club:undefined,page.nextCursor);set({items:[...page.items,...next.items],nextCursor:next.nextCursor})}
    catch(cause){setLookupError(cause instanceof Error?cause.message:'No pudimos cargar más.')}
    finally{setLookupBusy(false)}
  }
  const submit=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();if(pending){onRetry();return}const data=new FormData(event.currentTarget)
    const payload:Record<string,unknown>={...(row?{id:row.id,club_id:row.club_id,revision:row.revision}:{})}
    if(planForm)Object.assign(payload,{code:data.get('code'),name:data.get('name'),description:data.get('description'),billing_interval:data.get('interval'),price:Number(data.get('price')),active:data.get('active')==='on',
      config:{...row?.config,payment_instructions:data.get('instructions'),features:String(data.get('features')??'').split('\n').map(s=>s.trim()).filter(Boolean)}})
    if(planChoice)Object.assign(payload,{plan_id:data.get('plan'),...(op==='ASSIGN_PLAN'?{club_id:club,starts_on:data.get('starts_on'),trial:data.get('trial')==='on'}:{immediate:data.get('immediate')==='on'})})
    if(op==='GENERATE_PERIOD')Object.assign(payload,{period_start:data.get('period_start'),due_on:data.get('due_on'),expected_plan_id:row?.generated_current?row.next_plan_id??row.plan_id:row?.plan_id,expected_price:Number(emissionPrice),expected_interval:emissionInterval})
    if(op==='REGISTER_PAYMENT'){
      const selected=Object.entries(allocations).filter(([,v])=>Number(v)>0).map(([invoice_id,v])=>({invoice_id,amount:Number(v)}))
      Object.assign(payload,{club_id:club,amount:Number(selected.reduce((sum,a)=>sum+a.amount,0).toFixed(2)),allocations:selected,method:data.get('method'),reference:data.get('reference'),paid_at:new Date(String(data.get('paid_at'))).toISOString()})
    }
    if(['VOID_INVOICE','REVERSE_PAYMENT'].includes(op))payload.reason=data.get('reason')
    if(op==='CANCEL_AT_END')payload.cancel=!row?.cancel_at_period_end
    void onSave(payload)
  }
  return <dialog ref={dialog} aria-label={titles[op]} className={styles.dialog} onCancel={event=>{event.preventDefault();if(!saving)onClose()}}>
    <form onSubmit={submit}>
      <header className={styles.dialogHead}><div><small>SELPA Billing</small><h2>{titles[op]}</h2></div><button type="button" className={styles.icon} aria-label="Cerrar" onClick={onClose} disabled={saving}><X size={19}/></button></header>
      <fieldset disabled={saving||pending} className={styles.formBody} style={{border:0,margin:0,minWidth:0}}>
        {row && !planForm?<p className={styles.context}>{row.club_name}{op==='GENERATE_PERIOD'?'':` · ${row.invoice_number??row.plan_name??billingMoney(row.amount)}`}</p>:null}
        {planForm?<>
          <label>Código<input name="code" required maxLength={48} pattern="[A-Z0-9_-]+" defaultValue={row?.code} readOnly={Boolean(row)}/></label>
          <label>Nombre<input name="name" required maxLength={120} defaultValue={row?.name}/></label>
          <label>Descripción<input name="description" maxLength={1000} defaultValue={row?.description}/></label>
          <div className={styles.formGrid}><label>Frecuencia<select name="interval" defaultValue={row?.billing_interval??'MONTHLY'}><option value="MONTHLY">Mensual</option><option value="ANNUAL">Anual</option><option value="FREE">Sin cargo</option></select></label><label>Precio ARS<input name="price" required type="number" min="0" max="999999999999.99" step="0.01" defaultValue={row?.price??0}/></label></div>
          <label className={styles.check}><input name="active" type="checkbox" defaultChecked={row?.active??true}/>Plan activo</label>
          <label>Prestaciones (una por línea)<textarea name="features" defaultValue={Array.isArray(row?.config?.features)?row.config.features.join('\n'):''}/></label>
          <label>Instrucciones de pago para el club<textarea name="instructions" maxLength={3000} defaultValue={row?.config?.payment_instructions}/></label>
          <p className={styles.hint}>Sin cargo exige precio $0. Los cambios no alteran comprobantes ya emitidos.</p>
        </>:null}
        {op==='ASSIGN_PLAN'?<>
          <label>Buscar club<div className={styles.search}><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nombre del club"/><button type="button" className={styles.secondary} disabled={lookupBusy} onClick={async()=>{setLookupBusy(true);try{setClubs(await request('clubs',undefined,null,search));setClub('')}catch(e){setLookupError(e instanceof Error?e.message:'Error')}finally{setLookupBusy(false)}}}>Buscar</button></div></label>
          <label>Club<select required value={club} onChange={e=>setClub(e.target.value)}><option value="">Seleccionar club</option>{clubs.items.map(c=><option key={c.id} value={c.id}>{c.club_name}</option>)}</select></label>
          {clubs.nextCursor?<button type="button" className={styles.secondary} disabled={lookupBusy} onClick={()=>void more('clubs',clubs,setClubs)}>Más clubes</button>:null}
          <label>Inicio del primer período<input type="date" name="starts_on" required defaultValue={today()}/></label>
          <label className={styles.check}><input name="trial" type="checkbox"/>Comenzar en prueba</label>
        </>:null}
        {planChoice?<><label>Plan<select name="plan" required defaultValue=""><option value="">Seleccionar plan activo</option>{plans.items.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.name} · {billingMoney(p.price)} · {label(p.billing_interval)}</option>)}</select></label>{plans.nextCursor?<button type="button" className={styles.secondary} disabled={lookupBusy} onClick={()=>void more('plans',plans,setPlans)}>Más planes</button>:null}
          {op==='CHANGE_PLAN'?<><p className={styles.hint}>Se aplicará al próximo período, sin prorrateo ni cambios en facturas emitidas.</p><label className={styles.check}><input name="immediate" type="checkbox"/>Aplicar ahora para la próxima emisión (acción explícita)</label></>:null}</>:null}
        {op==='GENERATE_PERIOD'?<><strong>{row?.generated_current?row.next_plan_name??row.plan_name:row?.plan_name} · {billingMoney(emissionPrice)} · {label(emissionInterval)}</strong><label>Inicio del período<input name="period_start" type="date" required defaultValue={row?.generated_current?row.current_period_end:row?.current_period_start} readOnly/></label><label>Vencimiento del comprobante<input name="due_on" type="date" required defaultValue={row?.generated_current?row.current_period_end:row?.current_period_start}/></label><p className={styles.hint}>Un período, un comprobante. Reintentar no duplica. Los planes sin cargo sólo registran el período.{row?.status==='TRIAL'?' Esta emisión activa la suscripción y aplica el precio del plan.':''}</p></>:null}
        {op==='REGISTER_PAYMENT'?<>
          <p className={styles.hint}>Registrá únicamente dinero recibido. No es una solicitud ni un pago de jugadores al club.</p>
          <div className={styles.paymentFields}><label>Método<select name="method">{['BANK_TRANSFER','CASH','MERCADO_PAGO','OTHER'].map(m=><option key={m} value={m}>{label(m)}</option>)}</select></label><label>Fecha y hora del cobro<input name="paid_at" type="datetime-local" required defaultValue={defaultPaidAt}/></label></div>
          <label>Referencia<input name="reference" maxLength={300}/></label>
          <fieldset><legend>Distribución entre comprobantes</legend>{invoices.items.filter(i=>i.status==='ISSUED' && Number(i.balance)>0).map(i=><label key={i.id} className={styles.allocation}><span>{i.invoice_number}<small>Saldo {billingMoney(i.balance)}</small></span><input aria-label={`Importe para ${i.invoice_number}`} type="number" min="0" step="0.01" max={i.balance} placeholder="0,00" value={allocations[i.id]??''} onChange={e=>setAllocations({...allocations,[i.id]:e.target.value})}/></label>)}</fieldset>
          {invoices.nextCursor?<button type="button" className={styles.secondary} disabled={lookupBusy} onClick={()=>void more('invoices',invoices,setInvoices)}>Más comprobantes</button>:null}
          <strong>Total confirmado: {billingMoney(Object.values(allocations).reduce((s,v)=>s+Number(v||0),0))}</strong>
        </>:null}
        {['VOID_INVOICE','REVERSE_PAYMENT'].includes(op)?<><strong>{op==='VOID_INVOICE'?'Cargo a compensar':'Cobro a revertir'}: {billingMoney(op==='VOID_INVOICE'?row?.total:row?.amount)}</strong><p className={styles.hint}>{op==='VOID_INVOICE'?'Se compensará el cargo sin borrar el comprobante. Primero deben revertirse los pagos aplicados.':'Se compensará el cobro y se reabrirán los saldos aplicados. El pago original se conserva.'}</p><label>Motivo<input name="reason" required minLength={3} maxLength={1000}/></label></>:null}
        {['SUSPEND','REACTIVATE','CANCEL_AT_END'].includes(op)?<p className={styles.hint}>{op==='SUSPEND'?'Suspende la facturación de nuevos períodos. No altera deudas ni bloquea automáticamente la actividad deportiva.':op==='REACTIVATE'?'Reactiva la suscripción. Si existe deuda vencida seguirá mostrando ese estado.':row?.cancel_at_period_end?'Quita la cancelación programada. La próxima generación podrá emitir el siguiente período.':'Conserva el período actual. La siguiente generación cerrará la suscripción sin emitir un cargo nuevo.'}</p>:null}
        {lookupError?<p role="alert" className={styles.error}>{humanizeUiError(lookupError, 'No pudimos cargar las opciones. Reintentá.')}</p>:null}{error?<p role="alert" className={styles.error}>{humanizeUiError(error, 'No pudimos guardar la operación. Reintentá.')}</p>:null}
      </fieldset>
      <footer className={styles.dialogFoot}><button type="button" className={styles.secondary} disabled={saving} onClick={onClose}>Cerrar</button><button className={styles.primary} disabled={saving||lookupBusy}>{saving?'Guardando…':pending?'Reintentar operación':planForm?'Guardar plan':'Confirmar operación'}</button></footer>
    </form>
  </dialog>
}

export default function BillingExperience({platform=false,clubId}:{platform?:boolean;clubId?:string}) {
  const { user } = useSession()
  const intentScope = platform && user?.id ? `selpa.write-intent.billing:${user.id}` : null
  const [pendingIntent,setPendingIntent]=useState<WriteIntent|null>(null)
  const [tab,setTab]=useState(platform?'overview':'plan'); const [overview,setOverview]=useState<BillingOverview|null>(null)
  const [page,setPage]=useState<BillingPage>({items:[],nextCursor:null}); const [loading,setLoading]=useState(true); const [error,setError]=useState('')
  const [action,setAction]=useState<Action|null>(null); const [saving,setSaving]=useState(false); const [actionError,setActionError]=useState(''); const [notice,setNotice]=useState('')
  const [reportKind,setReportKind]=useState('balances'); const [focusClub,setFocusClub]=useState<string|undefined>(); const [moreBusy,setMoreBusy]=useState(false)
  const [from,setFrom]=useState(()=>`${today().slice(0,7)}-01`); const [to,setTo]=useState(today)
  useEffect(()=>{
    let alive=true
    queueMicrotask(()=>{
      if(!alive)return
      if(!intentScope){setPendingIntent(null);return}
      try{setPendingIntent(readWriteIntent(sessionStorage,intentScope))}
      catch(cause){setError(humanizeUiError(cause instanceof Error?cause.message:null))}
    })
    return()=>{alive=false}
  },[intentScope])
  const activeClub=platform?focusClub:clubId; const requestId=useRef(0); const submitLock=useRef(false)
  const api=platform?'/api/platform/billing':'/api/clubs/billing'
  const http=useCallback(async(url:string,init?:RequestInit)=>{
    const {data}=await supabase.auth.getSession();if(!data.session?.access_token)throw new Error('Tu sesión venció. Volvé a ingresar.')
    const res=await fetch(url,{...init,cache:'no-store',headers:{Authorization:`Bearer ${data.session.access_token}`,...init?.headers}})
    const json=await res.json();if(!res.ok)throw new (json.code?.startsWith('BILLING_')&&!['BILLING_IDEMPOTENCY_CONFLICT','BILLING_UNCONFIRMED'].includes(json.code)?ConfirmedWriteRejection:Error)(json.error??'No pudimos cargar Facturación.');return json
  },[])
  const request=useCallback< Requester >(async(kind,club,cursor,search)=>{
    const q=new URLSearchParams({kind,from,to});if(club)q.set('clubId',club);if(cursor){q.set('at',cursor.at);q.set('id',cursor.id)}if(search)q.set('search',search)
    return http(`${api}?${q}`) as Promise<BillingPage>
  },[api,from,http,to])
  const listKind=tab==='reports'?reportKind:tab
  const refresh=useCallback(async()=>{
    const id=++requestId.current;setLoading(true);setError('')
    if(!platform&&!clubId){setOverview(null);setPage({items:[],nextCursor:null});setLoading(false);return}
    try{
      const q=new URLSearchParams({kind:'overview',from,to});if(activeClub)q.set('clubId',activeClub)
      const [data,rows]=await Promise.all([http(`${api}?${q}`),['overview','plan'].includes(tab)?Promise.resolve({items:[],nextCursor:null}):request(listKind,activeClub)])
      if(id===requestId.current){setOverview(data);setPage(rows)}
    }catch(cause){if(id===requestId.current){setError(cause instanceof Error?cause.message:'Error inesperado.');setOverview(null);setPage({items:[],nextCursor:null})}}
    finally{if(id===requestId.current)setLoading(false)}
  },[activeClub,api,clubId,from,http,listKind,platform,request,tab,to])
  useEffect(()=>{let alive=true;void Promise.resolve().then(()=>{if(alive)void refresh()});return()=>{alive=false}},[refresh])
  const open=(operation:string,row?:BillingRow)=>{if(pendingIntent){setError('Primero confirmá la operación pendiente.');return}setActionError('');setAction({operation,row,key:crypto.randomUUID()})}
  const save=async(payload:Record<string,unknown>)=>{
    if(!action||submitLock.current||!intentScope)return
    try{
      const intent=prepareWriteIntent(sessionStorage,intentScope,{operation:action.operation,key:action.key,payload},action.key)
      setPendingIntent(intent)
      await dispatchIntent(intent)
    }catch(cause){setActionError(humanizeUiError(cause instanceof Error?cause.message:null))}
  }
  const dispatchIntent=async(intent:WriteIntent)=>{
    if(!platform||!intentScope||intent.scope!==intentScope||submitLock.current)return
    submitLock.current=true;setSaving(true);setActionError('')
    try{await http(api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(intent.payload)});sessionStorage.removeItem(intentScope);setPendingIntent(null);setAction(null);setNotice('Operación registrada.');await refresh()}
    catch(cause){
      if(cause instanceof ConfirmedWriteRejection){sessionStorage.removeItem(intentScope);setPendingIntent(null)}
      const message=humanizeUiError(cause instanceof Error?cause.message:null,'No pudimos confirmar. Reintentá el mismo intento.');setActionError(message);setError(message)
    }
    finally{submitLock.current=false;setSaving(false)}
  }
  const loadMore=async()=>{
    if(!page.nextCursor||moreBusy)return
    setMoreBusy(true);const id=requestId.current
    try{const next=await request(listKind,activeClub,page.nextCursor);if(id===requestId.current)setPage(p=>({items:[...p.items,...next.items.filter(r=>!p.items.some(old=>old.id===r.id))],nextCursor:next.nextCursor}))}
    catch(cause){if(id===requestId.current)setError(cause instanceof Error?cause.message:'No pudimos cargar más.')}
    finally{setMoreBusy(false)}
  }
  const download=async(format:string)=>{
    setMoreBusy(true)
    try{
      const {data}=await supabase.auth.getSession();const kind=tab==='reports'?'balances':['invoices','payments','subscriptions'].includes(tab)?tab:'invoices'
      const q=new URLSearchParams({kind,format});if(activeClub)q.set('clubId',activeClub)
      const res=await fetch(`/api/platform/billing/export?${q}`,{headers:{Authorization:`Bearer ${data.session?.access_token??''}`}})
      if(!res.ok)throw new Error((await res.json()).error)
      const url=URL.createObjectURL(await res.blob());const a=document.createElement('a');a.href=url;a.download=`selpa-billing-${kind}.${format}`;a.click();URL.revokeObjectURL(url)
    }catch(cause){setError(cause instanceof Error?cause.message:'No pudimos exportar.')}
    finally{setMoreBusy(false)}
  }
  const tabs=platform?['overview','plans','subscriptions','invoices','payments','reports','history']:['plan','invoices','payments']
  const tabLabels:Record<string,string>={overview:'Resumen',plans:'Planes',subscriptions:'Suscripciones',invoices:'Facturas',payments:'Pagos',reports:'Reportes',history:'Historial',plan:'Mi plan',periods:'Períodos'}
  const subscription=overview?.subscription
  const planView=(s:BillingRow)=><section className={styles.plan}><div className={styles.rowHead}><div><small>Plan actual</small><h2>{s.plan_name}</h2></div><Badge row={s}/></div><p>{billingMoney(s.price)} · {label(s.billing_interval)}</p><div className={styles.pair}><span>Período<strong>{billingDate(s.current_period_start)} → {billingDate(s.current_period_end)}<small>Fin exclusivo</small></strong></span><span>Próxima renovación<strong>{s.cancel_at_period_end?'Cancelación al cierre':billingDate(s.current_period_end)}</strong></span></div>{s.next_plan_name?<p className={styles.hint}>Próximo plan: {s.next_plan_name}</p>:null}{s.description?<p>{s.description}</p>:null}{s.config?.features?.length?<ul>{s.config.features.map((f:string)=><li key={f}>{f}</li>)}</ul>:null}<div className={styles.instructions}><strong>Cómo pagar a SELPA</strong><p>{s.config?.payment_instructions||'Contactá a SELPA para recibir las instrucciones de pago. No envíes dinero sin confirmar el destino.'}</p></div></section>
  return <main className={styles.shell}>
    <PageHeader backHref={platform?'/platform':'/club'} title="Facturación" eyebrow="CLUB → SELPA · ARS"
      actions={<button className={styles.icon} onClick={()=>void refresh()} disabled={loading} aria-label="Actualizar facturación"><RotateCcw size={18}/></button>} />
    <nav className={styles.tabs} aria-label="Secciones de facturación">{tabs.map(t=><button key={t} className={tab===t?styles.active:''} onClick={()=>{setTab(t);setNotice('')}}>{tabLabels[t]}</button>)}</nav>
    {platform&&['overview','reports'].includes(tab)?<div className={styles.dateFilters}><label>Cobrado desde<input type="date" value={from} max={to} onChange={e=>{if(e.target.value)setFrom(e.target.value)}}/></label><label>Hasta<input type="date" value={to} min={from} onChange={e=>{if(e.target.value)setTo(e.target.value)}}/></label></div>:null}
    {pendingIntent&&platform?<div role="status" className={styles.notice}>Operación pendiente de confirmar. El reintento conserva los datos originales. <button type="button" className={styles.secondary} disabled={saving} onClick={()=>void dispatchIntent(pendingIntent)}>Reintentar operación</button></div>:null}
    {notice?<p role="status" className={styles.notice}>{notice}</p>:null}
    {error?<p className={styles.error} role="alert">{humanizeUiError(error, 'No pudimos cargar Facturación. Reintentá.')}<button className={styles.secondary} onClick={()=>void refresh()}>Reintentar</button></p>:null}
    {loading?<div className={styles.loading} role="status"><span/>Cargando facturación…</div>:!clubId&&!platform?<p className={styles.empty}>Seleccioná un club para ver su facturación.</p>:overview?<>
      {platform&&focusClub?<div className={styles.toolbar}><span>Vista de un club</span><button className={styles.secondary} onClick={()=>setFocusClub(undefined)}>Ver todos</button></div>:null}
      {['overview','plan','reports'].includes(tab)?<>
        <section className={styles.metrics} aria-label="Resumen de facturación">
          {platform?<div><small>Cobrado neto del período</small><strong>{billingMoney(overview.received)}</strong></div>:null}
          <div><small>Saldo pendiente actual</small><strong>{billingMoney(overview.pending)}</strong></div><div><small>Vencido actual</small><strong>{billingMoney(overview.overdue)}</strong></div>
          {platform?<><div><small>Clubes activos / prueba</small><strong>{overview.active_clubs}</strong></div><div><small>Clubes con deuda</small><strong>{overview.clubs_with_debt}</strong></div></>:null}
        </section>
        {platform?<p className={styles.hint}>Cobrado: pagos del período que siguen confirmados. Saldos: cartera actual. Sin legacy ni Club Finance.</p>:null}
      </>:null}
      {tab==='overview'?<section className={styles.overviewActions}><div><h2>Operación de Billing</h2><p>Planes configurables, períodos únicos y cobros confirmados.</p></div><button className={styles.primary} onClick={()=>open('ASSIGN_PLAN')}><Plus size={16}/>Asignar plan</button><button className={styles.secondary} onClick={()=>{setTab('plans');open('SAVE_PLAN')}}>Crear plan</button></section>:null}
      {tab==='plan'?(subscription?planView(subscription):<p className={styles.empty}>Tu club todavía no tiene un plan asignado. Contactá a SELPA.</p>):null}
      {!['overview','plan'].includes(tab)?<>
        <div className={styles.toolbar}><h2>{tabLabels[tab]??'Períodos'}</h2><div>
          {tab==='plans'?<button className={styles.primary} onClick={()=>open('SAVE_PLAN')}><Plus size={16}/>Crear plan</button>:null}
          {tab==='subscriptions'?<button className={styles.primary} onClick={()=>open('ASSIGN_PLAN')}>Asignar plan</button>:null}
          {platform&&(['invoices','payments','subscriptions'].includes(tab)||tab==='reports'&&reportKind==='balances')?<><button className={styles.secondary} disabled={moreBusy} onClick={()=>void download('csv')}><Download size={14}/>CSV</button><button className={styles.secondary} disabled={moreBusy} onClick={()=>void download('xlsx')}>XLSX</button></>:null}
        </div></div>
        {tab==='reports'?<><div className={styles.segment}><button className={reportKind==='balances'?styles.active:''} onClick={()=>setReportKind('balances')}>Deuda por club</button><button className={reportKind==='plan_reports'?styles.active:''} onClick={()=>setReportKind('plan_reports')}>Por plan</button></div>{reportKind==='plan_reports'?<p className={styles.hint}>Facturado: comprobantes del rango sin anulados. Clubes: suscripciones vigentes actuales.</p>:null}</>:null}
        <div className={styles.list}>{page.items.map(row=><article key={row.id} className={styles.row}>
          <div className={styles.rowHead}><h3>{tab==='plans'||reportKind==='plan_reports'&&tab==='reports'?row.name:tab==='invoices'?row.invoice_number:tab==='periods'?`${billingDate(row.period_start)} → ${billingDate(row.period_end)}`:tab==='history'?label(row.operation):row.club_name}</h3>{['plans','subscriptions','invoices','payments','periods'].includes(tab)?<Badge row={row}/>:null}</div>
          {tab==='plans'?<><p>{billingMoney(row.price)} · {label(row.billing_interval)}</p><p className={styles.hint}>{row.description}</p><div className={styles.actions}><button className={styles.secondary} onClick={()=>open('SAVE_PLAN',row)}>Editar / activar</button></div></>:null}
          {tab==='subscriptions'?<><p>{row.plan_name} · {billingMoney(row.price)} / {label(row.billing_interval)}</p><div className={styles.pair}><span>Período<strong>{billingDate(row.current_period_start)} → {billingDate(row.current_period_end)}</strong></span><span>Saldo<strong>{billingMoney(row.balance)}</strong></span></div>{row.next_plan_name?<small>Próximo plan: {row.next_plan_name}</small>:null}<div className={styles.actions}>
            {row.status!=='CANCELLED'?<button className={styles.primary} disabled={row.status==='SUSPENDED'} title={row.status==='SUSPENDED'?'Reactivá la suscripción primero':undefined} onClick={()=>open('GENERATE_PERIOD',row)}>Generar período</button>:null}
            <details className={styles.rowMenu}><summary>Más opciones <span aria-hidden="true">⌄</span></summary><div>
              {row.status!=='CANCELLED'?<><button className={styles.secondary} onClick={()=>open('CHANGE_PLAN',row)}>Cambiar plan</button><button className={styles.secondary} onClick={()=>open(row.status==='SUSPENDED'?'REACTIVATE':'SUSPEND',row)}>{row.status==='SUSPENDED'?'Reactivar':'Suspender'}</button><button className={styles.secondary} onClick={()=>open('CANCEL_AT_END',row)}>{row.cancel_at_period_end?'Continuar suscripción':'Cancelar al cierre'}</button></>:null}
              <button className={styles.secondary} onClick={()=>{setFocusClub(row.club_id);setTab('periods')}}>Ver períodos</button><button className={styles.secondary} onClick={()=>{setFocusClub(row.club_id);setTab('invoices')}}>Ver facturas</button>
            </div></details>
          </div></>:null}
          {tab==='invoices'?<><p>{platform?`${row.club_name} · `:''}{billingDate(row.period_start)} → {billingDate(row.period_end)}</p><div className={styles.amounts}><span>Total<strong>{billingMoney(row.total)}</strong></span><span>Aplicado<strong>{billingMoney(row.allocated_net)}</strong></span><span>Saldo<strong>{billingMoney(row.balance)}</strong></span></div><small>Vence {billingDate(row.due_at)} · Comprobante interno, no fiscal</small>{row.void_reason?<p className={styles.hint}>Anulación: {row.void_reason}</p>:null}{platform&&row.status==='ISSUED'?<div className={styles.actions}>{Number(row.balance)>0?<button className={styles.primary} onClick={()=>open('REGISTER_PAYMENT',row)}>Registrar pago</button>:null}<button className={styles.secondary} onClick={()=>open('VOID_INVOICE',row)}>Anular</button></div>:null}</>:null}
          {tab==='payments'?<><p>{billingMoney(row.amount)} · {label(row.method)} · {billingDate(row.paid_at)}</p>{row.reference?<small>Referencia: {row.reference}</small>:null}<p className={styles.hint}>{row.allocations?.map(a=>`${a.invoice_number}: ${billingMoney(a.amount)}`).join(' · ')}</p>{row.reversal_reason?<small>Reversión: {row.reversal_reason}</small>:null}{platform&&row.status==='POSTED'?<div className={styles.actions}><button className={styles.secondary} onClick={()=>open('REVERSE_PAYMENT',row)}>Revertir pago</button></div>:null}</>:null}
          {tab==='periods'?<><p>{row.invoice_number??'Sin cargo'}</p><small>Período con fin exclusivo</small></>:null}
          {tab==='reports'?reportKind==='balances'?<div className={styles.pair}><span>Pendiente<strong>{billingMoney(row.balance)}</strong></span><span>Vencido<strong>{billingMoney(row.overdue)}</strong></span></div>:<div className={styles.pair}><span>Clubes vigentes<strong>{row.clubs}</strong></span><span>Facturado del período<strong>{billingMoney(row.billed)}</strong></span></div>:null}
          {tab==='history'?<><small>{billingDate(row.created_at)} · Actor: {row.actor_id}</small><details><summary>Detalle auditado</summary><pre>{JSON.stringify({datos:row.payload,resultado:row.response},null,2)}</pre></details></>:null}
        </article>)}</div>
        {!page.items.length?<p className={styles.empty}>No hay registros en esta vista.</p>:null}{page.nextCursor?<button className={styles.secondary} onClick={()=>void loadMore()} disabled={moreBusy}>{moreBusy?'Cargando…':'Ver más'}</button>:null}
      </>:null}
    </>:null}
    {action?<BillingAction key={action.key} action={action} request={request} onSave={save} onClose={()=>{if(!saving)setAction(null)}} saving={saving} error={actionError} pending={Boolean(pendingIntent)} onRetry={()=>{if(pendingIntent)void dispatchIntent(pendingIntent)}}/>:null}
  </main>
}
