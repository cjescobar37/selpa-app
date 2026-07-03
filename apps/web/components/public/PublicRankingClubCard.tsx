'use client'

import Link from 'next/link'
import type { CSSProperties, KeyboardEvent } from 'react'
import { useState } from 'react'
import { buildAssetProxyUrl, getClubInitials } from '@/lib/clubAssets'
import { getClubTheme } from '@/lib/clubThemes'

type PublicRankingClubCardProps = {
  clubName: string
  logoUrl?: string | null
  themeKey?: string | null
  href?: string
  onSelect?: () => void
  variant?: 'ranking' | 'home'
  playersCount?: number | null
  categories?: number[]
  rankingType?: string
}

export default function PublicRankingClubCard({
  clubName,
  logoUrl,
  themeKey,
  href,
  onSelect,
  variant = 'ranking',
  playersCount,
  rankingType = 'Ranking anual',
}: PublicRankingClubCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const logo = buildAssetProxyUrl(logoUrl)
  const theme = getClubTheme(themeKey)
  const accentStyle = {
    ['--club-primary' as string]: theme.vars.accent,
    ['--club-secondary' as string]: theme.vars.accent2,
  } satisfies CSSProperties
  const cardStyle = {
    ...accentStyle,
    background: 'linear-gradient(135deg, rgba(255,255,255,.98), rgba(248,250,252,.94)) padding-box, linear-gradient(135deg, rgba(34,211,238,.54), rgba(236,72,153,.46)) border-box',
    border: '1px solid transparent',
    borderRadius: 28,
    boxShadow: isHovered
      ? '0 24px 54px rgba(15,23,42,.14), 0 0 0 4px color-mix(in srgb, var(--club-primary) 16%, transparent), 0 0 38px color-mix(in srgb, var(--club-secondary) 18%, transparent)'
      : '0 18px 44px rgba(15,23,42,.09), 0 0 0 1px rgba(255,255,255,.7) inset',
    color: '#020617',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    minHeight: 190,
    minWidth: 0,
    overflow: 'hidden',
    padding: 24,
    position: 'relative',
    textDecoration: 'none',
    transform: isHovered ? 'translateY(-4px) scale(1.01)' : 'translateY(0) scale(1)',
    transition: 'transform .18s ease, box-shadow .18s ease',
  } satisfies CSSProperties

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!onSelect) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect()
    }
  }

  function renderHomeMeta() {
    const count = typeof playersCount === 'number' ? playersCount : 0
    return `${new Intl.NumberFormat('es-AR').format(count)} jugadores`
  }

  const homeCardStyle = {
    ...accentStyle,
    background: 'linear-gradient(135deg, #ffffff, rgba(248,250,252,.995)) padding-box, linear-gradient(135deg, color-mix(in srgb, var(--club-primary) 24%, #cbd5e1), color-mix(in srgb, var(--club-secondary) 18%, #e2e8f0)) border-box',
    border: '1px solid transparent',
    borderRadius: 20,
    boxShadow: isHovered
      ? '0 22px 48px rgba(15,23,42,.12), 0 0 0 3px color-mix(in srgb, var(--club-primary) 5%, transparent)'
      : '0 16px 38px rgba(15,23,42,.065), 0 0 0 1px rgba(255,255,255,.88) inset',
    color: '#020617',
    cursor: 'pointer',
    display: 'grid',
    gap: 16,
    gridTemplateColumns: 'minmax(128px, .82fr) minmax(0, 1fr)',
    minHeight: 188,
    minWidth: 0,
    overflow: 'hidden',
    padding: '18px 20px',
    position: 'relative',
    textDecoration: 'none',
    transform: isHovered ? 'translateY(-3px)' : 'translateY(0)',
    transition: 'transform .18s ease, box-shadow .18s ease, border-color .18s ease',
  } satisfies CSSProperties

  const homeContent = (
    <>
      <span
        aria-hidden="true"
        style={{
          background: 'linear-gradient(90deg, var(--club-primary), color-mix(in srgb, var(--club-secondary) 42%, #64748b))',
          height: isHovered ? 4 : 3,
          left: 18,
          opacity: isHovered ? .88 : .58,
          pointerEvents: 'none',
          position: 'absolute',
          right: isHovered ? 18 : '62%',
          top: 0,
          transition: 'right .2s ease, opacity .2s ease, height .2s ease',
          zIndex: 2,
        }}
      />
      <span
        aria-hidden="true"
        style={{
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--club-primary) 3.5%, transparent), transparent 34%, color-mix(in srgb, var(--club-secondary) 2.5%, transparent))',
          inset: 0,
          opacity: isHovered ? .58 : .38,
          pointerEvents: 'none',
          position: 'absolute',
          transition: 'opacity .2s ease',
          zIndex: 0,
        }}
      />
      <svg
        aria-hidden="true"
        viewBox="0 0 220 120"
        style={{
          bottom: -18,
          height: 132,
          opacity: isHovered ? .115 : .06,
          pointerEvents: 'none',
          position: 'absolute',
          right: -10,
          transform: isHovered ? 'translate(2px, -3px) scale(1.02)' : 'translate(0, 0) scale(1)',
          transition: 'transform .2s ease, opacity .2s ease',
          width: 210,
          zIndex: 0,
        }}
      >
        <path d="M28 88 C70 85 96 72 118 61 C146 47 164 31 194 26" fill="none" stroke="#0f172a" strokeLinecap="round" strokeWidth="14" />
        <path d="M170 22 L198 25 L187 52" fill="none" stroke="#0f172a" strokeLinecap="round" strokeLinejoin="round" strokeWidth="14" />
        <path d="M32 101 C78 94 112 75 145 57 C162 48 176 39 194 28" fill="none" stroke="var(--club-primary)" strokeLinecap="round" strokeWidth="3" />
      </svg>
      <span
        aria-hidden="true"
        style={{
          background: 'linear-gradient(135deg, rgba(15,23,42,.026) 0 1px, transparent 1px 100%), linear-gradient(45deg, rgba(15,23,42,.018) 0 1px, transparent 1px 100%)',
          backgroundSize: '20px 20px',
          inset: 0,
          opacity: isHovered ? .76 : .54,
          pointerEvents: 'none',
          position: 'absolute',
          zIndex: 0,
        }}
      />
      <div style={{ alignSelf: 'start', display: 'grid', gap: 9, gridTemplateRows: 'auto 1fr 5px', minHeight: 142, position: 'relative', zIndex: 1 }}>
        <span
          style={{
            alignItems: 'center',
            background: 'rgba(255,255,255,.88)',
            border: '1px solid color-mix(in srgb, var(--club-primary) 20%, #cbd5e1)',
            borderRadius: 999,
            boxShadow: '0 8px 18px rgba(15,23,42,.045)',
            color: 'color-mix(in srgb, var(--club-primary) 46%, #0f172a)',
            display: 'inline-flex',
            fontSize: 9,
            fontWeight: 950,
            gap: 6,
            justifySelf: 'start',
            letterSpacing: '.08em',
            padding: '5px 8px',
            textTransform: 'uppercase',
          }}
        >
          <i style={{ background: 'var(--club-primary)', borderRadius: 999, display: 'inline-block', height: 7, width: 7 }} />
          {rankingType}
        </span>
        <div
          aria-hidden="true"
          style={{
            alignItems: 'end',
            display: 'grid',
            gap: 8,
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            height: '100%',
          }}
        >
          {[ 
            { label: '4', height: 38, color: 'linear-gradient(180deg, #ffffff, color-mix(in srgb, var(--club-primary) 8%, #e2e8f0))', opacity: .94, lift: 2 },
            { label: '3', height: 58, color: 'linear-gradient(180deg, #f8fafc, color-mix(in srgb, var(--club-primary) 15%, #cbd5e1))', opacity: .96, lift: 3 },
            { label: '2', height: 78, color: 'linear-gradient(180deg, #f8fafc, color-mix(in srgb, var(--club-primary) 20%, #94a3b8))', opacity: .97, lift: 4 },
            { label: '1', height: 100, color: 'linear-gradient(180deg, #ffffff, color-mix(in srgb, var(--club-secondary) 22%, #94a3b8))', opacity: .98, lift: 5 },
          ].map((step) => (
            <span
              key={step.label}
              style={{
                alignItems: 'start',
                background: step.color,
                border: '1px solid rgba(255,255,255,.72)',
                borderRadius: '10px 10px 3px 3px',
                boxShadow: isHovered ? '0 13px 22px rgba(15,23,42,.105)' : '0 9px 16px rgba(15,23,42,.065)',
                color: '#1e293b',
                display: 'flex',
                fontSize: 15,
                fontWeight: 950,
                height: step.height,
                justifyContent: 'center',
                letterSpacing: '-.04em',
                lineHeight: 1,
                opacity: step.opacity,
                paddingTop: 10,
                transform: isHovered ? `translateY(-${step.lift}px)` : 'translateY(0)',
                transition: 'transform .2s ease, box-shadow .2s ease, background .2s ease',
              }}
            >
              {step.label}
            </span>
          ))}
        </div>
        <span
          style={{
            background: 'linear-gradient(90deg, var(--club-primary), color-mix(in srgb, var(--club-secondary) 40%, #64748b))',
            borderRadius: 999,
            display: 'block',
            height: 4,
            opacity: .88,
            transition: 'width .2s ease, opacity .2s ease',
            width: isHovered ? '100%' : '58%',
          }}
        />
      </div>

      <header style={{ alignSelf: 'center', display: 'grid', gap: 8, justifyItems: 'center', minWidth: 0, position: 'relative', textAlign: 'center', transform: 'translateY(-8px)', zIndex: 1 }}>
        <h3 style={{ color: '#020617', display: '-webkit-box', fontSize: 30, fontWeight: 950, letterSpacing: '-.065em', lineHeight: .94, margin: 0, overflow: 'hidden', overflowWrap: 'anywhere', textShadow: isHovered ? '0 13px 30px rgba(15,23,42,.14)' : '0 10px 24px rgba(15,23,42,.09)', transition: 'text-shadow .18s ease', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2 }}>
          {clubName}
        </h3>
        <p style={{ color: '#0f172a', fontSize: 11, fontWeight: 950, letterSpacing: '.02em', lineHeight: 1.25, margin: 0 }}>
          Damas - Caballeros
        </p>
        <p style={{ color: '#475569', fontSize: 12, fontWeight: 900, lineHeight: 1.3, margin: 0 }}>
          {renderHomeMeta()}
        </p>
      </header>
    </>
  )

  const content = (
    <>
      <span
        aria-hidden="true"
        style={{
          background: 'linear-gradient(90deg, #22d3ee, var(--club-primary), var(--club-secondary), #ec4899)',
          borderRadius: 999,
          bottom: 0,
          height: 4,
          left: isHovered ? 18 : 24,
          opacity: isHovered ? .95 : .58,
          pointerEvents: 'none',
          position: 'absolute',
          right: isHovered ? 18 : 24,
          transform: isHovered ? 'scaleX(1)' : 'scaleX(.74)',
          transformOrigin: 'left center',
          transition: 'transform .2s ease, opacity .2s ease, left .2s ease, right .2s ease',
          zIndex: 2,
        }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background: 'radial-gradient(circle at 18% 8%, color-mix(in srgb, var(--club-primary) 18%, transparent), transparent 34%), radial-gradient(circle at 92% 8%, color-mix(in srgb, var(--club-secondary) 14%, transparent), transparent 32%)',
          opacity: isHovered ? .95 : .72,
          transform: isHovered ? 'translate3d(4px, -3px, 0) scale(1.03)' : 'translate3d(0, 0, 0) scale(1)',
          transition: 'transform .2s ease, opacity .2s ease',
        }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-2 right-4 text-[54px] font-black lowercase leading-none tracking-[-0.08em] text-slate-950 opacity-[0.035]"
        style={{
          color: '#061b3a',
          fontSize: 96,
          fontWeight: 950,
          bottom: -14,
          lineHeight: 1,
          opacity: .04,
          pointerEvents: 'none',
          position: 'absolute',
          right: 18,
          top: 'auto',
          transform: isHovered ? 'translateX(2px) scale(1.03)' : 'translateX(0) scale(1)',
          transition: 'transform .2s ease',
          zIndex: 0,
        }}
      >
        #
      </span>
      <span
        aria-hidden="true"
        style={{
          alignItems: 'end',
          display: 'flex',
          filter: 'blur(.45px)',
          gap: 12,
          opacity: isHovered ? .10 : .06,
          pointerEvents: 'none',
          position: 'absolute',
          right: 18,
          top: 12,
          transform: isHovered ? 'translateY(-2px) translateX(2px) scale(1.02)' : 'translateY(0) translateX(0) scale(1)',
          transition: 'transform .2s ease, opacity .2s ease',
          zIndex: 0,
        }}
      >
        {[65, 105, 155].map((height) => (
          <i
            key={height}
            style={{
              background: 'linear-gradient(180deg, var(--club-primary), var(--club-secondary))',
              borderRadius: '18px 18px 4px 4px',
              display: 'block',
              height,
              width: 34,
            }}
          />
        ))}
      </span>
      <header
        className="relative z-[1] min-w-0"
        style={{ minWidth: 0, position: 'relative', zIndex: 1 }}
      >
        <h2
          className="line-clamp-2 overflow-hidden text-[23px] font-black leading-[1.04] tracking-[-0.025em] text-slate-950"
          style={{ color: '#020617', display: '-webkit-box', fontSize: 23, fontWeight: 950, letterSpacing: '-.025em', lineHeight: 1.04, margin: 0, overflow: 'hidden', overflowWrap: 'anywhere', paddingRight: 72, WebkitBoxOrient: 'vertical', WebkitLineClamp: 2 }}
        >
          {clubName}
        </h2>
        <span
          aria-hidden="true"
          style={{ background: 'linear-gradient(90deg, #22d3ee, var(--club-primary), var(--club-secondary), #ec4899)', borderRadius: 999, display: 'block', height: isHovered ? 4 : 3, marginTop: 10, maxWidth: isHovered ? 140 : 90, opacity: isHovered ? .94 : .68, transition: 'max-width .2s ease, opacity .2s ease, height .2s ease' }}
        />
      </header>
      <div
        className="relative z-[1] flex min-w-0 items-center gap-4"
        style={{ alignItems: 'center', display: 'flex', gap: 18, minWidth: 0, position: 'relative', transform: 'translateY(14px)', zIndex: 1 }}
      >
        <div
          className="relative flex h-[72px] w-[72px] min-w-[72px] items-center justify-center overflow-hidden rounded-[20px] bg-white p-[7px] text-sm font-black text-slate-950"
          style={{
            alignItems: 'center',
            background: logo ? '#ffffff' : 'linear-gradient(135deg, #061b3a, #12325d)',
            border: '2px solid transparent',
            borderRadius: 20,
            boxShadow: isHovered
              ? '0 0 0 11px color-mix(in srgb, var(--club-primary) 19%, transparent), 0 19px 36px rgba(15,23,42,.16)'
              : '0 0 0 7px color-mix(in srgb, var(--club-primary) 10%, transparent), 0 14px 26px rgba(15,23,42,.10)',
            color: logo ? '#020617' : '#ffffff',
            display: 'flex',
            flex: '0 0 83px',
            fontSize: 14,
            fontWeight: 950,
            height: 83,
            justifyContent: 'center',
            minWidth: 83,
            overflow: 'hidden',
            padding: 8,
            position: 'relative',
            width: 83,
            zIndex: 1,
            transition: 'box-shadow .18s ease, transform .18s ease',
            transform: isHovered ? 'scale(1.05)' : 'scale(1)',
          }}
        >
          {logo ? <img className="block h-full w-full object-contain" src={logo} alt="" loading="lazy" decoding="async" style={{ display: 'block', height: '100%', objectFit: 'contain', width: '100%' }} /> : getClubInitials(clubName)}
        </div>
        <p className="mt-1 text-xs font-extrabold leading-tight text-slate-500" style={{ color: '#64748b', flex: '1 1 auto', fontSize: 12, fontWeight: 850, lineHeight: 1.28, margin: 0, minWidth: 0 }}>
          Entrá al ranking oficial del club.
        </p>
      </div>
      <footer
        className="relative z-[1] flex min-w-0 items-end justify-between gap-3"
        style={{ alignItems: 'flex-end', display: 'flex', gap: 12, justifyContent: 'flex-end', minWidth: 0, position: 'relative', zIndex: 1 }}
      >
        <span
          className="flex shrink-0 items-center justify-center rounded-full bg-slate-950 font-black leading-none text-white shadow-lg transition"
          aria-hidden="true"
          style={{
            alignItems: 'center',
            background: '#020617',
            borderRadius: 999,
            boxShadow: '0 12px 24px rgba(6,27,58,.16), 0 0 0 4px color-mix(in srgb, var(--club-secondary) 10%, transparent)',
            color: '#ffffff',
            display: 'inline-flex',
            flex: '0 0 auto',
            fontSize: 11,
            fontWeight: 950,
            gap: 8,
            height: 40,
            justifyContent: 'center',
            letterSpacing: '.04em',
            lineHeight: 1,
            minWidth: 118,
            padding: '0 13px',
            textTransform: 'uppercase',
          }}
        >
          Ver ranking <b style={{ display: 'inline-block', fontSize: 18, lineHeight: 1, transform: isHovered ? 'translateX(4px)' : 'translateX(0)', transition: 'transform .18s ease' }}>→</b>
        </span>
      </footer>
    </>
  )

  const interactionProps = {
    onBlur: () => setIsHovered(false),
    onFocus: () => setIsHovered(true),
    onMouseEnter: () => setIsHovered(true),
    onMouseLeave: () => setIsHovered(false),
  }

  if (variant === 'home') {
    if (href) {
      return (
        <Link href={href} style={homeCardStyle} {...interactionProps}>
          {homeContent}
        </Link>
      )
    }

    return (
      <article
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={handleKeyDown}
        style={homeCardStyle}
        {...interactionProps}
      >
        {homeContent}
      </article>
    )
  }

  if (href) {
    return (
      <Link
        className="group relative flex min-h-[190px] cursor-pointer flex-col justify-between overflow-hidden rounded-[28px] bg-white p-6 text-slate-950 shadow-xl transition duration-200 hover:-translate-y-1 hover:shadow-2xl"
        href={href}
        style={cardStyle}
        {...interactionProps}
      >
        {content}
      </Link>
    )
  }

  return (
    <article
      className="group relative flex min-h-[190px] cursor-pointer flex-col justify-between overflow-hidden rounded-[28px] bg-white p-6 text-slate-950 shadow-xl transition duration-200 hover:-translate-y-1 hover:shadow-2xl"
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      style={cardStyle}
      {...interactionProps}
    >
      {content}
    </article>
  )
}
