'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, Mail, Search, ChevronDown, Menu, X } from 'lucide-react'

import { NAV_CONFIG, type NavItem } from '@/lib/navConfig'
import { useSession } from '@/components/session/SessionProvider'
import { getClubInitials } from '@/lib/clubAssets'
import { supabase } from '@/lib/supabaseClient'

type PreviewNotification = {
  id: string
  type: string
  title: string
  message: string
  read: boolean
  link: string | null
  created_at: string
  metadata?: Record<string, any> | null
}

function shorten(text?: string, max = 16) {
  const value = (text || '').trim()
  if (!value) return ''
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function normalizePath(p?: string | null) {
  const raw = (p ?? '/').split('#')[0].split('?')[0]
  return raw.length > 1 ? raw.replace(/\/+$/, '') : raw
}

function isActiveHref(pathname: string | null, href: string, exact?: boolean) {
  const p = normalizePath(pathname)
  const h = normalizePath(href)
  if (exact) return p === h
  if (h === '/') return p === '/'
  return p === h || p.startsWith(h + '/')
}

function isActiveItem(pathname: string | null, item: NavItem) {
  if (isActiveHref(pathname, item.href, item.exact)) return true
  if (item.children?.length) {
    return item.children.some((c) => isActiveHref(pathname, c.href, true))
  }
  return false
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return value
  }
}

function previewText(value: string, max = 78) {
  const clean = (value || '').replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 1)}…`
}

export default function AppNavbarClient() {
  const pathname = usePathname()
  const router = useRouter()
  const rootRef = useRef<HTMLDivElement | null>(null)

  const navCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearNavCloseTimeout() {
    if (navCloseTimeoutRef.current) {
      clearTimeout(navCloseTimeoutRef.current)
      navCloseTimeoutRef.current = null
    }
  }

  function openDesktopMenu(index: number) {
    clearNavCloseTimeout()
    setNavOpenIndex(index)
  }

  function closeDesktopMenuDelayed(index?: number) {
    clearNavCloseTimeout()
    navCloseTimeoutRef.current = setTimeout(() => {
      setNavOpenIndex((cur) => {
        if (typeof index === 'number') {
          return cur === index ? null : cur
        }
        return null
      })
    }, 180)
  }

  const { role, user, activeClub, clubs, setActiveClub, signOut } = useSession()
  const cfg = useMemo(() => NAV_CONFIG[role || 'guest'], [role])
  const nav = cfg.main as NavItem[]

  const [navOpenIndex, setNavOpenIndex] = useState<number | null>(null)
  const [userOpen, setUserOpen] = useState(false)
  const [clubOpen, setClubOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notificationPreview, setNotificationPreview] = useState<PreviewNotification[]>([])
  const [previewModal, setPreviewModal] = useState<PreviewNotification | null>(null)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [unreadMessages, setUnreadMessages] = useState(0)

  const isAuthed = (role || 'guest') !== 'guest'
  const showRight = cfg.right || {}
  const displayClub = activeClub ?? clubs?.[0] ?? null
  const displayClubName = displayClub?.name?.trim() ? displayClub.name : 'Mi Club'

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (!rootRef.current) return
      if (!rootRef.current.contains(target)) {
        setNavOpenIndex(null)
        setUserOpen(false)
        setClubOpen(false)
        setMobileMenuOpen(false)
        setNotificationsOpen(false)
      }
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNavOpenIndex(null)
        setUserOpen(false)
        setClubOpen(false)
        setMobileMenuOpen(false)
        setNotificationsOpen(false)
        setPreviewModal(null)
      }
    }

    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)

    return () => {
      clearNavCloseTimeout()
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  useEffect(() => {
    clearNavCloseTimeout()
    setNavOpenIndex(null)
    setUserOpen(false)
    setClubOpen(false)
    setMobileMenuOpen(false)
    setNotificationsOpen(false)
    setPreviewModal(null)
  }, [pathname])

  async function loadPreviewData() {
    if (!isAuthed || !user?.id) {
      setUnreadNotifications(0)
      setUnreadMessages(0)
      setNotificationPreview([])
      return
    }

    const [{ count: nCount }, { count: mCount }, previewRes] = await Promise.all([
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .neq('type', 'message')
        .eq('read', false),
      supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_user_id', user.id)
        .eq('read', false),
      supabase
        .from('notifications')
        .select('id, type, title, message, read, link, created_at, metadata')
        .eq('user_id', user.id)
        .neq('type', 'message')
        .order('created_at', { ascending: false })
        .limit(3),
    ])

    setUnreadNotifications(nCount ?? 0)
    setUnreadMessages(mCount ?? 0)
    if (!previewRes.error) {
      setNotificationPreview((previewRes.data ?? []) as PreviewNotification[])
    }
  }

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!alive) return
      await loadPreviewData()
    })()
    return () => {
      alive = false
    }
  }, [isAuthed, pathname, user?.id])

  function closeAllMenus() {
    setNavOpenIndex(null)
    setUserOpen(false)
    setClubOpen(false)
    setMobileMenuOpen(false)
    setNotificationsOpen(false)
  }

  async function openNotification(item: PreviewNotification) {
    if (!item.read) {
      await supabase.from('notifications').update({ read: true }).eq('id', item.id)
      setNotificationPreview((cur) => cur.map((n) => (n.id === item.id ? { ...n, read: true } : n)))
      setUnreadNotifications((cur) => Math.max(0, cur - 1))
    }

    setNotificationsOpen(false)

    if (item.link) {
      router.push(item.link)
      return
    }

    setPreviewModal(item)
  }

  function ClubLogo() {
    const [broken, setBroken] = useState(false)
    if (displayClub?.logoUrl && !broken) {
      return <img src={displayClub.logoUrl} alt="" onError={() => setBroken(true)} />
    }
    return <span>{getClubInitials(displayClubName)}</span>
  }

  function UserAvatar() {
    const [broken, setBroken] = useState(false)
    if (user?.avatarUrl && !broken) {
      return <img src={user.avatarUrl} alt="" onError={() => setBroken(true)} />
    }
    return <span>{getClubInitials(user?.name || 'Usuario')}</span>
  }

  function renderUserMenu() {
    if (!userOpen) return null

    if (role === 'club') {
      return (
        <div className="px-navDropdown px-navDropdown--right" role="menu">
          <Link className="px-ddItem" href="/club/configuracion">Configuración del club</Link>
          <Link className="px-ddItem" href="/ajustes">Preferencias</Link>
          <button className="px-ddItem px-ddItem--danger" onClick={signOut}>Cerrar sesión</button>
        </div>
      )
    }

    if (role === 'platform') {
      return (
        <div className="px-navDropdown px-navDropdown--right" role="menu">
          <Link className="px-ddItem" href="/platform/configuracion">Configuración de la plataforma</Link>
          <Link className="px-ddItem" href="/platform/logs">Auditoría</Link>
          <button className="px-ddItem px-ddItem--danger" onClick={signOut}>Cerrar sesión</button>
        </div>
      )
    }

    return (
      <div className="px-navDropdown px-navDropdown--right" role="menu">
        <Link className="px-ddItem" href="/perfil">Mi perfil</Link>
        <Link className="px-ddItem" href="/actividad">Mi actividad</Link>
        <Link className="px-ddItem" href="/ajustes">Preferencias</Link>
        <button className="px-ddItem px-ddItem--danger" onClick={signOut}>Cerrar sesión</button>
      </div>
    )
  }

  function renderClubMenu() {
    if (!clubOpen) return null

    const isPlayer = role === 'player'

    return (
      <div className="px-navDropdown px-navDropdown--club" role="menu">
        {isPlayer ? (
          <>
            <Link className="px-ddItem" href="/clubs">Ver clubes activos</Link>
            <Link className="px-ddItem" href="/seleccionar-club">Seleccionar club</Link>
          </>
        ) : (
          <>
            <Link className="px-ddItem" href="/club">Info del club</Link>
            <Link className="px-ddItem" href="/seleccionar-club">Cambiar club</Link>
          </>
        )}
        {clubs.length > 0 ? <div className="px-ddSep" /> : null}
        {clubs.map((club) => (
          <button
            key={club.id}
            className={`px-ddItem ${club.id === displayClub?.id ? 'is-active' : ''}`}
            onClick={async () => {
              await setActiveClub(club.id)
              setClubOpen(false)
            }}
          >
            {club.name}
          </button>
        ))}
      </div>
    )
  }

  function renderDesktopLeft() {
    if (cfg.leftMode === 'club' || cfg.leftMode === 'club-static') {
      return (
        <div className="px-left">
          <div className="px-dd px-clubWrap">
            <button
              type="button"
              className="px-clubBtn"
              onClick={cfg.leftMode === 'club' ? () => setClubOpen((v) => !v) : undefined}
              style={cfg.leftMode === 'club-static' ? { cursor: 'default' } : undefined}
            >
              <span className="px-clubLogo" aria-hidden="true"><ClubLogo /></span>
              <span className="px-clubName">{shorten(displayClubName, 16)}</span>
              {cfg.leftMode === 'club' ? <ChevronDown size={16} className="px-caret" /> : null}
            </button>
            {cfg.leftMode === 'club' ? renderClubMenu() : null}
          </div>
        </div>
      )
    }

    return (
      <div className="px-left">
        <Link href="/" className="px-brand">
          <span className="px-brandLogo" aria-hidden="true">PX</span>
          <span className="px-brandText">PAMPRAX</span>
        </Link>
      </div>
    )
  }

  function renderDesktopCenter() {
    return (
      <nav className="px-navlinks" aria-label="Primary">
        {nav.map((item, i) => {
          const active = isActiveItem(pathname, item)
          const hasChildren = !!item.children?.length

          if (!hasChildren) {
            return (
              <Link key={item.href} href={item.href} className={`px-navlink ${active ? 'active' : ''}`}>
                {item.label}
                {item.dot ? <span className="px-dot" aria-hidden="true" /> : null}
              </Link>
            )
          }

          const isOpen = navOpenIndex === i

          return (
            <div
              key={item.href}
              className={`px-navItem px-navItem--hasDropdown ${isOpen ? 'is-open' : ''}`}
              onMouseEnter={() => openDesktopMenu(i)}
              onMouseLeave={() => closeDesktopMenuDelayed(i)}
              onFocus={() => openDesktopMenu(i)}
              onBlur={() => closeDesktopMenuDelayed(i)}
              data-open={isOpen ? 'true' : 'false'}
            >
              <button
                type="button"
                className={`px-navlink ${active ? 'active' : ''}`}
                aria-expanded={isOpen}
              >
                {item.label}
                <ChevronDown size={14} className="px-caret" />
              </button>

              <div
                className="px-navDropdown"
                role="menu"
                onMouseEnter={() => openDesktopMenu(i)}
                onMouseLeave={() => closeDesktopMenuDelayed(i)}
              >
                {item.children!.map((c) => (
                  <Link
                    key={c.href}
                    href={c.href}
                    className={`px-ddItem ${isActiveHref(pathname, c.href) ? 'is-active' : ''}`}
                    onClick={() => {
                      clearNavCloseTimeout()
                      setNavOpenIndex(null)
                    }}
                  >
                    {c.label}
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
      </nav>
    )
  }

  function renderNotificationsDropdown() {
    if (!notificationsOpen) return null

    return (
      <div className="px-navDropdown px-navDropdown--right px-notifPreview" role="menu">
        <div className="px-notifPreview__head">
          <strong>Notificaciones</strong>
          <Link href="/notificaciones" className="px-link" onClick={() => setNotificationsOpen(false)}>Ver todas</Link>
        </div>

        {notificationPreview.length === 0 ? (
          <div className="px-notifPreview__empty">No tenés notificaciones nuevas.</div>
        ) : (
          notificationPreview.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`px-notifPreview__item ${item.read ? 'is-read' : 'is-unread'}`}
              onClick={() => openNotification(item)}
            >
              <div className="px-notifPreview__row">
                <div className="px-notifPreview__title">{item.title}</div>
                <div className="px-notifPreview__date">{formatDate(item.created_at)}</div>
              </div>
              <div className="px-notifPreview__msg">{previewText(item.message)}</div>
            </button>
          ))
        )}
      </div>
    )
  }

  function renderDesktopRight() {
    return (
      <div className="px-right">
        <div className="px-icons">
          {showRight.search ? (
            <button className="px-iconBtn" aria-label="Buscar" onClick={() => router.push('/buscar')}><Search size={18} /></button>
          ) : null}
          {showRight.notifications ? (
            <div className="px-dd" style={{ position: 'relative' }}>
              <button className="px-iconBtn" aria-label="Notificaciones" onClick={async () => { await loadPreviewData(); setNotificationsOpen((v) => !v) }}>
                <Bell size={18} />
                {unreadNotifications > 0 ? <span className="px-iconBadge">{unreadNotifications > 99 ? '99+' : unreadNotifications}</span> : null}
              </button>
              {renderNotificationsDropdown()}
            </div>
          ) : null}
          {showRight.messages ? (
            <Link className="px-iconBtn" href="/mensajes" aria-label="Mensajes">
              <Mail size={18} />
              {unreadMessages > 0 ? <span className="px-iconBadge">{unreadMessages > 99 ? '99+' : unreadMessages}</span> : null}
            </Link>
          ) : null}
        </div>

        {!isAuthed ? (
          <Link className="px-loginBtn" href="/login">Login</Link>
        ) : (
          <div className="px-userWrap px-dd">
            <button type="button" className="px-userBtn" onClick={() => setUserOpen((v) => !v)}>
              <span className="px-avatar" aria-hidden="true"><UserAvatar /></span>
              <span className="px-userName">{shorten(user?.name || 'Usuario', 14)}</span>
              <ChevronDown size={16} className="px-caret" />
            </button>
            {renderUserMenu()}
          </div>
        )}
      </div>
    )
  }

  function renderMobileLeft() {
    if (role === 'guest') {
      return (
        <Link href="/" className="px-mobileBrand" aria-label="PAMPRAX">
          <span className="px-brandLogo" aria-hidden="true">PX</span>
        </Link>
      )
    }

    if (role === 'platform') {
      return <div className="px-mobileBadge">Platform</div>
    }

    return (
      <div className="px-dd px-clubWrap px-mobileClubWrap">
        <button type="button" className="px-mobileClubBtn" onClick={() => setClubOpen((v) => !v)} aria-label="Club activo">
          <span className="px-clubLogo" aria-hidden="true"><ClubLogo /></span>
          <ChevronDown size={14} className="px-caret" />
        </button>
        {renderClubMenu()}
      </div>
    )
  }

  function renderMobileCenter() {
    if (role === 'guest') {
      return <Link className="px-loginBtn px-mobileLogin" href="/login">Login</Link>
    }

    return (
      <button
        type="button"
        className="px-burger"
        onClick={() => {
          setMobileMenuOpen((v) => !v)
          setUserOpen(false)
          setClubOpen(false)
          setNotificationsOpen(false)
        }}
        aria-label="Abrir menú"
        aria-expanded={mobileMenuOpen}
      >
        {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
      </button>
    )
  }

  function renderMobileRight() {
    if (role === 'guest') {
      return (
        <div className="px-mobileActions">
          <button className="px-iconBtn" aria-label="Buscar" onClick={() => router.push('/buscar')}><Search size={17} /></button>
          <button
            type="button"
            className="px-burger"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Abrir menú"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      )
    }

    return (
      <div className="px-mobileActions">
        {showRight.messages ? (
          <Link className="px-iconBtn" href="/mensajes" aria-label="Mensajes">
            <Mail size={17} />
            {unreadMessages > 0 ? <span className="px-iconBadge">{unreadMessages > 99 ? '99+' : unreadMessages}</span> : null}
          </Link>
        ) : null}
        {showRight.notifications ? (
          <Link className="px-iconBtn" href="/notificaciones" aria-label="Notificaciones">
            <Bell size={17} />
            {unreadNotifications > 0 ? <span className="px-iconBadge">{unreadNotifications > 99 ? '99+' : unreadNotifications}</span> : null}
          </Link>
        ) : null}
        <div className="px-userWrap px-dd">
          <button type="button" className="px-mobileUserBtn" onClick={() => setUserOpen((v) => !v)} aria-label="Mi cuenta">
            <span className="px-avatar" aria-hidden="true"><UserAvatar /></span>
            <ChevronDown size={14} className="px-caret" />
          </button>
          {renderUserMenu()}
        </div>
      </div>
    )
  }

  function renderMobileMenu() {
    if (!mobileMenuOpen) return null

    const items = nav
    return (
      <div className="px-mobileMenu" role="dialog" aria-label="Menú móvil">
        {role !== 'guest' ? (
          <button className="px-mobileLink" type="button" onClick={() => { closeAllMenus(); router.push('/buscar') }}>
            Buscar
          </button>
        ) : null}

        {items.map((item) => (
          <div key={item.href} className="px-mobileRow">
            <Link className={`px-mobileLink ${isActiveItem(pathname, item) ? 'is-active' : ''}`} href={item.href} onClick={closeAllMenus}>
              {item.label}
            </Link>
            {item.children?.length ? (
              <div className="px-mobileChildren">
                {item.children.map((child) => (
                  <Link
                    key={child.href}
                    className={`px-mobileChild ${isActiveHref(pathname, child.href, true) ? 'is-active' : ''}`}
                    href={child.href}
                    onClick={closeAllMenus}
                  >
                    {child.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    )
  }

  return (
    <>
      <header className="px-nav" ref={rootRef}>
        <div className="px-navgrid px-desktopBar">
          {renderDesktopLeft()}
          {renderDesktopCenter()}
          {renderDesktopRight()}
        </div>

        <div className="px-mobileBar">
          <div className="px-mobileBar__left">{renderMobileLeft()}</div>
          <div className="px-mobileBar__center">{renderMobileCenter()}</div>
          <div className="px-mobileBar__right">{renderMobileRight()}</div>
        </div>

        {renderMobileMenu()}
      </header>

      {previewModal ? (
        <div className="px-overlay" onClick={() => setPreviewModal(null)}>
          <div className="px-modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="px-modalHead">
              <div>
                <h3 className="px-modalTitle">{previewModal.title}</h3>
                <div className="px-modalSub">{formatDate(previewModal.created_at)}</div>
              </div>
              <button type="button" className="px-btn px-btn--ghost" onClick={() => setPreviewModal(null)}>Cerrar</button>
            </div>
            <div className="px-modalBodyText">{previewModal.message}</div>
          </div>
        </div>
      ) : null}
    </>
  )
}
