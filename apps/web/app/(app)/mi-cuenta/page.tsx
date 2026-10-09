'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/components/session/SessionProvider'
import { supabase } from '@/lib/supabaseClient'
import PageHeader from '@/components/navigation/PageHeader'
import AuthAlert from '@/components/AuthAlert'
import styles from '@/components/product/ProductFlow.module.css'

export default function AccountPage() {
  const session = useSession()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  useEffect(() => { const timer = window.setTimeout(() => setVersion(value => value + 1), 0); return () => window.clearTimeout(timer) }, [session.globalProfile])
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    form.set('step', 'account')
    setBusy(true); setError('')
    try {
      const { data } = await supabase.auth.getSession()
      if (!data.session) throw new Error('Tu sesión venció. Volvé a ingresar.')
      const response = await fetch('/api/auth/complete-profile', { method: 'POST', headers: { Authorization: `Bearer ${data.session.access_token}` }, body: form })
      const body = await response.json()
      if (!response.ok) throw new Error(body.message || 'No pudimos guardar tus datos.')
      await session.refresh({ silent: true })
      router.replace('/mis-datos?updated=account')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos guardar tus datos. Reintentá.') }
    finally { setBusy(false) }
  }
  return <main className={styles.page}>
    <PageHeader backHref="/mis-datos" title="Datos personales" description="Datos personales y foto de cuenta." />
    {error ? <AuthAlert variant="error" title="No pudimos guardar" message={error}/> : null}
    {session.status === 'ready' && session.user ? <form key={version} className={styles.panel} onSubmit={save}>
      <label className={styles.field}>Nombre<input name="firstName" autoComplete="given-name" defaultValue={session.globalProfile?.first_name ?? ''} required minLength={2}/></label>
      <label className={styles.field}>Apellido<input name="lastName" autoComplete="family-name" defaultValue={session.globalProfile?.last_name ?? ''} required minLength={2}/></label>
      <div className={styles.grid}><label className={styles.field}>Código de área<input name="phoneAreaCode" inputMode="tel" defaultValue={session.globalProfile?.phone_area_code ?? ''} required/></label><label className={styles.field}>Teléfono<input name="phoneNumber" inputMode="tel" defaultValue={session.globalProfile?.phone_number ?? ''} required/></label></div>
      <label className={styles.field}>Foto de cuenta · opcional<input name="avatar" type="file" accept="image/jpeg,image/png,image/webp" /></label>
      <p>Correo de acceso: {session.user.email}. Para cambiar la contraseña, usá Seguridad.</p>
      <div className={styles.actions}><button className={styles.button} disabled={busy} type="submit">{busy ? 'Guardando…' : 'Guardar datos'}</button></div>
    </form> : <p role="status">Preparando tu cuenta…</p>}
  </main>
}
