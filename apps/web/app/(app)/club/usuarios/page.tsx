'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useSession } from '@/components/session/SessionProvider'
import { getClubInitials } from '@/lib/clubAssets'
import { getClubTheme } from '@/lib/clubThemes'
import type { ClubRole } from '@/lib/clubMembershipRules'
import {
  CLUB_CAPABILITY_GROUPS,
  getCanonicalClubPermissionRole,
  getClubPermissions,
  type ClubCapability,
  type ClubCapabilityGroup,
  type ClubPermissionRole,
} from '@/lib/clubPermissions'

type InviteStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED'
type ManageableRole = Exclude<ClubRole, 'OWNER' | 'PLAYER'>
type TeamTab = 'staff' | 'invites' | 'permissions' | 'activity'

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
  status: string
  tone: ActivityTone
}

const roleOptions: Array<{ value: ManageableRole; label: string; help: string }> = [
  { value: 'ADMIN', label: 'Admin', help: 'Gestión operativa amplia del club.' },
  { value: 'PLANILLERO', label: 'Planillero', help: 'Carga operativa de partidos/resultados.' },
  { value: 'OPERATIVO', label: 'Operativo', help: 'Soporte diario sin permisos sensibles.' },
]

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

const permissionRoles: ClubPermissionRole[] = [
  'OWNER',
  'ADMIN',
  'PLANILLERO',
  'OPERADOR',
  'PRENSA',
  'TESORERIA',
  'PLAYER',
]

const adminPermissionRoles: ClubPermissionRole[] = [
  'OWNER',
  'ADMIN',
  'OPERADOR',
  'PLANILLERO',
  'PRENSA',
  'TESORERIA',
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

const capabilityLabels: Record<ClubCapability, string> = {
  'tournament:create': 'Crear torneo',
  'tournament:update': 'Editar torneo',
  'tournament:delete': 'Eliminar torneo',
  'groups:generate': 'Generar grupos',
  'playoff:generate': 'Generar playoff',
  'matches:update': 'Cargar resultados',
  'matches:swap_schedule': 'Cambiar horarios',
  'registrations:approve': 'Aprobar inscripciones',
  'registrations:manage': 'Gestionar inscripciones',
  'users:manage': 'Gestionar equipo',
  'roles:manage': 'Gestionar roles',
  'finance:view': 'Ver finanzas',
  'finance:manage': 'Administrar finanzas',
  'content:publish': 'Publicar contenido',
  'content:edit': 'Editar contenido',
  'club:configure': 'Configurar club',
  'club:branding': 'Branding del club',
}

const groupLabels: Record<ClubCapabilityGroup, string> = {
  tournament: 'Torneos',
  groups: 'Grupos',
  playoff: 'Playoff',
  matches: 'Partidos',
  registrations: 'Inscripciones',
  users: 'Equipo',
  finance: 'Finanzas',
  content: 'Contenido',
  club: 'Club',
}

function formatDate(value?: string | null) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(value))
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
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

function hasCapability(role: ClubPermissionRole, capability: ClubCapability) {
  return getClubPermissions(role).includes(capability)
}

function canonicalRoleLabel(role: string | null | undefined) {
  const canonical = getCanonicalClubPermissionRole(role)
  return canonical ? roleLabel(canonical) : 'Sin rol'
}

const staffPermissionSummaries = [
  {
    label: 'Torneos',
    capabilities: ['tournament:create', 'tournament:update', 'groups:generate', 'playoff:generate'],
  },
  { label: 'Resultados', capabilities: ['matches:update'] },
  { label: 'Horarios', capabilities: ['matches:swap_schedule'] },
  { label: 'Usuarios', capabilities: ['users:manage', 'roles:manage'] },
  { label: 'Finanzas', capabilities: ['finance:view', 'finance:manage'] },
  { label: 'Contenido', capabilities: ['content:edit', 'content:publish'] },
  { label: 'Club', capabilities: ['club:configure', 'club:branding'] },
] satisfies Array<{ label: string; capabilities: ClubCapability[] }>

const compactPermissionRows = [
  { label: 'Crear torneos', capabilities: ['tournament:create'] },
  { label: 'Generar grupos/playoff', capabilities: ['groups:generate', 'playoff:generate'] },
  { label: 'Cargar resultados', capabilities: ['matches:update'] },
  { label: 'Cambiar horarios/canchas', capabilities: ['matches:swap_schedule'] },
  { label: 'Aprobar inscripciones', capabilities: ['registrations:approve'] },
  { label: 'Gestionar usuarios', capabilities: ['users:manage', 'roles:manage'] },
  { label: 'Ver finanzas', capabilities: ['finance:view'] },
  { label: 'Publicar contenido', capabilities: ['content:publish'] },
  { label: 'Configurar club', capabilities: ['club:configure', 'club:branding'] },
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
  const { activeClub, clubRole } = useSession()
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
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<ManageableRole>('ADMIN')

  const pendingInvites = useMemo(
    () => invites.filter((invite) => invite.status === 'PENDING'),
    [invites]
  )

  const resolvedInvites = useMemo(
    () => invites.filter((invite) => invite.status !== 'PENDING').slice(0, 8),
    [invites]
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
      status: statusLabel(member.status),
      tone: 'success',
    }))

    return [...inviteEvents, ...staffEvents]
      .filter((event) => Boolean(event.date))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 18)
  }, [invites, staff])

  const rolesCovered = useMemo(() => {
    const roles = new Set(
      staff
        .map((member) => getCanonicalClubPermissionRole(member.role) ?? member.role)
        .filter(Boolean)
    )
    return roles.size
  }, [staff])

  const ownerOnly = clubRole === 'OWNER'
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
      if (json?.code === 'CLUB_INTERNAL_USERS_SCHEMA_MISSING') {
        setSchemaWarning(json?.error ?? 'Falta inicializar la gestión interna del club.')
      } else if (res.status === 403) {
        setStaffWarning(json?.error ?? 'La gestión de staff interno está limitada al OWNER.')
      } else {
        setStaffWarning(json?.error ?? 'No pude cargar el equipo interno.')
      }
      return
    }

    setStaff((json?.staff ?? []) as StaffMember[])
    setInvites((json?.invites ?? []) as ClubInvite[])
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

  async function createInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeClub?.id || !ownerOnly) return

    setSaving(true)
    setMessage('')
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
        email,
        role,
      }),
    })
    const json = await res.json().catch(() => ({}))

    setSaving(false)

    if (!res.ok) {
      if (json?.code === 'CLUB_INTERNAL_USERS_SCHEMA_MISSING') {
        setSchemaWarning(json?.error ?? 'Falta inicializar la gestión interna del club.')
      } else {
        setMessage(json?.error ?? 'No pude crear la invitación.')
      }
      return
    }

    setEmail('')
    setRole('ADMIN')
    setMessage('Invitación creada.')
    await loadClubCore()
  }

  async function cancelInvite(inviteId: string) {
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
      setMessage(json?.error ?? 'No pude cancelar la invitación.')
      return
    }

    setMessage('Invitación cancelada.')
    await loadClubCore()
  }

  function renderPerson(profile: Profile | null, name: string, fallbackEmail?: string | null, compact = false) {
    return (
      <div className={`club-person ${compact ? 'club-person--compact' : ''}`}>
        <span className={`club-avatar ${compact ? 'club-avatar--sm' : ''}`}>
          {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : getClubInitials(name)}
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
          {staff.length === 0 ? (
            <div className="px-empty">Todavía no hay usuarios internos aprobados.</div>
          ) : (
            <div className="club-staffCards">
              {staff.map((member) => {
                const permissionSummary = getStaffPermissionSummary(member.role)
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

                    <div className="club-staffMetaGrid">
                      <span>
                        <small>Alta</small>
                        <strong>{formatDate(member.approved_at ?? member.created_at)}</strong>
                      </span>
                      <span>
                        <small>Rol operativo</small>
                        <strong>{canonicalRoleLabel(member.role)}</strong>
                      </span>
                    </div>

                    <div className="club-permissionChips" aria-label={`Permisos principales de ${member.full_name}`}>
                      {permissionSummary.length > 0 ? (
                        permissionSummary.map((permission) => (
                          <span key={`${member.id}-${permission}`} className="club-permissionChip">
                            {permission}
                          </span>
                        ))
                      ) : (
                        <span className="club-permissionChip club-permissionChip--muted">
                          Sin permisos operativos
                        </span>
                      )}
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
              <h2>Invitar staff</h2>
              <p>Invitaciones para equipo operativo. La edición de rol queda para una capa posterior.</p>
            </div>
          </div>

          {!ownerOnly ? (
            <div className="club-note">Solo el OWNER puede crear invitaciones de staff en esta versión.</div>
          ) : (
            <form className="club-inviteForm" onSubmit={createInvite}>
              <label>
                <span>Email</span>
                <input
                  className="px-input"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="usuario@email.com"
                  required
                />
              </label>

              <label>
                <span>Rol</span>
                <select
                  className="px-input"
                  value={role}
                  onChange={(event) => setRole(event.target.value as ManageableRole)}
                >
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <small>{roleOptions.find((option) => option.value === role)?.help}</small>
              </label>

              <button type="submit" className="club-primaryBtn" disabled={saving}>
                {saving ? 'Creando...' : 'Crear invitación'}
              </button>
            </form>
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
            <div className="px-empty">No hay invitaciones de staff pendientes.</div>
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

                    <div className="club-staffMetaGrid">
                      <span>
                        <small>Enviada</small>
                        <strong>{formatDate(invite.created_at)}</strong>
                      </span>
                      <span>
                        <small>Rol propuesto</small>
                        <strong>{canonicalRoleLabel(invite.role)}</strong>
                      </span>
                    </div>

                    <div className="club-staffInviteFooter">
                      <div className="club-permissionChips" aria-label={`Permisos principales de ${invite.email}`}>
                        {permissionSummary.map((permission) => (
                          <span key={`${invite.id}-${permission}`} className="club-permissionChip">
                            {permission}
                          </span>
                        ))}
                      </div>
                      {ownerOnly ? (
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
              <article key={permissionRole} className="club-roleCard">
                <div className="club-roleCardHead">
                  <span className={roleBadgeClass(permissionRole)}>{roleLabel(permissionRole)}</span>
                  <small>{getClubPermissions(permissionRole).length} permisos</small>
                </div>
                <p>{roleDescriptions[permissionRole]}</p>
                <div className="club-permissionChips" aria-label={`Resumen de permisos de ${roleLabel(permissionRole)}`}>
                  {permissionSummary.map((permission) => (
                    <span key={`${permissionRole}-${permission}`} className="club-permissionChip">
                      {permission}
                    </span>
                  ))}
                </div>
              </article>
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
          <span>Es un rol externo para la comunidad deportiva. No se muestra como rol administrativo principal.</span>
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
          Esta vista muestra actividad disponible. La auditoría completa llegará en una etapa futura.
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
            <span><b>{staff.length}</b> staff activo</span>
            <span><b>{pendingInvites.length}</b> invitaciones</span>
            <span><b>{rolesCovered}</b> roles cubiertos</span>
          </div>
        </div>

        {message ? <div className="club-message">{message}</div> : null}
        {schemaWarning ? <div className="club-warning">{schemaWarning}</div> : null}

        {!activeClub?.id ? (
          <div className="px-empty">Primero seleccioná un club activo.</div>
        ) : loading ? (
          <div className="px-empty">Cargando equipo y roles...</div>
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
          overflow: hidden;
          padding: 22px;
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
        .club-usersHead { align-items: flex-start; background: linear-gradient(135deg, rgba(248,250,252,.98), var(--club-admin-soft)); border: 1px solid rgba(15,23,42,.07); border-radius: 20px; display: flex; gap: 14px; justify-content: space-between; padding: 18px; }
        .club-usersStats { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
        .club-usersStats span { background: #fff; border: 1px solid color-mix(in srgb, var(--club-admin-accent) 16%, transparent); border-radius: 999px; color: #475569; font-size: 13px; font-weight: 800; padding: 8px 10px; white-space: nowrap; }
        .club-usersStats b { color: #17253f; }
        .club-message, .club-warning, .club-note { border-radius: 12px; font-weight: 800; padding: 10px 12px; }
        .club-message, .club-note { background: color-mix(in srgb, var(--club-admin-accent) 10%, white); border: 1px solid color-mix(in srgb, var(--club-admin-accent) 24%, transparent); color: #061b3a; }
        .club-warning { background: #fff7df; border: 1px solid rgba(217,119,6,.24); color: #854d0e; margin-top: 12px; }
        .club-teamTabs { align-items: center; background: #f8fafc; border: 1px solid rgba(15,23,42,.08); border-radius: 12px; display: flex; flex-wrap: wrap; gap: 4px; margin-top: 14px; padding: 4px; }
        .club-teamTab { align-items: center; background: transparent; border: 1px solid transparent; border-radius: 9px; color: #64748b; cursor: pointer; display: inline-flex; font-size: 12px; font-weight: 950; gap: 7px; min-height: 34px; padding: 7px 10px; }
        .club-teamTab span { align-items: center; background: rgba(100,116,139,.10); border-radius: 999px; display: inline-flex; font-size: 11px; justify-content: center; min-width: 22px; padding: 2px 6px; }
        .club-teamTab:hover { background: #fff; border-color: color-mix(in srgb, var(--club-admin-accent) 24%, transparent); color: #061b3a; }
        .club-teamTab--active { background: #fff; border-color: color-mix(in srgb, var(--club-admin-accent) 42%, transparent); box-shadow: 0 8px 18px var(--club-admin-glow); color: #061b3a; }
        .club-teamGrid { display: grid; gap: 14px; margin-top: 14px; }
        .club-card { background: rgba(255,255,255,.96); border: 1px solid rgba(15,23,42,.08); border-radius: 20px; box-shadow: 0 16px 42px rgba(15,23,42,.055); display: grid; gap: 12px; margin-top: 14px; min-width: 0; padding: 16px; }
        .club-teamGrid .club-card { margin-top: 0; }
        .club-cardHead { align-items: flex-start; display: flex; gap: 10px; justify-content: space-between; }
        .club-cardHead h2 { color: #17253f; font-size: 18px; line-height: 1.15; margin: 2px 0 0; }
        .club-cardHead p { color: #64748b; font-size: 12px; font-weight: 800; margin: 5px 0 0; }
        .club-kicker { color: var(--club-admin-accent); font-size: 11px; font-weight: 950; letter-spacing: .06em; text-transform: uppercase; }
        .club-inviteForm { display: grid; gap: 10px; }
        .club-inviteForm label { color: #17253f; display: grid; font-size: 13px; font-weight: 900; gap: 6px; min-width: 0; }
        .club-inviteForm small { color: #64748b; font-size: 12px; font-weight: 700; }
        .club-primaryBtn, .club-secondaryBtn { border-radius: 999px; cursor: pointer; font-weight: 950; min-height: 36px; padding: 8px 13px; transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease; }
        .club-primaryBtn { background: #061b3a; border: 1px solid color-mix(in srgb, var(--club-admin-accent) 38%, transparent); box-shadow: 0 10px 22px var(--club-admin-glow); color: #fff; }
        .club-secondaryBtn { background: #fff; border: 1px solid color-mix(in srgb, var(--club-admin-accent) 34%, transparent); color: #061b3a; }
        .club-primaryBtn:hover:not(:disabled), .club-secondaryBtn:hover:not(:disabled) { box-shadow: 0 12px 26px var(--club-admin-glow); transform: translateY(-1px); }
        .club-primaryBtn:disabled, .club-secondaryBtn:disabled { cursor: not-allowed; opacity: .65; }
        .club-staffLayout { display: grid; gap: 14px; margin-top: 14px; }
        .club-staffLayout .club-card { margin-top: 0; }
        .club-staffPeoplePanel { align-content: start; }
        .club-staffPendingPanel { align-content: start; }
        .club-staffCards, .club-staffPendingList { display: grid; gap: 10px; min-width: 0; }
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
        .club-roleCardHead { align-items: center; display: flex; gap: 8px; justify-content: space-between; min-width: 0; }
        .club-roleCardHead small { color: #64748b; font-size: 11px; font-weight: 900; white-space: nowrap; }
        .club-roleCard p { color: #475569; font-size: 12px; font-weight: 800; line-height: 1.35; margin: 0; }
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
        @media (min-width: 920px) {
          .club-teamGrid { grid-template-columns: minmax(280px, .7fr) minmax(0, 1.3fr); }
          .club-staffLayout { grid-template-columns: minmax(280px, .68fr) minmax(0, 1.32fr); }
          .club-staffPendingPanel { grid-column: 1 / -1; }
          .club-staffCards, .club-staffPendingList { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .club-staffRow, .club-inviteRow, .club-requestRow { grid-template-columns: minmax(0, 1fr) auto; }
        }
        @media (max-width: 920px) {
          .club-permissionMatrix { grid-template-columns: 1fr; }
          .club-roleCards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .club-compactMatrixHead { display: none; }
          .club-compactMatrixRow { grid-template-columns: 1fr repeat(3, minmax(0, 1fr)); }
          .club-compactMatrixRow span:first-child { grid-column: 1 / -1; white-space: normal; }
        }
        @media (max-width: 720px) {
          .club-usersHead { display: grid; }
          .club-usersStats { justify-content: flex-start; }
          .club-teamTabs { align-items: stretch; flex-direction: column; }
          .club-teamTab { justify-content: space-between; width: 100%; }
          .club-staffCardTop, .club-staffInviteFooter { align-items: flex-start; display: grid; }
          .club-staffCardBadges { align-items: flex-start; flex-direction: row; flex-wrap: wrap; }
          .club-staffMetaGrid { grid-template-columns: 1fr; }
          .club-roleCards { grid-template-columns: 1fr; }
          .club-compactMatrixRow { grid-template-columns: 1fr repeat(2, minmax(0, 1fr)); }
          .club-compactMatrixRow span:nth-last-child(-n+4) { margin-top: 2px; }
          .club-permissionsPlayerNote { align-items: flex-start; display: grid; }
          .club-activityTop { align-items: flex-start; display: grid; }
          .club-activityMeta { align-items: flex-start; display: grid; justify-content: start; }
          .club-rowMeta { align-items: flex-start; justify-items: start; }
          .club-historyRow { grid-template-columns: 1fr; }
          .club-historyRow > span { white-space: normal; }
        }
      `}</style>
    </div>
  )
}
