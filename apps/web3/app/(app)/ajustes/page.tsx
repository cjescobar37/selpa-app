'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useSession } from '@/components/session/SessionProvider'

type Settings = {
  notifications_email: boolean
  notifications_push: boolean
  notifications_inscripcion: boolean
  notifications_resultados: boolean
  profile_public: boolean
  show_in_ranking: boolean
  theme: 'auto' | 'light' | 'dark'
  language: 'es'
}

const DEFAULT_SETTINGS: Settings = {
  notifications_email: true,
  notifications_push: true,
  notifications_inscripcion: true,
  notifications_resultados: true,
  profile_public: true,
  show_in_ranking: true,
  theme: 'auto',
  language: 'es',
}

const STORAGE_KEY = 'pamprax_user_settings'

export default function AjustesPage() {
  const { user, role } = useSession()
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [changePass, setChangePass] = useState(false)
  const [email, setEmail] = useState('')
  const [sendingPass, setSendingPass] = useState(false)
  const [passMsg, setPassMsg] = useState('')

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) })
    } catch {}
    if (user?.email) setEmail(user.email)
  }, [user])

  function toggle(key: keyof Settings) {
    setSettings(s => ({ ...s, [key]: !s[key] }))
  }

  function handleSave() {
    setSaving(true)
    setMsg('')
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
      setMsg('Preferencias guardadas correctamente.')
    } catch { setMsg('Error al guardar preferencias.') }
    setSaving(false)
  }

  async function handleChangePass() {
    setSendingPass(true)
    setPassMsg('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/update-password` })
    if (error) setPassMsg(`Error: ${error.message}`)
    else setPassMsg('Email enviado. Revisá tu bandeja de entrada.')
    setSendingPass(false)
  }

  const Toggle = ({ active, onToggle }: { active: boolean; onToggle: () => void }) => (
    <button onClick={onToggle} style={{ width:42, height:24, borderRadius:999, border:'none', cursor:'pointer', background: active ? 'var(--navy)' : 'rgba(23,37,63,.2)', position:'relative', transition:'background .2s', flexShrink:0 }}>
      <div style={{ width:18, height:18, borderRadius:'50%', background:'#fff', position:'absolute', top:3, left: active ? 21 : 3, transition:'left .2s', boxShadow:'0 1px 4px rgba(0,0,0,.2)' }} />
    </button>
  )

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="px-card" style={{ padding:0, overflow:'hidden', marginBottom:14 }}>
      <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', fontWeight:900, fontSize:14, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--muted)' }}>{title}</div>
      <div style={{ padding:'6px 0' }}>{children}</div>
    </div>
  )

  const Row = ({ label, sub, right }: { label: string; sub?: string; right: React.ReactNode }) => (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:16, padding:'13px 18px', borderBottom:'1px solid var(--border)' }}>
      <div>
        <div style={{ fontWeight:700, fontSize:14 }}>{label}</div>
        {sub && <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>{sub}</div>}
      </div>
      <div>{right}</div>
    </div>
  )

  return (
    <div className="px-wrap" style={{ maxWidth:680 }}>
      <div style={{ marginBottom:24 }}>
        <h1 className="px-h1">Preferencias</h1>
        <p className="px-muted" style={{ marginTop:6 }}>Configuración de notificaciones, privacidad y cuenta</p>
      </div>

      {/* Info cuenta */}
      <div className="px-card px-card--flat" style={{ padding:'16px 18px', marginBottom:14, display:'flex', gap:14, alignItems:'center' }}>
        <div style={{ width:48, height:48, borderRadius:'50%', background:'var(--navy)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:18, flexShrink:0 }}>
          {(user?.email ?? 'U').slice(0,1).toUpperCase()}
        </div>
        <div>
          <div style={{ fontWeight:800, fontSize:15 }}>{user?.email ?? '—'}</div>
          <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>Rol: {role ?? '—'} · ID: {user?.id?.slice(0,8) ?? '—'}…</div>
        </div>
      </div>

      {/* Notificaciones */}
      <Section title="Notificaciones">
        <Row label="Notificaciones por email" sub="Recibí alertas importantes en tu correo" right={<Toggle active={settings.notifications_email} onToggle={() => toggle('notifications_email')} />} />
        <Row label="Notificaciones push" sub="Alertas en tiempo real en el navegador" right={<Toggle active={settings.notifications_push} onToggle={() => toggle('notifications_push')} />} />
        <Row label="Estado de inscripción" sub="Cuando tu inscripción sea aprobada o rechazada" right={<Toggle active={settings.notifications_inscripcion} onToggle={() => toggle('notifications_inscripcion')} />} />
        <Row label="Resultados de partidos" sub="Cuando se carguen resultados de tu torneo" right={<Toggle active={settings.notifications_resultados} onToggle={() => toggle('notifications_resultados')} />} />
      </Section>

      {/* Privacidad */}
      <Section title="Privacidad">
        <Row label="Perfil público" sub="Tu perfil es visible para otros jugadores" right={<Toggle active={settings.profile_public} onToggle={() => toggle('profile_public')} />} />
        <Row label="Aparecer en el ranking" sub="Tu posición se muestra en el ranking público" right={<Toggle active={settings.show_in_ranking} onToggle={() => toggle('show_in_ranking')} />} />
      </Section>

      {/* Apariencia */}
      <Section title="Apariencia">
        <Row label="Tema" sub="Elegí la apariencia de la plataforma" right={
          <select value={settings.theme} onChange={e => setSettings(s => ({ ...s, theme: e.target.value as any }))} style={{ height:34, padding:'0 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--glass)', fontSize:13 }}>
            <option value="auto">Automático (sistema)</option>
            <option value="light">Claro</option>
            <option value="dark">Oscuro</option>
          </select>
        } />
      </Section>

      {msg && <div style={{ marginBottom:14, padding:'10px 14px', borderRadius:10, background:'rgba(16,185,129,.1)', border:'1px solid rgba(16,185,129,.3)', fontSize:13, color:'#065f46' }}>{msg}</div>}

      <button onClick={handleSave} disabled={saving} className="px-btn px-btn--magenta" style={{ width:'100%', height:44, fontSize:15, marginBottom:20 }}>
        {saving ? 'Guardando…' : 'Guardar preferencias'}
      </button>

      {/* Seguridad */}
      <Section title="Seguridad">
        <div style={{ padding:'14px 18px' }}>
          <div style={{ fontWeight:700, marginBottom:6 }}>Cambiar contraseña</div>
          <div style={{ fontSize:13, color:'var(--muted)', marginBottom:12 }}>Recibirás un email con un enlace para restablecer tu contraseña.</div>
          {changePass ? (
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" style={{ flex:1, height:38, padding:'0 12px', borderRadius:10, border:'1px solid var(--border)', background:'var(--glass)', fontSize:13, outline:'none', minWidth:200 }} />
              <button onClick={handleChangePass} disabled={sendingPass} className="px-btn" style={{ height:38, padding:'0 16px', fontSize:13 }}>
                {sendingPass ? 'Enviando…' : 'Enviar email'}
              </button>
              <button onClick={() => setChangePass(false)} className="px-btn px-btn--ghost" style={{ height:38, padding:'0 14px', fontSize:13 }}>Cancelar</button>
            </div>
          ) : (
            <button onClick={() => setChangePass(true)} className="px-btn px-btn--ghost" style={{ height:38, padding:'0 16px', fontSize:13 }}>
              Solicitar cambio de contraseña
            </button>
          )}
          {passMsg && <div style={{ marginTop:10, fontSize:13, color: passMsg.startsWith('Error') ? '#ef4444' : '#10b981', fontWeight:700 }}>{passMsg}</div>}
        </div>
      </Section>
    </div>
  )
}
