'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import AuthAlert from '@/components/AuthAlert'

type AlertState =
  | { variant: 'success' | 'warning' | 'error' | 'info'; title: string; message?: string }
  | null

type Stat = { label: string; value: string; hint?: string }
type ClubRow = { id: string; name: string; city: string | null; is_active: boolean | null; created_at: string }

export default function PlatformPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [alert, setAlert] = useState<AlertState>(null)

  const [clubs, setClubs] = useState<ClubRow[]>([])
  const [clubsCount, setClubsCount] = useState<number | null>(null)

  const stats: Stat[] = useMemo(() => {
    return [
      { label: 'Clubes activos', value: clubsCount === null ? '—' : String(clubsCount), hint: 'Total en plataforma' },
      { label: 'Pagos hoy', value: '—', hint: 'Pendiente integrar MP' },
      { label: 'Comisión hoy', value: '—', hint: 'Snapshot por pago' },
      { label: 'Alertas', value: '0', hint: 'Webhooks / fallos' },
    ]
  }, [clubsCount])

  async function load() {
    setLoading(true)
    setAlert(null)

    const { data: s } = await supabase.auth.getSession()
    if (!s?.session?.user) {
      setAlert({ variant: 'warning', title: 'Sesión expirada', message: 'Volvé a iniciar sesión.' })
      setLoading(false)
      return
    }

    // (Opcional) Si querés asegurar superadmin acá, lo chequeás:
    const userId = s.session.user.id
    const { data: pa, error: paErr } = await supabase
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()

    if (paErr) {
      setAlert({ variant: 'error', title: 'Error verificando permisos', message: paErr.message })
      setLoading(false)
      return
    }

    if (!pa?.user_id) {
      // si no es superadmin, lo mandamos a post-login y que resuelva
      router.replace('/auth/post-login')
      return
    }

    const { data: rows, error } = await supabase
      .from('clubs')
      .select('id,name,city,is_active,created_at')
      .order('created_at', { ascending: false })
      .limit(6)

    if (error) {
      setAlert({ variant: 'error', title: 'No pude traer clubes', message: error.message })
      setLoading(false)
      return
    }

    setClubs(rows ?? [])
    setClubsCount((rows ?? []).filter(r => r.is_active !== false).length) // placeholder
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="platform-shell">
      <div className="platform-panel">
        <div className="px-platform">
      <div className="px-platformHead">
        <div>
          <h1 className="px-platformTitle">Plataforma</h1>
          <div className="px-platformSub">Panel global • comisiones • clubes • auditoría</div>
        </div>

        <div className="px-toolbar">
          <button className="px-btn px-btn--soft" onClick={() => setAlert({ variant: 'info', title: 'Próximo paso', message: 'Acá abrimos modal de reglas / % variable.' })}>
            Configurar comisión
          </button>
          <button className="px-btn" onClick={load} disabled={loading}>
            {loading ? (
              <>
                <span className="px-spinner" />&nbsp;Cargando…
              </>
            ) : (
              'Recargar'
            )}
          </button>
        </div>
      </div>

      {alert ? <AuthAlert variant={alert.variant} title={alert.title} message={alert.message} /> : null}

      <div className="px-kpis" style={{ marginTop: 14 }}>
        {stats.map(s => (
          <div key={s.label} className="px-kpi">
            <div className="px-kpiLabel">{s.label}</div>
            <div className="px-kpiValue">{s.value}</div>
            {s.hint ? <div className="px-kpiHint">{s.hint}</div> : null}
          </div>
        ))}
      </div>

      <div className="px-platformGrid" style={{ marginTop: 14 }}>
        <div className="px-platformCard">
          <div className="px-sectionTitle">Acciones rápidas</div>

          <div className="px-actions">
            <div className="px-action" onClick={() => setAlert({ variant: 'info', title: 'Comisiones', message: 'Abrimos pantalla: reglas, % por club, vigencia, historial.' })}>
              <div className="px-actionLeft">
                <p className="px-actionTitle">Comisiones</p>
                <p className="px-actionSub">Cambiar % default y reglas</p>
              </div>
              <span className="px-pill"><span className="px-dot" /> Config</span>
            </div>

            <div className="px-action" onClick={() => setAlert({ variant: 'info', title: 'Pagos', message: 'Vista global: estados, conciliación MP, devoluciones, chargebacks.' })}>
              <div className="px-actionLeft">
                <p className="px-actionTitle">Pagos</p>
                <p className="px-actionSub">Ver estados / chargebacks</p>
              </div>
              <span className="px-pill"><span className="px-dot" /> Monitor</span>
            </div>

            <div className="px-action" onClick={() => setAlert({ variant: 'info', title: 'Auditoría', message: 'Logs: altas/bajas, cambios de comisión, roles, acciones sensibles.' })}>
              <div className="px-actionLeft">
                <p className="px-actionTitle">Auditoría</p>
                <p className="px-actionSub">Logs de acciones sensibles</p>
              </div>
              <span className="px-pill"><span className="px-dot" /> Logs</span>
            </div>

            <div className="px-action" onClick={() => setAlert({ variant: 'info', title: 'Usuarios', message: 'Panel de usuarios: roles extra, bloqueos, reportes, merges.' })}>
              <div className="px-actionLeft">
                <p className="px-actionTitle">Usuarios</p>
                <p className="px-actionSub">Roles extra / bloqueos</p>
              </div>
              <span className="px-pill"><span className="px-dot" /> Admin</span>
            </div>
          </div>
        </div>

        <div className="px-platformAsideStack">
          <div className="px-platformCard">
            <div className="px-sectionTitle">Clubes recientes</div>

            {clubs.length ? (
              <table className="px-table">
                <thead>
                  <tr>
                    <th>Club</th>
                    <th>Ciudad</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {clubs.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 800 }}>{c.name}</td>
                      <td style={{ opacity: 0.8 }}>{c.city ?? '—'}</td>
                      <td style={{ opacity: 0.8 }}>{c.is_active === false ? 'Inactivo' : 'Activo'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="px-empty">No hay datos todavía.</div>
            )}
          </div>

          <div className="px-platformCard">
            <div className="px-sectionTitle">Salud del sistema</div>
            <div className="px-pill" style={{ width: 'fit-content' }}>
              <span className="px-dot" /> Webhooks OK
            </div>
            <div style={{ marginTop: 10, opacity: 0.78, fontSize: 13.5 }}>
              Próximo: tablero de eventos MP, reintentos y errores por club.
            </div>
          </div>
        </div>
      </div>
        </div>
      </div>
    </div>
  )
}