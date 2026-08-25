'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, ChevronDown, ChevronRight, Mail, ShieldCheck, Trophy, UserRound } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useSession } from '@/components/session/SessionProvider'
import { supabase } from '@/lib/supabaseClient'
import { getClubInitials } from '@/lib/clubAssets'
import SelpaLoader from '@/components/SelpaLoader'
import PampraxInbox from '@/components/messages/PampraxInbox'
import { ActionFeedbackNotice, type ActionFeedbackTone } from '@/components/ui/ActionFeedbackNotice'
import styles from './playerAdministration.module.css'
import refinement from './playerAdministration.refinement.module.css'

type Registration = { id: string; status: string; tournament: { id: string; name: string; starts_on: string | null } | null }
type Detail = { player: { id: string; user_id: string | null; full_name: string; avatar_url: string | null; category: number | null; gender: string | null; ranking_points: number; approved_at: string | null; created_at: string; account_kind: 'MANUAL' | 'REGISTERED'; operational_status: 'ACTIVE' | 'BLOCKED' | 'LEFT'; personal: { email: string | null; city: string | null; birth_date: string | null; dominant_hand: string | null; preferred_position: string | null } | null }; membership: { id: string; role: string; status: string; created_at: string; approved_at: string | null; rejection_reason: string | null } | null; stats: { tournaments_played: number; registrations: number }; registrations: Registration[]; permissions: { can_view_private: boolean; can_view_membership: boolean; can_manage_membership: boolean; can_manage_lifecycle: boolean; can_reincorporate: boolean; can_manage_roles: boolean; lifecycle_staff_protected: boolean; can_view_messages: boolean; can_reply_messages: boolean; can_view_competition: boolean; can_view_ranking: boolean } }
const label = (v?: string | null) => ({ APPROVED: 'Aprobado', PENDING: 'Pendiente', REJECTED: 'Rechazado', BANNED: 'Bloqueado' }[String(v ?? '').toUpperCase()] ?? 'Sin estado')
const date = (v?: string | null) => v ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(v)) : 'Sin fecha'
const branch = (v?: string | null) => v === 'M' || v === 'MALE' ? 'Caballeros' : v === 'F' || v === 'FEMALE' ? 'Damas' : v ? 'Mixto' : 'Sin rama'
const roleLabel = (v?: string | null) => ({ OWNER: 'Propietario', ADMIN: 'Administrador', OPERADOR: 'Operador', PLAYER: 'Jugador', PLANILLERO: 'Planillero' }[String(v ?? '').toUpperCase()] ?? 'Sin rol')
const human = (v?: string | null) => ({ RIGHT: 'Diestro', LEFT: 'Zurdo', AMBIDEXTROUS: 'Ambidiestro', DRIVE: 'Drive', REVES: 'Revés', BOTH: 'Ambos lados' }[String(v ?? '').toUpperCase()] ?? null)

export default function PlayerAdministrationPage() {
  const { id } = useParams<{ id: string }>()
  const { activeClub } = useSession()
  const activeClubId = activeClub?.id
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>('membership')
  const [membershipMode, setMembershipMode] = useState<'approve' | 'reject' | null>(null)
  const [membershipBusy, setMembershipBusy] = useState(false)
  const [membershipError, setMembershipError] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')
  const [messageComposerOpen, setMessageComposerOpen] = useState(false)
  const [messageNotice, setMessageNotice] = useState('')
  const [lifecycleMode, setLifecycleMode] = useState<'block' | 'leave' | null>(null)
  const [lifecycleReason, setLifecycleReason] = useState('')
  const [lifecycleConfirmation, setLifecycleConfirmation] = useState('')
  const [lifecycleBusy, setLifecycleBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: ActionFeedbackTone; title: string; message: string } | null>(null)
  const loadDetail = useCallback(async () => {
    if (!activeClubId || !id) return
    const { data } = await supabase.auth.getSession()
    const response = await fetch('/api/clubs/' + activeClubId + '/players/' + id + '/admin', { headers: data.session?.access_token ? { Authorization: 'Bearer ' + data.session.access_token } : {}, cache: 'no-store' })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) { setError(payload.error ?? 'No pude cargar la ficha administrativa.'); return }
    setError(''); setDetail(payload)
  }, [activeClubId, id])
  useEffect(() => { void Promise.resolve().then(loadDetail) }, [loadDetail])
  if (!detail) return <main className={`${styles.page} app-page`}><Link href="/club/jugadores" className={styles.back}><ArrowLeft size={17} />Jugadores</Link>{error ? <p className={styles.error}>{error}</p> : <SelpaLoader title="Preparando ficha" subtitle="" />}</main>
  const status = detail.membership?.status ?? (detail.player.approved_at ? 'APPROVED' : 'PENDING')
  const toggle = (key: string) => setOpen(open === key ? null : key)
  const canMessage = detail.player.account_kind === 'REGISTERED' && detail.player.user_id && detail.permissions.can_view_messages && detail.permissions.can_reply_messages
  async function updateMembership(action: 'approve' | 'reject') {
    const membershipId = detail?.membership?.id
    if (!activeClub?.id || !membershipId || membershipBusy) return
    if (action === 'reject' && rejectionReason.trim().length < 3) { setMembershipError('Indicá el motivo del rechazo.'); return }
    setMembershipBusy(true); setMembershipError('')
    const { data } = await supabase.auth.getSession()
    const response = await fetch('/api/clubs/memberships', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(data.session?.access_token ? { Authorization: 'Bearer ' + data.session.access_token } : {}) }, body: JSON.stringify({ membershipId, action, rejectionReason: action === 'reject' ? rejectionReason.trim() : undefined }) })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) { setMembershipError(payload.error ?? 'No pude actualizar la membresía.'); setMembershipBusy(false); return }
    setDetail((current) => current && current.membership ? { ...current, membership: { ...current.membership, status: action === 'approve' ? 'APPROVED' : 'REJECTED', approved_at: action === 'approve' ? new Date().toISOString() : current.membership.approved_at, rejection_reason: action === 'reject' ? rejectionReason.trim() : null } } : current)
    setMembershipMode(null); setMembershipBusy(false)
  }
  async function updateLifecycle(action: 'block' | 'reactivate' | 'leave' | 'reincorporate') {
    if (!activeClub?.id || !detail || lifecycleBusy) return
    if ((action === 'block' || action === 'leave') && !lifecycleReason.trim()) { setFeedback({ tone: 'warning', title: 'Falta un dato', message: action === 'block' ? 'Indicá el motivo del bloqueo.' : 'Indicá el motivo de la baja.' }); return }
    if (action === 'leave' && lifecycleConfirmation.trim() !== 'ACEPTAR') return
    setLifecycleBusy(true)
    const { data } = await supabase.auth.getSession()
    const response = await fetch('/api/clubs/' + activeClub.id + '/players/' + id + '/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(data.session?.access_token ? { Authorization: 'Bearer ' + data.session.access_token } : {}) },
      body: JSON.stringify({ action, reason: action === 'block' || action === 'leave' ? lifecycleReason.trim() : undefined }),
    })
    const payload = await response.json().catch(() => ({}))
    setLifecycleBusy(false)
    if (!response.ok) { setFeedback({ tone: 'error', title: 'No pudimos actualizar al jugador', message: payload.error ?? 'Intentá nuevamente.' }); return }
    setLifecycleMode(null); setLifecycleReason(''); setLifecycleConfirmation('')
    await loadDetail()
    const notice = action === 'block'
      ? { title: 'Jugador bloqueado temporalmente', message: 'Su historial competitivo se conserva.' }
      : action === 'reactivate'
        ? { title: 'Jugador reactivado', message: 'Volvió a quedar habilitado cuando el torneo lo permita.' }
        : action === 'leave'
          ? { title: 'Baja del club registrada', message: 'La cuenta y todo el historial del jugador se conservaron.' }
          : { title: 'Jugador reincorporado', message: 'Volvió a quedar activo conservando todo su historial.' }
    setFeedback({ tone: 'success', ...notice })
  }
  return <main className={`${styles.page} app-page`}>
    <Link href="/club/jugadores" className={styles.back}><ArrowLeft size={17} />Jugadores</Link>
    <header className={styles.hero}><div className={styles.identity}><span className={`${styles.avatar} ${refinement.avatar}`}>{detail.player.avatar_url ? <Image src={detail.player.avatar_url} alt="" fill sizes="88px" /> : getClubInitials(detail.player.full_name)}</span><div><span>FICHA ADMINISTRATIVA</span><h1>{detail.player.full_name}</h1><p>{detail.player.category ? String(detail.player.category) + 'ª' : 'Sin categoría'} · {branch(detail.player.gender)}</p></div></div><b className={detail.player.operational_status === 'BLOCKED' ? styles.status_banned : detail.player.operational_status === 'LEFT' ? styles.status_rejected : styles['status_' + String(status).toLowerCase()]}>{detail.player.operational_status === 'BLOCKED' ? 'Bloqueo temporal' : detail.player.operational_status === 'LEFT' ? 'Baja del club' : label(status)}</b></header>
    <section className={styles.summary}><div><span>Ranking</span><strong>{detail.player.ranking_points} pts</strong></div><div><span>Torneos</span><strong>{detail.stats.tournaments_played}</strong></div><div><span>Inscripciones</span><strong>{detail.stats.registrations}</strong></div><div><span>Alta</span><strong>{date(detail.membership?.approved_at ?? detail.player.approved_at)}</strong></div></section>
    <section className={styles.sections}>
      {detail.permissions.can_view_private ? <Panel icon={<UserRound size={17} />} title="Datos personales" subtitle={detail.player.account_kind === 'MANUAL' ? 'Registro manual del club' : detail.player.personal?.city || 'Datos del jugador'} open={open === 'personal'} onClick={() => toggle('personal')}><div className={styles.disclosureBody}>{detail.player.account_kind === 'MANUAL' ? <p>Este jugador fue registrado manualmente por el club. No tiene una cuenta SELPA vinculada.</p> : <dl>{detail.player.personal?.email ? <><dt>Email</dt><dd>{detail.player.personal.email}</dd></> : null}{detail.player.personal?.city ? <><dt>Ciudad</dt><dd>{detail.player.personal.city}</dd></> : null}{detail.player.personal?.birth_date ? <><dt>Fecha de nacimiento</dt><dd>{date(detail.player.personal.birth_date)}</dd></> : null}{human(detail.player.personal?.dominant_hand) ? <><dt>Mano hábil</dt><dd>{human(detail.player.personal?.dominant_hand)}</dd></> : null}{human(detail.player.personal?.preferred_position) ? <><dt>Posición</dt><dd>{human(detail.player.personal?.preferred_position)}</dd></> : null}</dl>}</div></Panel> : null}
      {detail.permissions.can_view_membership ? <Panel icon={<ShieldCheck size={17} />} title="Membresía" subtitle={(detail.player.operational_status === 'LEFT' ? 'Baja del club' : detail.player.operational_status === 'BLOCKED' ? 'Bloqueo temporal' : label(status)) + ' · ' + (detail.membership?.role ? roleLabel(detail.membership.role) : detail.player.account_kind === 'MANUAL' ? 'Registro manual' : 'Membresía no disponible')} open={open === 'membership'} onClick={() => toggle('membership')}><div className={styles.disclosureBody}><dl><dt>Estado</dt><dd>{detail.player.operational_status === 'LEFT' ? 'Baja del club' : detail.player.operational_status === 'BLOCKED' ? 'Bloqueo temporal' : label(status)}</dd><dt>Relación</dt><dd>{detail.membership?.role ? roleLabel(detail.membership.role) : detail.player.account_kind === 'MANUAL' ? 'Registro manual del club' : 'Membresía no disponible'}</dd><dt>Solicitud</dt><dd>{date(detail.membership?.created_at ?? detail.player.created_at)}</dd>{detail.membership?.approved_at ? <><dt>Aprobación</dt><dd>{date(detail.membership.approved_at)}</dd></> : null}</dl>{detail.membership?.rejection_reason ? <p className={styles.note}>Motivo informado: {detail.membership.rejection_reason}</p> : null}</div></Panel> : null}
      <Panel icon={<Trophy size={17} />} title="Actividad competitiva" subtitle={detail.stats.tournaments_played ? String(detail.stats.tournaments_played) + ' torneos · ' + detail.player.ranking_points + ' pts' : 'Sin actividad registrada todavía'} open={open === 'activity'} onClick={() => toggle('activity')}><div className={styles.disclosureBody}><dl><dt>Ranking actual</dt><dd>{detail.permissions.can_view_ranking ? detail.player.ranking_points + ' pts' : 'No disponible'}</dd><dt>Torneos</dt><dd>{detail.permissions.can_view_competition ? detail.stats.tournaments_played : 'No disponible'}</dd><dt>Inscripciones</dt><dd>{detail.stats.registrations}</dd></dl></div></Panel>
      <Panel icon={<Trophy size={17} />} title="Inscripciones" subtitle={detail.stats.registrations ? String(detail.stats.registrations) + ' registros del club' : 'No hay inscripciones registradas'} open={open === 'registrations'} onClick={() => toggle('registrations')}><div className={styles.registrationList}>{detail.registrations.length ? detail.registrations.map((r) => <Link key={r.id} href={r.tournament ? '/club/torneos/' + r.tournament.id : '/club/inscripciones'} className={styles.registration}><span><b>{r.tournament?.name ?? 'Torneo no disponible'}</b><small>{r.tournament?.starts_on ? date(r.tournament.starts_on) : 'Sin fecha'} · {label(r.status)}</small></span><ChevronRight size={17} /></Link>) : <p className={styles.empty}>No hay inscripciones del jugador en este club.</p>}</div></Panel>
      {canMessage ? <button type="button" className={`${styles.messageLink} ${refinement.messageTrigger}`} onClick={() => { setMessageNotice(''); setMessageComposerOpen(true) }}><span className={styles.disclosureIcon}><Mail size={17} /></span><span><b>Comunicación</b><small>Enviar un mensaje al jugador</small></span><ChevronRight size={18} /></button> : null}
      {detail.permissions.can_manage_membership ? <Panel icon={<ShieldCheck size={17} />} title="Administrar jugador" subtitle={detail.player.operational_status === 'BLOCKED' ? 'Bloqueo temporal y relación con el club' : detail.player.operational_status === 'LEFT' ? 'Baja del club · historial preservado' : 'Estado, acceso y relación con el club'} open={open === 'admin'} onClick={() => toggle('admin')}><div className={styles.disclosureBody}>{String(status).toUpperCase() === 'PENDING' ? <div className={styles.membershipActions}>{membershipMode === 'approve' ? <><p>Al aprobar, se habilitará su membresía y su ficha deportiva en este club.</p><button type="button" className={styles.approve} disabled={membershipBusy} onClick={() => updateMembership('approve')}>{membershipBusy ? 'Guardando…' : 'Confirmar aprobación'}</button><button type="button" className={styles.textButton} disabled={membershipBusy} onClick={() => setMembershipMode(null)}>Cancelar</button></> : membershipMode === 'reject' ? <><p>La solicitud quedará rechazada y el jugador no podrá acceder al club.</p><textarea value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} placeholder="Motivo del rechazo" rows={2} /><button type="button" className={styles.reject} disabled={membershipBusy} onClick={() => updateMembership('reject')}>{membershipBusy ? 'Guardando…' : 'Confirmar rechazo'}</button><button type="button" className={styles.textButton} disabled={membershipBusy} onClick={() => { setMembershipMode(null); setMembershipError('') }}>Cancelar</button></> : <><p>Esta solicitud está pendiente de revisión.</p><button type="button" className={styles.approve} disabled={membershipBusy} onClick={() => setMembershipMode('approve')}>Aprobar solicitud</button><button type="button" className={styles.textButton} disabled={membershipBusy} onClick={() => setMembershipMode('reject')}>Rechazar solicitud</button></>}{membershipError ? <p className={styles.membershipError}>{membershipError}</p> : null}</div> : detail.permissions.can_manage_lifecycle && detail.player.operational_status === 'ACTIVE' ? <><div className={refinement.lifecycleAction}><b>Bloquear temporalmente</b><p>Impide temporalmente el acceso y nuevas inscripciones. Se puede revertir en cualquier momento.</p><button type="button" className={refinement.lifecycleBlock} onClick={() => { setLifecycleReason(''); setLifecycleMode('block') }}>Bloquear temporalmente</button></div><DangerZone onLeave={() => { setLifecycleReason(''); setLifecycleConfirmation(''); setLifecycleMode('leave') }} /></> : detail.permissions.can_manage_lifecycle && detail.player.operational_status === 'BLOCKED' ? <><div className={refinement.lifecycleAction}><b>Reactivar jugador</b><p>Revierte el bloqueo temporal y restaura el acceso cuando el torneo lo permita.</p><button type="button" className={styles.approve} disabled={lifecycleBusy} onClick={() => void updateLifecycle('reactivate')}>{lifecycleBusy ? 'Reactivando…' : 'Reactivar jugador'}</button></div><DangerZone onLeave={() => { setLifecycleReason(''); setLifecycleConfirmation(''); setLifecycleMode('leave') }} /></> : detail.player.operational_status === 'LEFT' && detail.permissions.can_reincorporate ? <div className={refinement.lifecycleAction}><b>Reincorporar jugador</b><p>Volverá a quedar activo en este club conservando todo su historial.</p><button type="button" className={styles.approve} disabled={lifecycleBusy} onClick={() => void updateLifecycle('reincorporate')}>{lifecycleBusy ? 'Reincorporando…' : 'Reincorporar jugador'}</button></div> : detail.permissions.lifecycle_staff_protected ? <div><p>Este jugador también tiene un rol administrativo en el club. Gestioná primero su rol desde Equipo y roles.</p>{detail.permissions.can_manage_roles ? <Link href="/club/usuarios" className={styles.approve}>Gestionar rol →</Link> : null}</div> : <p>No hay acciones administrativas disponibles para este jugador. La ficha y el historial competitivo se conservan.</p>}</div></Panel> : null}
    </section>
    {feedback ? <ActionFeedbackNotice {...feedback} onDismiss={() => setFeedback(null)} autoDismissMs={feedback.tone === 'success' ? 4000 : undefined} /> : null}
    {messageNotice ? <div className={refinement.messageNotice} role="status">{messageNotice}</div> : null}
    {lifecycleMode === 'block' ? <div className={refinement.lifecycleModal} role="dialog" aria-modal="true" aria-labelledby="block-player-title"><div><h2 id="block-player-title">¿Bloquear temporalmente a {detail.player.full_name}?</h2><p>No podrá acceder ni inscribirse en nuevos torneos de este club mientras esté bloqueado. Su historial, ranking y resultados se conservarán.</p><label>Motivo<textarea value={lifecycleReason} onChange={(event) => setLifecycleReason(event.target.value)} placeholder="Contá brevemente el motivo" rows={3} autoFocus /></label><footer><button type="button" className={styles.textButton} disabled={lifecycleBusy} onClick={() => setLifecycleMode(null)}>Cancelar</button><button type="button" className={refinement.lifecycleBlock} disabled={lifecycleBusy || !lifecycleReason.trim()} onClick={() => void updateLifecycle('block')}>{lifecycleBusy ? 'Bloqueando…' : 'Bloquear jugador'}</button></footer></div></div> : null}
    {lifecycleMode === 'leave' ? <div className={refinement.lifecycleModal} role="dialog" aria-modal="true" aria-labelledby="leave-player-title"><div><h2 id="leave-player-title">¿Dar de baja a {detail.player.full_name}?</h2><p>Perderá el acceso operativo y no podrá realizar nuevas inscripciones. Su cuenta, historial, ranking, puntos y resultados se conservarán.</p><label>Motivo<textarea value={lifecycleReason} onChange={(event) => setLifecycleReason(event.target.value)} placeholder="Contá brevemente el motivo" rows={2} autoFocus /></label><label>Escribí ACEPTAR para confirmar<input value={lifecycleConfirmation} onChange={(event) => setLifecycleConfirmation(event.target.value)} autoComplete="off" /></label><footer><button type="button" className={styles.textButton} disabled={lifecycleBusy} onClick={() => setLifecycleMode(null)}>Cancelar</button><button type="button" className={refinement.lifecycleDanger} disabled={lifecycleBusy || !lifecycleReason.trim() || lifecycleConfirmation.trim() !== 'ACEPTAR'} onClick={() => { if (lifecycleConfirmation.trim() !== 'ACEPTAR') return; void updateLifecycle('leave') }}>{lifecycleBusy ? 'Procesando…' : 'Dar de baja'}</button></footer></div></div> : null}
    {canMessage && messageComposerOpen && activeClub?.id && detail.player.user_id ? <PampraxInbox scope="club" title="" subtitle="" composerOnly lockedRecipient={{ clubId: activeClub.id, userId: detail.player.user_id, fullName: detail.player.full_name }} onComposerClose={() => setMessageComposerOpen(false)} onMessageSent={() => { setMessageComposerOpen(false); setMessageNotice('Mensaje enviado a ' + detail.player.full_name + '.') }} /> : null}
  </main>
}

function Panel({ icon, title, subtitle, open, onClick, children }: { icon: ReactNode; title: string; subtitle: string; open: boolean; onClick: () => void; children: ReactNode }) {
  return <article className={styles.disclosure}><button type="button" onClick={onClick} aria-expanded={open}><span className={styles.disclosureIcon}>{icon}</span><span><b>{title}</b><small>{subtitle}</small></span><ChevronDown size={18} className={open ? styles.rotated : undefined} /></button>{open ? children : null}</article>
}

function DangerZone({ onLeave }: { onLeave: () => void }) {
  return <div className={refinement.dangerZone}><span>ZONA DE RIESGO</span><b>Dar de baja del club</b><p>Dejará de formar parte operativamente del club y no podrá realizar nuevas inscripciones. Su historial, ranking, puntos y resultados se conservarán.</p><button type="button" onClick={onLeave}>Dar de baja del club</button></div>
}
