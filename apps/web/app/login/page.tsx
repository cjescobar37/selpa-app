'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')

  // Si ya está logueado y entra a /login, lo mandamos al inicio
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) router.replace('/')
    })
  }, [router])

  async function signUp() {
    setMsg('Registrando...')
    const { error } = await supabase.auth.signUp({ email, password })
    setMsg(error ? error.message : 'Registrado OK. Ahora hacé Login.')
  }

  async function signIn() {
    setMsg('Logueando...')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setMsg(error.message)
      return
    }

    if (data?.session) {
      setMsg('Logueado OK. Entrando...')
      router.replace('/') // ✅ acá está la clave
    } else {
      setMsg('Logueado, pero sin sesión (raro). Probá refrescar.')
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setMsg('Sesión cerrada.')
  }

  return (
    <div style={{ maxWidth: 420, margin: '40px auto', fontFamily: 'system-ui' }}>
      <h1>Login</h1>

      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: '100%', padding: 10, marginTop: 10 }}
      />

      <input
        placeholder="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ width: '100%', padding: 10, marginTop: 10 }}
      />

      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        <button onClick={signUp}>Registrarse</button>
        <button onClick={signIn}>Login</button>
        <button onClick={signOut}>Salir</button>
      </div>

      <p style={{ marginTop: 12 }}>{msg}</p>
    </div>
  )
}
