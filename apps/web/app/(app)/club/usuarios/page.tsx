'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useSession } from '@/components/session/SessionProvider'
import { getClubInitials } from '@/lib/clubAssets'
import type { ClubRole } from '@/lib/clubMembershipRules'

type InviteStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED'
type ManageableRole = Exclude<ClubRole, 'OWNER' | 'PLAYER'>

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
  PLAYER: 'Jugador',
}

const statusLabels: Record<string, string> = {
  PENDING: 'Pendiente',
  ACCEPTED: 'Aceptada',
  DECLINED: 'Rechazada',
  CANCELLED: 'Cancelada',
  APPROVED: 'Aprobado',
}

function formatDate(value?: string | null) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(value))
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

export default function ClubUsuariosPage() {
  const { activeClub, clubRole } = useSession()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [schemaWarning, setSchemaWarning] = useState('')
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

  const ownerOnly = clubRole === 'OWNER'

  async function getToken() {
    const { data } = await supabase.auth.getSession()
    return data?.session?.access_token ?? null
  }

  async function loadInternalUsers() {
    if (!activeClub?.id) {
      setStaff([])
      setInvites([])
      setLoading(false)
      return
    }

    setLoading(true)
    setMessage('')
    setSchemaWarning('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setLoading(false)
      return
    }

    const res = await fetch(`/api/clubs/internal-users?clubId=${activeClub.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const json = await res.json().catch(() => ({}))

    if (!res.ok) {
      if (json?.code === 'CLUB_INTERNAL_USERS_SCHEMA_MISSING') {
        setSchemaWarning(json?.error ?? 'Falta inicializar la gestión interna del club.')
      } else {
        setMessage(json?.error ?? 'No pude cargar el equipo interno.')
      }
      setStaff([])
      setInvites([])
      setLoading(false)
      return
    }

    setStaff((json?.staff ?? []) as StaffMember[])
    setInvites((json?.invites ?? []) as ClubInvite[])
    setLoading(false)
  }

  useEffect(() => {
    void Promise.resolve().then(() => loadInternalUsers())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClub?.id])

  async function createInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeClub?.id) return

    setSaving(true)
    setMessage('')
    setSchemaWarning('')

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
    await loadInternalUsers()
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
    await loadInternalUsers()
  }

  return (
    <div className="px-wrap">
      <div className="club-panel club-users">
        <div className="club-usersHead">
          <div>
            <h1 className="club-title">Equipo interno</h1>
            <p className="club-sub">Staff operativo de {activeClub?.name ?? 'tu club'} e invitaciones pendientes.</p>
          </div>
          <div className="club-usersStats">
            <span><b>{staff.length}</b> staff</span>
            <span><b>{pendingInvites.length}</b> invitaciones</span>
          </div>
        </div>

        {message ? <div className="club-message">{message}</div> : null}
        {schemaWarning ? <div className="club-warning">{schemaWarning}</div> : null}

        {!activeClub?.id ? (
          <div className="px-empty">Primero seleccioná un club activo.</div>
        ) : !ownerOnly ? (
          <div className="px-empty">En esta versión solo el OWNER puede gestionar usuarios internos.</div>
        ) : loading ? (
          <div className="px-empty">Cargando equipo interno...</div>
        ) : (
          <div className="club-usersGrid">
            <section className="club-card">
              <div className="club-cardHead">
                <div>
                  <span className="club-kicker">Alta interna</span>
                  <h2>Invitar usuario</h2>
                </div>
              </div>

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
            </section>

            <section className="club-card">
              <div className="club-cardHead">
                <div>
                  <span className="club-kicker">Staff</span>
                  <h2>Equipo activo</h2>
                </div>
              </div>

              {staff.length === 0 ? (
                <div className="px-empty">Todavía no hay usuarios internos aprobados.</div>
              ) : (
                <div className="club-staffList">
                  {staff.map((member) => (
                    <article key={member.id} className="club-staffRow">
                      <div className="club-person">
                        <span className="club-avatar">
                          {member.profile?.avatar_url ? (
                            <img src={member.profile.avatar_url} alt="" />
                          ) : (
                            getClubInitials(member.full_name)
                          )}
                        </span>
                        <div className="club-personMain">
                          <strong>{member.full_name}</strong>
                          <span>{getProfileEmail(member.profile)}</span>
                        </div>
                      </div>
                      <span className={`club-roleBadge club-roleBadge--${member.role.toLowerCase()}`}>
                        {roleLabel(member.role)}
                      </span>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="club-card club-card--wide">
              <div className="club-cardHead">
                <div>
                  <span className="club-kicker">Invitaciones</span>
                  <h2>Pendientes</h2>
                </div>
              </div>

              {pendingInvites.length === 0 ? (
                <div className="px-empty">No hay invitaciones pendientes.</div>
              ) : (
                <div className="club-inviteList">
                  {pendingInvites.map((invite) => (
                    <article key={invite.id} className="club-inviteRow">
                      <div className="club-inviteMain">
                        <strong>{invite.email}</strong>
                        <span>{roleLabel(invite.role)} · enviada el {formatDate(invite.created_at)}</span>
                      </div>
                      <button
                        type="button"
                        className="club-secondaryBtn"
                        disabled={savingId === invite.id}
                        onClick={() => cancelInvite(invite.id)}
                      >
                        {savingId === invite.id ? '...' : 'Cancelar'}
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="club-card club-card--wide">
              <div className="club-cardHead">
                <div>
                  <span className="club-kicker">Historial</span>
                  <h2>Invitaciones resueltas</h2>
                </div>
              </div>

              {resolvedInvites.length === 0 ? (
                <div className="px-empty">Sin invitaciones resueltas todavía.</div>
              ) : (
                <div className="club-historyList">
                  {resolvedInvites.map((invite) => (
                    <article key={invite.id} className="club-historyRow">
                      <span>{invite.email}</span>
                      <span>{roleLabel(invite.role)}</span>
                      <span className={`club-statusBadge club-statusBadge--${invite.status.toLowerCase()}`}>
                        {statusLabel(invite.status)}
                      </span>
                      <span>{formatDate(invite.resolved_at ?? invite.updated_at)}</span>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      <style>{`
        .club-users { overflow: hidden; }
        .club-usersHead { align-items: flex-start; display: flex; gap: 14px; justify-content: space-between; }
        .club-usersStats { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
        .club-usersStats span { background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 999px; color: #475569; font-size: 13px; font-weight: 800; padding: 8px 10px; white-space: nowrap; }
        .club-usersStats b { color: #17253f; }
        .club-message, .club-warning { border-radius: 12px; font-weight: 800; margin-top: 12px; padding: 10px 12px; }
        .club-message { background: #eef8ff; border: 1px solid #b8dff1; color: #164e63; }
        .club-warning { background: #fff7df; border: 1px solid rgba(217,119,6,.24); color: #854d0e; }
        .club-usersGrid { display: grid; gap: 14px; margin-top: 14px; }
        .club-card { background: rgba(255,255,255,.94); border: 1px solid rgba(15,23,42,.08); border-radius: 16px; display: grid; gap: 12px; min-width: 0; padding: 14px; }
        .club-cardHead { align-items: flex-start; display: flex; gap: 10px; justify-content: space-between; }
        .club-cardHead h2 { color: #17253f; font-size: 18px; line-height: 1.15; margin: 2px 0 0; }
        .club-kicker { color: #64748b; font-size: 11px; font-weight: 950; letter-spacing: 0; text-transform: uppercase; }
        .club-inviteForm { display: grid; gap: 10px; }
        .club-inviteForm label { color: #17253f; display: grid; font-size: 13px; font-weight: 900; gap: 6px; min-width: 0; }
        .club-inviteForm small { color: #64748b; font-size: 12px; font-weight: 700; }
        .club-primaryBtn, .club-secondaryBtn { border-radius: 8px; cursor: pointer; font-weight: 950; min-height: 36px; padding: 8px 12px; }
        .club-primaryBtn { background: #69dfe3; border: 1px solid rgba(15,23,42,.10); color: #102538; }
        .club-secondaryBtn { background: #fff; border: 1px solid rgba(83,199,217,.36); color: #0f8ea0; }
        .club-primaryBtn:disabled, .club-secondaryBtn:disabled { cursor: not-allowed; opacity: .65; }
        .club-staffList, .club-inviteList, .club-historyList { display: grid; gap: 8px; min-width: 0; }
        .club-staffRow, .club-inviteRow, .club-historyRow { border: 1px solid rgba(15,23,42,.07); border-radius: 12px; min-width: 0; padding: 9px; }
        .club-staffRow, .club-inviteRow { align-items: center; display: grid; gap: 10px; }
        .club-person { align-items: center; display: flex; gap: 10px; min-width: 0; }
        .club-avatar { align-items: center; background: rgba(15,23,42,.08); border-radius: 12px; color: #17253f; display: inline-flex; flex: 0 0 auto; font-weight: 950; height: 38px; justify-content: center; overflow: hidden; width: 38px; }
        .club-avatar img { height: 100%; object-fit: cover; width: 100%; }
        .club-personMain, .club-inviteMain { display: grid; gap: 2px; min-width: 0; }
        .club-personMain strong, .club-personMain span, .club-inviteMain strong, .club-inviteMain span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-personMain strong, .club-inviteMain strong { color: #17253f; font-size: 14px; font-weight: 950; }
        .club-personMain span, .club-inviteMain span { color: #64748b; font-size: 12px; }
        .club-roleBadge, .club-statusBadge { border-radius: 999px; font-size: 12px; font-weight: 950; padding: 6px 8px; text-align: center; white-space: nowrap; width: fit-content; }
        .club-roleBadge--owner { background: #fff7df; color: #854d0e; }
        .club-roleBadge--admin { background: #eef8ff; color: #164e63; }
        .club-roleBadge--planillero { background: #ecfdf3; color: #166534; }
        .club-roleBadge--operativo { background: #fff0f5; color: #9d174d; }
        .club-statusBadge--accepted { background: #ecfdf3; color: #166534; }
        .club-statusBadge--declined { background: #fff0f5; color: #9d174d; }
        .club-statusBadge--cancelled { background: #f1f5f9; color: #475569; }
        .club-historyRow { align-items: center; color: #334155; display: grid; gap: 8px; grid-template-columns: minmax(0, 1.4fr) 110px 96px 110px; }
        .club-historyRow > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        @media (min-width: 920px) {
          .club-usersGrid { grid-template-columns: minmax(280px, .7fr) minmax(0, 1.3fr); }
          .club-card--wide { grid-column: 1 / -1; }
          .club-staffRow { grid-template-columns: minmax(0, 1fr) auto; }
          .club-inviteRow { grid-template-columns: minmax(0, 1fr) auto; }
        }
        @media (max-width: 720px) {
          .club-usersHead { display: grid; }
          .club-usersStats { justify-content: flex-start; }
          .club-historyRow { grid-template-columns: 1fr; }
          .club-historyRow > span { white-space: normal; }
        }
      `}</style>
    </div>
  )
}
