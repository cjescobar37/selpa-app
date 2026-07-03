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
      border: '1px solid #f7d58d',
      background: '#fff8e6',
      color: '#8a5a00',
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
        padding: 15,
        boxShadow: '0 10px 30px rgba(0,0,0,0.06)',
      }}
    >
      <div style={{ fontWeight: 900 }}>{alert.title}</div>
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
      setAlert({ type: 'info', title: 'Chequeando tus clubes…' })

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

      if (mergedMemberships.length === 0) {
        setAlert({
          type: 'warning',
          title: 'Todavía no pertenecés a ningún club',
          message: 'Podés explorar clubes disponibles o solicitar el alta de tu club.',
        })
      } else {
        setAlert({
          type: 'info',
          title: 'Elegí tu club activo',
          message: 'Esto define navbar, permisos, ranking, torneos e inscripciones.',
        })
      }

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
    <div className="px-auth">
      <div
        className="px-authCard"
        style={{
          maxWidth: 980,
          background: 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(246,248,252,0.96))',
          boxShadow: '0 20px 60px rgba(16,24,40,0.10)',
        }}
      >
        <div className="px-authTop">
          <div className="px-authBrand">
            <div
              className="px-authLogo"
              style={{
                background: 'linear-gradient(135deg, #3558a5, #28457f)',
                boxShadow: '0 10px 24px rgba(53,88,165,0.22)',
              }}
            >
              <img src="/brand/selpa-isotipo.png" alt="SELPA" />
            </div>
            <div className="px-authBrandText">
              <h1 className="px-authTitle">Seleccionar club</h1>
              <p className="px-authSub">Definí tu club activo para trabajar con el contexto correcto.</p>
            </div>
          </div>
        </div>

        <div
          style={{
            height: 2,
            borderRadius: 999,
            background: 'linear-gradient(90deg, rgba(255,78,114,0.28), rgba(105,223,227,0.20))',
            marginBottom: 14,
          }}
        />

        <div className="px-authBody">
          <AlertBox alert={alert} />

          <div className="px-help" style={{ marginTop: 12, color: '#41506c' }}>
            El club activo impacta en <b>navbar, permisos, ranking, torneos e inscripciones</b>.
          </div>

          <div className="px-sepRow" style={{ color: '#727f97', marginTop: 16 }}>clubes aprobados</div>

          {loading ? (
            <div className="px-help">Cargando clubes…</div>
          ) : approved.length > 0 ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 12,
              }}
            >
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
                    style={{
                      textAlign: 'left',
                      padding: 16,
                      borderRadius: 18,
                      border: isActive
                        ? '1px solid rgba(105,223,227,.55)'
                        : '1px solid rgba(26,46,90,.10)',
                      background: isActive
                        ? 'linear-gradient(180deg, rgba(105,223,227,.14), rgba(105,223,227,.07))'
                        : 'linear-gradient(180deg, rgba(255,255,255,.95), rgba(246,248,252,.95))',
                      color: '#13213c',
                      display: 'grid',
                      gap: 10,
                      cursor: 'pointer',
                      boxShadow: isActive ? '0 14px 30px rgba(105,223,227,.12)' : '0 10px 24px rgba(16,24,40,.05)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span
                        className="px-clubLogo"
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 15,
                          background: 'linear-gradient(135deg, rgba(53,88,165,.14), rgba(105,223,227,.12))',
                          color: '#28457f',
                        }}
                      >
                        {club.logo_url ? (
                          <img src={club.logo_url} alt="" />
                        ) : (
                          <span>{getClubInitials(club.name)}</span>
                        )}
                      </span>

                      <div>
                        <div style={{ fontWeight: 900 }}>{club.name}</div>
                        <div style={{ color: '#667085', fontSize: 13 }}>
                          {club.city ?? 'Sin ciudad'}
                        </div>
                      </div>
                    </div>

                    <div style={{ fontSize: 13, color: '#667085' }}>
                      Rol: <b style={{ color: '#21314f' }}>{item.role}</b>
                    </div>

                    <div style={{ fontSize: 13, color: '#667085' }}>
                      {isActive ? 'Club activo actual' : 'Hacé click para activarlo'}
                    </div>

                    <div style={{ fontWeight: 800, color: '#21314f' }}>
                      {isSaving ? 'Activando…' : isActive ? 'Activo' : 'Usar este club'}
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="px-help" style={{ color: '#667085' }}>No tenés clubes aprobados todavía.</div>
          )}

          {pending.length > 0 ? (
            <>
              <div className="px-sepRow" style={{ color: '#727f97', marginTop: 18 }}>
                solicitudes / membresías pendientes
              </div>

              <div style={{ display: 'grid', gap: 10 }}>
                {pending.map((item) => {
                  const club = item.club
                  return (
                    <div
                      key={`${item.club_id}-${item.status}`}
                      className="px-help"
                      style={{
                        border: '1px solid rgba(255,196,0,.22)',
                        background: 'linear-gradient(180deg, rgba(255,196,0,.08), rgba(255,196,0,.04))',
                        borderRadius: 14,
                        padding: 12,
                        color: '#665200',
                      }}
                    >
                      <b>{club?.name ?? 'Club'}</b> · Estado: <b>{item.status}</b> · Rol:{' '}
                      <b>{item.role}</b>
                    </div>
                  )
                })}
              </div>
            </>
          ) : null}

          <div className="px-sepRow" style={{ color: '#727f97', marginTop: 18 }}>acciones</div>

          <div
            className="px-authRow"
            style={{
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10,
              borderTop: '1px solid rgba(26,46,90,.08)',
              paddingTop: 14,
            }}
          >
            <Link className="px-link" href="/clubs">
              Ver clubes disponibles
            </Link>

            <Link className="px-link" href="/clubs/nuevo">
              Dar de alta mi club
            </Link>

            <button
              className="px-btn px-btn--ghost"
              type="button"
              onClick={() => router.replace('/player')}
              disabled={loading}
              style={{
                background: 'white',
                color: '#1c2d4d',
                border: '1px solid rgba(26,46,90,.12)',
              }}
            >
              Seguir en modo jugador
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
