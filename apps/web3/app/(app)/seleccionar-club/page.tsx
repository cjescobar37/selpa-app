'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { getClubInitials } from '@/lib/clubAssets'
import { useSession } from '@/components/session/SessionProvider'

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

      const [settingsRes, membershipsRes] = await Promise.all([
        supabase
          .from('user_settings')
          .select('active_club_id')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('club_memberships')
          .select('club_id, role, status')
          .eq('user_id', user.id),
      ])

      if (cancelled) return

      if (settingsRes.error) {
        setAlert({
          type: 'error',
          title: 'No pude leer tu configuración',
          message: settingsRes.error.message,
        })
        setLoading(false)
        return
      }

      if (membershipsRes.error) {
        setAlert({
          type: 'error',
          title: 'No pude leer tus clubes',
          message: membershipsRes.error.message,
        })
        setLoading(false)
        return
      }

      const rawMemberships = membershipsRes.data ?? []
      const clubIds = Array.from(new Set(rawMemberships.map((m: any) => m.club_id).filter(Boolean)))

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
          (clubsRes.data ?? []).map((club: any) => [
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

      const mergedMemberships: MembershipRow[] = rawMemberships.map((m: any) => ({
        club_id: m.club_id,
        role: m.role,
        status: m.status,
        club: clubsMap.get(m.club_id) ?? null,
      }))

      setActiveClubId(settingsRes.data?.active_club_id ?? null)
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
  }, [router])

  const approved = useMemo(() => {
    return memberships.filter((item) => item.status === 'APPROVED' && item.club)
  }, [memberships])

  const pending = useMemo(() => {
    return memberships.filter((item) => item.status !== 'APPROVED' && item.club)
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

    const { error } = await supabase
      .from('user_settings')
      .upsert({ user_id: user.id, active_club_id: clubId }, { onConflict: 'user_id' })

    if (error) {
      setAlert({
        type: 'error',
        title: 'No pude activar el club',
        message: error.message,
      })
      setSavingClubId(null)
      return
    }

    setActiveClubId(clubId)

    if (session?.refresh) {
      await session.refresh()
    }

    const selected = approved.find((item) => item.club_id === clubId)
    const role = selected?.role ?? 'PLAYER'

    if (role === 'OWNER' || role === 'ADMIN' || role === 'PLANILLERO') {
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
              PX
            </div>
            <div className="px-authBrandText">
              <h1 className="px-authTitle">Seleccionar club</h1>
              <p className="px-authSub">Definí tu club activo para trabajar con el contexto correcto.</p>
            </div>
          </div>
        </div>

        <div
          style={{
            height: 3,
            borderRadius: 999,
            background: 'linear-gradient(90deg, rgba(53,88,165,0.32), rgba(255,78,114,0.22), rgba(105,223,227,0.24))',
            marginBottom: 18,
          }}
        />

        <div className="px-authBody">
          <AlertBox alert={alert} />

          <div
            style={{
              marginTop: 14,
              padding: '16px 18px',
              borderRadius: 20,
              border: '1px solid rgba(105,223,227,.24)',
              background: 'linear-gradient(180deg, rgba(238,248,255,.98), rgba(245,251,255,.94))',
              color: '#24506a',
              boxShadow: '0 10px 24px rgba(83, 199, 217, 0.08)',
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 15, marginBottom: 6 }}>Elegí tu club activo</div>
            <div style={{ fontSize: 14, lineHeight: 1.55 }}>
              Esto define <b>navbar, permisos, ranking, torneos e inscripciones</b>.
            </div>
          </div>

          <div className="px-sepRow" style={{ color: '#6e7b94', marginTop: 18 }}>clubes aprobados</div>

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
                      {isActive ? 'Este es tu club activo actual.' : 'Activá este club para usar la app con su contexto.'}
                    </div>

                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: 42,
                        padding: '0 14px',
                        borderRadius: 14,
                        border: isActive
                          ? '1px solid rgba(16,185,129,.20)'
                          : '1px solid rgba(53,88,165,.14)',
                        background: isActive
                          ? 'rgba(16,185,129,.10)'
                          : 'linear-gradient(135deg, rgba(53,88,165,.14), rgba(105,223,227,.14))',
                        color: isActive ? '#0f766e' : '#21314f',
                        fontWeight: 900,
                      }}
                    >
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
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
              borderTop: '1px solid rgba(26,46,90,.08)',
              paddingTop: 16,
            }}
          >
            <Link
              href="/clubs"
              style={{
                textDecoration: 'none',
                padding: '16px 18px',
                borderRadius: 18,
                border: '1px solid rgba(53,88,165,.14)',
                background: 'linear-gradient(135deg, rgba(53,88,165,.14), rgba(105,223,227,.14))',
                color: '#10213f',
                display: 'grid',
                gap: 6,
                boxShadow: '0 12px 28px rgba(53,88,165,.08)',
              }}
            >
              <span style={{ fontWeight: 900 }}>Ver clubes disponibles</span>
              <span style={{ fontSize: 13, color: '#5b6a85' }}>Explorá clubes activos y solicitá tu ingreso como jugador.</span>
            </Link>

            <Link
              href="/unir-mi-club"
              style={{
                textDecoration: 'none',
                padding: '16px 18px',
                borderRadius: 18,
                border: '1px solid rgba(255,78,114,.16)',
                background: 'linear-gradient(135deg, rgba(255,78,114,.12), rgba(255,255,255,.94))',
                color: '#10213f',
                display: 'grid',
                gap: 6,
                boxShadow: '0 12px 28px rgba(255,78,114,.08)',
              }}
            >
              <span style={{ fontWeight: 900 }}>Dar de alta mi club</span>
              <span style={{ fontSize: 13, color: '#5b6a85' }}>Iniciá el flujo para sumar tu club a PAMPRAX.</span>
            </Link>

            <button
              className="px-btn px-btn--ghost"
              type="button"
              onClick={() => router.replace('/player')}
              disabled={loading}
              style={{
                minHeight: 58,
                background: 'white',
                color: '#1c2d4d',
                border: '1px solid rgba(26,46,90,.12)',
                fontWeight: 900,
                boxShadow: '0 10px 24px rgba(16,24,40,.05)',
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