'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useActiveClub } from '@/lib/useActiveClub'

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname()
  const active = pathname === href

  return (
    <Link
      href={href}
      style={{
        padding: '8px 10px',
        borderRadius: 10,
        textDecoration: 'none',
        color: 'white',
        background: active ? 'rgba(255,255,255,0.18)' : 'transparent',
      }}
    >
      {label}
    </Link>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [email, setEmail] = useState<string | null>(null)

  const { activeClub, setActiveClubId, errorMsg, loading } = useActiveClub()
  const [clubs, setClubs] = useState<{ id: string; name: string }[]>([])

  // 🔐 Auth guard
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) router.replace('/login')
      else setEmail(data.user.email ?? null)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session?.user) router.replace('/login')
      else setEmail(session.user.email ?? null)
    })

    return () => sub.subscription.unsubscribe()
  }, [router])

  // 🏟️ Cargar clubs para selector
  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from('clubs')
        .select('id, name')
        .order('created_at', { ascending: false })

      setClubs((data ?? []) as any)
    })()
  }, [])

  // 🚧 Guard: sin club activo → seleccionar-club
  useEffect(() => {
    if (loading) return

    const allowNoClub = ['/clubs', '/clubs/nuevo', '/seleccionar-club', '/perfil']

    if (!activeClub && !allowNoClub.includes(pathname)) {
      router.replace('/seleccionar-club')
    }
  }, [loading, activeClub, pathname, router])

  async function logout() {
    await supabase.auth.signOut()
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0b0b10', color: 'white' }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          backdropFilter: 'blur(10px)',
          background: 'rgba(20,20,30,.8)',
          borderBottom: '1px solid rgba(255,255,255,.08)',
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            padding: 12,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div>
            <b>Padel Platform</b>
            <div style={{ fontSize: 12, opacity: 0.7 }}>{email}</div>
          </div>

          <nav style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <NavLink href="/" label="Inicio" />
            <NavLink href="/torneos" label="Torneos" />
            <NavLink href="/ranking" label="Ranking" />
            <NavLink href="/envivo" label="En Vivo" />
            <NavLink href="/notificaciones" label="Notificaciones" />
            <NavLink href="/perfil" label="Perfil" />
            <NavLink href="/clubs" label="Clubs" />

            {/* Selector de club */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Club:</span>
              <select
                value={activeClub?.id ?? ''}
                onChange={(e) => setActiveClubId(e.target.value || null)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.06)',
                  color: 'white',
                  border: '1px solid rgba(255,255,255,0.15)',
                }}
              >
                <option value="">(seleccionar)</option>
                {clubs.map((c) => (
                  <option key={c.id} value={c.id} style={{ color: 'black' }}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <button onClick={logout}>Salir</button>
          </nav>
        </div>

        {errorMsg && (
          <div
            style={{
              maxWidth: 1100,
              margin: '0 auto',
              padding: '0 12px 10px',
              color: '#ff6b6b',
              fontSize: 12,
            }}
          >
            {errorMsg}
          </div>
        )}
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: 14 }}>
        {children}
      </main>
    </div>
  )
}
