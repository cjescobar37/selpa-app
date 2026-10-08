'use client'

import { useRef, useState, type FormEvent } from 'react'
import { useWriteGuard } from '@/lib/useWriteGuard'
import Link from 'next/link'
import PageHeader from '@/components/navigation/PageHeader'
import AuthAlert from '@/components/AuthAlert'
import { CLUB_THEMES, CLUB_THEME_LABELS, type ClubThemeKey } from '@/lib/clubThemes'
import { clubRequestRequiredLabels, humanizeUiError } from '@/lib/productPresentation'
import styles from '@/components/product/ProductFlow.module.css'

const initial = { club_name: '', brand_name: '', cuit: '', email: '', phone: '', website: '', instagram: '',
  address: '', city: '', province: '', country: 'Argentina', courts_count: '', courts_surface: '', opening_hours: '',
  logo_url: '', notes: '', admin_name: '', admin_email: '', admin_phone: '', theme_key: 'cyan' }
type Field = keyof typeof initial
const optionalLabels: Partial<Record<Field, string>> = { brand_name: 'Nombre comercial', cuit: 'CUIT', phone: 'Teléfono del club',
  website: 'Sitio web', instagram: 'Instagram', address: 'Dirección', country: 'País', courts_count: 'Cantidad de canchas',
  courts_surface: 'Superficie', opening_hours: 'Horarios de apertura', logo_url: 'URL del logo', notes: 'Observaciones', admin_phone: 'Teléfono del administrador' }

export default function UnirMiClubPage() {
  const [values, setValues] = useState(initial)
  const [sent, setSent] = useState(false)
  const [resultStatus, setResultStatus] = useState('PENDING')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const write = useWriteGuard()
  const requestId = useRef<string | null>(null)
  function field(key: Field, label: string, required = false) {
    const type = key.includes('email') ? 'email' : key === 'courts_count' ? 'number' : 'text'
    return <label key={key} className={styles.field}>{label}{required ? ' *' : ''}<input name={key} type={type} required={required} min={key === 'courts_count' ? 1 : undefined} value={values[key]} onChange={event => setValues(current => ({ ...current, [key]: event.target.value }))} disabled={submitting} /></label>
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    return write(async () => {
    if (submitting) return
    const missing = (Object.keys(clubRequestRequiredLabels) as Array<keyof typeof clubRequestRequiredLabels>).filter(key => !values[key].trim())
    if (missing.length) { setError(`Completá: ${missing.map(key => clubRequestRequiredLabels[key]).join(', ')}.`); return }
    setSubmitting(true); setError('')
    try {
      if (!requestId.current) {
        try { requestId.current = sessionStorage.getItem('selpa.club-request.intent') } catch { /* Storage may be unavailable. */ }
        requestId.current ||= crypto.randomUUID()
        try { sessionStorage.setItem('selpa.club-request.intent', requestId.current) } catch { /* In-memory retry stays safe. */ }
      }
      const response = await fetch('/api/club-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...values, requestId: requestId.current }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) { setError(humanizeUiError(data.error, 'No pudimos enviar la solicitud. Conservamos tus datos para que puedas reintentar.')); return }
      setResultStatus(data.status === 'APPROVED' || data.status === 'REJECTED' ? data.status : 'PENDING')
      setSent(true)
    } catch { setError('No pudimos conectarnos. Conservamos tus datos; reintentá cuando tengas conexión.') }
    finally { setSubmitting(false) }
    })
  }
  return <main className={styles.page}>
    <PageHeader backHref="/" title="Unir mi club" description="Solicitá el alta de tu club. Revisaremos los datos antes de activarlo." actions={<Link className={styles.link} href="/login">Ingresar</Link>} />
    {sent ? <section className={styles.panel}><h2>{resultStatus === 'APPROVED' ? 'Solicitud aprobada' : resultStatus === 'REJECTED' ? 'Solicitud rechazada' : 'Solicitud enviada'}</h2><p>{resultStatus === 'APPROVED' ? 'El club ya fue aprobado. Ingresá con la cuenta del administrador indicado para gestionarlo.' : resultStatus === 'REJECTED' ? 'Esta solicitud ya fue revisada y rechazada. Contactá a SELPA para conocer el motivo antes de volver a solicitar el alta.' : 'El equipo de SELPA revisará el alta y se comunicará con el administrador indicado. No necesitás volver a enviarla.'}</p><div className={styles.actions}><Link className={styles.button} href={resultStatus === 'APPROVED' ? '/login' : '/'}>{resultStatus === 'APPROVED' ? 'Ingresar' : 'Volver al inicio'}</Link><Link className={styles.link} href="/clubes">Explorar clubes</Link></div></section> : <form onSubmit={submit} className={styles.page} style={{ padding: 0 }}>
      <section className={styles.panel}><h2>Club y contacto</h2><div className={styles.grid}>{(Object.entries(clubRequestRequiredLabels) as Array<[keyof typeof clubRequestRequiredLabels, string]>).map(([key,label]) => field(key,label,true))}</div>
        <label className={styles.field}>Identidad visual<select name="theme_key" value={values.theme_key} onChange={event => setValues(current => ({ ...current, theme_key: event.target.value }))} disabled={submitting}>{(Object.keys(CLUB_THEMES) as ClubThemeKey[]).map(key => <option key={key} value={key}>{CLUB_THEME_LABELS[key]}</option>)}</select></label>
      </section>
      <details className={styles.disclosure}><summary>Datos adicionales · opcional</summary><div className={styles.grid}>{(Object.entries(optionalLabels) as Array<[Field,string]>).map(([key,label]) => field(key,label))}</div></details>
      {error ? <AuthAlert variant="error" title="Revisá la solicitud" message={error} /> : null}
      <div className={styles.actions}><button className={styles.button} type="submit" disabled={submitting}>{submitting ? 'Enviando…' : 'Enviar solicitud'}</button><p className={styles.note}>* Datos obligatorios. No crea un club automáticamente.</p></div>
    </form>}
  </main>
}
