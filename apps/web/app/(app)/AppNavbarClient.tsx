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
  Menu,
  X,
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
  const [mobileOpen, setMobileOpen] = useState(false)

  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onScroll = () => {
      const scrolled = window.scrollY > 8
      document.querySelector('.px-navbar')?.classList.toggle('px-navbar--scrolled', scrolled)
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
        setMobileOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  useEffect(() => {
    // al cambiar de ruta, cerramos todo
    setMobileOpen(false)
    setClubOpen(false)
    setUserOpen(false)
  }, [pathname])

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
      {/* ======================
          LEFT (mobile: burger + club) | (desktop: club)
         ====================== */}
      <div className="px-left">
        {/* BURGER SOLO MOBILE (izquierda) */}
        <button
          className="px-burgerBtn px-mobileOnly"
          type="button"
          aria-label="Abrir menú"
          onClick={() => setMobileOpen(true)}
        >
          <Menu size={18} />
        </button>

        {/* CLUB (se ve en ambos, pero en mobile lo compactamos por CSS) */}
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
                  {c.id === activeClub.id ? <span className="px-pill">Activo</span> : null}
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

      {/* ======================
          DESKTOP nav links
         ====================== */}
      <nav className="px-navlinks px-navlinks--center px-desktopOnly" aria-label="Primary">
        {nav.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={['px-navlink', isActive(item.href) ? 'px-navlink--active' : ''].join(' ')}
          >
            {item.label}
            {item.dot ? <span className="px-dot" aria-hidden="true" /> : null}
          </Link>
        ))}
      </nav>

      {/* ======================
          RIGHT
         ====================== */}
      <div className="px-right">
        {/* ICONOS SOLO DESKTOP */}
        <div className="px-icons px-desktopOnly">
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

        {/* USER (en mobile queda compacto por CSS) */}
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
                Preferencias
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

    {/* DRAWER MOBILE */}
    {mobileOpen ? (
      <div className="px-drawerBackdrop" role="presentation" onClick={() => setMobileOpen(false)}>
        <aside
          className="px-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Menú"
          onClick={e => e.stopPropagation()}
        >
          <div className="px-drawerTop">
            <div className="px-drawerTitle">Menú</div>
            <button
              className="px-drawerClose"
              type="button"
              aria-label="Cerrar"
              onClick={() => setMobileOpen(false)}
            >
              <X size={18} />
            </button>
          </div>

          <div className="px-drawerSection">
            <div className="px-drawerSectionTitle">Navegación</div>
            {nav.map(item => (
              <button
                key={item.href}
                className={['px-drawerItem', isActive(item.href) ? 'px-drawerItem--active' : ''].join(' ')}
                type="button"
                onClick={() => router.push(item.href)}
              >
                {item.label}
                {item.dot ? <span className="px-dot" aria-hidden="true" /> : null}
              </button>
            ))}
          </div>

          <div className="px-drawerSection">
            <div className="px-drawerSectionTitle">Acciones</div>
            <button className="px-drawerItem" type="button">
              <Bell size={16} />
              Notificaciones {notifCount > 0 ? <span className="px-pill">{notifCount}</span> : null}
            </button>
            <button className="px-drawerItem" type="button">
              <Mail size={16} />
              Mensajes {mailCount > 0 ? <span className="px-pill">{mailCount}</span> : null}
            </button>
            <button className="px-drawerItem" type="button">
              <Search size={16} />
              Buscar
            </button>
          </div>
        </aside>
      </div>
    ) : null}
  </header>
)

}
