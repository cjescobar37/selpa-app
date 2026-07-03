'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React, { useEffect, useMemo, useState } from 'react'

// Si ya tenés lucide, perfecto. Si no, reemplazalos por texto simple o tus íconos.
import { ChevronDown, Search, Bell, Mail } from 'lucide-react'

// 🔁 AJUSTÁ ESTO a tu proyecto:
// - Si ya tenés SessionProvider, importá el hook real.
// - Si tu hook tiene otro nombre/shape, adaptá abajo donde lo uso.
import { useSession } from '@/components/session/SessionProvider'

// 🔁 AJUSTÁ ESTO a tu proyecto:
// import { NAV_CONFIG } from '@/components/nav/navConfig'
import { NAV_CONFIG } from '@/lib/navConfig'
import { BRAND } from '@/lib/branding'

type Role = 'guest' | 'player' | 'club' | 'platform'

type NavChild = { label: string; href: string }
type NavItem = { label: string; href: string; dot?: boolean; exact?: boolean; children?: NavChild[] }

type RightConfig = {
  search?: boolean
  notifications?: boolean
  messages?: boolean
  userMenu?: boolean
}

type NavConfig = {
  leftMode: 'brand' | 'club'
  main: NavItem[]
  right: RightConfig
}

function normalizePath(p?: string) {
  if (!p) return '/'
  return p.length > 1 ? p.replace(/\/+$/, '') : p
}

function isActiveHref(pathname: string | null, href: string, exact?: boolean) {
  const p = normalizePath(pathname || '/')
  const h = normalizePath(href)
  if (exact) return p === h
  return p === h || p.startsWith(h + '/')
}

function isActiveItem(pathname: string | null, item: NavItem) {
  if (isActiveHref(pathname, item.href, item.exact)) return true
  if (item.children?.length) {
    return item.children.some((c) => isActiveHref(pathname, c.href))
  }
  return false
}

export default function AppNavbarClient() {
  const pathname = usePathname()

  // ---- Session / Role ----
  const { role, user, activeClub, signOut } = useSession() as any
  const safeRole: Role = (role as Role) || 'guest'

  const cfg: NavConfig = useMemo(() => {
    const c = (NAV_CONFIG as any)[safeRole] as NavConfig
    return c
  }, [safeRole])

  const nav = cfg.main

  // ---- Dropdown open states ----
  const [navOpenIndex, setNavOpenIndex] = useState<number | null>(null)
  const [userOpen, setUserOpen] = useState(false)
  const [clubOpen, setClubOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Cerrar dropdowns al navegar
  useEffect(() => {
    setNavOpenIndex(null)
    setUserOpen(false)
    setClubOpen(false)
    setMobileOpen(false)
  }, [pathname])

  // ---- Helpers ----
  const showRight = cfg.right || {}
  const isAuthed = safeRole !== 'guest'

  // ---- Render helpers (Left) ----
  const LeftBlock = () => {
    if (cfg.leftMode === 'club') {
      return (
        <div className="px-left">
          <button
            type="button"
            className="px-clubBtn"
            onClick={() => setClubOpen((v) => !v)}
            onMouseEnter={() => setClubOpen(true)}
            onMouseLeave={() => setClubOpen(false)}
          >
            <span className="px-clubLogo" aria-hidden="true">
              {/* si tenés logo real, acá va */}
              {activeClub?.logo ? <img src={activeClub.logo} alt="" /> : null}
            </span>
            <span className="px-clubName">{activeClub?.name || 'Mi Club'}</span>
            <ChevronDown size={14} className="px-caret" />
          </button>

          {clubOpen ? (
            <div className="px-navDropdown" role="menu">
              {/* Ajustá rutas según tu app */}
              <Link className="px-ddItem" href="/club/ver">Ver club</Link>
              <Link className="px-ddItem" href="/player/club">Cambiar club</Link>
              <Link className="px-ddItem" href="/club/info">Info del club</Link>
            </div>
          ) : null}
        </div>
      )
    }

    // brand
    return (
      <div className="px-left">
        <Link href="/" className="px-brand">
          <span className="px-brandLogo" aria-hidden="true" />
          <span className="px-brandText">{BRAND.name}</span>
        </Link>
      </div>
    )
  }

  // ---- Render helpers (Right) ----
  const RightBlock = () => {
    return (
      <div className="px-right">
        {showRight.search ? (
          <Link className="px-iconBtn" href="/buscar" aria-label="Buscar">
            <Search size={18} />
          </Link>
        ) : null}

        {showRight.notifications ? (
          <Link className="px-iconBtn" href={isAuthed ? `/${safeRole}/notificaciones` : '/auth/login'} aria-label="Notificaciones">
            <Bell size={18} />
          </Link>
        ) : null}

        {showRight.messages ? (
          <Link className="px-iconBtn" href={isAuthed ? `/${safeRole}/mensajes` : '/auth/login'} aria-label="Mensajes">
            <Mail size={18} />
          </Link>
        ) : null}

        {!isAuthed ? (
          <Link className="px-loginBtn" href="/auth/login">
            LOGIN
          </Link>
        ) : (
          <div
            className="px-userWrap"
            onMouseEnter={() => setUserOpen(true)}
            onMouseLeave={() => setUserOpen(false)}
          >
            <button type="button" className="px-userBtn" onClick={() => setUserOpen((v) => !v)}>
              <span className="px-avatar" aria-hidden="true">
                {user?.avatar ? <img src={user.avatar} alt="" /> : null}
              </span>
              <span className="px-userName">{user?.name || 'Usuario'}</span>
              <ChevronDown size={14} className="px-caret" />
            </button>

            {userOpen ? (
              <div className="px-navDropdown px-navDropdown--right" role="menu">
                <Link className="px-ddItem" href={`/${safeRole}/perfil`}>Mi perfil</Link>
                <Link className="px-ddItem" href={`/${safeRole}/actividad`}>Mi actividad</Link>
                <Link className="px-ddItem" href={`/${safeRole}/preferencias`}>Preferencias</Link>
                <button className="px-ddItem px-ddItem--danger" onClick={signOut}>
                  Cerrar sesión
                </button>
              </div>
            ) : null}
          </div>
        )}

        <button
          type="button"
          className="px-burger px-mobileOnly"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Menú"
        >
          ☰
        </button>
      </div>
    )
  }

  return (
    <header className="px-nav">
      <div className="px-navgrid">
        <LeftBlock />

        {/* CENTER NAV (desktop) */}
        <nav className="px-navlinks px-navlinks--center px-desktopOnly" aria-label="Primary">
          {nav.map((item, i) => {
            const active = isActiveItem(pathname, item)
            const hasChildren = !!item.children?.length

            return (
              <div
                key={item.href}
                className="px-navItem"
                onMouseEnter={() => { if (hasChildren) setNavOpenIndex(i) }}
                onMouseLeave={() => { if (hasChildren) setNavOpenIndex((cur) => (cur === i ? null : cur)) }}
              >
                <Link
                  href={item.href}
                  className={['px-navlink', active ? 'px-navlink--active' : ''].join(' ')}
                >
                  {item.label}
                  {hasChildren ? <ChevronDown size={14} className="px-caret" /> : null}
                  {item.dot ? <span className="px-dot" aria-hidden="true" /> : null}
                </Link>

                {hasChildren && navOpenIndex === i ? (
                  <div className="px-navDropdown" role="menu">
                    {item.children!.map((c) => (
                      <Link
                        key={c.href}
                        href={c.href}
                        className={[
                          'px-ddItem',
                          isActiveHref(pathname, c.href) ? 'is-active' : '',
                        ].join(' ')}
                        onClick={() => setNavOpenIndex(null)}
                      >
                        {c.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
        </nav>

        <RightBlock />
      </div>

      {/* MOBILE NAV */}
      {mobileOpen ? (
        <div className="px-mobileMenu px-mobileOnly">
          {nav.map((item) => {
            const active = isActiveItem(pathname, item)
            return (
              <div key={item.href} className="px-mobileRow">
                <Link className={['px-mobileLink', active ? 'is-active' : ''].join(' ')} href={item.href}>
                  {item.label}
                </Link>

                {item.children?.length ? (
                  <div className="px-mobileChildren">
                    {item.children.map((c) => (
                      <Link
                        key={c.href}
                        className={['px-mobileChild', isActiveHref(pathname, c.href) ? 'is-active' : ''].join(' ')}
                        href={c.href}
                      >
                        {c.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
    </header>
  )
}
