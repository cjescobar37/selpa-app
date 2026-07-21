'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Clock3, Compass, Search } from 'lucide-react'
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
  const requestsRef = useRef<HTMLDivElement>(null)

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

      const accessToken = sess.session?.access_token
      const response = await fetch('/api/clubs/my-memberships', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      })
      const result = await response.json().catch(() => null) as { memberships?: MembershipRow[]; error?: string } | null

      if (cancelled) return

      if (!response.ok) {
        setAlert({
          type: 'error',
          title: 'No pude leer tus clubes',
          message: result?.error ?? 'Intentá nuevamente.',
        })
        setLoading(false)
        return
      }

      setActiveClubId(session.activeClubId)
      setMemberships(result?.memberships ?? [])

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
    return memberships.filter((item) => item.status === 'PENDING' && item.club)
  }, [memberships])

  const rejected = useMemo(() => {
    return memberships.filter((item) => item.status === 'REJECTED' && item.club)
  }, [memberships])

  const hasApproved = approved.length > 0
  const hasPending = pending.length > 0
  const pageTitle = hasApproved ? 'Elegí tu club' : hasPending ? 'Sin club por ahora' : 'Todavía no elegiste un club'
  const pageSubtitle = hasApproved
    ? 'Usalo como tu contexto para competir y seguir tu actividad.'
    : hasPending
      ? 'Tus solicitudes están siendo revisadas. Mientras tanto, podés explorar torneos, rankings y la comunidad SELPA.'
      : 'Podés explorar SELPA y unirte más adelante.'

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
              <span className="px-playerFlowKicker">{hasApproved ? 'Contexto jugador' : 'Tu espacio SELPA'}</span>
              <h1 className="px-authTitle">{pageTitle}</h1>
              <p className="px-authSub">{pageSubtitle}</p>
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
          ) : hasPending ? (
            <div className="px-noClubWaitCard">
              <span className="px-noClubWaitIcon"><Clock3 /></span>
              <div><small>Estado actual</small><strong>Solicitudes pendientes: {pending.length}</strong><p>Podés seguir explorando mientras los clubes las revisan.</p></div>
              <button type="button" onClick={() => requestsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Ver mis solicitudes <ArrowRight /></button>
            </div>
          ) : (
            <div className="px-selectClubEmpty">
              <span className="px-selectClubEmptyMark"><Compass /></span>
              <div><strong>Tu experiencia ya está lista</strong><p>Explorá la comunidad y elegí un club cuando quieras competir.</p></div>
            </div>
          )}

          {pending.length > 0 ? (
            <div id="mis-solicitudes" ref={requestsRef} className="px-noClubRequests">
              <div className="px-playerSectionHead">
                <div>
                  <h2>Mis solicitudes</h2>
                  <p>Los clubes te avisarán cuando finalice la revisión.</p>
                </div>
              </div>

              <div className="px-noClubRequestList">
                {pending.map((item) => {
                  const club = item.club
                  return (
                    <div key={`${item.club_id}-${item.status}`} className="px-noClubRequestRow">
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
                          <div className="px-playerClubMeta">{club?.city ?? 'Argentina'}</div>
                        </div>
                      </div>
                      <div className="px-playerClubFoot">
                        <span className="px-playerStatus px-playerStatus--pending">En revisión</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          {rejected.length > 0 ? (
            <div className="px-noClubRequests">
              <div className="px-playerSectionHead"><div><h2>Solicitudes anteriores</h2><p>Podés elegir otro club cuando quieras.</p></div></div>
              <div className="px-noClubRequestList">
                {rejected.map((item) => (
                  <div key={`${item.club_id}-rejected`} className="px-noClubRequestRow">
                    <div className="px-playerClubMain">
                      <span className="px-playerClubLogo">{item.club?.logo_url ? <img src={item.club.logo_url} alt="" /> : <span>{getClubInitials(item.club?.name ?? 'Club')}</span>}</span>
                      <div><h3 className="px-playerClubName">{item.club?.name ?? 'Club'}</h3><div className="px-playerClubMeta">Solicitud finalizada</div></div>
                    </div>
                    <span className="px-playerStatus px-playerStatus--rejected">Rechazada</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="px-playerFlowActions px-selectClubActions">
            {!hasApproved ? <Link className="px-btn" href="/player">
              Ir a Mi espacio <ArrowRight />
            </Link> : null}

            <Link className="px-btn" href="/">
              Explorar SELPA <ArrowRight />
            </Link>

            <Link className="px-btn px-btn--ghost" href="/clubs">
              <Search /> Explorar clubes
            </Link>

            {hasApproved ? <button
              className="px-selectClubContinue"
              type="button"
              onClick={() => router.replace('/player')}
              disabled={loading}
            >
              Seguir sin club
            </button> : null}
          </div>
        </div>
      </div>
    </div>
  )
}
