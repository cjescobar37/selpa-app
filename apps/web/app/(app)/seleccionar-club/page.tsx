'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { getClubInitials } from '@/lib/clubAssets'
import { useSession } from '@/components/session/SessionProvider'
import { isApprovedMembership, isClubStaffRole } from '@/lib/clubMembershipRules'

type AlertType = 'success' | 'warning' | 'error' | 'info'

type AlertState = {
  type: AlertType
  title: string
  message?: string
} | null

type ClubInfo = {
  id: string
  name: string
  city: string | null
  logo_url: string | null
}

type MembershipRow = {
  club_id: string
  role: string
  status: string
  approved_at: string | null
  club: ClubInfo | null
}

type MembershipQueryRow = Omit<MembershipRow, 'club'>

function AlertBox({ alert }: { alert: AlertState }) {
  if (!alert) return null

  const styles: Record<AlertType, React.CSSProperties> = {
    success: {
      border: '1px solid #b7ebc6',
      background: '#ecfdf3',
      color: '#166534',
    },
    warning: {
      border: '1px solid rgba(83,199,217,.24)',
      background: 'linear-gradient(180deg, rgba(83,199,217,.08), rgba(255,255,255,.9))',
      color: '#17324d',
    },
    error: {
      border: '1px solid #f0b2b2',
      background: '#fff0f0',
      color: '#8f1d1d',
    },
    info: {
      border: '1px solid #b8dff1',
      background: '#eef8ff',
      color: '#164e63',
    },
  }

  return (
    <div
      style={{
        ...styles[alert.type],
        borderRadius: 18,
        padding: 12,
        boxShadow: '0 10px 24px rgba(15,23,42,0.05)',
      }}
    >
      <div style={{ fontWeight: 850 }}>{alert.title}</div>
      {alert.message ? <div style={{ marginTop: 6, opacity: 0.95 }}>{alert.message}</div> : null}
    </div>
  )
}

export default function SeleccionarClubPage() {
  const router = useRouter()
  const session = useSession()

  const [loading, setLoading] = useState(true)
  const [savingClubId, setSavingClubId] = useState<string | null>(null)
  const [alert, setAlert] = useState<AlertState>(null)
  const [memberships, setMemberships] = useState<MembershipRow[]>([])
  const [activeClubId, setActiveClubId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setAlert(null)

      const { data: sess } = await supabase.auth.getSession()
      const user = sess?.session?.user

      if (!user) {
        router.replace('/login')
        return
      }

      const membershipsRes = await supabase
        .from('club_memberships')
        .select('club_id, role, status, approved_at')
        .eq('user_id', user.id)

      if (cancelled) return

      if (membershipsRes.error) {
        setAlert({
          type: 'error',
          title: 'No pude leer tus clubes',
          message: membershipsRes.error.message,
        })
        setLoading(false)
        return
      }

      const rawMemberships = (membershipsRes.data ?? []) as MembershipQueryRow[]
      const clubIds = Array.from(new Set(rawMemberships.map((m) => m.club_id).filter(Boolean)))

      let clubsMap = new Map<string, ClubInfo>()

      if (clubIds.length > 0) {
        const clubsRes = await supabase
          .from('clubs')
          .select('id, name, city, logo_url')
          .in('id', clubIds)

        if (clubsRes.error) {
          setAlert({
            type: 'error',
            title: 'No pude leer los datos de los clubes',
            message: clubsRes.error.message,
          })
          setLoading(false)
          return
        }

        clubsMap = new Map(
          ((clubsRes.data ?? []) as ClubInfo[]).map((club) => [
            club.id,
            {
              id: club.id,
              name: club.name,
              city: club.city ?? null,
              logo_url: club.logo_url ?? null,
            },
          ])
        )
      }

      const mergedMemberships: MembershipRow[] = rawMemberships.map((m) => ({
        club_id: m.club_id,
        role: m.role,
        status: m.status,
        approved_at: m.approved_at ?? null,
        club: clubsMap.get(m.club_id) ?? null,
      }))

      setActiveClubId(session.activeClubId)
      setMemberships(mergedMemberships)

      setLoading(false)
    }

    load()

    return () => {
      cancelled = true
    }
  }, [router, session.activeClubId])

  const approved = useMemo(() => {
    return memberships.filter((item) => isApprovedMembership(item) && item.club)
  }, [memberships])

  const pending = useMemo(() => {
    return memberships.filter((item) => !isApprovedMembership(item) && item.club)
  }, [memberships])

  async function activateClub(clubId: string) {
    setSavingClubId(clubId)
    setAlert(null)

    const { data: sess } = await supabase.auth.getSession()
    const user = sess?.session?.user

    if (!user) {
      router.replace('/login')
      return
    }

    try {
      await session.setActiveClub(clubId)
    } catch (error: unknown) {
      setAlert({
        type: 'error',
        title: 'No pude activar el club',
        message: error instanceof Error ? error.message : 'El club no está aprobado para tu usuario.',
      })
      setSavingClubId(null)
      return
    }

    setActiveClubId(clubId)

    const selected = approved.find((item) => item.club_id === clubId)
    const role = selected?.role ?? 'PLAYER'

    if (isClubStaffRole(role)) {
      router.replace('/club')
    } else {
      router.replace('/player')
    }
  }

  return (
    <div className="px-auth px-playerFlow px-playerFlow--wide px-selectClubFlow">
      <div
        className="px-authCard"
      >
        <div className="px-authTop">
          <div className="px-authBrand">
            <div className="px-authLogo">
              <img src="/brand/selpa-isotipo.png" alt="SELPA" />
            </div>
            <div className="px-authBrandText">
              <span className="px-playerFlowKicker">Contexto jugador</span>
              <h1 className="px-authTitle">Elegí tu club</h1>
              <p className="px-authSub">Usalo como tu contexto para competir y seguir tu actividad.</p>
            </div>
          </div>
        </div>

        <div className="px-authBody">
          <AlertBox alert={alert} />

          {loading ? (
            <div className="px-help">Cargando clubes…</div>
          ) : approved.length > 0 ? (
            <>
              <div className="px-playerSectionHead">
                <div>
                  <h2>Mis clubes</h2>
                  <p>Elegí cuál querés usar ahora.</p>
                </div>
              </div>
              <div className="px-playerClubGrid">
                {approved.map((item) => {
                const club = item.club
                if (!club) return null

                const isActive = activeClubId === item.club_id
                const isSaving = savingClubId === item.club_id

                return (
                  <button
                    key={item.club_id}
                    type="button"
                    onClick={() => activateClub(item.club_id)}
                    disabled={isSaving}
                    className={`px-playerClubCard ${isActive ? 'is-active' : ''}`}
                  >
                    <div className="px-playerClubMain">
                      <span className="px-playerClubLogo">
                        {club.logo_url ? (
                          <img src={club.logo_url} alt="" />
                        ) : (
                          <span>{getClubInitials(club.name)}</span>
                        )}
                      </span>

                      <div>
                        <h3 className="px-playerClubName">{club.name}</h3>
                        <div className="px-playerClubMeta">
                          {club.city ?? 'Sin ciudad'}
                        </div>
                      </div>
                    </div>

                    <div className="px-playerClubFoot">
                      <span className="px-playerStatus px-playerStatus--approved">
                        {isActive ? 'Aprobado · Activo' : 'Aprobado'}
                      </span>
                      <span className="px-playerClubCta">
                        {isSaving ? 'Activando...' : isActive ? 'Activo' : 'Usar club'}
                      </span>
                    </div>

                    <div className="px-playerClubMeta">Rol: <b>{item.role}</b></div>
                  </button>
                )
                })}
              </div>
            </>
          ) : (
            <div className="px-selectClubEmpty">
              <span className="px-selectClubEmptyMark">SELPA</span>
              <div>
                <strong>Todavía no tenés un club activo</strong>
                <p>Explorá clubes disponibles o creá el tuyo para empezar a participar.</p>
              </div>
            </div>
          )}

          {pending.length > 0 ? (
            <>
              <div className="px-playerSectionHead">
                <div>
                  <h2>Solicitudes en curso</h2>
                  <p>Estados pendientes de revisión del club.</p>
                </div>
              </div>

              <div className="px-playerClubGrid">
                {pending.map((item) => {
                  const club = item.club
                  return (
                    <div
                      key={`${item.club_id}-${item.status}`}
                      className="px-playerClubCard"
                    >
                      <div className="px-playerClubMain">
                        <span className="px-playerClubLogo">
                          {club?.logo_url ? (
                            <img src={club.logo_url} alt="" />
                          ) : (
                            <span>{getClubInitials(club?.name ?? 'Club')}</span>
                          )}
                        </span>
                        <div>
                          <h3 className="px-playerClubName">{club?.name ?? 'Club'}</h3>
                          <div className="px-playerClubMeta">{club?.city ?? 'Sin ciudad'} · Rol: <b>{item.role}</b></div>
                        </div>
                      </div>
                      <div className="px-playerClubFoot">
                        <span className={`px-playerStatus ${item.status === 'REJECTED' ? 'px-playerStatus--rejected' : 'px-playerStatus--pending'}`}>
                          {membershipStatusLabel(item.status)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          ) : null}

          <div className="px-playerFlowActions px-selectClubActions">
            <Link className="px-btn" href="/clubs">
              Explorar clubes
            </Link>

            <Link className="px-btn px-btn--ghost" href="/clubs/nuevo">
              Dar de alta mi club
            </Link>

            <button
              className="px-selectClubContinue"
              type="button"
              onClick={() => router.replace('/player')}
              disabled={loading}
            >
              Seguir sin club
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function membershipStatusLabel(status: string) {
  if (status === 'PENDING') return 'Pendiente'
  if (status === 'APPROVED') return 'Aprobado'
  if (status === 'REJECTED') return 'Rechazado'
  return status || 'Sin solicitud'
}
