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
  categories = [],
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

  function renderCategoryMeta() {
    if (!categories.length) return 'Categorias activas'
    const visible = categories.slice(0, 3).join(', ')
    return `Categorias ${visible}${categories.length > 3 ? '+' : ''}`
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
        className="publicRankingCardV2__mark"
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
      <div className="publicRankingCardV2__chartWrap" style={{ alignSelf: 'start', display: 'grid', gap: 9, gridTemplateRows: 'auto 1fr 5px', minHeight: 142, position: 'relative', zIndex: 1 }}>
        <span
          className="publicRankingCardV2__badge"
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
          className="publicRankingCardV2__steps"
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
              className="publicRankingCardV2__step"
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
          className="publicRankingCardV2__base"
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

      <header className="publicRankingCardV2__homeBody" style={{ alignSelf: 'center', display: 'grid', gap: 8, justifyItems: 'center', minWidth: 0, position: 'relative', textAlign: 'center', transform: 'translateY(-8px)', zIndex: 1 }}>
        <h3 className="publicRankingCardV2__clubName" style={{ color: '#020617', display: '-webkit-box', fontSize: 30, fontWeight: 950, letterSpacing: '-.065em', lineHeight: .94, margin: 0, overflow: 'hidden', overflowWrap: 'anywhere', textShadow: isHovered ? '0 13px 30px rgba(15,23,42,.14)' : '0 10px 24px rgba(15,23,42,.09)', transition: 'text-shadow .18s ease', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2 }}>
          {clubName}
        </h3>
        <span className="publicRankingCardV2__nameAccent" aria-hidden="true" />
        <p className="publicRankingCardV2__branches" style={{ color: '#0f172a', fontSize: 11, fontWeight: 950, letterSpacing: '.02em', lineHeight: 1.25, margin: 0 }}>
          Damas - Caballeros
        </p>
        <p className="publicRankingCardV2__players" style={{ color: '#475569', fontSize: 12, fontWeight: 900, lineHeight: 1.3, margin: 0 }}>
          {renderHomeMeta()}
        </p>
        <span className="publicRankingCardV2__homeCta" aria-hidden="true">Ver ranking →</span>
      </header>
      <span className="publicRankingCardV2__homeChevron" aria-hidden="true">›</span>
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
      <div className="publicRankingCardV2__mobileLayout" style={{ display: 'none' }}>
        <div className="publicRankingCardV2__mobileVisual" aria-hidden="true">
          <span className="publicRankingCardV2__mobileBadge">
            <i />
            {rankingType}
          </span>
          <span className="publicRankingCardV2__mobileArrow">
            <svg viewBox="0 0 120 92" focusable="false">
              <path d="M14 70 C42 66 59 50 74 35 C83 26 91 18 106 16" />
              <path d="M82 13 L108 16 L100 42" />
            </svg>
          </span>
          <div className="publicRankingCardV2__mobileSteps">
            <span>3</span>
            <span>2</span>
            <span>1</span>
          </div>
        </div>
        <div className="publicRankingCardV2__mobileBody">
          <h2>{clubName}</h2>
          <p>{renderCategoryMeta()}</p>
          <small>{typeof playersCount === 'number' ? renderHomeMeta() : 'Ranking oficial'}</small>
          <span className="publicRankingCardV2__mobileCta">
            Ver ranking <b aria-hidden="true">→</b>
          </span>
        </div>
      </div>
      <header
        className="publicRankingCardV2__rankingHeader relative z-[1] min-w-0"
        style={{ minWidth: 0, position: 'relative', zIndex: 1 }}
      >
        <h2
          className="publicRankingCardV2__rankingTitle line-clamp-2 overflow-hidden text-[23px] font-black leading-[1.04] tracking-[-0.025em] text-slate-950"
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
        className="publicRankingCardV2__rankingMeta relative z-[1] flex min-w-0 items-center gap-4"
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
        <p className="publicRankingCardV2__rankingCopy mt-1 text-xs font-extrabold leading-tight text-slate-500" style={{ color: '#64748b', flex: '1 1 auto', fontSize: 12, fontWeight: 850, lineHeight: 1.28, margin: 0, minWidth: 0 }}>
          Entrá al ranking oficial del club.
        </p>
      </div>
      <footer
        className="publicRankingCardV2__rankingFooter relative z-[1] flex min-w-0 items-end justify-between gap-3"
        style={{ alignItems: 'flex-end', display: 'flex', gap: 12, justifyContent: 'flex-end', minWidth: 0, position: 'relative', zIndex: 1 }}
      >
        <span
          className="publicRankingCardV2__cta flex shrink-0 items-center justify-center rounded-full bg-slate-950 font-black leading-none text-white shadow-lg transition"
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
        <Link className="publicRankingCardV2 publicRankingCardV2--home" href={href} style={homeCardStyle} {...interactionProps}>
          {homeContent}
          <MobileRankingCardStyles />
        </Link>
      )
    }

    return (
      <article
        className="publicRankingCardV2 publicRankingCardV2--home"
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={handleKeyDown}
        style={homeCardStyle}
        {...interactionProps}
      >
        {homeContent}
        <MobileRankingCardStyles />
      </article>
    )
  }

  if (href) {
    return (
      <Link
        className="publicRankingCardV2 publicRankingCardV2--ranking group relative flex min-h-[190px] cursor-pointer flex-col justify-between overflow-hidden rounded-[28px] bg-white p-6 text-slate-950 shadow-xl transition duration-200 hover:-translate-y-1 hover:shadow-2xl"
        href={href}
        style={cardStyle}
        {...interactionProps}
      >
        {content}
        <MobileRankingCardStyles />
      </Link>
    )
  }

  return (
    <article
      className="publicRankingCardV2 publicRankingCardV2--ranking group relative flex min-h-[190px] cursor-pointer flex-col justify-between overflow-hidden rounded-[28px] bg-white p-6 text-slate-950 shadow-xl transition duration-200 hover:-translate-y-1 hover:shadow-2xl"
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      style={cardStyle}
      {...interactionProps}
    >
      {content}
      <MobileRankingCardStyles />
    </article>
  )
}

function MobileRankingCardStyles() {
  return (
    <style jsx>{`
      @media (max-width: 640px) {
        :global(.publicRankingCardV2--home) {
          align-items: stretch !important;
          aspect-ratio: 1 / .82 !important;
          background-color: #FAFBFC !important;
          background-clip: padding-box, padding-box, border-box !important;
          background-image:
            radial-gradient(circle at 50% 115%, rgba(15,23,42,.07), transparent 58%),
            linear-gradient(180deg, rgba(255,255,255,.96), #FAFBFC 54%, #f4f7fa),
            linear-gradient(90deg, color-mix(in srgb, var(--club-primary) 58%, #cbd5e1), color-mix(in srgb, var(--club-secondary) 34%, #dbe3ec)) !important;
          background-origin: padding-box, padding-box, border-box !important;
          border-radius: 16px !important;
          box-shadow: 0 10px 22px rgba(15,23,42,.055), 0 0 0 1px rgba(255,255,255,.74) inset !important;
          gap: 0 !important;
          grid-template-columns: 1fr !important;
          min-height: 0 !important;
          padding: 0 !important;
        }

        :global(.publicRankingCardV2--home > span:nth-of-type(1)) {
          height: 3px !important;
          opacity: .78 !important;
          right: 54% !important;
        }

        :global(.publicRankingCardV2--home > span:nth-of-type(2)),
        :global(.publicRankingCardV2--home > span:nth-of-type(3)) {
          display: none !important;
        }

        :global(.publicRankingCardV2__chartWrap) {
          bottom: 0 !important;
          display: block !important;
          gap: 0 !important;
          left: 0 !important;
          min-height: 0 !important;
          opacity: 1 !important;
          pointer-events: none !important;
          position: absolute !important;
          right: 0 !important;
          top: 0 !important;
          transform: none !important;
          z-index: 0 !important;
        }

        :global(.publicRankingCardV2__badge) {
          background: color-mix(in srgb, var(--club-primary) 11%, #ffffff) !important;
          border-color: color-mix(in srgb, var(--club-primary) 34%, #dbe3ec) !important;
          border-radius: 7px !important;
          box-shadow: 0 5px 12px rgba(15,23,42,.045) !important;
          font-size: 7.5px !important;
          font-weight: 850 !important;
          gap: 3px !important;
          left: 13px !important;
          letter-spacing: .055em !important;
          opacity: .94 !important;
          padding: 3px 5px !important;
          position: absolute !important;
          top: 13px !important;
          z-index: 2 !important;
        }

        :global(.publicRankingCardV2__badge i) {
          height: 4px !important;
          width: 4px !important;
        }

        :global(.publicRankingCardV2__steps) {
          align-items: end !important;
          bottom: 12px !important;
          display: grid !important;
          gap: 7px !important;
          height: 73px !important;
          left: 22px !important;
          opacity: .07 !important;
          position: absolute !important;
          right: 16px !important;
          max-width: none !important;
          width: 100% !important;
          z-index: 0 !important;
        }

        :global(.publicRankingCardV2__step) {
          border-radius: 10px 10px 3px 3px !important;
          border-color: rgba(15,23,42,.08) !important;
          box-shadow: none !important;
          font-size: 0 !important;
          opacity: 1 !important;
          padding-top: 0 !important;
        }

        :global(.publicRankingCardV2__step:nth-child(1)) { height: 26px !important; }
        :global(.publicRankingCardV2__step:nth-child(2)) { height: 40px !important; }
        :global(.publicRankingCardV2__step:nth-child(3)) { height: 58px !important; }
        :global(.publicRankingCardV2__step:nth-child(4)) { height: 76px !important; }

        :global(.publicRankingCardV2__base) {
          display: none !important;
        }

        :global(.publicRankingCardV2__mark) {
          bottom: 8px !important;
          height: 88px !important;
          opacity: .07 !important;
          right: -12px !important;
          width: 154px !important;
        }

        :global(.publicRankingCardV2__mark path) {
          stroke: #0f172a !important;
        }

        :global(.publicRankingCardV2--home .publicRankingCardV2__chartWrap) {
          bottom: 0 !important;
          height: 100% !important;
          inset: 0 !important;
          overflow: hidden !important;
          position: absolute !important;
          transform: none !important;
        }

        :global(.publicRankingCardV2--home .publicRankingCardV2__steps) {
          bottom: 12px !important;
          height: 73px !important;
          left: 22px !important;
          position: absolute !important;
          right: 16px !important;
          top: auto !important;
          transform: none !important;
        }

        :global(.publicRankingCardV2__homeBody) {
          align-content: start !important;
          background: transparent !important;
          border: 0 !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          gap: 4px !important;
          justify-items: start !important;
          left: 13px !important;
          min-height: 0 !important;
          padding: 0 !important;
          position: absolute !important;
          right: 34px !important;
          text-align: left !important;
          top: 39px !important;
          transform: none !important;
          backdrop-filter: none !important;
          z-index: 2 !important;
        }

        :global(.publicRankingCardV2__clubName) {
          font-size: 17px !important;
          font-weight: 900 !important;
          letter-spacing: 0 !important;
          line-height: 1.02 !important;
          max-width: 100% !important;
          text-align: left !important;
          text-shadow: none !important;
        }

        :global(.publicRankingCardV2__nameAccent) {
          background: var(--club-primary) !important;
          border-radius: 999px !important;
          display: block !important;
          height: 3px !important;
          margin: 3px 0 1px !important;
          opacity: .78 !important;
          width: 44px !important;
        }

        :global(.publicRankingCardV2__branches),
        :global(.publicRankingCardV2__players) {
          font-size: 10px !important;
          font-weight: 760 !important;
          line-height: 1.14 !important;
        }

        :global(.publicRankingCardV2__homeCta) {
          display: none !important;
        }

        :global(.publicRankingCardV2__homeChevron) {
          align-items: center !important;
          background: transparent !important;
          border: 0 !important;
          border-radius: 0 !important;
          color: color-mix(in srgb, var(--club-primary) 72%, #020617) !important;
          display: inline-flex !important;
          font-size: 34px !important;
          font-weight: 800 !important;
          height: 30px !important;
          justify-content: center !important;
          line-height: 1 !important;
          position: absolute !important;
          right: 17px !important;
          top: 38px !important;
          width: 22px !important;
          z-index: 3 !important;
        }

        :global(.publicRankingCardV2--ranking) {
          background-color: #FAFBFC !important;
          background-clip: padding-box, padding-box, border-box !important;
          background-image:
            radial-gradient(circle at 54% 118%, rgba(15,23,42,.075), transparent 58%),
            linear-gradient(180deg, rgba(255,255,255,.97), #FAFBFC 56%, #f4f7fa),
            linear-gradient(90deg, color-mix(in srgb, var(--club-primary) 56%, #cbd5e1), color-mix(in srgb, var(--club-secondary) 34%, #dbe3ec)) !important;
          background-origin: padding-box, padding-box, border-box !important;
          border-radius: 20px !important;
          display: grid !important;
          min-height: 156px !important;
          padding: 0 !important;
        }

        :global(.publicRankingCardV2--ranking)::before {
          background: linear-gradient(90deg, var(--club-primary), color-mix(in srgb, var(--club-secondary) 48%, #64748b)) !important;
          content: '' !important;
          height: 3px !important;
          left: 0 !important;
          opacity: .82 !important;
          pointer-events: none !important;
          position: absolute !important;
          right: 0 !important;
          top: 0 !important;
          z-index: 3 !important;
        }

        :global(.publicRankingCardV2--ranking > span:not(.publicRankingCardV2__mobileArrow)),
        :global(.publicRankingCardV2--ranking > header),
        :global(.publicRankingCardV2--ranking > .publicRankingCardV2__rankingMeta),
        :global(.publicRankingCardV2--ranking > footer) {
          display: none !important;
        }

        :global(.publicRankingCardV2__mobileLayout) {
          display: grid !important;
          grid-template-columns: 130px minmax(0, 1fr) !important;
          min-height: 156px !important;
          overflow: hidden !important;
          position: relative !important;
          transform: none !important;
          width: 100% !important;
          z-index: 1 !important;
        }

        :global(.publicRankingCardV2--ranking > .publicRankingCardV2__mobileLayout) {
          gap: 0 !important;
          transform: none !important;
        }

        :global(.publicRankingCardV2__mobileVisual) {
          align-content: end !important;
          background:
            radial-gradient(circle at 12% 10%, color-mix(in srgb, var(--club-primary) 16%, transparent), transparent 42%),
            linear-gradient(135deg, color-mix(in srgb, var(--club-primary) 11%, #f8fafc), color-mix(in srgb, var(--club-secondary) 8%, #fff)) !important;
          border-right: 1px solid color-mix(in srgb, var(--club-primary) 16%, #e2e8f0) !important;
          display: grid !important;
          min-width: 0 !important;
          overflow: hidden !important;
          padding: 10px 8px 11px !important;
          position: relative !important;
        }

        :global(.publicRankingCardV2--ranking > .publicRankingCardV2__mobileLayout > .publicRankingCardV2__mobileVisual) {
          border-radius: 0 !important;
          flex-basis: auto !important;
          height: auto !important;
          min-width: 0 !important;
          width: auto !important;
        }

        :global(.publicRankingCardV2__mobileBadge) {
          align-items: center !important;
          background: color-mix(in srgb, var(--club-primary) 10%, rgba(255,255,255,.9)) !important;
          border: 1px solid color-mix(in srgb, var(--club-primary) 34%, #dbe5ef) !important;
          border-radius: 999px !important;
          box-shadow: 0 6px 14px rgba(15,23,42,.055) !important;
          color: color-mix(in srgb, var(--club-primary) 66%, #0f172a) !important;
          display: inline-flex !important;
          font-size: 7px !important;
          font-weight: 860 !important;
          gap: 4px !important;
          justify-self: start !important;
          letter-spacing: .04em !important;
          line-height: 1 !important;
          padding: 4px 6px !important;
          position: absolute !important;
          text-transform: uppercase !important;
          top: 10px !important;
          left: 8px !important;
          z-index: 2 !important;
        }

        :global(.publicRankingCardV2__mobileBadge i) {
          background: var(--club-primary) !important;
          border-radius: 999px !important;
          display: inline-block !important;
          height: 5px !important;
          width: 5px !important;
        }

        :global(.publicRankingCardV2__mobileArrow) {
          bottom: 10px !important;
          color: color-mix(in srgb, var(--club-secondary) 48%, #061b3a) !important;
          opacity: .18 !important;
          position: absolute !important;
          right: -14px !important;
          width: 112px !important;
          z-index: 0 !important;
        }

        :global(.publicRankingCardV2__mobileArrow)::after {
          background: var(--club-primary) !important;
          border-radius: 999px !important;
          content: '' !important;
          height: 3px !important;
          opacity: .76 !important;
          position: absolute !important;
          right: 18px !important;
          top: -5px !important;
          width: 24px !important;
        }

        :global(.publicRankingCardV2__mobileArrow svg) {
          display: block !important;
          fill: none !important;
          height: auto !important;
          stroke: currentColor !important;
          stroke-linecap: round !important;
          stroke-linejoin: round !important;
          stroke-width: 13 !important;
          width: 100% !important;
        }

        :global(.publicRankingCardV2__mobileSteps) {
          align-items: end !important;
          align-self: end !important;
          display: grid !important;
          gap: 5px !important;
          grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          height: 108px !important;
          position: relative !important;
          z-index: 1 !important;
        }

        :global(.publicRankingCardV2__mobileSteps span) {
          align-items: start !important;
          background: linear-gradient(180deg, #fff, color-mix(in srgb, var(--club-primary) 30%, #cbd5e1)) !important;
          border: 1px solid color-mix(in srgb, var(--club-primary) 18%, rgba(255,255,255,.82)) !important;
          border-radius: 11px 11px 4px 4px !important;
          box-shadow: 0 10px 18px rgba(15,23,42,.105) !important;
          color: #0f172a !important;
          display: flex !important;
          font-size: 15px !important;
          font-weight: 930 !important;
          justify-content: center !important;
          line-height: 1 !important;
          padding-top: 8px !important;
        }

        :global(.publicRankingCardV2__mobileSteps span:nth-child(1)) { height: 60px !important; }
        :global(.publicRankingCardV2__mobileSteps span:nth-child(2)) { height: 84px !important; }
        :global(.publicRankingCardV2__mobileSteps span:nth-child(3)) {
          background: linear-gradient(180deg, #fff, color-mix(in srgb, var(--club-secondary) 34%, #cbd5e1)) !important;
          height: 108px !important;
        }

        :global(.publicRankingCardV2__mobileBody) {
          align-content: start !important;
          display: grid !important;
          gap: 5px !important;
          min-width: 0 !important;
          padding: 13px 12px 11px !important;
          position: relative !important;
        }

        :global(.publicRankingCardV2__mobileBody h2) {
          color: #020617 !important;
          display: -webkit-box !important;
          font-size: 22px !important;
          font-weight: 930 !important;
          letter-spacing: 0 !important;
          line-height: 1 !important;
          margin: 0 !important;
          max-width: 100% !important;
          overflow: hidden !important;
          overflow-wrap: anywhere !important;
          -webkit-box-orient: vertical !important;
          -webkit-line-clamp: 2 !important;
        }

        :global(.publicRankingCardV2__mobileBody p),
        :global(.publicRankingCardV2__mobileBody small) {
          color: #64748b !important;
          font-size: 11.5px !important;
          font-weight: 760 !important;
          line-height: 1.15 !important;
          margin: 0 !important;
          min-width: 0 !important;
        }

        :global(.publicRankingCardV2--ranking > .publicRankingCardV2__mobileLayout > .publicRankingCardV2__mobileBody p),
        :global(.publicRankingCardV2--ranking > .publicRankingCardV2__mobileLayout > .publicRankingCardV2__mobileBody small) {
          font-size: 11.5px !important;
          font-weight: 760 !important;
        }

        :global(.publicRankingCardV2__mobileBody p) {
          color: #0f172a !important;
          font-weight: 820 !important;
        }

        :global(.publicRankingCardV2__mobileCta) {
          align-items: center !important;
          align-self: end !important;
          background: #020617 !important;
          border-radius: 999px !important;
          box-shadow: 0 10px 20px rgba(6,27,58,.14), 0 0 0 3px color-mix(in srgb, var(--club-secondary) 9%, transparent) !important;
          color: #fff !important;
          display: inline-flex !important;
          font-size: 8.8px !important;
          font-weight: 880 !important;
          gap: 6px !important;
          justify-self: end !important;
          letter-spacing: .025em !important;
          line-height: 1 !important;
          margin-top: auto !important;
          min-height: 30px !important;
          min-width: 112px !important;
          padding: 0 11px !important;
          text-transform: uppercase !important;
          white-space: nowrap !important;
        }

        :global(.publicRankingCardV2__mobileCta b) {
          font-size: 14px !important;
          line-height: 1 !important;
        }

        :global(.publicRankingCardV2__rankingHeader h2) {
          font-size: 24px !important;
          font-weight: 900 !important;
          letter-spacing: 0 !important;
          line-height: 1.02 !important;
          padding-right: 28px !important;
        }

        :global(.publicRankingCardV2__rankingHeader span) {
          margin-top: 7px !important;
          max-width: 112px !important;
        }

        :global(.publicRankingCardV2__rankingMeta) {
          gap: 9px !important;
          transform: none !important;
        }

        :global(.publicRankingCardV2__rankingMeta > div) {
          border-radius: 16px !important;
          flex-basis: 48px !important;
          height: 48px !important;
          min-width: 48px !important;
          padding: 5px !important;
          width: 48px !important;
        }

        :global(.publicRankingCardV2__rankingCopy) {
          font-size: 12.5px !important;
          font-weight: 760 !important;
          line-height: 1.2 !important;
        }

        :global(.publicRankingCardV2__cta) {
          font-size: 9px !important;
          height: 29px !important;
          min-width: 98px !important;
          padding: 0 10px !important;
        }
      }
    `}</style>
  )
}
