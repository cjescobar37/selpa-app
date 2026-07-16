'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  Bell,
  BookOpen,
  CalendarDays,
  ChevronDown,
  CircleUserRound,
  Compass,
  Home,
  LogOut,
  Mail,
  Medal,
  Menu,
  Newspaper,
  Radio,
  Search,
  Settings,
  Trophy,
  X,
} from 'lucide-react'

import { NAV_CONFIG, type NavChild, type NavItem } from '@/lib/navConfig'
import { useSession } from '@/components/session/SessionProvider'
import { getClubInitials } from '@/lib/clubAssets'
import { hasAnyClubPermission } from '@/lib/clubPermissions'
import { getClubTheme } from '@/lib/clubThemes'
import { supabase } from '@/lib/supabaseClient'
import { BRAND } from '@/lib/branding'

const SELPA_WORDMARK = '/brand/selpa-wordmark-clean.png'

type PreviewNotification = {
  id: string
  type: string
  title: string
  message: string
  read: boolean
  link: string | null
  href?: string | null
  created_at: string
  metadata?: Record<string, any> | null
}

type PreviewThread = {
  id: string
  subject: string
  updated_at: string
  player: { name: string; avatar_url: string | null } | null
  club: { name: string; logo_url: string | null } | null
  latest_message: { body: string; created_at: string; sender_name: string } | null
  unread_count: number
}

type NavbarOverlay = 'club' | 'player' | 'messages' | 'notifications' | null

function shorten(text?: string, max = 16) {
  const value = (text || '').trim()
  if (!value) return ''
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function getMobileClubLabel(text?: string) {
  const value = (text || '').trim().replace(/\s+/g, ' ')
  if (!value) return ''
  if (value.length <= 10) return value

  const words = value.split(' ')
  const isGenericWord = (word: string) => ['club', 'padel', 'pádel', 'complejo', 'academia', 'escuela', 'centro'].includes(word.toLocaleLowerCase('es-AR'))
  const isShortCode = (word: string) => /^[A-Z0-9]{2,4}$/.test(word)

  if (words.length === 2 && words[0]?.toLocaleLowerCase('es-AR') === 'padel' && isShortCode(words[1] ?? '')) {
    return value
  }

  if (words.length >= 2 && isGenericWord(words[0] ?? '') && isShortCode(words[1] ?? '')) {
    return words[1] ?? value
  }

  const meaningful = words.filter((word) => !isGenericWord(word))
  const inferred = meaningful.length ? meaningful.join(' ') : words[0]
  if (inferred && inferred.length <= 10) return inferred
  const fallback = meaningful[0] || words[0] || value
  return fallback.length <= 9 ? `${fallback}…` : `${fallback.slice(0, 9).trim()}…`
}

function toTitleCaseName(text?: string) {
  return (text || 'Usuario')
    .trim()
    .toLocaleLowerCase('es-AR')
    .replace(/(^|\s|-)(\p{L})/gu, (match) => match.toLocaleUpperCase('es-AR'))
}

function getFirstVisibleName(text?: string) {
  return toTitleCaseName(text).split(/\s+/).filter(Boolean)[0] || 'Jugador'
}

function normalizePath(p?: string | null) {
  const raw = (p ?? '/').split('#')[0].split('?')[0]
  return raw.length > 1 ? raw.replace(/\/+$/, '') : raw
}

function getHrefQuery(href: string) {
  const query = href.split('?')[1]?.split('#')[0] ?? ''
  return new URLSearchParams(query)
}

function hasHrefQuery(href: string) {
  return href.includes('?') && getHrefQuery(href).toString().length > 0
}

function queryMatches(currentSearch: string, href: string) {
  const expected = getHrefQuery(href)
  if (!expected.toString()) return true

  const current = new URLSearchParams(currentSearch)
  for (const [key, value] of expected.entries()) {
    if (current.get(key) !== value) return false
  }
  return true
}

function isActiveHref(pathname: string | null, currentSearch: string, href: string, exact?: boolean) {
  const p = normalizePath(pathname)
  const h = normalizePath(href)
  if (exact) {
    if (p !== h) return false
    if (hasHrefQuery(href)) return queryMatches(currentSearch, href)
    return !currentSearch
  }
  if (h === '/') return p === '/'
  const pathMatches = p === h || p.startsWith(h + '/')
  return pathMatches && queryMatches(currentSearch, href)
}

function isActiveChild(pathname: string | null, currentSearch: string, child: NavChild) {
  if (child.activeMatch === 'none') return false
  return isActiveHref(pathname, currentSearch, child.href, child.activeMatch !== 'prefix')
}

function isActiveItem(pathname: string | null, currentSearch: string, item: NavItem) {
  if (isActiveHref(pathname, currentSearch, item.href, item.exact)) return true
  if (item.children?.length) {
    return item.children.some((c) => isActiveChild(pathname, currentSearch, c))
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

function relativeDate(value: string) {
  try {
    const diff = Date.now() - new Date(value).getTime()
    const minute = 60_000
    const hour = 60 * minute
    const day = 24 * hour
    if (diff < minute) return 'Ahora'
    if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))} min`
    if (diff < day) return `${Math.floor(diff / hour)} h`
    if (diff < day * 7) return `${Math.floor(diff / day)} d`
    return formatDate(value)
  } catch {
    return formatDate(value)
  }
}

function previewText(value: string, max = 78) {
  const clean = (value || '').replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 1)}…`
}

function notificationIconLabel(type: string) {
  const key = String(type ?? '').toLowerCase()
  if (key.includes('payment') || key.includes('pago')) return '$'
  if (key.includes('message') || key.includes('mensaje')) return 'M'
  if (key.includes('registration') || key.includes('inscrip')) return 'I'
  if (key.includes('cancel') || key.includes('baja')) return 'B'
  if (key.includes('club')) return 'C'
  return 'P'
}

function notificationGroup(type: string) {
  const key = String(type ?? '').toLowerCase()
  if (key.includes('payment') || key.includes('pago')) return 'payments'
  if (key.includes('registration') || key.includes('inscrip') || key.includes('tournament') || key.includes('torneo')) return 'tournaments'
  return 'other'
}

function messageScopeForRole(role: string | null | undefined): 'player' | 'club' | 'platform' {
  if (role === 'club') return 'club'
  if (role === 'platform') return 'platform'
  return 'player'
}

function isMissingColumnError(error: { code?: string; message?: string } | null | undefined) {
  const message = String(error?.message ?? '').toLowerCase()
  return error?.code === '42703' || error?.code === 'PGRST204' || message.includes('column') || message.includes('schema cache')
}

function messageHrefForRole(role: string | null | undefined) {
  if (role === 'club') return '/club/mensajes'
  if (role === 'platform') return '/platform/mensajes'
  if (role === 'player') return '/player/mensajes'
  return '/mensajes'
}

type NavSearchResult = {
  type: 'jugador' | 'torneo' | 'club' | 'noticia'
  title: string
  subtitle: string
  href: string
}

const searchTypeLabels: Record<NavSearchResult['type'], string> = {
  jugador: 'Jugadores',
  torneo: 'Torneos',
  club: 'Clubes',
  noticia: 'Noticias',
}

function canShowClubNavItem(clubRole: string | null | undefined, item: NavItem) {
  const required = item.requiredAnyCapabilities
  return !required?.length || hasAnyClubPermission(clubRole, required)
}

function filterClubNavItems(items: NavItem[], clubRole: string | null | undefined) {
  return items.reduce<NavItem[]>((acc, item) => {
    const children = item.children?.filter((child) => canShowClubNavItem(clubRole, child)) ?? []
    const canShowItem = canShowClubNavItem(clubRole, item)

    if (!canShowItem && children.length === 0) return acc

    acc.push({
      ...item,
      children: item.children ? children : undefined,
    })

    return acc
  }, [])
}

export default function AppNavbarClient() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const overlayTriggerRefs = useRef<Partial<Record<Exclude<NavbarOverlay, null>, HTMLButtonElement | null>>>({})

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

  const { role, clubRole, user, activeClub, clubs, setActiveClub, signOut } = useSession()
  const currentSearch = searchParams.toString()
  const cfg = useMemo(() => NAV_CONFIG[role || 'guest'], [role])

  const [navOpenIndex, setNavOpenIndex] = useState<number | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [navbarOverlay, setNavbarOverlay] = useState<NavbarOverlay>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<NavSearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [notificationPreview, setNotificationPreview] = useState<PreviewNotification[]>([])
  const [notificationFilter, setNotificationFilter] = useState<'all' | 'unread' | 'payments' | 'tournaments'>('all')
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [notificationError, setNotificationError] = useState('')
  const [messagePreview, setMessagePreview] = useState<PreviewThread[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messageError, setMessageError] = useState('')
  const [previewModal, setPreviewModal] = useState<PreviewNotification | null>(null)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [activeClubThemeKey, setActiveClubThemeKey] = useState<string | null>(null)
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null)
  const [playerCategory, setPlayerCategory] = useState<number | null>(null)

  const isAuthed = (role || 'guest') !== 'guest'
  const clubOpen = navbarOverlay === 'club'
  const userOpen = navbarOverlay === 'player'
  const messagesOpen = navbarOverlay === 'messages'
  const notificationsOpen = navbarOverlay === 'notifications'
  const showRight = cfg.right || {}
  const displayClub = activeClub ?? clubs?.[0] ?? null
  const isGlobalPublicNav = !isAuthed && !displayClub?.id
  const displayClubName = displayClub?.name?.trim() ? displayClub.name : 'Mi Club'
  const clubPublicHomeHref = displayClub?.id ? `/clubs/${displayClub.id}` : '/club'
  const nav = useMemo(() => {
    const items = cfg.main as NavItem[]
    const contextualItems = role === 'club'
      ? items.map((item) => item.label === 'Inicio' ? { ...item, href: clubPublicHomeHref } : item)
      : items
    return role === 'club' ? filterClubNavItems(contextualItems, clubRole) : contextualItems
  }, [cfg.main, clubPublicHomeHref, clubRole, role])
  const activeClubTheme = useMemo(() => getClubTheme(activeClubThemeKey), [activeClubThemeKey])
  const clubThemeStyle = useMemo(
    () => ({
      '--px-club-accent': activeClubTheme.vars.accent,
      '--px-club-accent-2': activeClubTheme.vars.accent2,
      '--px-club-soft': activeClubTheme.vars.soft,
      '--px-club-glow': activeClubTheme.vars.glow,
    }) as React.CSSProperties,
    [activeClubTheme]
  )

  const playerIdentityMeta = useMemo(() => {
    const category = playerCategory ? `${playerCategory}ta categoría` : null
    return [category, displayClubName].filter(Boolean).join(' · ')
  }, [displayClubName, playerCategory])

  const visibleNotifications = useMemo(() => {
    if (notificationFilter === 'unread') return notificationPreview.filter((item) => !item.read)
    if (notificationFilter === 'payments') return notificationPreview.filter((item) => notificationGroup(item.type) === 'payments')
    if (notificationFilter === 'tournaments') return notificationPreview.filter((item) => notificationGroup(item.type) === 'tournaments')
    return notificationPreview
  }, [notificationFilter, notificationPreview])

  function closeNavbarOverlay(restoreFocus = false) {
    const previousOverlay = navbarOverlay
    setNavbarOverlay(null)
    if (restoreFocus && previousOverlay) {
      window.requestAnimationFrame(() => overlayTriggerRefs.current[previousOverlay]?.focus())
    }
  }

  function toggleNavbarOverlay(nextOverlay: Exclude<NavbarOverlay, null>, trigger?: HTMLButtonElement | null) {
    if (trigger) overlayTriggerRefs.current[nextOverlay] = trigger
    setNavbarOverlay((current) => current === nextOverlay ? null : nextOverlay)
    setMobileMenuOpen(false)
    setSearchOpen(false)
  }

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--px-active-club-accent', activeClubTheme.vars.accent)
    root.style.setProperty('--px-club-accent', activeClubTheme.vars.accent)
    root.style.setProperty('--px-club-accent-2', activeClubTheme.vars.accent2)
    root.style.setProperty('--px-club-soft', activeClubTheme.vars.soft)
    root.style.setProperty('--px-club-glow', activeClubTheme.vars.glow)
    return () => {
      root.style.removeProperty('--px-active-club-accent')
      root.style.removeProperty('--px-club-accent')
      root.style.removeProperty('--px-club-accent-2')
      root.style.removeProperty('--px-club-soft')
      root.style.removeProperty('--px-club-glow')
    }
  }, [activeClubTheme.vars.accent, activeClubTheme.vars.accent2, activeClubTheme.vars.glow, activeClubTheme.vars.soft])

  useEffect(() => {
    let alive = true

    ;(async () => {
      if (!user?.id) {
        setProfileAvatarUrl(null)
        return
      }

      const { data } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('user_id', user.id)
        .maybeSingle()

      if (alive) {
        setProfileAvatarUrl((data?.avatar_url as string | null) ?? null)
      }
    })()

    return () => {
      alive = false
    }
  }, [user?.id])

  useEffect(() => {
    let alive = true

    ;(async () => {
      if (!displayClub?.id) {
        setActiveClubThemeKey(null)
        return
      }

      const { data } = await supabase
        .from('clubs')
        .select('theme_key')
        .eq('id', displayClub.id)
        .maybeSingle()

      if (alive) {
        setActiveClubThemeKey((data?.theme_key as string | null) ?? null)
      }
    })()

    return () => {
      alive = false
    }
  }, [displayClub?.id])

  useEffect(() => {
    let alive = true

    ;(async () => {
      if (role !== 'player' || !user?.id || !displayClub?.id) {
        setPlayerCategory(null)
        return
      }

      const { data } = await supabase
        .from('club_players')
        .select('category')
        .eq('club_id', displayClub.id)
        .eq('user_id', user.id)
        .maybeSingle()

      if (alive) setPlayerCategory(typeof data?.category === 'number' ? data.category : null)
    })()

    return () => {
      alive = false
    }
  }, [displayClub?.id, role, user?.id])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (!rootRef.current) return
      if (!rootRef.current.contains(target)) {
        setNavOpenIndex(null)
        setMobileMenuOpen(false)
        closeNavbarOverlay()
        setSearchOpen(false)
      }
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNavOpenIndex(null)
        setMobileMenuOpen(false)
        closeNavbarOverlay(true)
        setSearchOpen(false)
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
  }, [navbarOverlay])

  useEffect(() => {
    clearNavCloseTimeout()
    setNavOpenIndex(null)
    setMobileMenuOpen(false)
    setNavbarOverlay(null)
    setSearchOpen(false)
    setPreviewModal(null)
  }, [currentSearch, pathname])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const isMobile = window.matchMedia('(max-width: 980px)').matches
    const hasOverlay = mobileMenuOpen || Boolean(navbarOverlay) || searchOpen
    if (!isMobile || !hasOverlay) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [mobileMenuOpen, navbarOverlay, searchOpen])

  useEffect(() => {
    if (!searchOpen) return
    const timeout = window.setTimeout(() => searchInputRef.current?.focus(), 40)
    return () => window.clearTimeout(timeout)
  }, [searchOpen])

  async function loadPreviewData() {
    if (!isAuthed || !user?.id) {
      setUnreadNotifications(0)
      setUnreadMessages(0)
      setNotificationPreview([])
      return
    }

    setNotificationsLoading(true)
    setNotificationError('')

    const unreadNotificationsQuery = supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .neq('type', 'message')
      .eq('read', false)

    const previewNotificationsQuery = supabase
      .from('notifications')
      .select('id, type, title, message, read, link, href, created_at, metadata')
      .eq('user_id', user.id)
      .neq('type', 'message')
      .order('created_at', { ascending: false })
      .limit(10)

    const [{ count: nCount, error: notificationsCountError }, { count: mCount, error: messagesCountError }, previewInitialRes] = await Promise.all([
      unreadNotificationsQuery,
      supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_user_id', user.id)
        .eq('read', false),
      previewNotificationsQuery,
    ])
    let previewRes: any = previewInitialRes

    if (previewRes.error && isMissingColumnError(previewRes.error)) {
      previewRes = await supabase
        .from('notifications')
        .select('id, type, title, message, read, link, created_at, metadata')
        .eq('user_id', user.id)
        .neq('type', 'message')
        .order('created_at', { ascending: false })
        .limit(10)
    }

    setUnreadNotifications(nCount ?? 0)
    setUnreadMessages(mCount ?? 0)
    if (!previewRes.error && !notificationsCountError && !messagesCountError) {
      setNotificationPreview((previewRes.data ?? []) as PreviewNotification[])
    } else {
      setNotificationError('No pudimos cargar tus notificaciones. Intentá nuevamente.')
    }
    setNotificationsLoading(false)
  }

  async function loadMessagePreview() {
    if (!isAuthed || !user?.id) {
      setMessagePreview([])
      return
    }

    setMessagesLoading(true)
    setMessageError('')
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('Sesión inválida.')

      const response = await fetch(`/api/message-threads?scope=${messageScopeForRole(role)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error || 'No pudimos cargar tus mensajes.')
      setMessagePreview(((payload?.threads ?? []) as PreviewThread[]).slice(0, 4))
    } catch {
      setMessageError('No pudimos cargar tus conversaciones. Intentá nuevamente.')
    } finally {
      setMessagesLoading(false)
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
  }, [isAuthed, pathname, role, user?.id])

  function closeAllMenus() {
    setNavOpenIndex(null)
    setMobileMenuOpen(false)
    setNavbarOverlay(null)
    setSearchOpen(false)
  }

  function toggleSearch() {
    setSearchOpen((value) => !value)
    setNavOpenIndex(null)
    setMobileMenuOpen(false)
    setNavbarOverlay(null)
  }

  useEffect(() => {
    const q = searchQuery.trim()
    if (!searchOpen || q.length < 2) {
      setSearchResults([])
      setSearchLoading(false)
      return
    }

    let alive = true
    setSearchLoading(true)
    const timeout = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&context=${encodeURIComponent(role || 'guest')}`, {
          cache: 'no-store',
        })
        const data = await res.json().catch(() => [])
        if (alive) setSearchResults(Array.isArray(data) ? data : [])
      } catch {
        if (alive) setSearchResults([])
      } finally {
        if (alive) setSearchLoading(false)
      }
    }, 250)

    return () => {
      alive = false
      window.clearTimeout(timeout)
    }
  }, [role, searchOpen, searchQuery])

  function submitSearch() {
    const q = searchQuery.trim()
    if (!q) return
    const destination = searchResults[0]?.href
    if (!destination) return
    setSearchOpen(false)
    router.push(destination)
  }

  function openSearchResult(href: string) {
    setSearchOpen(false)
    router.push(href)
  }

  function renderSearchPanel() {
    if (!searchOpen) return null
    const groupedResults = searchResults.reduce<Record<string, NavSearchResult[]>>((acc, item) => {
      ;(acc[item.type] ??= []).push(item)
      return acc
    }, {})
    const orderedTypes: NavSearchResult['type'][] = ['jugador', 'torneo', 'club', 'noticia']

    return (
      <div className="px-searchPanel" role="search">
        <form
          className="px-searchBox"
          onSubmit={(event) => {
            event.preventDefault()
            submitSearch()
          }}
        >
          <Search size={17} aria-hidden="true" />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Buscar torneos, jugadores, clubes, noticias..."
            aria-label="Buscar torneos, jugadores, clubes, noticias"
          />
          <button type="button" onClick={() => { setSearchQuery(''); setSearchOpen(false) }} aria-label="Cerrar búsqueda">
            <X size={16} />
          </button>
        </form>
        {searchQuery.trim() ? (
          <div className="px-searchResults" aria-label="Resultados de búsqueda">
            {searchLoading ? <div className="px-searchEmpty">Buscando...</div> : null}
            {!searchLoading && searchQuery.trim().length >= 2 && searchResults.length ? orderedTypes.map((type) => {
              const items = groupedResults[type] ?? []
              if (!items.length) return null
              return (
                <div className="px-searchGroup" key={type}>
                  <span>{searchTypeLabels[type]}</span>
                  {items.map((item) => (
                    <button key={`${item.type}-${item.href}`} type="button" onClick={() => openSearchResult(item.href)}>
                      <strong>{item.title}</strong>
                      <small>{item.subtitle}</small>
                    </button>
                  ))}
                </div>
              )
            }) : null}
            {!searchLoading && searchQuery.trim().length >= 2 && !searchResults.length ? (
              <div className="px-searchEmpty">Sin resultados</div>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  async function openNotification(item: PreviewNotification) {
    if (!item.read) {
      await supabase.from('notifications').update({ read: true }).eq('id', item.id)
      setNotificationPreview((cur) => cur.map((n) => (n.id === item.id ? { ...n, read: true } : n)))
      setUnreadNotifications((cur) => Math.max(0, cur - 1))
    }

    setNavbarOverlay(null)

    const destination = item.href || item.link
    if (destination) {
      router.push(destination)
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
    const avatarSrc = profileAvatarUrl || user?.avatarUrl || null

    useEffect(() => {
      setBroken(false)
    }, [avatarSrc])

    if (avatarSrc && !broken) {
      return <img src={avatarSrc} alt="" onError={() => setBroken(true)} />
    }
    return <span>{getClubInitials(user?.name || 'Usuario')}</span>
  }

  function MessageAvatar({ thread }: { thread: PreviewThread }) {
    const source = thread.club?.logo_url || thread.player?.avatar_url || null
    const label = thread.club?.name || thread.player?.name || 'SELPA'
    if (source) return <img src={source} alt="" />
    return <span>{getClubInitials(label)}</span>
  }

  function renderUserMenu(mobile = false) {
    if (!userOpen) return null

    if (role === 'player' && mobile) {
      return (
        <div id="player-navbar-player-popover" className="px-navDropdown px-navDropdown--right px-playerUserMenu" role="menu" aria-label="Mi espacio">
          <div className="px-playerUserMenu__identity">
            <span className="px-avatar" aria-hidden="true"><UserAvatar /></span>
            <div>
              <strong>{toTitleCaseName(user?.name)}</strong>
              {user?.email ? <small>{user.email}</small> : null}
              {playerIdentityMeta ? <em>{playerIdentityMeta}</em> : null}
            </div>
          </div>
          <Link className="px-ddItem" href="/perfil" onClick={closeAllMenus}><CircleUserRound size={18} />Mi perfil</Link>
          <Link className="px-ddItem" href="/player/torneos" onClick={closeAllMenus}><Trophy size={18} />Mis torneos</Link>
          <Link className="px-ddItem" href="/player/ranking" onClick={closeAllMenus}><Medal size={18} />Mi ranking</Link>
          <Link className="px-ddItem" href="/actividad" onClick={closeAllMenus}><Activity size={18} />Mi actividad</Link>
          <Link className="px-ddItem" href="/ajustes" onClick={closeAllMenus}><Settings size={18} />Preferencias</Link>
          <div className="px-ddSep" />
          <button className="px-ddItem px-ddItem--danger" onClick={() => { closeAllMenus(); void signOut() }}><LogOut size={18} />Cerrar sesión</button>
        </div>
      )
    }

    if (role === 'club') {
      return (
        <div className="px-navDropdown px-navDropdown--right" role="menu">
          <Link className="px-ddItem" href="/club/configuracion">Preferencias</Link>
          <button className="px-ddItem px-ddItem--disabled" type="button" disabled>Auditoría / actividad <span>Próximamente</span></button>
          <Link className="px-ddItem" href="/club/usuarios">Seguridad y permisos</Link>
          <button className="px-ddItem px-ddItem--disabled" type="button" disabled>Soporte <span>Próximamente</span></button>
          <Link className="px-ddItem" href={clubPublicHomeHref}>Ver home pública del club</Link>
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
              closeAllMenus()
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
      const clubHomeContent = (
        <>
          <span className="px-clubLogo" aria-hidden="true"><ClubLogo /></span>
          <span className="px-clubName">{shorten(displayClubName, 18)}</span>
        </>
      )

      return (
        <div className="px-left">
          <div className="px-dd px-clubWrap">
            {cfg.leftMode === 'club-static' ? (
              <Link href={clubPublicHomeHref} className="px-clubBtn px-clubBtn--themed" style={clubThemeStyle} aria-label="Inicio público del club">
                {clubHomeContent}
              </Link>
            ) : (
              <button
                type="button"
                className="px-clubBtn px-clubBtn--themed"
                style={clubThemeStyle}
                aria-expanded={clubOpen}
                onClick={(event) => toggleNavbarOverlay('club', event.currentTarget)}
              >
                {clubHomeContent}
                <ChevronDown size={16} className="px-caret" />
              </button>
            )}
            {cfg.leftMode === 'club' ? renderClubMenu() : null}
          </div>
        </div>
      )
    }

    return (
      <div className="px-left">
        <Link href="/" className="px-brand">
          <img className="px-brandImage" src={SELPA_WORDMARK} alt={BRAND.name.toUpperCase()} />
        </Link>
      </div>
    )
  }

  function renderDesktopCenter() {
    return (
      <nav className="px-navlinks" aria-label="Primary">
        {nav.map((item, i) => {
          const active = isActiveItem(pathname, currentSearch, item)
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
                    className={`px-ddItem ${isActiveChild(pathname, currentSearch, c) ? 'is-active' : ''}`}
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

    const filters = [
      { key: 'all' as const, label: 'Todas', visible: true },
      { key: 'unread' as const, label: 'No leídas', visible: notificationPreview.some((item) => !item.read) },
      { key: 'payments' as const, label: 'Pagos', visible: notificationPreview.some((item) => notificationGroup(item.type) === 'payments') },
      { key: 'tournaments' as const, label: 'Torneos', visible: notificationPreview.some((item) => notificationGroup(item.type) === 'tournaments') },
    ]

    return (
      <div id="player-navbar-notifications-popover" className="px-navDropdown px-navDropdown--right px-notifPreview" role="menu" aria-label="Notificaciones">
        <div className="px-notifPreview__head">
          <strong>Notificaciones</strong>
          <Link href="/notificaciones" className="px-link" onClick={closeAllMenus}>Ver todas</Link>
        </div>
        {filters.filter((filter) => filter.visible).length > 1 ? (
          <div className="px-notifPreview__filters" aria-label="Filtrar notificaciones">
            {filters.filter((filter) => filter.visible).map((filter) => (
              <button key={filter.key} type="button" className={notificationFilter === filter.key ? 'is-active' : ''} onClick={() => setNotificationFilter(filter.key)}>{filter.label}</button>
            ))}
          </div>
        ) : null}
        {notificationsLoading ? <div className="px-notifPreview__status">Cargando notificaciones...</div> : null}
        {!notificationsLoading && notificationError ? <div className="px-notifPreview__status px-notifPreview__status--error">{notificationError}</div> : null}
        {!notificationsLoading && !notificationError && notificationPreview.length === 0 ? (
          <div className="px-notifPreview__empty">
            <span className="px-notifPreview__emptyIcon">N</span>
            <strong>No tenés notificaciones todavía.</strong>
            <p>Cuando haya novedades importantes van a aparecer acá.</p>
          </div>
        ) : null}
        {!notificationsLoading && !notificationError && notificationPreview.length > 0 && visibleNotifications.length === 0 ? (
          <div className="px-notifPreview__status">No hay notificaciones en este filtro.</div>
        ) : null}
        {!notificationsLoading && !notificationError ? visibleNotifications.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`px-notifPreview__item ${item.read ? 'is-read' : 'is-unread'}`}
              onClick={() => openNotification(item)}
            >
              <span className="px-notifPreview__icon" aria-hidden="true">{notificationIconLabel(item.type)}</span>
              <div className="px-notifPreview__body">
                <div className="px-notifPreview__row">
                  <div className="px-notifPreview__title">{item.title}</div>
                  <div className="px-notifPreview__date">{relativeDate(item.created_at)}</div>
                </div>
                <div className="px-notifPreview__msg">{previewText(item.message)}</div>
              </div>
              {!item.read ? <span className="px-notifPreview__dot" aria-label="No leída" /> : null}
            </button>
          )) : null}

        <Link href="/notificaciones" className="px-notifPreview__footer" onClick={closeAllMenus}>
          Ver todas las notificaciones
        </Link>
      </div>
    )
  }

  function openPreviewThread(thread: PreviewThread) {
    closeAllMenus()
    router.push(`${messageHrefForRole(role)}?thread=${encodeURIComponent(thread.id)}`)
  }

  function renderMessagesDropdown() {
    if (!messagesOpen) return null

    return (
      <div id="player-navbar-messages-popover" className="px-navDropdown px-navDropdown--right px-notifPreview px-messagePreview" role="menu" aria-label="Mensajes">
        <div className="px-notifPreview__head">
          <strong>Mensajes</strong>
          <Link href={messageHrefForRole(role)} className="px-link" onClick={closeAllMenus}>Ver todos</Link>
        </div>
        {messagesLoading ? <div className="px-notifPreview__status">Cargando mensajes...</div> : null}
        {!messagesLoading && messageError ? <div className="px-notifPreview__status px-notifPreview__status--error">{messageError}</div> : null}
        {!messagesLoading && !messageError && messagePreview.length === 0 ? (
          <div className="px-notifPreview__empty">
            <span className="px-notifPreview__emptyIcon">M</span>
            <strong>No tenés conversaciones recientes.</strong>
          </div>
        ) : null}
        {!messagesLoading && !messageError ? messagePreview.map((thread) => {
          const counterpart = role === 'player' ? thread.club?.name || 'Club' : thread.player?.name || 'Jugador'
          return (
            <button key={thread.id} type="button" className={`px-notifPreview__item ${thread.unread_count > 0 ? 'is-unread' : 'is-read'}`} onClick={() => openPreviewThread(thread)}>
              <span className="px-messagePreview__avatar" aria-hidden="true"><MessageAvatar thread={thread} /></span>
              <div className="px-notifPreview__body">
                <div className="px-notifPreview__row">
                  <div className="px-notifPreview__title">{counterpart}</div>
                  <div className="px-notifPreview__date">{relativeDate(thread.latest_message?.created_at || thread.updated_at)}</div>
                </div>
                <div className="px-notifPreview__msg">{previewText(thread.latest_message?.body || thread.subject)}</div>
              </div>
              {thread.unread_count > 0 ? <span className="px-notifPreview__dot" aria-label={`${thread.unread_count} sin leer`}>{thread.unread_count}</span> : null}
            </button>
          )
        }) : null}
        <Link href={messageHrefForRole(role)} className="px-notifPreview__footer" onClick={closeAllMenus}>Ver todos los mensajes</Link>
      </div>
    )
  }

  function renderDesktopRight() {
    return (
      <div className="px-right">
        <div className="px-icons">
          {showRight.search ? (
            <button className={`px-iconBtn ${searchOpen ? 'is-active' : ''}`} aria-label="Buscar" aria-expanded={searchOpen} onClick={toggleSearch}><Search size={18} /></button>
          ) : null}
          {showRight.notifications ? (
            <div className="px-dd" style={{ position: 'relative' }}>
              <button
                className="px-iconBtn"
                aria-label="Notificaciones"
                aria-expanded={notificationsOpen}
                aria-controls="player-navbar-notifications-popover"
                onClick={(event) => {
                  const shouldOpen = !notificationsOpen
                  toggleNavbarOverlay('notifications', event.currentTarget)
                  if (shouldOpen) void loadPreviewData()
                }}
              >
                <Bell size={18} />
                {unreadNotifications > 0 ? <span className="px-iconBadge">{unreadNotifications > 99 ? '99+' : unreadNotifications}</span> : null}
              </button>
              {renderNotificationsDropdown()}
            </div>
          ) : null}
          {showRight.messages ? (
            <div className="px-dd" style={{ position: 'relative' }}>
              <button className="px-iconBtn" type="button" aria-label="Mensajes" aria-expanded={messagesOpen} aria-controls="player-navbar-messages-popover" onClick={(event) => {
                const shouldOpen = !messagesOpen
                toggleNavbarOverlay('messages', event.currentTarget)
                if (shouldOpen) void loadMessagePreview()
              }}>
                <Mail size={18} />
                {unreadMessages > 0 ? <span className="px-iconBadge">{unreadMessages > 99 ? '99+' : unreadMessages}</span> : null}
              </button>
              {renderMessagesDropdown()}
            </div>
          ) : null}
        </div>

        {!isAuthed ? (
          <Link className="px-loginBtn" href="/login">Login</Link>
        ) : (
          <div className="px-userWrap px-dd">
            <button type="button" className="px-userBtn" aria-expanded={userOpen} onClick={(event) => toggleNavbarOverlay('player', event.currentTarget)}>
              <span className="px-avatar" aria-hidden="true"><UserAvatar /></span>
              <span className="px-userName">{shorten(toTitleCaseName(user?.name), 14)}</span>
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
        <Link href="/" className="px-mobileBrand" aria-label={BRAND.name}>
          <img className="px-mobileBrandImage" src={SELPA_WORDMARK} alt={BRAND.name.toUpperCase()} />
        </Link>
      )
    }

    if (role === 'platform') {
      return <div className="px-mobileBadge">Platform</div>
    }

    return (
      <div className="px-dd px-clubWrap px-mobileClubWrap">
        <button
          type="button"
          className="px-mobileClubBtn px-clubBtn--themed"
          style={clubThemeStyle}
          aria-expanded={clubOpen}
          aria-controls="player-navbar-club-popover"
          onClick={(event) => toggleNavbarOverlay('club', event.currentTarget)}
          aria-label={`Club activo: ${displayClubName}`}
        >
          <span className="px-clubLogo" aria-hidden="true"><ClubLogo /></span>
          <span className="px-mobileClubName">{getMobileClubLabel(displayClubName)}</span>
          <ChevronDown size={14} className="px-caret" />
        </button>
        {renderMobileClubMenu()}
      </div>
    )
  }

  function renderMobileCenter() {
    if (role === 'guest') {
      return <Link className="px-loginBtn px-mobileLogin" href="/login">Login</Link>
    }

    return null
  }

  function renderMobileRight() {
    if (role === 'guest') {
      return (
        <div className="px-mobileActions">
          <button
            className={`px-burger px-burger--menu ${mobileMenuOpen ? 'is-active' : ''}`}
            type="button"
            aria-label="Abrir menú"
            aria-expanded={mobileMenuOpen}
            onClick={() => {
              setMobileMenuOpen((value) => !value)
              setNavbarOverlay(null)
              setSearchOpen(false)
            }}
          >
            <Menu size={16} aria-hidden="true" />
            <span className="px-burgerText">Menú</span>
          </button>
        </div>
      )
    }

    return (
      <div className="px-mobileActions">
        {showRight.search ? (
          <button className={`px-iconBtn px-mobileSearchBtn ${searchOpen ? 'is-active' : ''}`} aria-label="Buscar" aria-expanded={searchOpen} onClick={toggleSearch}>
            <Search size={17} />
          </button>
        ) : null}
        {showRight.messages ? (
          <div className="px-dd px-mobileMessageWrap">
            <button type="button" className="px-iconBtn" aria-label="Mensajes" aria-expanded={messagesOpen} aria-controls="player-navbar-messages-popover" onClick={(event) => {
              const shouldOpen = !messagesOpen
              toggleNavbarOverlay('messages', event.currentTarget)
              if (shouldOpen) void loadMessagePreview()
            }}>
              <Mail size={17} />
              {unreadMessages > 0 ? <span className="px-iconBadge">{unreadMessages > 99 ? '99+' : unreadMessages}</span> : null}
            </button>
            {renderMessagesDropdown()}
          </div>
        ) : null}
        {showRight.notifications ? (
          <div className="px-dd px-mobileNotifWrap">
            <button
              type="button"
              className="px-iconBtn"
              aria-label="Notificaciones"
              aria-expanded={notificationsOpen}
              aria-controls="player-navbar-notifications-popover"
              onClick={(event) => {
                const shouldOpen = !notificationsOpen
                toggleNavbarOverlay('notifications', event.currentTarget)
                if (shouldOpen) void loadPreviewData()
              }}
            >
              <Bell size={17} />
              {unreadNotifications > 0 ? <span className="px-iconBadge">{unreadNotifications > 99 ? '99+' : unreadNotifications}</span> : null}
            </button>
            {renderNotificationsDropdown()}
          </div>
        ) : null}
        <div className="px-userWrap px-dd">
          <button
            type="button"
            className="px-mobileUserBtn"
            onClick={(event) => toggleNavbarOverlay('player', event.currentTarget)}
            aria-label="Mi cuenta y actividad"
            aria-expanded={userOpen}
            aria-controls="player-navbar-player-popover"
          >
            <span className="px-avatar" aria-hidden="true"><UserAvatar /></span>
            {role === 'player' ? <span className="px-mobileUserName">{getFirstVisibleName(user?.name)}</span> : null}
            <ChevronDown size={14} className="px-caret" />
          </button>
          {renderUserMenu(true)}
        </div>
      </div>
    )
  }

  function renderMobileClubMenu() {
    if (!clubOpen) return null

    return (
      <div id="player-navbar-club-popover" className="px-mobileClubMenu" role="menu" aria-label="Espacio Club">
        <Link className="px-mobileClubMenu__head" href="/player" onClick={closeAllMenus} aria-label="Ir al inicio del espacio Club">
          <span className="px-mobileClubMenu__logo" aria-hidden="true"><ClubLogo /></span>
          <div>
            <small>Espacio Club</small>
            <strong>{displayClubName}</strong>
          </div>
        </Link>

        {role === 'player' ? (
          <div className="px-playerClubNav" aria-label="Espacio Club">
            <Link className={`px-ddItem px-playerClubNav__item ${isActiveHref(pathname, currentSearch, '/player', true) ? 'is-active' : ''}`} href="/player" onClick={closeAllMenus}><Home size={18} />Inicio</Link>
            <Link className={`px-ddItem px-playerClubNav__item ${isActiveHref(pathname, currentSearch, '/player/torneos/calendario', true) ? 'is-active' : ''}`} href="/player/torneos/calendario" onClick={closeAllMenus}><CalendarDays size={18} />Calendario del club</Link>
            <Link className={`px-ddItem px-playerClubNav__item ${isActiveHref(pathname, currentSearch, '/player/torneos/explorar', true) ? 'is-active' : ''}`} href="/player/torneos/explorar" onClick={closeAllMenus}><Compass size={18} />Explorar torneos</Link>
            <Link className={`px-ddItem px-playerClubNav__item ${isActiveHref(pathname, currentSearch, '/player/torneos/reglamento', true) ? 'is-active' : ''}`} href="/player/torneos/reglamento" onClick={closeAllMenus}><BookOpen size={18} />Reglamento</Link>
            <Link className={`px-ddItem px-playerClubNav__item ${isActiveHref(pathname, currentSearch, '/player/ranking/club', true) ? 'is-active' : ''}`} href="/player/ranking/club" onClick={closeAllMenus}><Trophy size={18} />Ranking del club</Link>
            <Link className={`px-ddItem px-playerClubNav__item ${isActiveHref(pathname, currentSearch, '/envivo', true) ? 'is-active' : ''}`} href="/envivo" onClick={closeAllMenus}><Radio size={18} />En vivo</Link>
            <Link className={`px-ddItem px-playerClubNav__item ${isActiveHref(pathname, currentSearch, '/noticias', true) ? 'is-active' : ''}`} href="/noticias" onClick={closeAllMenus}><Newspaper size={18} />Noticias</Link>
            {clubs.some((club) => club.id !== displayClub?.id) ? <div className="px-ddSep" /> : null}
            {clubs.some((club) => club.id !== displayClub?.id) ? <span className="px-playerClubNav__eyebrow">Cambiar a otro club</span> : null}
            {clubs.filter((club) => club.id !== displayClub?.id).map((club) => (
              <button key={club.id} type="button" className="px-ddItem px-playerClubNav__club" onClick={async () => {
                await setActiveClub(club.id)
                closeAllMenus()
              }}>
                <span className="px-playerClubNav__clubLogo" aria-hidden="true">{club.logoUrl ? <img src={club.logoUrl} alt="" /> : getClubInitials(club.name)}</span>
                {club.name}
              </button>
            ))}
            <Link className="px-ddItem px-playerClubNav__utility" href="/seleccionar-club" onClick={closeAllMenus}><Settings size={18} />Gestionar mis clubes</Link>
          </div>
        ) : nav.map((item) => (
          <div key={item.href} className="px-mobileRow">
            <Link className={`px-mobileLink ${isActiveItem(pathname, currentSearch, item) ? 'is-active' : ''}`} href={item.href} onClick={closeAllMenus}>{item.label}</Link>
          </div>
        ))}

        {role !== 'platform' && role !== 'player' ? (
          <>
            <div className="px-ddSep" />
            <Link className="px-mobileLink px-mobileLink--muted" href="/club" onClick={closeAllMenus}>Info del club</Link>
            <Link className="px-mobileLink px-mobileLink--muted" href="/seleccionar-club" onClick={closeAllMenus}>Cambiar club</Link>
            {clubs.length > 0 ? (
              <div className="px-mobileClubList" aria-label="Clubes disponibles">
                {clubs.map((club) => (
                  <button
                    key={club.id}
                    className={`px-mobileChild ${club.id === displayClub?.id ? 'is-active' : ''}`}
            onClick={async () => {
              await setActiveClub(club.id)
              closeAllMenus()
            }}
                    type="button"
                  >
                    {club.name}
                  </button>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    )
  }

  function renderMobileMenu() {
    if (role !== 'guest' || !mobileMenuOpen) return null

    return (
      <nav className="px-mobileMenu" aria-label="Menú principal">
        <div className="px-mobileMenuHead">
          <span>Menú</span>
          <strong>{BRAND.name.toUpperCase()}</strong>
        </div>
        {nav.map((item) => (
          <div key={item.href} className="px-mobileRow">
            <Link className={`px-mobileLink ${isActiveItem(pathname, currentSearch, item) ? 'is-active' : ''}`} href={item.href} onClick={closeAllMenus}>
              {item.label}
            </Link>
          </div>
        ))}
      </nav>
    )
  }

  return (
    <>
      <header className={`px-nav${isGlobalPublicNav ? ' px-nav--global' : ''}${role === 'guest' ? ' px-nav--guest' : ' px-nav--authed'}`} ref={rootRef} style={clubThemeStyle}>
        <div className="px-navgrid px-desktopBar">
          {renderDesktopLeft()}
          {renderDesktopCenter()}
          {renderDesktopRight()}
        </div>

        <div className={`px-mobileBar ${role === 'guest' ? 'px-mobileBar--guest' : 'px-mobileBar--authed'}`}>
          <div className="px-mobileBar__left">{renderMobileLeft()}</div>
          <div className="px-mobileBar__center">{renderMobileCenter()}</div>
          <div className="px-mobileBar__right">{renderMobileRight()}</div>
        </div>

        {renderMobileMenu()}
        {renderSearchPanel()}
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
