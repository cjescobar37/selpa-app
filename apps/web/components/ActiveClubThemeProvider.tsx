'use client'

import { createContext, useContext, useMemo, type CSSProperties, type ReactNode } from 'react'
import { getClubTheme, type ClubThemeKey } from '@/lib/clubThemes'
import { useSession } from '@/components/session/SessionProvider'

type ActiveClubThemeContextValue = {
  themeKey: ClubThemeKey
  hasActiveClub: boolean
}

const ActiveClubThemeContext = createContext<ActiveClubThemeContextValue | null>(null)

export function ActiveClubThemeProvider({ children }: { children: ReactNode }) {
  const { activeClub } = useSession()
  const theme = useMemo(() => getClubTheme(activeClub?.themeKey ?? null), [activeClub?.themeKey])
  const themeStyle = useMemo(() => ({
    '--club-primary': theme.vars.accent,
    '--club-secondary': theme.vars.accent2,
    '--club-accent': theme.vars.accent,
    '--club-soft': theme.vars.soft,
    '--club-border': `color-mix(in srgb, ${theme.vars.accent} 28%, rgba(15,23,42,.14))`,
    '--club-focus': `color-mix(in srgb, ${theme.vars.accent} 34%, transparent)`,
    '--club-gradient': `linear-gradient(135deg, ${theme.vars.accent}, ${theme.vars.accent2})`,

    // Temporary aliases keep shared legacy player surfaces compatible during migration.
    '--px-active-club-accent': 'var(--club-accent)',
    '--px-club-accent': 'var(--club-accent)',
    '--px-club-accent-2': 'var(--club-secondary)',
    '--px-club-soft': 'var(--club-soft)',
    '--px-club-glow': theme.vars.glow,
  }) as CSSProperties, [theme])
  const value = useMemo(() => ({
    themeKey: theme.key,
    hasActiveClub: Boolean(activeClub),
  }), [activeClub, theme.key])

  return (
    <ActiveClubThemeContext.Provider value={value}>
      <div className="activeClubTheme" data-club-theme={theme.key} style={themeStyle}>
        {children}
      </div>
    </ActiveClubThemeContext.Provider>
  )
}

export function useActiveClubTheme() {
  const value = useContext(ActiveClubThemeContext)
  if (!value) throw new Error('useActiveClubTheme must be used within ActiveClubThemeProvider')
  return value
}
