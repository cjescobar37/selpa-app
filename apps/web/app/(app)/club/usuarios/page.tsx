'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'
import { useSession } from '@/components/session/SessionProvider'
import { getClubInitials } from '@/lib/clubAssets'
import { getClubTheme } from '@/lib/clubThemes'
import type { ClubRole } from '@/lib/clubMembershipRules'
import {
  getCanonicalClubPermissionRole,
  getClubPermissions,
  type ClubCapability,
  type ClubPermissionRole,
} from '@/lib/clubPermissions'

type InviteStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED'
type ManageableRole = 'ADMIN' | 'OPERADOR' | 'PLANILLERO' | 'PLAYER'
type InvitableRole = Exclude<ManageableRole, 'PLAYER'>
type TeamTab = 'staff' | 'invites' | 'permissions' | 'activity'
type InviteMode = 'player' | 'email'
type StaffFilter = 'ALL' | 'ADMIN' | 'OPERADOR' | 'PLANILLERO'
type FlowSuccess = { mode: InviteMode; title: string } | null

type Profile = {
  user_id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  display_name: string | null
  avatar_url: string | null
}

type StaffMember = {
  id: string
  user_id: string
  role: ClubRole
  status: string
  approved_at: string | null
  created_at: string
  full_name: string
  profile: Profile | null
}

type ClubInvite = {
  id: string
  email: string
  role: ClubRole
  status: InviteStatus
  invited_by: string
  resolved_by: string | null
  resolved_at: string | null
  target_user_id: string | null
  created_at: string
  updated_at: string
  expires_at: string | null
  invited_by_profile: Profile | null
  resolved_by_profile: Profile | null
  target_user_profile: Profile | null
}

type ActivityTone = 'info' | 'success' | 'warning' | 'muted'

type ActivityEvent = {
  id: string
  date: string
  title: string
  detail: string
  actor?: string
  subject?: string
  status: string
  tone: ActivityTone
}

type AuditEvent = {
  id: string
  action: string
  old_role: ClubRole | null
  new_role: ClubRole | null
  created_at: string
  actor_profile: Profile | null
  target_profile: Profile | null
}

type StaffCandidate = {
  user_id: string
  display_name: string
  email: string
  avatar_url: string | null
  category: number | null
  candidate_status: string
}

const roleOptions: Array<{ value: ManageableRole; label: string; help: string }> = [
  { value: 'ADMIN', label: 'Admin', help: 'Gestión operativa amplia del club.' },
  { value: 'OPERADOR', label: 'Operador', help: 'Gestión cotidiana deportiva y de contenidos.' },
  { value: 'PLANILLERO', label: 'Planillero', help: 'Carga operativa de partidos/resultados.' },
  { value: 'PLAYER', label: 'Jugador', help: 'Membresía sin permisos administrativos.' },
]

const inviteRoleOptions = roleOptions.filter((option) => option.value !== 'PLAYER')

function actionRoleLabel(role: ManageableRole) {
  if (role === 'ADMIN') return 'administrador'
  if (role === 'OPERADOR') return 'operador'
  if (role === 'PLANILLERO') return 'planillero'
  return 'jugador'
}

function StaffRoleField({
  role,
  onChange,
}: {
  role: ManageableRole
  onChange: (role: InvitableRole) => void
}) {
  return (
    <label>
      <span>Rol</span>
      <select className="px-input" value={role} onChange={(event) => onChange(event.target.value as InvitableRole)}>
        {inviteRoleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <small>{inviteRoleOptions.find((option) => option.value === role)?.help}</small>
    </label>
  )
}

const roleLabels: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  PLANILLERO: 'Planillero',
  OPERATIVO: 'Operativo',
  OPERADOR: 'Operador',
  PRENSA: 'Prensa',
  TESORERIA: 'Tesorería',
  PLAYER: 'Jugador',
}

const statusLabels: Record<string, string> = {
  PENDING: 'Pendiente',
  ACCEPTED: 'Aceptada',
  DECLINED: 'Rechazada',
  CANCELLED: 'Cancelada',
  APPROVED: 'Aprobado',
}

const adminPermissionRoles: ClubPermissionRole[] = [
  'OWNER',
  'ADMIN',
  'OPERADOR',
  'PLANILLERO',
  'PLAYER',
]

const roleDescriptions: Record<ClubPermissionRole, string> = {
  OWNER: 'Control total del club, configuración sensible y administración de equipo.',
  ADMIN: 'Gestión amplia de torneos, operación diaria y administración general.',
  OPERADOR: 'Operación de partidos, horarios y soporte del torneo en vivo.',
  OPERATIVO: 'Rol legacy equivalente a operación diaria del club.',
  PLANILLERO: 'Carga de resultados y seguimiento deportivo durante la competencia.',
  PRENSA: 'Gestión de contenido, noticias y comunicación pública del club.',
  TESORERIA: 'Visualización y administración de finanzas del club.',
  PLAYER: 'Rol externo de jugador, sin acceso administrativo al Club Admin.',
}

function formatDate(value?: string | null) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(value))
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Sin fecha'
  const date = new Date(value)
  const currentYear = new Date().getFullYear()
  const datePart = new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === currentYear ? {} : { year: 'numeric' as const }),
  }).format(date).replace('.', '')
  const timePart = new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
  return `${datePart} · ${timePart}`
}

function getProfileEmail(profile?: Profile | null, fallback?: string | null) {
  return profile?.email ?? fallback ?? 'Sin email'
}

function roleLabel(role: string) {
  return roleLabels[role] ?? role
}

function statusLabel(status: string) {
  return statusLabels[status] ?? status
}

function canonicalRoleLabel(role: string | null | undefined) {
  const canonical = getCanonicalClubPermissionRole(role)
  return canonical ? roleLabel(canonical) : 'Sin rol'
}

const staffPermissionSummaries = [
  {
    label: 'Torneos',
    capabilities: ['tournaments:create', 'tournaments:update', 'groups:generate', 'playoff:generate'],
  },
  { label: 'Resultados', capabilities: ['matches:update'] },
  { label: 'Horarios', capabilities: ['matches:schedule'] },
  { label: 'Usuarios', capabilities: ['memberships:manage', 'roles:manage'] },
  { label: 'Finanzas', capabilities: ['finance:view', 'finance:manage'] },
  { label: 'Contenido', capabilities: ['news:manage', 'ads:manage'] },
  { label: 'Club', capabilities: ['club:update', 'club:branding'] },
] satisfies Array<{ label: string; capabilities: ClubCapability[] }>

const compactPermissionRows = [
  { label: 'Crear torneos', capabilities: ['tournaments:create'] },
  { label: 'Generar grupos/playoff', capabilities: ['groups:generate', 'playoff:generate'] },
  { label: 'Cargar resultados', capabilities: ['matches:update'] },
  { label: 'Cambiar horarios/canchas', capabilities: ['matches:schedule'] },
  { label: 'Aprobar inscripciones', capabilities: ['registrations:manage'] },
  { label: 'Gestionar usuarios', capabilities: ['memberships:manage', 'roles:manage'] },
  { label: 'Ver finanzas', capabilities: ['finance:view'] },
  { label: 'Publicar contenido', capabilities: ['news:manage'] },
  { label: 'Configurar club', capabilities: ['club:update', 'club:branding'] },
] satisfies Array<{ label: string; capabilities: ClubCapability[] }>

function roleBadgeClass(role: string | null | undefined) {
  const canonical = getCanonicalClubPermissionRole(role)
  return `club-roleBadge club-roleBadge--${(canonical ?? role ?? 'unknown').toLowerCase()}`
}

function getStaffPermissionSummary(role: string | null | undefined) {
  const canonical = getCanonicalClubPermissionRole(role)
  if (!canonical) return []

  const permissions = getClubPermissions(canonical)
  return staffPermissionSummaries
    .filter((summary) => summary.capabilities.some((capability) => permissions.includes(capability)))
    .map((summary) => summary.label)
}

function hasAnyCapability(role: ClubPermissionRole, capabilities: ClubCapability[]) {
  const permissions = getClubPermissions(role)
  return capabilities.some((capability) => permissions.includes(capability))
}

export default function ClubUsuariosPage() {
  const { activeClub, clubRole, user } = useSession()
  const [activeTab, setActiveTab] = useState<TeamTab>('staff')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [schemaWarning, setSchemaWarning] = useState('')
  const [staffWarning, setStaffWarning] = useState('')
  const [themeKey, setThemeKey] = useState<string | null>(null)
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [invites, setInvites] = useState<ClubInvite[]>([])
  const [audit, setAudit] = useState<AuditEvent[]>([])
  const [staffMetrics, setStaffMetrics] = useState({ active: 0, rolesCovered: 0 })
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<ManageableRole>('ADMIN')
  const [inviteMode, setInviteMode] = useState<InviteMode>('player')
  const [candidateQuery, setCandidateQuery] = useState('')
  const [candidates, setCandidates] = useState<StaffCandidate[]>([])
  const [selectedCandidate, setSelectedCandidate] = useState<StaffCandidate | null>(null)
  const [candidateLoading, setCandidateLoading] = useState(false)
  const [candidateError, setCandidateError] = useState('')
  const [candidateRetry, setCandidateRetry] = useState(0)
  const [emailError, setEmailError] = useState('')
  const [staffFilter, setStaffFilter] = useState<StaffFilter>('ALL')
  const [flowSuccess, setFlowSuccess] = useState<FlowSuccess>(null)
  const [openActionsId, setOpenActionsId] = useState<string | null>(null)

  const pendingInvites = useMemo(
    () => invites.filter((invite) => invite.status === 'PENDING'),
    [invites]
  )

  const filteredStaff = useMemo(
    () => staffFilter === 'ALL' ? staff : staff.filter((member) => member.role === staffFilter),
    [staff, staffFilter]
  )

  const activityEvents = useMemo<ActivityEvent[]>(() => {
    const inviteEvents = invites.flatMap<ActivityEvent>((invite) => {
      const events: ActivityEvent[] = [
        {
          id: `invite-created-${invite.id}`,
          date: invite.created_at,
          title: 'Invitación enviada',
          detail: `${invite.email} fue invitado como ${roleLabel(invite.role)}.`,
          actor: invite.invited_by_profile?.display_name ?? invite.invited_by_profile?.email ?? undefined,
          subject: invite.email,
          status: statusLabel(invite.status),
          tone: invite.status === 'PENDING' ? 'warning' : 'info',
        },
      ]

      if (invite.status !== 'PENDING') {
        events.push({
          id: `invite-resolved-${invite.id}`,
          date: invite.resolved_at ?? invite.updated_at,
          title: invite.status === 'CANCELLED' ? 'Invitación cancelada' : 'Invitación resuelta',
          detail: `${invite.email} quedó con estado ${statusLabel(invite.status).toLowerCase()}.`,
          actor: invite.resolved_by_profile?.display_name ?? invite.resolved_by_profile?.email ?? undefined,
          subject: invite.email,
          status: statusLabel(invite.status),
          tone: invite.status === 'ACCEPTED' ? 'success' : invite.status === 'CANCELLED' ? 'muted' : 'warning',
        })
      }

      return events
    })

    const staffEvents = staff.map<ActivityEvent>((member) => ({
      id: `staff-active-${member.id}`,
      date: member.approved_at ?? member.created_at,
      title: 'Staff activo',
      detail: `${member.full_name} quedó activo como ${roleLabel(member.role)}.`,
      subject: member.profile?.email ?? member.full_name,
      status: statusLabel(member.status),
      tone: 'success',
    }))

    const auditEvents = audit.map<ActivityEvent>((event) => {
      const actorName = event.actor_profile?.display_name ?? event.actor_profile?.email ?? 'Un administrador'
      const targetName = event.target_profile?.display_name ?? event.target_profile?.email ?? 'un miembro'
      const detail = event.action === 'ROLE_CHANGED'
        ? `${actorName} asignó a ${targetName} como ${roleLabel(event.new_role ?? '')}.`
        : event.action === 'MEMBER_REMOVED'
          ? `${actorName} quitó a ${targetName} del equipo.`
          : event.action === 'OWNERSHIP_TRANSFERRED'
            ? `${actorName} transfirió la propiedad a ${targetName}.`
            : `${actorName} realizó un cambio en el equipo.`
      return {
        id: `audit-${event.id}`,
        date: event.created_at,
        title: event.action === 'ROLE_CHANGED' ? 'Rol actualizado' : event.action === 'MEMBER_REMOVED' ? 'Miembro removido' : event.action === 'OWNERSHIP_TRANSFERRED' ? 'Propiedad transferida' : event.action === 'INVITE_CANCELLED' ? 'Invitación cancelada' : event.action === 'INVITE_CREATED' ? 'Invitación enviada' : 'Cambio registrado',
        detail,
        actor: actorName,
        subject: event.target_profile?.email ?? event.target_profile?.display_name ?? undefined,
        status: 'Registrado',
        tone: 'info',
      }
    })
    return [...inviteEvents, ...auditEvents, ...staffEvents]
      .filter((event) => Boolean(event.date))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .filter((event, index, events) => {
        const eventTime = new Date(event.date).getTime()
        return !events.slice(0, index).some((previous) => (
          previous.title === event.title
          && (previous.actor ?? '') === (event.actor ?? '')
          && (previous.subject ?? '') === (event.subject ?? '')
          && Math.abs(new Date(previous.date).getTime() - eventTime) <= 5_000
        ))
      })
      .slice(0, 18)
  }, [audit, invites, staff])

  const ownerOnly = clubRole === 'OWNER'
  const canManageTeam = clubRole === 'OWNER' || clubRole === 'ADMIN'
  const theme = useMemo(() => getClubTheme(themeKey), [themeKey])
  const themeStyle = useMemo(
    () =>
      ({
        '--club-admin-accent': theme.vars.accent,
        '--club-admin-accent-2': theme.vars.accent2,
        '--club-admin-soft': theme.vars.soft,
        '--club-admin-glow': theme.vars.glow,
      }) as CSSProperties,
    [theme]
  )

  async function getToken() {
    const { data } = await supabase.auth.getSession()
    return data?.session?.access_token ?? null
  }

  async function loadInternalUsers(token: string) {
    if (!activeClub?.id) return

    const res = await fetch(`/api/clubs/internal-users?clubId=${activeClub.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const json = await res.json().catch(() => ({}))

    if (!res.ok) {
      setStaff([])
      setInvites([])
      setStaffMetrics({ active: 0, rolesCovered: 0 })
      if (json?.code === 'CLUB_INTERNAL_USERS_SCHEMA_MISSING') {
        setSchemaWarning(json?.error ?? 'Falta inicializar la gestión interna del club.')
      } else if (res.status === 403) {
        setStaffWarning(json?.error ?? 'La gestión de staff interno está limitada al OWNER.')
      } else {
        setStaffWarning(json?.error ?? 'No pudimos cargar el equipo.')
      }
      return
    }

    setStaff((json?.staff ?? []) as StaffMember[])
    setStaffMetrics({
      active: Number(json?.metrics?.active ?? 0),
      rolesCovered: Number(json?.metrics?.rolesCovered ?? 0),
    })
    setInvites((json?.invites ?? []) as ClubInvite[])
    setAudit((json?.audit ?? []) as AuditEvent[])
  }

  async function loadClubCore() {
    if (!activeClub?.id) {
      setStaff([])
      setInvites([])
      setThemeKey(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setMessage('')
    setSchemaWarning('')
    setStaffWarning('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setLoading(false)
      return
    }

    const [, clubThemeResult] = await Promise.allSettled([
      loadInternalUsers(token),
      supabase.from('clubs').select('theme_key').eq('id', activeClub.id).maybeSingle(),
    ])

    if (clubThemeResult.status === 'fulfilled') {
      setThemeKey((clubThemeResult.value.data?.theme_key as string | null) ?? null)
    }
    setLoading(false)
  }

  useEffect(() => {
    void Promise.resolve().then(() => loadClubCore())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClub?.id])

  useEffect(() => {
    if (inviteMode !== 'player' || !activeClub?.id || selectedCandidate) return
    const query = candidateQuery.trim()
    if (query.length < 2) return

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setCandidateLoading(true)
      setCandidateError('')
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) {
        setCandidateError('Sesión inválida.')
        setCandidateLoading(false)
        return
      }
      try {
        const params = new URLSearchParams({ clubId: activeClub.id, query })
        const res = await fetch(`/api/clubs/internal-users/candidates?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
          signal: controller.signal,
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error('No pudimos buscar jugadores.')
        setCandidates((json?.candidates ?? []) as StaffCandidate[])
      } catch (error) {
        if (!controller.signal.aborted) {
          setCandidates([])
          setCandidateError(error instanceof Error ? error.message : 'No pudimos buscar jugadores.')
        }
      } finally {
        if (!controller.signal.aborted) setCandidateLoading(false)
      }
    }, 350)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [activeClub?.id, candidateQuery, candidateRetry, inviteMode, selectedCandidate])

  useEffect(() => {
    if (!openActionsId) return
    function closeActions(event: MouseEvent) {
      const target = event.target
      if (target instanceof Element && target.closest(`[data-member-actions="${openActionsId}"]`)) return
      setOpenActionsId(null)
    }
    function closeActionsWithEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenActionsId(null)
    }
    document.addEventListener('pointerdown', closeActions)
    document.addEventListener('keydown', closeActionsWithEscape)
    return () => {
      document.removeEventListener('pointerdown', closeActions)
      document.removeEventListener('keydown', closeActionsWithEscape)
    }
  }, [openActionsId])

  async function createInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeClub?.id || !canManageTeam) return

    const normalizedEmail = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setEmailError('Ingresá un email válido.')
      return
    }

    setSaving(true)
    setMessage('')
    setFlowSuccess(null)
    setEmailError('')
    setSchemaWarning('')
    setStaffWarning('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setSaving(false)
      return
    }

    const res = await fetch('/api/clubs/internal-users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        clubId: activeClub.id,
        email: normalizedEmail,
        role,
      }),
    })
    const json = await res.json().catch(() => ({}))

    setSaving(false)

    if (!res.ok) {
      if (json?.code === 'CLUB_INTERNAL_USERS_SCHEMA_MISSING') {
        setSchemaWarning(json?.error ?? 'Falta inicializar la gestión interna del club.')
      } else {
        setMessage(json?.error ?? 'No pudimos enviar la invitación.')
      }
      return
    }

    setEmail('')
    setRole('ADMIN')
    setFlowSuccess({ mode: 'email', title: `Invitación enviada a ${normalizedEmail}.` })
    await loadClubCore()
  }

  async function promoteSelectedPlayer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeClub?.id || !selectedCandidate || !canManageTeam || role === 'PLAYER') return
    setSaving(true)
    setMessage('')
    setFlowSuccess(null)
    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setSaving(false)
      return
    }

    const res = await fetch('/api/clubs/internal-users/candidates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        clubId: activeClub.id,
        targetUserId: selectedCandidate.user_id,
        role,
      }),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      setMessage(json?.error ?? 'No pudimos asignar el rol.')
      return
    }

    const promotedName = selectedCandidate.display_name
    setSelectedCandidate(null)
    setCandidateQuery('')
    setCandidates([])
    setRole('ADMIN')
    setFlowSuccess({ mode: 'player', title: `${promotedName} ahora forma parte del equipo como ${actionRoleLabel(role)}.` })
    await loadClubCore()
  }

  async function cancelInvite(inviteId: string) {
    if (!window.confirm('¿Cancelar esta invitación? La persona ya no podrá aceptarla.')) return
    setSavingId(inviteId)
    setMessage('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setSavingId(null)
      return
    }

    const res = await fetch(`/api/clubs/internal-users/invites/${inviteId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = await res.json().catch(() => ({}))
    setSavingId(null)

    if (!res.ok) {
      setMessage(json?.error ?? 'No pudimos cancelar la invitación.')
      return
    }

    setMessage('Invitación cancelada.')
    await loadClubCore()
  }

  async function updateRole(member: StaffMember, nextRole: ManageableRole) {
    if (!activeClub?.id || member.role === 'OWNER') return
    setOpenActionsId(null)
    setSavingId(member.id)
    const token = await getToken()
    const res = await fetch('/api/clubs/internal-users', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ clubId: activeClub.id, membershipId: member.id, role: nextRole }) })
    const json = await res.json().catch(() => ({}))
    setSavingId(null)
    setMessage(res.ok ? 'Rol actualizado.' : json?.error ?? 'No pudimos cambiar el rol.')
    if (res.ok && token) await loadInternalUsers(token)
  }

  async function removeMember(member: StaffMember) {
    if (!activeClub?.id || member.role === 'OWNER' || !window.confirm(`¿Remover a ${member.full_name} del equipo interno?`)) return
    setOpenActionsId(null)
    setSavingId(member.id)
    const token = await getToken()
    const res = await fetch('/api/clubs/internal-users', { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ clubId: activeClub.id, membershipId: member.id }) })
    const json = await res.json().catch(() => ({}))
    setSavingId(null)
    setMessage(res.ok ? 'Miembro removido.' : json?.error ?? 'No pude remover al miembro.')
    if (res.ok && token) await loadInternalUsers(token)
  }

  async function transferOwnership(member: StaffMember) {
    if (!activeClub?.id || !ownerOnly || member.role === 'OWNER' || !window.confirm(`Vas a transferir la propiedad a ${member.full_name}. Tu rol pasará a ADMIN. ¿Continuar?`)) return
    setSavingId(member.id)
    const token = await getToken()
    const res = await fetch('/api/clubs/internal-users/transfer-ownership', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ clubId: activeClub.id, membershipId: member.id }) })
    const json = await res.json().catch(() => ({}))
    setSavingId(null)
    setMessage(res.ok ? 'Propiedad transferida correctamente.' : json?.error ?? 'No pude transferir la propiedad.')
    if (res.ok) window.location.reload()
  }

  function renderPerson(profile: Profile | null, name: string, fallbackEmail?: string | null, compact = false) {
    return (
      <div className={`club-person ${compact ? 'club-person--compact' : ''}`}>
        <span className={`club-avatar ${compact ? 'club-avatar--sm' : ''}`}>
          {profile?.avatar_url ? <Image src={profile.avatar_url} alt="" width={44} height={44} /> : getClubInitials(name)}
        </span>
        <div className="club-personMain">
          <strong>{name}</strong>
          <span>{getProfileEmail(profile, fallbackEmail)}</span>
        </div>
      </div>
    )
  }

  function renderStaffTab() {
    return (
      <section className="club-card club-staffPeoplePanel">
          <div className="club-cardHead">
            <div>
              <span className="club-kicker">Staff</span>
              <h2>Equipo activo</h2>
              <p>Roles internos y capacidades principales para operar el club.</p>
            </div>
          </div>

          {staffWarning ? <div className="club-note">{staffWarning}</div> : null}
          {staff.length > 2 ? (
            <div className="club-staffFilters" aria-label="Filtrar staff por rol">
              {([
                ['ALL', 'Todos'], ['ADMIN', 'Admin'], ['OPERADOR', 'Operadores'], ['PLANILLERO', 'Planilleros'],
              ] as Array<[StaffFilter, string]>).map(([value, label]) => (
                <button key={value} type="button" className={staffFilter === value ? 'is-active' : ''} aria-pressed={staffFilter === value} onClick={() => setStaffFilter(value)}>{label}</button>
              ))}
            </div>
          ) : null}
          {staff.length === 0 ? (
            <div className="px-empty">Todavía no hay usuarios internos aprobados.</div>
          ) : filteredStaff.length === 0 ? (
            <div className="px-empty">No hay miembros con este rol.</div>
          ) : (
            <div className="club-staffCards">
              {filteredStaff.map((member) => {
                const permissionSummary = getStaffPermissionSummary(member.role)
                const isSelf = member.user_id === user?.id
                const canReceiveOwnership = member.role === 'ADMIN' || member.role === 'OPERADOR'
                return (
                  <article key={member.id} className="club-staffCard">
                    <div className="club-staffCardTop">
                      {renderPerson(member.profile, member.full_name)}
                      <div className="club-staffCardBadges">
                        <span className={roleBadgeClass(member.role)}>{roleLabel(member.role)}</span>
                        <span className="club-statusPill club-statusPill--ok">
                          {statusLabel(member.status)}
                        </span>
                      </div>
                    </div>

                    <div className="club-staffCapabilityRow">
                      <div className="club-permissionChips" aria-label={`Permisos principales de ${member.full_name}`}>
                        {permissionSummary.length > 0 ? (
                          permissionSummary.slice(0, 4).map((permission) => (
                            <span key={`${member.id}-${permission}`} className="club-permissionChip">
                              {permission}
                            </span>
                          ))
                        ) : (
                          <span className="club-permissionChip club-permissionChip--muted">
                            Sin permisos operativos
                          </span>
                        )}
                        {permissionSummary.length > 4 ? <span className="club-permissionChip">+{permissionSummary.length - 4}</span> : null}
                      </div>
                      {canManageTeam && member.role !== 'OWNER' && !isSelf ? (
                        <div className={`club-memberActions ${openActionsId === member.id ? 'is-open' : ''}`} data-member-actions={member.id}>
                          <button type="button" className="club-memberActionsTrigger" aria-expanded={openActionsId === member.id} aria-controls={`member-actions-${member.id}`} onClick={() => setOpenActionsId((current) => current === member.id ? null : member.id)}>Acciones</button>
                          {openActionsId === member.id ? <div id={`member-actions-${member.id}`} role="group" aria-label={`Acciones para ${member.full_name}`}>
                            <label>
                              <span>Cambiar rol</span>
                              <select className="px-input" value={member.role} disabled={savingId === member.id} onChange={(event) => void updateRole(member, event.target.value as ManageableRole)} aria-label={`Cambiar rol de ${member.full_name}`}>
                                {roleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                              </select>
                            </label>
                            <div className="club-memberActionButtons">
                              <button type="button" className="club-secondaryBtn" onClick={() => { setActiveTab('permissions'); setOpenActionsId(null) }}>Ver permisos</button>
                              <button type="button" className="club-dangerBtn" disabled={savingId === member.id} onClick={() => void removeMember(member)}>Remover</button>
                            </div>
                            {ownerOnly && canReceiveOwnership ? <button type="button" className="club-secondaryBtn" disabled={savingId === member.id} onClick={() => void transferOwnership(member)}>Transferir propiedad</button> : null}
                          </div> : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="club-staffCardFoot">
                      <small>Activo desde {formatDate(member.approved_at ?? member.created_at)}</small>
                      {member.role === 'OWNER' ? <span className="club-ownerProtected">Propiedad protegida</span> : null}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
      </section>
    )
  }

  function renderInvitationsTab() {
    return (
      <div className="club-staffLayout">
        <section className="club-card club-staffInvitePanel">
          <div className="club-cardHead">
            <div>
              <span className="club-kicker">Alta interna</span>
              <h2>Incorporar al equipo</h2>
              <p>Promové un jugador del club o invitá a una persona externa.</p>
            </div>
          </div>

          {!canManageTeam ? (
            <div className="club-note">No tenés permisos para crear invitaciones de staff.</div>
          ) : (
            <>
              <div className="club-inviteModes" role="tablist" aria-label="Tipo de incorporación">
                <button type="button" role="tab" aria-selected={inviteMode === 'player'} className={inviteMode === 'player' ? 'is-active' : ''} onClick={() => { setInviteMode('player'); setMessage(''); setFlowSuccess(null) }}>
                  Jugador del club
                </button>
                <button type="button" role="tab" aria-selected={inviteMode === 'email'} className={inviteMode === 'email' ? 'is-active' : ''} onClick={() => { setInviteMode('email'); setMessage(''); setFlowSuccess(null) }}>
                  Persona externa
                </button>
              </div>

              {flowSuccess?.mode === inviteMode ? (
                <div className="club-flowSuccess" role="status">
                  <span aria-hidden="true">✓</span>
                  <strong>{flowSuccess.title}</strong>
                  <p>{inviteMode === 'player' ? 'El nuevo rol ya está activo en el equipo.' : 'La invitación queda pendiente hasta que la persona la acepte.'}</p>
                  <div>
                    <button type="button" className="club-primaryBtn" onClick={() => { setFlowSuccess(null); setActiveTab(inviteMode === 'player' ? 'staff' : 'invites') }}>
                      {inviteMode === 'player' ? 'Ver en Staff' : 'Ver invitaciones'}
                    </button>
                    <button type="button" className="club-secondaryBtn" onClick={() => setFlowSuccess(null)}>
                      {inviteMode === 'player' ? 'Incorporar otra persona' : 'Enviar otra'}
                    </button>
                  </div>
                </div>
              ) : inviteMode === 'player' ? (
                <form className="club-inviteForm" onSubmit={promoteSelectedPlayer}>
                  {!selectedCandidate ? (
                    <label>
                      <span>Buscar jugador</span>
                      <div className="club-searchField">
                        <input className="px-input" type="search" value={candidateQuery} onChange={(event) => {
                          const nextQuery = event.target.value
                          setCandidateQuery(nextQuery)
                          if (nextQuery.trim().length < 2) {
                            setCandidates([])
                            setCandidateError('')
                            setCandidateLoading(false)
                          }
                        }} placeholder="Buscar por nombre o email" autoComplete="off" />
                        {candidateLoading ? <span className="club-searchLoader" aria-label="Buscando jugadores" /> : null}
                        {candidateQuery ? <button type="button" aria-label="Limpiar búsqueda" onClick={() => { setCandidateQuery(''); setCandidates([]); setCandidateError('') }}>×</button> : null}
                      </div>
                      <small aria-live="polite">
                        {!candidateQuery.trim()
                          ? 'Buscá un jugador aprobado del club para incorporarlo al equipo.'
                          : candidateQuery.trim().length < 2
                            ? 'Escribí al menos 2 caracteres.'
                            : candidateLoading
                              ? 'Buscando jugadores…'
                              : candidateError || 'Seleccioná un jugador del padrón del club.'}
                      </small>
                      {candidateError ? <button type="button" className="club-inlineRetry" onClick={() => setCandidateRetry((value) => value + 1)}>Reintentar</button> : null}
                    </label>
                  ) : null}

                  {!selectedCandidate && candidateQuery.trim().length >= 2 && !candidateLoading && !candidateError ? (
                    candidates.length > 0 ? (
                      <div className="club-candidateList" role="listbox" aria-label="Jugadores encontrados">
                        {candidates.map((candidate) => (
                          <button key={candidate.user_id} type="button" role="option" aria-selected="false" onClick={() => setSelectedCandidate(candidate)}>
                            {renderPerson({ user_id: candidate.user_id, email: candidate.email, first_name: null, last_name: null, display_name: candidate.display_name, avatar_url: candidate.avatar_url }, candidate.display_name, candidate.email, true)}
                            <span className="club-candidateMeta">{candidate.category ? `Categoría ${candidate.category}` : 'Sin categoría'} · Jugador</span>
                          </button>
                        ))}
                      </div>
                    ) : <div className="px-empty">No encontramos jugadores disponibles con esa búsqueda.</div>
                  ) : null}

                  {selectedCandidate ? (
                    <div className="club-selectedCandidate">
                      {renderPerson({ user_id: selectedCandidate.user_id, email: selectedCandidate.email, first_name: null, last_name: null, display_name: selectedCandidate.display_name, avatar_url: selectedCandidate.avatar_url }, selectedCandidate.display_name, selectedCandidate.email)}
                      <span>{selectedCandidate.category ? `Categoría ${selectedCandidate.category}` : 'Sin categoría'} · {selectedCandidate.candidate_status} · Jugador</span>
                      <button type="button" className="club-secondaryBtn" onClick={() => setSelectedCandidate(null)}>Cambiar jugador</button>
                    </div>
                  ) : null}

                  <StaffRoleField role={role} onChange={setRole} />
                  <button type="submit" className="club-primaryBtn" disabled={saving || !selectedCandidate}>
                    {saving ? 'Asignando…' : `✓ Asignar como ${actionRoleLabel(role)}`}
                  </button>
                </form>
              ) : (
                <form className="club-inviteForm" onSubmit={createInvite}>
                  <p className="club-formHint">Se enviará una invitación para sumarse al equipo del club.</p>
                  <label>
                    <span>Email</span>
                    <input className="px-input" type="email" value={email} onChange={(event) => { setEmail(event.target.value); setEmailError('') }} placeholder="usuario@email.com" aria-invalid={Boolean(emailError)} aria-describedby="external-email-error" required />
                    <small id="external-email-error" aria-live="polite">{emailError}</small>
                  </label>
                  <StaffRoleField role={role} onChange={setRole} />
                  <button type="submit" className="club-primaryBtn" disabled={saving}>
                    {saving ? 'Enviando…' : `Enviar invitación como ${actionRoleLabel(role)}`}
                  </button>
                </form>
              )}
            </>
          )}
        </section>

        <section className="club-card club-staffPendingPanel">
          <div className="club-cardHead">
            <div>
              <span className="club-kicker">Invitaciones</span>
              <h2>Staff pendiente</h2>
              <p>Invitaciones enviadas que todavía no fueron aceptadas.</p>
            </div>
          </div>

          {pendingInvites.length === 0 ? (
            <div className="club-emptyState">
              <strong>No hay invitaciones pendientes.</strong>
              <span>Las invitaciones enviadas a personas externas aparecerán acá.</span>
            </div>
          ) : (
            <div className="club-staffPendingList">
              {pendingInvites.map((invite) => {
                const permissionSummary = getStaffPermissionSummary(invite.role)
                return (
                  <article key={invite.id} className="club-staffInviteCard">
                    <div className="club-staffCardTop">
                      {renderPerson(invite.target_user_profile, invite.email, invite.email)}
                      <div className="club-staffCardBadges">
                        <span className={roleBadgeClass(invite.role)}>{roleLabel(invite.role)}</span>
                        <span className="club-statusPill club-statusPill--pending">
                          Invitación pendiente
                        </span>
                      </div>
                    </div>

                    <p className="club-inviteDates">
                      {canonicalRoleLabel(invite.role)} · Enviada {formatDate(invite.created_at)} · Vence {formatDate(invite.expires_at)}
                    </p>

                    <div className="club-staffInviteFooter">
                      <div className="club-permissionChips" aria-label={`Permisos principales de ${invite.email}`}>
                        {permissionSummary.map((permission) => (
                          <span key={`${invite.id}-${permission}`} className="club-permissionChip">
                            {permission}
                          </span>
                        ))}
                      </div>
                      {canManageTeam ? (
                        <button
                          type="button"
                          className="club-secondaryBtn"
                          disabled={savingId === invite.id}
                          onClick={() => cancelInvite(invite.id)}
                        >
                          {savingId === invite.id ? '...' : 'Cancelar invitación'}
                        </button>
                      ) : null}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
    )
  }

  function renderPermissionsTab() {
    return (
      <section className="club-card club-permissionsPanel">
        <div className="club-cardHead">
          <div>
            <span className="club-kicker">Roles y permisos</span>
            <h2>Mapa operativo del club</h2>
            <p>Vista informativa de capacidades administrativas. Por ahora no es editable por club.</p>
          </div>
        </div>

        <div className="club-permissionsNote">
          Los permisos se aplican desde la capa interna de SELPA. La edición personalizada por club llegará en una etapa futura.
        </div>

        <div className="club-roleCards" aria-label="Roles administrativos del club">
          {adminPermissionRoles.map((permissionRole) => {
            const permissionSummary = getStaffPermissionSummary(permissionRole)
            return (
              <details key={permissionRole} className="club-roleCard">
                <summary className="club-roleCardHead">
                  <span className={roleBadgeClass(permissionRole)}>{roleLabel(permissionRole)}</span>
                  <small>{getClubPermissions(permissionRole).length} permisos</small>
                </summary>
                <div className="club-roleCardBody">
                  <p>{roleDescriptions[permissionRole]}</p>
                  <div className="club-permissionChips" aria-label={`Resumen de permisos de ${roleLabel(permissionRole)}`}>
                    {permissionSummary.map((permission) => (
                      <span key={`${permissionRole}-${permission}`} className="club-permissionChip">
                        {permission}
                      </span>
                    ))}
                  </div>
                </div>
              </details>
            )
          })}
        </div>

        <div className="club-compactMatrix" aria-label="Matriz compacta de permisos">
          <div className="club-compactMatrixHead">
            <span>Capacidad</span>
            {adminPermissionRoles.map((permissionRole) => (
              <span key={permissionRole}>{roleLabel(permissionRole)}</span>
            ))}
          </div>
          {compactPermissionRows.map((row) => (
            <div key={row.label} className="club-compactMatrixRow">
              <span>{row.label}</span>
              {adminPermissionRoles.map((permissionRole) => {
                const isAllowed = hasAnyCapability(permissionRole, row.capabilities)
                return (
                  <span
                    key={`${row.label}-${permissionRole}`}
                    className={`club-matrixCheck ${isAllowed ? 'is-on' : ''}`}
                    title={`${roleLabel(permissionRole)}: ${isAllowed ? 'habilitado' : 'sin permiso'}`}
                  >
                    {isAllowed ? '✓' : '–'}
                  </span>
                )
              })}
            </div>
          ))}
        </div>

        <div className="club-permissionsPlayerNote">
          <strong>Jugador / PLAYER</strong>
          <span>Jugador es un rol externo de la comunidad deportiva y no forma parte del staff operativo.</span>
        </div>
      </section>
    )
  }

  function renderActivityTab() {
    return (
      <section className="club-card club-activityPanel">
        <div className="club-cardHead">
          <div>
            <span className="club-kicker">Actividad</span>
            <h2>Historial operativo</h2>
            <p>Actividad disponible a partir de invitaciones, altas y aprobaciones existentes.</p>
          </div>
          <span className="club-statusPill club-statusPill--muted">{activityEvents.length}</span>
        </div>

        <div className="club-activityNote">
          Los cambios sensibles de equipo quedan registrados con actor, fecha y detalle.
        </div>

        {activityEvents.length === 0 ? (
          <div className="club-activityPlaceholder">
            <strong>Próximamente</strong>
            <span>Historial de cambios de rol, resultados, pagos y horarios.</span>
          </div>
        ) : (
          <div className="club-activityTimeline" aria-label="Timeline de actividad del club">
            {activityEvents.map((event) => (
              <article key={event.id} className={`club-activityEvent club-activityEvent--${event.tone}`}>
                <span className="club-activityIcon" aria-hidden="true" />
                <div className="club-activityBody">
                  <div className="club-activityTop">
                    <strong>{event.title}</strong>
                    <span>{formatDateTime(event.date)}</span>
                  </div>
                  <p>{event.detail}</p>
                  <div className="club-activityMeta">
                    {event.actor ? <span>Actor: {event.actor}</span> : <span>Actor no disponible</span>}
                    <span className={`club-statusPill club-statusPill--${event.tone === 'success' ? 'ok' : event.tone === 'warning' ? 'pending' : 'muted'}`}>
                      {event.status}
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    )
  }

  function renderActiveTab() {
    if (activeTab === 'staff') return renderStaffTab()
    if (activeTab === 'invites') return renderInvitationsTab()
    if (activeTab === 'permissions') return renderPermissionsTab()
    return renderActivityTab()
  }

  return (
    <div className="px-wrap">
      <div className="club-panel club-users" style={themeStyle}>
        <div className="club-usersHead">
          <div>
            <span className="club-kicker">Club Core</span>
            <h1 className="club-title">Equipo y roles</h1>
            <p className="club-sub">Administración interna de staff, invitaciones y permisos de {activeClub?.name ?? 'tu club'}.</p>
          </div>
          <div className="club-usersStats">
            <span><b>{staffMetrics.active}</b> staff activo</span>
            <span><b>{pendingInvites.length}</b> invitaciones</span>
            <span><b>{staffMetrics.rolesCovered}</b> roles cubiertos</span>
          </div>
        </div>

        {message ? <div className="club-message" role="status" aria-live="polite">{message}</div> : null}
        {schemaWarning ? <div className="club-warning">{schemaWarning}</div> : null}

        {!activeClub?.id ? (
          <div className="px-empty">Primero seleccioná un club activo.</div>
        ) : loading ? (
          <div className="club-teamSkeleton" role="status" aria-label="Cargando equipo y roles">
            <span />
            <span />
            <span />
          </div>
        ) : (
          <>
            <div className="club-teamTabs" role="tablist" aria-label="Equipo y roles">
              {[
                ['staff', 'Staff', staff.length],
                ['invites', 'Invitaciones', pendingInvites.length],
                ['permissions', 'Roles y permisos', null],
                ['activity', 'Actividad', null],
              ].map(([tab, label, count]) => (
                <button
                  key={tab}
                  type="button"
                  className={`club-teamTab ${activeTab === tab ? 'club-teamTab--active' : ''}`}
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => setActiveTab(tab as TeamTab)}
                >
                  {label}
                  {typeof count === 'number' ? <span>{count}</span> : null}
                </button>
              ))}
            </div>

            {renderActiveTab()}
          </>
        )}
      </div>

      <style>{`
        .club-users {
          background: #fff;
          border: 1px solid rgba(15,23,42,.08);
          border-radius: 24px;
          box-shadow: 0 24px 64px rgba(15,23,42,.09);
          min-width: 0;
          overflow: visible;
          padding: 18px;
          position: relative;
        }
        .club-users::before {
          background: linear-gradient(90deg, var(--club-admin-accent), var(--club-admin-accent-2));
          content: "";
          height: 4px;
          left: 0;
          position: absolute;
          right: 0;
          top: 0;
        }
        .club-usersHead { align-items: flex-start; background: linear-gradient(135deg, rgba(248,250,252,.98), var(--club-admin-soft)); border: 1px solid rgba(15,23,42,.07); border-radius: 16px; display: flex; gap: 12px; justify-content: space-between; padding: 14px; }
        .club-usersStats { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
        .club-usersStats span { background: #fff; border: 1px solid color-mix(in srgb, var(--club-admin-accent) 16%, transparent); border-radius: 999px; color: #475569; font-size: 13px; font-weight: 800; padding: 8px 10px; white-space: nowrap; }
        .club-usersStats b { color: #17253f; }
        .club-message, .club-warning, .club-note { border-radius: 12px; font-weight: 800; padding: 10px 12px; }
        .club-message, .club-note { background: color-mix(in srgb, var(--club-admin-accent) 10%, white); border: 1px solid color-mix(in srgb, var(--club-admin-accent) 24%, transparent); color: #061b3a; }
        .club-warning { background: #fff7df; border: 1px solid rgba(217,119,6,.24); color: #854d0e; margin-top: 12px; }
        .club-teamTabs { align-items: center; background: #f8fafc; border: 1px solid rgba(15,23,42,.08); border-radius: 12px; display: flex; flex-wrap: wrap; gap: 4px; margin-top: 14px; padding: 4px; }
        .club-teamTab { align-items: center; background: transparent; border: 1px solid transparent; border-radius: 9px; color: #64748b; cursor: pointer; display: inline-flex; font-size: 12px; font-weight: 500; gap: 5px; height: 38px; padding: 5px 8px; white-space: nowrap; }
        .club-teamTab span { align-items: center; background: rgba(100,116,139,.10); border-radius: 999px; display: inline-flex; font-size: 11px; justify-content: center; min-width: 22px; padding: 2px 6px; }
        .club-teamTab:hover { background: #fff; border-color: color-mix(in srgb, var(--club-admin-accent) 24%, transparent); color: #061b3a; }
        .club-teamTab--active { background: #fff; border-color: color-mix(in srgb, var(--club-admin-accent) 38%, transparent); box-shadow: 0 2px 7px rgba(15,23,42,.07); color: #061b3a; }
        .club-teamGrid { display: grid; gap: 14px; margin-top: 14px; }
        .club-card { background: rgba(255,255,255,.96); border: 1px solid rgba(15,23,42,.08); border-radius: 16px; box-shadow: 0 10px 28px rgba(15,23,42,.045); display: grid; gap: 10px; margin-top: 12px; min-width: 0; padding: 14px; }
        .club-teamGrid .club-card { margin-top: 0; }
        .club-cardHead { align-items: flex-start; display: flex; gap: 10px; justify-content: space-between; }
        .club-cardHead h2 { color: #17253f; font-size: 18px; line-height: 1.15; margin: 2px 0 0; }
        .club-cardHead p { color: #64748b; font-size: 12px; font-weight: 800; margin: 5px 0 0; }
        .club-kicker { color: var(--club-admin-accent); font-size: 11px; font-weight: 950; letter-spacing: .06em; text-transform: uppercase; }
        .club-inviteForm { display: grid; gap: 10px; }
        .club-inviteForm label { color: #17253f; display: grid; font-size: 13px; font-weight: 900; gap: 6px; min-width: 0; }
        .club-inviteForm small { color: #64748b; font-size: 12px; font-weight: 700; }
        .club-searchField { min-width: 0; position: relative; }
        .club-searchField .px-input { padding-right: 72px; width: 100%; }
        .club-searchField > button { align-items: center; background: transparent; border: 0; border-radius: 999px; color: #64748b; cursor: pointer; display: flex; font-size: 20px; height: 36px; justify-content: center; position: absolute; right: 5px; top: 4px; width: 36px; }
        .club-searchLoader { animation: club-spin .75s linear infinite; border: 2px solid #cbd5e1; border-right-color: var(--club-admin-accent); border-radius: 999px; height: 16px; position: absolute; right: 45px; top: 14px; width: 16px; }
        .club-inlineRetry { background: transparent; border: 0; color: #075985; cursor: pointer; font-size: 12px; font-weight: 950; justify-self: start; min-height: 36px; padding: 4px 0; text-decoration: underline; }
        .club-inviteModes { background: #f8fafc; border: 1px solid rgba(15,23,42,.08); border-radius: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 12px; padding: 4px; }
        .club-inviteModes button { background: transparent; border: 0; border-radius: 9px; color: #64748b; cursor: pointer; font: inherit; font-size: 12px; font-weight: 900; padding: 9px 10px; }
        .club-inviteModes button.is-active { background: #fff; box-shadow: 0 3px 10px rgba(15,23,42,.08); color: #10233f; }
        .club-candidateList { border: 1px solid rgba(15,23,42,.1); border-radius: 12px; display: grid; max-height: 260px; overflow-y: auto; }
        .club-candidateList > button { align-items: center; background: #fff; border: 0; border-bottom: 1px solid rgba(15,23,42,.07); cursor: pointer; display: grid; gap: 4px; grid-template-columns: minmax(0,1fr) auto; padding: 10px; text-align: left; }
        .club-candidateList > button:last-child { border-bottom: 0; }
        .club-candidateList > button:hover, .club-candidateList > button:focus-visible { background: #f8fafc; outline: none; }
        .club-candidateMeta { color: #64748b; font-size: 11px; font-weight: 800; }
        .club-selectedCandidate { background: #f8fafc; border: 1px solid rgba(15,23,42,.1); border-radius: 14px; display: grid; gap: 8px; padding: 12px; }
        .club-selectedCandidate > span { color: #64748b; font-size: 12px; font-weight: 800; }
        .club-formHint { color: #64748b; font-size: 12px; font-weight: 750; line-height: 1.4; margin: 0; }
        .club-flowSuccess { align-items: start; background: #f0fdf4; border: 1px solid rgba(22,163,74,.22); border-radius: 14px; display: grid; gap: 7px; padding: 14px; }
        .club-flowSuccess > span { align-items: center; background: #16a34a; border-radius: 999px; color: #fff; display: inline-flex; font-weight: 950; height: 28px; justify-content: center; width: 28px; }
        .club-flowSuccess strong { color: #14532d; font-size: 15px; }
        .club-flowSuccess p { color: #3f6250; font-size: 12px; font-weight: 750; margin: 0; }
        .club-flowSuccess > div { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 3px; }
        .club-teamSkeleton { display: grid; gap: 8px; margin-top: 10px; }
        .club-teamSkeleton span { animation: club-pulse 1.2s ease-in-out infinite alternate; background: #e8edf3; border-radius: 12px; height: 54px; }
        .club-teamSkeleton span:first-child { height: 42px; }
        @keyframes club-spin { to { transform: rotate(360deg); } }
        @keyframes club-pulse { to { opacity: .48; } }
        .club-primaryBtn, .club-secondaryBtn, .club-dangerBtn { border-radius: 999px; cursor: pointer; font-weight: 950; min-height: 44px; padding: 9px 14px; transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease; }
        .club-primaryBtn { background: #061b3a; border: 1px solid color-mix(in srgb, var(--club-admin-accent) 38%, transparent); box-shadow: 0 10px 22px var(--club-admin-glow); color: #fff; }
        .club-secondaryBtn { background: #fff; border: 1px solid color-mix(in srgb, var(--club-admin-accent) 34%, transparent); color: #061b3a; }
        .club-dangerBtn { background: #fff; border: 1px solid rgba(190,18,60,.24); color: #9f1239; }
        .club-primaryBtn:hover:not(:disabled), .club-secondaryBtn:hover:not(:disabled) { box-shadow: 0 12px 26px var(--club-admin-glow); transform: translateY(-1px); }
        .club-primaryBtn:disabled, .club-secondaryBtn:disabled { cursor: not-allowed; opacity: .65; }
        .club-staffLayout { display: grid; gap: 14px; margin-top: 14px; }
        .club-staffLayout .club-card { margin-top: 0; }
        .club-staffPeoplePanel { align-content: start; }
        .club-staffPendingPanel { align-content: start; }
        .club-staffCards, .club-staffPendingList { display: grid; gap: 10px; min-width: 0; }
        .club-staffFilters { display: flex; gap: 6px; max-width: 100%; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; }
        .club-staffFilters::-webkit-scrollbar { display: none; }
        .club-staffFilters button { background: #f8fafc; border: 1px solid rgba(15,23,42,.08); border-radius: 999px; color: #64748b; cursor: pointer; flex: 0 0 auto; font-size: 12px; font-weight: 900; min-height: 38px; padding: 7px 12px; }
        .club-staffFilters button.is-active { background: #061b3a; border-color: #061b3a; color: #fff; }
        .club-staffCard, .club-staffInviteCard {
          background: linear-gradient(180deg, rgba(248,250,252,.86), rgba(255,255,255,.98));
          border: 1px solid rgba(15,23,42,.08);
          border-radius: 14px;
          box-shadow: 0 10px 24px rgba(15,23,42,.04);
          display: grid;
          gap: 10px;
          min-width: 0;
          padding: 12px;
        }
        .club-staffInviteCard { background: #fff; }
        .club-inviteDates { color: #64748b; font-size: 12px; font-weight: 800; line-height: 1.4; margin: 0; overflow-wrap: anywhere; }
        .club-staffCardTop { align-items: flex-start; display: flex; gap: 10px; justify-content: space-between; min-width: 0; }
        .club-staffCardBadges { align-items: flex-end; display: flex; flex: 0 0 auto; flex-direction: column; gap: 6px; }
        .club-staffMetaGrid { display: grid; gap: 8px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .club-staffMetaGrid span {
          background: rgba(255,255,255,.78);
          border: 1px solid rgba(15,23,42,.06);
          border-radius: 10px;
          display: grid;
          gap: 2px;
          min-width: 0;
          padding: 8px 9px;
        }
        .club-staffMetaGrid small { color: #64748b; font-size: 10px; font-weight: 950; text-transform: uppercase; }
        .club-staffMetaGrid strong { color: #17253f; font-size: 12px; font-weight: 850; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-staffCapabilityRow { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: space-between; min-width: 0; }
        .club-staffCapabilityRow > .club-permissionChips { flex: 1 1 auto; }
        .club-permissionChips { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
        .club-permissionChip {
          background: color-mix(in srgb, var(--club-admin-accent) 10%, white);
          border: 1px solid color-mix(in srgb, var(--club-admin-accent) 24%, transparent);
          border-radius: 999px;
          color: #061b3a;
          font-size: 11px;
          font-weight: 850;
          line-height: 1;
          padding: 6px 8px;
        }
        .club-permissionChip--muted { background: #f1f5f9; border-color: rgba(15,23,42,.08); color: #64748b; }
        .club-staffInviteFooter { align-items: center; display: flex; gap: 10px; justify-content: space-between; min-width: 0; }
        .club-staffCardFoot { align-items: center; border-top: 1px solid rgba(15,23,42,.07); display: flex; flex-wrap: wrap; gap: 4px 8px; justify-content: space-between; padding-top: 7px; }
        .club-staffCardFoot > small { color: #64748b; font-size: 11px; font-weight: 800; }
        .club-memberActions { flex: 0 0 auto; min-width: 132px; position: relative; }
        .club-memberActions > div { background: #fff; border: 1px solid rgba(15,23,42,.1); border-radius: 14px; box-shadow: 0 18px 44px rgba(15,23,42,.16); display: grid; gap: 8px; min-width: 250px; padding: 10px; position: absolute; right: 0; top: calc(100% + 6px); z-index: 4; }
        .club-memberActions label { color: #475569; display: grid; font-size: 11px; font-weight: 900; gap: 5px; }
        .club-ownerProtected { color: #64748b; font-size: 11px; font-weight: 850; }
        .club-staffList, .club-inviteList, .club-historyList { display: grid; gap: 8px; min-width: 0; }
        .club-staffRow, .club-inviteRow, .club-historyRow, .club-requestRow { border: 1px solid rgba(15,23,42,.07); border-radius: 12px; min-width: 0; padding: 9px; }
        .club-staffRow, .club-inviteRow, .club-requestRow { align-items: center; display: grid; gap: 10px; }
        .club-person { align-items: center; display: flex; gap: 10px; min-width: 0; }
        .club-person--compact { gap: 8px; }
        .club-avatar { align-items: center; background: rgba(15,23,42,.08); border-radius: 12px; color: #17253f; display: inline-flex; flex: 0 0 auto; font-weight: 950; height: 38px; justify-content: center; overflow: hidden; width: 38px; }
        .club-avatar--sm { border-radius: 10px; height: 34px; width: 34px; }
        .club-avatar img { height: 100%; object-fit: cover; width: 100%; }
        .club-personMain, .club-inviteMain { display: grid; gap: 2px; min-width: 0; }
        .club-personMain strong, .club-personMain span, .club-inviteMain strong, .club-inviteMain span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-personMain strong, .club-inviteMain strong { color: #17253f; font-size: 14px; font-weight: 950; }
        .club-personMain span, .club-inviteMain span { color: #64748b; font-size: 12px; }
        .club-rowMeta { align-items: flex-end; display: grid; gap: 4px; justify-items: end; }
        .club-rowMeta small { color: #64748b; font-size: 11px; font-weight: 800; }
        .club-roleBadge, .club-statusBadge, .club-statusPill { border-radius: 999px; font-size: 12px; font-weight: 950; padding: 6px 8px; text-align: center; white-space: nowrap; width: fit-content; }
        .club-roleBadge--owner { background: #fff7df; color: #854d0e; }
        .club-roleBadge--admin { background: color-mix(in srgb, var(--club-admin-accent) 10%, white); color: #061b3a; }
        .club-roleBadge--planillero { background: #ecfdf3; color: #166534; }
        .club-roleBadge--operativo { background: #fff0f5; color: #9d174d; }
        .club-roleBadge--operador { background: #fff0f5; color: #9d174d; }
        .club-roleBadge--prensa { background: #f0f9ff; color: #075985; }
        .club-roleBadge--tesoreria { background: #fefce8; color: #854d0e; }
        .club-roleBadge--player, .club-roleBadge--unknown { background: #f1f5f9; color: #475569; }
        .club-statusPill--ok, .club-statusBadge--accepted { background: #ecfdf3; color: #166534; }
        .club-statusPill--pending { background: #fff7df; color: #854d0e; }
        .club-statusPill--muted, .club-statusBadge--cancelled { background: #f1f5f9; color: #475569; }
        .club-statusBadge--declined { background: #fff0f5; color: #9d174d; }
        .club-emptyState {
          background: #f8fafc;
          border: 1px dashed rgba(15,23,42,.16);
          border-radius: 12px;
          display: grid;
          gap: 3px;
          padding: 12px;
        }
        .club-emptyState strong { color: #17253f; font-size: 13px; font-weight: 900; }
        .club-emptyState span { color: #64748b; font-size: 12px; font-weight: 800; }
        .club-permissionsPanel { align-content: start; }
        .club-permissionsNote, .club-permissionsPlayerNote {
          background: color-mix(in srgb, var(--club-admin-accent) 9%, white);
          border: 1px solid color-mix(in srgb, var(--club-admin-accent) 22%, transparent);
          border-radius: 12px;
          color: #061b3a;
          font-size: 12px;
          font-weight: 850;
          line-height: 1.35;
          padding: 10px 12px;
        }
        .club-roleCards { display: grid; gap: 10px; grid-template-columns: repeat(3, minmax(0, 1fr)); min-width: 0; }
        .club-roleCard {
          background: #fff;
          border: 1px solid rgba(15,23,42,.08);
          border-radius: 14px;
          box-shadow: 0 10px 24px rgba(15,23,42,.035);
          display: grid;
          gap: 9px;
          min-width: 0;
          padding: 12px;
        }
        .club-roleCardHead { align-items: center; cursor: pointer; display: flex; gap: 8px; justify-content: space-between; list-style: none; min-height: 34px; min-width: 0; }
        .club-roleCardHead::-webkit-details-marker { display: none; }
        .club-roleCardHead::after { color: #64748b; content: '+'; font-size: 18px; font-weight: 800; }
        .club-roleCard[open] .club-roleCardHead::after { content: '−'; }
        .club-roleCardHead small { color: #64748b; font-size: 11px; font-weight: 900; white-space: nowrap; }
        .club-roleCard p { color: #475569; font-size: 12px; font-weight: 800; line-height: 1.35; margin: 0; }
        .club-roleCardBody { display: grid; gap: 9px; padding-top: 9px; }
        .club-compactMatrix { display: grid; gap: 6px; min-width: 0; }
        .club-compactMatrixHead, .club-compactMatrixRow {
          align-items: center;
          display: grid;
          gap: 6px;
          grid-template-columns: minmax(160px, 1.35fr) repeat(6, minmax(54px, .55fr));
          min-width: 0;
        }
        .club-compactMatrixHead {
          background: #f8fafc;
          border: 1px solid rgba(15,23,42,.07);
          border-radius: 12px;
          color: #64748b;
          font-size: 10px;
          font-weight: 950;
          padding: 8px;
          text-transform: uppercase;
        }
        .club-compactMatrixRow {
          background: #fff;
          border: 1px solid rgba(15,23,42,.07);
          border-radius: 12px;
          color: #17253f;
          font-size: 12px;
          font-weight: 850;
          padding: 8px;
        }
        .club-compactMatrixHead span, .club-compactMatrixRow span { min-width: 0; overflow: hidden; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
        .club-compactMatrixHead span:first-child, .club-compactMatrixRow span:first-child { text-align: left; }
        .club-matrixCheck {
          align-items: center;
          background: #f1f5f9;
          border-radius: 999px;
          color: #94a3b8;
          display: inline-flex;
          font-size: 12px;
          font-weight: 950;
          height: 24px;
          justify-content: center;
          justify-self: center;
          width: 24px;
        }
        .club-matrixCheck.is-on { background: color-mix(in srgb, var(--club-admin-accent) 12%, white); color: #061b3a; }
        .club-permissionsPlayerNote { align-items: center; display: flex; gap: 8px; justify-content: space-between; }
        .club-permissionsPlayerNote strong { color: #17253f; font-size: 12px; font-weight: 950; white-space: nowrap; }
        .club-permissionsPlayerNote span { color: #475569; }
        .club-permissionMatrix { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .club-permissionGroup { border: 1px solid rgba(15,23,42,.07); border-radius: 12px; display: grid; gap: 6px; min-width: 0; padding: 10px; }
        .club-permissionGroup h3 { color: #17253f; font-size: 14px; font-weight: 950; margin: 0; }
        .club-permissionRow { align-items: center; display: grid; gap: 8px; grid-template-columns: minmax(0, 1fr) auto; }
        .club-permissionRow > span { color: #334155; font-size: 12px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-permissionRow > div { display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; }
        .club-permissionDot { background: #f1f5f9; border-radius: 999px; color: #94a3b8; font-size: 10px; font-weight: 950; padding: 3px 5px; }
        .club-permissionDot.is-on { background: color-mix(in srgb, var(--club-admin-accent) 12%, white); color: #061b3a; }
        .club-activityPanel { align-content: start; }
        .club-activityNote {
          background: color-mix(in srgb, var(--club-admin-accent) 9%, white);
          border: 1px solid color-mix(in srgb, var(--club-admin-accent) 22%, transparent);
          border-radius: 12px;
          color: #061b3a;
          font-size: 12px;
          font-weight: 850;
          line-height: 1.35;
          padding: 10px 12px;
        }
        .club-activityPlaceholder { background: #f8fafc; border: 1px dashed rgba(15,23,42,.16); border-radius: 12px; display: grid; gap: 4px; padding: 14px; }
        .club-activityPlaceholder strong { color: #17253f; }
        .club-activityPlaceholder span { color: #64748b; font-size: 13px; font-weight: 800; }
        .club-activityTimeline { display: grid; gap: 0; min-width: 0; padding-left: 10px; position: relative; }
        .club-activityTimeline::before {
          background: color-mix(in srgb, var(--club-admin-accent) 24%, transparent);
          bottom: 12px;
          content: '';
          left: 17px;
          position: absolute;
          top: 12px;
          width: 2px;
        }
        .club-activityEvent {
          display: grid;
          gap: 10px;
          grid-template-columns: 18px minmax(0, 1fr);
          min-width: 0;
          padding: 8px 0 8px;
          position: relative;
        }
        .club-activityIcon {
          background: color-mix(in srgb, var(--club-admin-accent) 14%, white);
          border: 2px solid var(--club-admin-accent);
          border-radius: 999px;
          height: 14px;
          margin-top: 12px;
          position: relative;
          width: 14px;
          z-index: 1;
        }
        .club-activityEvent--success .club-activityIcon { background: #ecfdf3; border-color: #22c55e; }
        .club-activityEvent--warning .club-activityIcon { background: #fff7df; border-color: #f59e0b; }
        .club-activityEvent--muted .club-activityIcon { background: #f1f5f9; border-color: #94a3b8; }
        .club-activityBody {
          background: #fff;
          border: 1px solid rgba(15,23,42,.08);
          border-radius: 14px;
          box-shadow: 0 10px 24px rgba(15,23,42,.035);
          display: grid;
          gap: 7px;
          min-width: 0;
          padding: 11px;
        }
        .club-activityTop { align-items: baseline; display: flex; gap: 8px; justify-content: space-between; min-width: 0; }
        .club-activityTop strong { color: #17253f; font-size: 14px; font-weight: 950; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-activityTop span { color: #64748b; flex: 0 0 auto; font-size: 11px; font-weight: 850; }
        .club-activityBody p { color: #475569; font-size: 12px; font-weight: 800; line-height: 1.35; margin: 0; }
        .club-activityMeta { align-items: center; display: flex; flex-wrap: wrap; gap: 6px; justify-content: space-between; }
        .club-activityMeta > span:first-child { color: #64748b; font-size: 11px; font-weight: 800; }
        .club-historyRow { align-items: center; color: #334155; display: grid; gap: 8px; grid-template-columns: minmax(0, 1.4fr) 110px 96px 110px; }
        .club-historyRow > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-teamTab:focus-visible, .club-inviteModes button:focus-visible, .club-staffFilters button:focus-visible, .club-memberActionsTrigger:focus-visible, .club-primaryBtn:focus-visible, .club-secondaryBtn:focus-visible, .club-dangerBtn:focus-visible, .club-roleCardHead:focus-visible { outline: 3px solid color-mix(in srgb, var(--club-admin-accent) 38%, transparent); outline-offset: 2px; }
        .club-usersHead .club-title { font-size: 23px; font-weight: 600; }
        .club-usersHead .club-sub { font-size: 13px; font-weight: 400; }
        .club-kicker { font-weight: 600; }
        .club-usersStats span { font-weight: 500; }
        .club-usersStats b { font-weight: 600; }
        .club-cardHead h2 { font-weight: 600; }
        .club-cardHead p, .club-formHint { font-weight: 400; }
        .club-inviteForm label { font-weight: 500; }
        .club-inviteForm small { font-weight: 400; }
        .club-inviteModes button { font-weight: 500; }
        .club-primaryBtn, .club-secondaryBtn, .club-dangerBtn { font-size: 13px; font-weight: 600; min-height: 40px; padding-block: 7px; }
        .club-staffCard, .club-staffInviteCard { gap: 8px; padding: 12px; }
        .club-personMain strong, .club-inviteMain strong { font-size: 15px; font-weight: 600; }
        .club-personMain span, .club-inviteMain span { font-weight: 400; }
        .club-roleBadge, .club-statusBadge, .club-statusPill { font-weight: 600; min-height: 22px; padding: 5px 7px; }
        .club-permissionChip { font-size: 10.5px; font-weight: 500; min-height: 22px; padding: 5px 7px; }
        .club-staffCardFoot > small, .club-ownerProtected { font-weight: 400; }
        .club-memberActions { min-width: 0; }
        .club-memberActionsTrigger { background: #fff; border: 1px solid rgba(15,23,42,.12); border-radius: 999px; color: #17253f; cursor: pointer; font-size: 12px; font-weight: 500; height: 36px; padding: 5px 16px; }
        .club-memberActions > div { box-shadow: 0 14px 34px rgba(15,23,42,.13); gap: 7px; min-width: 228px; padding: 9px; z-index: 30; }
        .club-memberActions label { font-size: 11px; font-weight: 500; gap: 4px; }
        .club-memberActions .px-input { font-size: 13px; min-height: 38px; }
        .club-memberActionButtons { display: grid; gap: 6px; grid-template-columns: 1fr 1fr; }
        .club-memberActionButtons button { min-height: 35px; padding: 5px 9px; }
        .club-emptyState { padding: 10px 12px; }
        .club-emptyState strong { font-size: 13px; font-weight: 600; }
        .club-emptyState span { font-size: 11.5px; font-weight: 400; }
        .club-permissionsNote, .club-permissionsPlayerNote, .club-activityNote { font-weight: 400; padding: 10px 12px; }
        .club-roleCards { gap: 8px; }
        .club-roleCard { gap: 6px; padding: 10px 12px; }
        .club-roleCardHead { min-height: 32px; }
        .club-roleCardHead small { font-weight: 500; }
        .club-roleCardHead::after { font-size: 16px; }
        .club-roleCard p { font-weight: 400; }
        .club-compactMatrixHead, .club-compactMatrixRow { min-height: 34px; padding-block: 6px; }
        .club-compactMatrixHead { font-weight: 600; }
        .club-compactMatrixRow { font-size: 11.5px; font-weight: 400; }
        .club-activityTimeline { gap: 8px; }
        .club-activityEvent { padding-block: 0; }
        .club-activityBody { gap: 5px; padding: 10px 12px; }
        .club-activityTop strong { font-size: 13px; font-weight: 600; }
        .club-activityTop span { font-size: 10.5px; font-weight: 400; white-space: nowrap; }
        .club-activityBody p { font-size: 12px; font-weight: 400; }
        .club-activityMeta > span:first-child { font-weight: 400; }
        @media (min-width: 920px) {
          .club-teamGrid { grid-template-columns: minmax(280px, .7fr) minmax(0, 1.3fr); }
          .club-staffLayout { grid-template-columns: repeat(2,minmax(0,1fr)); }
          .club-staffPendingPanel { grid-column: auto; }
          .club-staffCards, .club-staffPendingList { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .club-staffCard:nth-last-child(-n + 2) .club-memberActions > div { bottom: calc(100% + 6px); top: auto; }
          .club-staffRow, .club-inviteRow, .club-requestRow { grid-template-columns: minmax(0, 1fr) auto; }
        }
        @media (max-width: 920px) {
          .club-permissionMatrix { grid-template-columns: 1fr; }
          .club-roleCards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .club-compactMatrix { display: none; }
        }
        @media (max-width: 720px) {
          .club-users {
            background: transparent;
            border: 0;
            border-radius: 0;
            box-shadow: none;
            overflow: visible;
            padding: 0;
          }
          .club-users::before { display: none; }
          .club-usersHead {
            border-radius: 16px;
            gap: 8px;
            padding: 12px;
          }
          .club-usersHead .club-title { font-size: 20px; font-weight: 600; line-height: 1.08; }
          .club-usersHead .club-sub { font-size: 12px; font-weight: 400; line-height: 1.3; margin-top: 3px; }
          .club-usersHead { display: grid; }
          .club-usersStats { display: grid; gap: 5px; grid-template-columns: repeat(3,minmax(0,1fr)); justify-content: stretch; width: 100%; }
          .club-usersStats span { border-radius: 9px; display: grid; font-size: 10px; font-weight: 500; gap: 0; height: 48px; justify-items: center; min-width: 0; padding: 5px 3px; text-align: center; white-space: normal; }
          .club-usersStats b { font-size: 16px; font-weight: 600; }
          .club-teamTabs { display: grid; gap: 2px; grid-template-columns: .75fr 1.15fr 1.55fr .95fr; margin: 9px 0 0; overflow: visible; padding: 3px; width: 100%; }
          .club-teamTab { font-size: 11px; font-weight: 500; gap: 3px; height: 40px; justify-content: center; min-width: 0; padding: 4px; width: 100%; }
          .club-teamTab span { font-size: 9px; min-width: 17px; padding: 1px 4px; }
          .club-card { border-radius: 14px; box-shadow: 0 6px 18px rgba(15,23,42,.04); gap: 9px; margin-top: 10px; padding: 12px; }
          .club-cardHead h2 { font-size: 16px; font-weight: 600; }
          .club-cardHead p { font-size: 12px; font-weight: 400; line-height: 1.3; }
          .club-staffLayout, .club-teamGrid { gap: 10px; margin-top: 10px; }
          .club-staffCard, .club-staffInviteCard { gap: 8px; padding: 12px; }
          .club-staffCardTop { align-items: center; }
          .club-staffCardBadges { align-items: flex-end; gap: 4px; }
          .club-roleBadge, .club-statusBadge, .club-statusPill { font-size: 10px; padding: 5px 7px; }
          .club-staffCapabilityRow { flex-wrap: wrap; }
          .club-staffCapabilityRow > .club-permissionChips { flex: 1 1 140px; }
          .club-permissionChips { flex-wrap: wrap; max-width: 100%; overflow: visible; }
          .club-permissionChip { flex: 0 0 auto; }
          .club-staffCardFoot { align-items: center; display: flex; flex-wrap: wrap; padding-top: 7px; }
          .club-memberActions { margin-left: auto; width: auto; }
          .club-memberActionsTrigger { height: 36px; padding-inline: 16px; }
          .club-memberActions > div { background: #f8fafc; border: 0; border-radius: 12px; box-shadow: none; margin-top: 8px; min-width: 0; padding: 10px; position: static; width: 100%; }
          .club-memberActions.is-open { flex-basis: 100%; margin-left: 0; width: 100%; }
          .club-memberActions.is-open .club-memberActionsTrigger { margin-left: auto; }
          .club-memberActions > div button { min-height: 36px; width: 100%; }
          .club-memberActions > div select { min-height: 38px; width: 100%; }
          .club-staffInviteFooter { align-items: stretch; display: grid; }
          .club-staffInviteFooter .club-secondaryBtn { justify-self: end; width: auto; }
          .club-inviteModes { height: 42px; margin-bottom: 8px; }
          .club-inviteModes button { font-size: 12px; font-weight: 500; min-height: 34px; padding-inline: 5px; }
          .club-inviteForm { gap: 9px; }
          .club-inviteForm .px-input { font-size: 13px; min-height: 41px; }
          .club-inviteForm > .club-primaryBtn, .club-flowSuccess .club-primaryBtn, .club-flowSuccess .club-secondaryBtn { width: 100%; }
          .club-inviteForm > .club-primaryBtn { min-height: 41px; }
          .club-flowSuccess > div { display: grid; grid-template-columns: 1fr; width: 100%; }
          .club-candidateList > button { align-items: start; grid-template-columns: minmax(0,1fr); min-height: 62px; }
          .club-candidateMeta { padding-left: 42px; }
          .club-personMain strong, .club-personMain span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .club-roleCards { grid-template-columns: 1fr; }
          .club-roleCard { padding: 8px 12px; }
          .club-roleCardHead { min-height: 36px; }
          .club-compactMatrix { display: none; }
          .club-permissionsPlayerNote { align-items: flex-start; display: grid; }
          .club-activityTimeline { padding-left: 2px; }
          .club-activityTimeline::before { display: none; }
          .club-activityEvent { grid-template-columns: minmax(0,1fr); padding: 4px 0; }
          .club-activityIcon { display: none; }
          .club-activityBody { box-shadow: none; gap: 5px; padding: 10px 12px; }
          .club-activityTop { align-items: flex-start; display: flex; }
          .club-activityMeta { align-items: center; display: flex; justify-content: space-between; }
          .club-rowMeta { align-items: flex-start; justify-items: start; }
          .club-historyRow { grid-template-columns: 1fr; }
          .club-historyRow > span { white-space: normal; }
        }
        @media (max-width: 390px) {
          .club-teamTab { font-size: 10.5px; padding-inline: 3px; }
          .club-staffCardTop { align-items: flex-start; }
          .club-staffCardBadges { max-width: 96px; }
          .club-avatar { height: 36px; width: 36px; }
          .club-personMain strong { font-size: 13px; }
          .club-personMain span { font-size: 11px; }
        }
        @media (max-width: 340px) {
          .club-teamTab:not(.club-teamTab--active) span { display: none; }
          .club-teamTab { font-size: 10.5px; }
          .club-memberActionButtons { grid-template-columns: 1fr; }
        }
        @media (prefers-reduced-motion: reduce) {
          .club-primaryBtn, .club-secondaryBtn, .club-dangerBtn { transition-duration: .01ms; }
          .club-primaryBtn:hover:not(:disabled), .club-secondaryBtn:hover:not(:disabled) { transform: none; }
          .club-searchLoader, .club-teamSkeleton span { animation: none; }
        }
      `}</style>
    </div>
  )
}
