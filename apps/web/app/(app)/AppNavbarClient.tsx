'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bell,
  Mail,
  Search,
  ChevronDown,
  User,
  Activity,
  Settings,
  LogOut,
  Shield,
} from 'lucide-react'

type Club = { id: string; name: string; logoUrl?: string }
type UserMini = { name: string; email?: string; avatarUrl?: string }

const ROUTES = {
  home: '/(app)',
  torneos: '/(app)/torneos',
  ranking: '/(app)/ranking',
  envivo: '/(app)/envivo',
  noticias: '/(app)/notificaciones',
  perfil: '/(app)/perfil',
}

function initials(text?: string) {
  if (!text) return 'U'
  const parts = text.trim().split(/\s+/).slice(0, 2)
  return parts.map(p => p[0]?.toUpperCase()).join('') || 'U'
}

export default function AppNavbarClient() {
  const pathname = usePathname()
  const router = useRouter()

  const user: UserMini = {
    name: 'Cristian',
    email: 'cjescobar37@gmail.com',
    avatarUrl: '',
  }

  const clubs: Club[] = useMemo(
    () => [
      { id: 'la33', name: 'Complejo LA33', logoUrl: '' },
      { id: 'padelix', name: 'Club Padelix', logoUrl: '' },
    ],
    []
  )
  const [activeClub, setActiveClub] = useState<Club>(clubs[0])

  const notifCount = 1
  const mailCount = 3
  const liveDot = true

  const [clubOpen, setClubOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)

  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onScroll = () => {
      const scrolled = window.scrollY > 8
      document
        .querySelector('.px-navbar')
        ?.classList.toggle('px-navbar--scrolled', scrolled)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (!rootRef.current) return
      if (!rootRef.current.contains(target)) {
        setClubOpen(false)
        setUserOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setClubOpen(false)
        setUserOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const nav = [
    { href: ROUTES.home, label: 'Inicio' },
    { href: ROUTES.torneos, label: 'Torneos' },
    { href: ROUTES.ranking, label: 'Ranking' },
    { href: ROUTES.envivo, label: 'En vivo', dot: liveDot },
    { href: ROUTES.noticias, label: 'Noticias' },
  ]

  const isActive = (href: string) =>
    pathname === href || (href !== ROUTES.home && pathname?.startsWith(href))

  const onLogout = async () => {
    router.push('/login')
  }

  return (
    <header className="px-navbar" ref={rootRef}>
      <div className="px-navbar-inner px-navgrid">
        {/* CLUB */}
        <div className="px-left">
          <div className="px-dd px-glass px-clubWrap">
            <button
              className="px-clubBtn"
              type="button"
              onClick={() => {
                setClubOpen(v => !v)
                setUserOpen(false)
              }}
              aria-expanded={clubOpen}
              aria-haspopup="menu"
              title={activeClub.name}
            >
              <span className="px-clubLogo">
                {activeClub.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={activeClub.logoUrl} alt="" />
                ) : (
                  <span>{initials(activeClub.name)}</span>
                )}
              </span>

                <span className="px-clubText">
                    <span className="px-clubName">{activeClub.name}</span>
                </span>

              <ChevronDown size={16} className={clubOpen ? 'px-rot' : ''} />
            </button>

            {clubOpen ? (
              <div className="px-menu" role="menu">
                <button
                  className="px-menuItem"
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setClubOpen(false)
                    router.push('/(app)/clubs')
                  }}
                >
                  <Shield size={16} />
                  Ver club
                </button>

                <div className="px-menuSep" />

                <div className="px-menuGroupTitle">Cambiar club</div>
                {clubs.map(c => (
                  <button
                    key={c.id}
                    className={[
                      'px-menuItem',
                      c.id === activeClub.id ? 'px-menuItem--active' : '',
                    ].join(' ')}
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setActiveClub(c)
                      setClubOpen(false)
                    }}
                  >
                    {c.name}
                    {c.id === activeClub.id ? (
                      <span className="px-pill">Activo</span>
                    ) : null}
                  </button>
                ))}

                <div className="px-menuSep" />

                <button
                  className="px-menuItem"
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setClubOpen(false)
                    router.push('/(app)/clubs')
                  }}
                >
                  <Settings size={16} />
                  Info del club
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* NAV */}
        <nav className="px-navlinks px-navlinks--center" aria-label="Primary">
          {nav.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'px-navlink',
                isActive(item.href) ? 'px-navlink--active' : '',
              ].join(' ')}
            >
              {item.label}
              {item.dot ? <span className="px-dot" aria-hidden="true" /> : null}
            </Link>
          ))}
        </nav>

        {/* RIGHT */}
        <div className="px-right">
          <div className="px-icons">
            <button className="px-icoBtn" type="button" aria-label="Buscar">
              <Search size={18} />
            </button>

            <button className="px-icoBtn" type="button" aria-label="Notificaciones">
              <Bell size={18} />
              {notifCount > 0 ? <span className="px-badge">{notifCount}</span> : null}
            </button>

            <button className="px-icoBtn" type="button" aria-label="Mensajes">
              <Mail size={18} />
              {mailCount > 0 ? <span className="px-badge">{mailCount}</span> : null}
            </button>
          </div>

          {/* USUARIO (ahora con wrapper dedicado) */}
          <div className="px-dd px-glass px-userWrap">
            <button
              className="px-userBtn"
              type="button"
              onClick={() => {
                setUserOpen(v => !v)
                setClubOpen(false)
              }}
              aria-expanded={userOpen}
              aria-haspopup="menu"
              title={user.name}
            >
              <span className="px-avatar">
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatarUrl} alt="" />
                ) : (
                  <span>{initials(user.name)}</span>
                )}
              </span>

                <span className="px-userText">
                <span className="px-userName">{user.name}</span>
                </span>


              <ChevronDown size={16} className={userOpen ? 'px-rot' : ''} />
            </button>

            {userOpen ? (
              <div className="px-menu" role="menu">
                <button
                  className="px-menuItem"
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setUserOpen(false)
                    router.push(ROUTES.perfil)
                  }}
                >
                  <User size={16} />
                  Mi perfil
                </button>

                <button
                  className="px-menuItem"
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setUserOpen(false)
                    router.push('/(app)/actividad')
                  }}
                >
                  <Activity size={16} />
                  Mi actividad
                </button>

                <button
                  className="px-menuItem"
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setUserOpen(false)
                    router.push('/(app)/ajustes')
                  }}
                >
                  <Settings size={16} />
                  Ajustes
                </button>

                <div className="px-menuSep" />

                <button
                  className="px-menuItem px-menuItem--danger"
                  role="menuitem"
                  type="button"
                  onClick={onLogout}
                >
                  <LogOut size={16} />
                  Cerrar sesión
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  )
}
