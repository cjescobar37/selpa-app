import type { CSSProperties, ElementType } from 'react'
import {
  getPlatformAdResponsiveConfig,
  normalizePlatformAdRenderConfig,
  type PlatformAdRenderConfig,
} from '@/lib/platformAdConfig'

type ConfigurableAdBannerProps = {
  title: string
  description?: string | null
  imageUrl?: string | null
  href?: string | null
  config: PlatformAdRenderConfig | unknown
  className?: string
  loading?: 'eager' | 'lazy'
  viewport?: 'desktop' | 'mobile'
}

export const AD_BANNER_DIMENSIONS = {
  desktopWidth: 1056,
  desktopHeight: 112,
  mobileHeight: 78,
  mobileWidth: 341,
} as const

function buildBannerVariables(config: PlatformAdRenderConfig, prefix = '') {
  const background = config.backgroundMode === 'solid'
    ? config.backgroundColor
    : `linear-gradient(135deg, ${config.gradientFrom}, ${config.gradientTo})`

  return {
    [`--ad-${prefix}bg` as string]: background,
    [`--ad-${prefix}bg-opacity` as string]: String(config.backgroundOpacity),
    [`--ad-${prefix}overlay-color` as string]: config.overlay === 'light' ? '255,255,255' : '2,6,23',
    [`--ad-${prefix}overlay-opacity` as string]: config.overlay === 'none' ? '0' : String(config.overlayOpacity),
    [`--ad-${prefix}title-color` as string]: config.titleColor,
    [`--ad-${prefix}subtitle-color` as string]: config.subtitleColor,
    [`--ad-${prefix}button-color` as string]: config.buttonTextColor,
    [`--ad-${prefix}button-bg` as string]: config.buttonBackgroundColor,
    [`--ad-${prefix}button-border-color` as string]: config.buttonBorderColor,
    [`--ad-${prefix}button-border-width` as string]: `${config.buttonBorderWidth}px`,
    [`--ad-${prefix}image-opacity` as string]: String(config.imageOpacity),
    [`--ad-${prefix}image-width` as string]: `${config.imageWidth}%`,
    [`--ad-${prefix}image-stretch-x` as string]: String(config.imageStretchX),
    [`--ad-${prefix}image-scale` as string]: String(config.imageScale),
    [`--ad-${prefix}image-x` as string]: `${config.imageX}px`,
    [`--ad-${prefix}image-y` as string]: `${config.imageY}px`,
    [`--ad-${prefix}image-fit` as string]: config.imageFit,
    [`--ad-${prefix}title-size` as string]: `${config.titleSize}px`,
    [`--ad-${prefix}title-weight` as string]: String(config.titleWeight),
    [`--ad-${prefix}title-align` as string]: config.titleAlign,
    [`--ad-${prefix}title-x` as string]: `${config.titleX}px`,
    [`--ad-${prefix}title-y` as string]: `${config.titleY}px`,
    [`--ad-${prefix}title-max` as string]: `${config.titleMaxWidth}%`,
    [`--ad-${prefix}title-opacity` as string]: String(config.titleOpacity),
    [`--ad-${prefix}title-line` as string]: String(config.titleLineHeight),
    [`--ad-${prefix}subtitle-size` as string]: `${config.subtitleSize}px`,
    [`--ad-${prefix}subtitle-weight` as string]: String(config.subtitleWeight),
    [`--ad-${prefix}subtitle-align` as string]: config.subtitleAlign,
    [`--ad-${prefix}subtitle-x` as string]: `${config.subtitleX}px`,
    [`--ad-${prefix}subtitle-y` as string]: `${config.subtitleY}px`,
    [`--ad-${prefix}subtitle-max` as string]: `${config.subtitleMaxWidth}%`,
    [`--ad-${prefix}subtitle-opacity` as string]: String(config.subtitleOpacity),
    [`--ad-${prefix}subtitle-line` as string]: String(config.subtitleLineHeight),
    [`--ad-${prefix}secondary-size` as string]: `${config.secondarySize}px`,
    [`--ad-${prefix}secondary-weight` as string]: String(config.secondaryWeight),
    [`--ad-${prefix}secondary-align` as string]: config.secondaryAlign,
    [`--ad-${prefix}secondary-x` as string]: `${config.secondaryX}px`,
    [`--ad-${prefix}secondary-y` as string]: `${config.secondaryY}px`,
    [`--ad-${prefix}secondary-max` as string]: `${config.secondaryMaxWidth}%`,
    [`--ad-${prefix}secondary-opacity` as string]: String(config.secondaryOpacity),
    [`--ad-${prefix}secondary-line` as string]: String(config.secondaryLineHeight),
    [`--ad-${prefix}button-align` as string]: config.buttonAlign,
    [`--ad-${prefix}button-x` as string]: `${config.buttonX}px`,
    [`--ad-${prefix}button-y` as string]: `${config.buttonY}px`,
    [`--ad-${prefix}button-size` as string]: `${config.buttonSize}px`,
    [`--ad-${prefix}button-px` as string]: `${config.buttonPaddingX}px`,
    [`--ad-${prefix}button-py` as string]: `${config.buttonPaddingY}px`,
    [`--ad-${prefix}button-radius` as string]: `${config.buttonRadius}px`,
    [`--ad-${prefix}button-opacity` as string]: String(config.buttonOpacity),
  } satisfies CSSProperties
}

function buildBannerStyle(config: PlatformAdRenderConfig) {
  return {
    ...buildBannerVariables(config),
    ...buildBannerVariables(getPlatformAdResponsiveConfig(config, 'mobile'), 'mobile-'),
  } satisfies CSSProperties
}

export default function ConfigurableAdBanner({
  title,
  description,
  imageUrl,
  href,
  config: rawConfig,
  className,
  loading = 'lazy',
  viewport,
}: ConfigurableAdBannerProps) {
  const config = normalizePlatformAdRenderConfig(rawConfig)
  const mobileConfig = getPlatformAdResponsiveConfig(config, 'mobile')
  const subtitle = config.subtitle || description || ''
  const showImage = Boolean(imageUrl) && (config.layout !== 'text-only' || mobileConfig.layout !== 'text-only')
  const showText = config.layout !== 'image-only' || mobileConfig.layout !== 'image-only'
  const Tag = (href ? 'a' : 'article') as ElementType
  const style = buildBannerStyle(config)
  const classes = [
    'selpaAdBanner',
    `is-${config.layout}`,
    `is-mobile-${mobileConfig.layout}`,
    `mobile-layout-${mobileConfig.layout}`,
    `has-image-${config.imagePosition}`,
    `has-mobile-image-${mobileConfig.imagePosition}`,
    `button-align-${config.buttonAlign}`,
    `mobile-button-align-${mobileConfig.buttonAlign}`,
    viewport ? `is-render-${viewport}` : '',
    imageUrl ? 'has-image' : '',
    className ?? '',
  ].filter(Boolean).join(' ')

  return (
    <Tag className={classes} href={href || undefined} target={href ? '_blank' : undefined} rel={href ? 'noreferrer' : undefined} style={style}>
      <span className="selpaAdBannerBg" aria-hidden="true" />
      {showImage ? (
        <span className={`selpaAdBannerImage is-${config.imagePosition}`} aria-hidden="true">
          <img src={imageUrl!} alt="" loading={loading} decoding="async" />
        </span>
      ) : null}
      <span className="selpaAdBannerOverlay" aria-hidden="true" />
      <span className="selpaAdBannerBadge">PUBLICIDAD</span>
      {showText ? (
        <span className="selpaAdBannerBody">
          {subtitle ? <span className="selpaAdBannerSubtitle">{subtitle}</span> : null}
          <strong className="selpaAdBannerTitle">{title || 'Nombre de campaña'}</strong>
          {config.secondaryText ? <em className="selpaAdBannerSecondary">{config.secondaryText}</em> : null}
        </span>
      ) : null}
      {showText && config.buttonEnabled && config.buttonText ? <b className="selpaAdBannerButton">{config.buttonText}</b> : null}
      <style jsx>{`
        .selpaAdBanner {
          background: transparent;
          border: 0;
          color: var(--ad-title-color);
          display: block;
          height: var(--selpa-ad-height, ${AD_BANNER_DIMENSIONS.desktopHeight}px);
          isolation: isolate;
          min-height: var(--selpa-ad-height, ${AD_BANNER_DIMENSIONS.desktopHeight}px);
          min-width: 0;
          overflow: hidden;
          position: relative;
          text-decoration: none;
        }

        .selpaAdBannerBg,
        .selpaAdBannerOverlay {
          inset: 0;
          position: absolute;
        }

        .selpaAdBannerBg {
          background: var(--ad-bg);
          opacity: var(--ad-bg-opacity);
          z-index: 0;
        }

        .selpaAdBannerOverlay {
          background: rgba(var(--ad-overlay-color), var(--ad-overlay-opacity));
          z-index: 2;
        }

        .selpaAdBannerImage {
          bottom: 0;
          opacity: var(--ad-image-opacity);
          overflow: hidden;
          position: absolute;
          top: 0;
          width: var(--ad-image-width);
          z-index: 1;
        }

        .selpaAdBannerImage.is-left {
          left: 0;
          mask-image: linear-gradient(90deg, #000 0%, #000 34%, rgba(0,0,0,.68) 58%, transparent 100%);
          -webkit-mask-image: linear-gradient(90deg, #000 0%, #000 34%, rgba(0,0,0,.68) 58%, transparent 100%);
        }

        .selpaAdBannerImage.is-center {
          left: 18%;
          mask-image: linear-gradient(90deg, transparent 0%, rgba(0,0,0,.72) 18%, #000 50%, rgba(0,0,0,.72) 82%, transparent 100%);
          -webkit-mask-image: linear-gradient(90deg, transparent 0%, rgba(0,0,0,.72) 18%, #000 50%, rgba(0,0,0,.72) 82%, transparent 100%);
        }

        .selpaAdBannerImage.is-right {
          right: 0;
          mask-image: linear-gradient(270deg, #000 0%, #000 34%, rgba(0,0,0,.68) 58%, transparent 100%);
          -webkit-mask-image: linear-gradient(270deg, #000 0%, #000 34%, rgba(0,0,0,.68) 58%, transparent 100%);
        }

        .selpaAdBanner .selpaAdBannerImage img {
          display: block;
          filter: saturate(1.05) contrast(1.02);
          height: 100%;
          inset: auto;
          object-fit: var(--ad-image-fit);
          object-position: center;
          position: static;
          transform: translate(var(--ad-image-x), var(--ad-image-y)) scale(var(--ad-image-scale)) scaleX(var(--ad-image-stretch-x));
          width: 100%;
        }

        .selpaAdBannerBadge {
          background: rgba(255,255,255,.84);
          border-radius: var(--ds-radius-pill, 999px);
          color: #0f172a;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: .08em;
          line-height: 1;
          padding: 4px 6px;
          position: absolute;
          right: 8px;
          text-transform: uppercase;
          top: 8px;
          z-index: 4;
        }

        .selpaAdBannerBody {
          align-content: center;
          bottom: 0;
          display: grid;
          gap: 3px;
          left: 12px;
          max-width: 66%;
          padding-right: 78px;
          position: absolute;
          top: 0;
          z-index: 3;
        }

        .selpaAdBanner.is-image-left .selpaAdBannerBody {
          left: 42%;
          max-width: 50%;
          padding-right: 54px;
        }

        .selpaAdBanner.is-text-only .selpaAdBannerBody {
          max-width: 78%;
        }

        .selpaAdBannerSubtitle,
        .selpaAdBannerTitle,
        .selpaAdBannerSecondary,
        .selpaAdBannerButton {
          max-width: 100%;
          min-width: 0;
        }

        .selpaAdBannerSubtitle {
          color: var(--ad-subtitle-color);
          display: block;
          font-size: var(--ad-subtitle-size);
          font-weight: var(--ad-subtitle-weight);
          letter-spacing: .08em;
          line-height: var(--ad-subtitle-line);
          max-width: var(--ad-subtitle-max);
          opacity: var(--ad-subtitle-opacity);
          text-align: var(--ad-subtitle-align);
          text-transform: uppercase;
          transform: translate(var(--ad-subtitle-x), var(--ad-subtitle-y));
        }

        .selpaAdBannerTitle {
          color: var(--ad-title-color);
          display: -webkit-box;
          font-size: var(--ad-title-size);
          font-weight: var(--ad-title-weight);
          letter-spacing: -.03em;
          line-height: var(--ad-title-line);
          max-width: var(--ad-title-max);
          opacity: var(--ad-title-opacity);
          overflow: hidden;
          overflow-wrap: anywhere;
          text-align: var(--ad-title-align);
          text-shadow: 0 2px 14px rgba(2,6,23,.26);
          transform: translate(var(--ad-title-x), var(--ad-title-y));
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }

        .selpaAdBannerSecondary {
          color: var(--ad-subtitle-color);
          display: -webkit-box;
          font-size: var(--ad-secondary-size);
          font-style: normal;
          font-weight: var(--ad-secondary-weight);
          line-height: var(--ad-secondary-line);
          max-width: var(--ad-secondary-max);
          opacity: var(--ad-secondary-opacity);
          overflow: hidden;
          text-align: var(--ad-secondary-align);
          transform: translate(var(--ad-secondary-x), var(--ad-secondary-y));
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 1;
        }

        .selpaAdBannerButton {
          background: var(--ad-button-bg);
          border: var(--ad-button-border-width) solid var(--ad-button-border-color);
          border-radius: var(--ad-button-radius);
          bottom: 8px;
          color: var(--ad-button-color);
          display: inline-flex;
          font-size: var(--ad-button-size);
          font-style: normal;
          font-weight: 900;
          line-height: 1;
          opacity: var(--ad-button-opacity);
          padding: var(--ad-button-py) var(--ad-button-px);
          position: absolute;
          text-transform: uppercase;
          width: max-content;
          z-index: 4;
        }

        .selpaAdBanner.button-align-left .selpaAdBannerButton {
          left: 12px;
          transform: translate(var(--ad-button-x), var(--ad-button-y));
        }

        .selpaAdBanner.is-image-left.button-align-left .selpaAdBannerButton {
          left: 42%;
        }

        .selpaAdBanner.button-align-center .selpaAdBannerButton {
          left: 50%;
          transform: translate(calc(-50% + var(--ad-button-x)), var(--ad-button-y));
        }

        .selpaAdBanner.button-align-right .selpaAdBannerButton {
          right: 8px;
          transform: translate(var(--ad-button-x), var(--ad-button-y));
        }

        .selpaAdBanner.is-render-mobile {
          --ad-bg: var(--ad-mobile-bg);
          --ad-bg-opacity: var(--ad-mobile-bg-opacity);
          --ad-overlay-color: var(--ad-mobile-overlay-color);
          --ad-overlay-opacity: var(--ad-mobile-overlay-opacity);
          --ad-title-color: var(--ad-mobile-title-color);
          --ad-subtitle-color: var(--ad-mobile-subtitle-color);
          --ad-button-color: var(--ad-mobile-button-color);
          --ad-button-bg: var(--ad-mobile-button-bg);
          --ad-button-border-color: var(--ad-mobile-button-border-color);
          --ad-button-border-width: var(--ad-mobile-button-border-width);
          --ad-image-opacity: var(--ad-mobile-image-opacity);
          --ad-image-width: var(--ad-mobile-image-width);
          --ad-image-stretch-x: var(--ad-mobile-image-stretch-x);
          --ad-image-scale: var(--ad-mobile-image-scale);
          --ad-image-x: var(--ad-mobile-image-x);
          --ad-image-y: var(--ad-mobile-image-y);
          --ad-image-fit: var(--ad-mobile-image-fit);
          --ad-title-size: var(--ad-mobile-title-size);
          --ad-title-weight: var(--ad-mobile-title-weight);
          --ad-title-align: var(--ad-mobile-title-align);
          --ad-title-x: var(--ad-mobile-title-x);
          --ad-title-y: var(--ad-mobile-title-y);
          --ad-title-max: var(--ad-mobile-title-max);
          --ad-title-opacity: var(--ad-mobile-title-opacity);
          --ad-title-line: var(--ad-mobile-title-line);
          --ad-subtitle-size: var(--ad-mobile-subtitle-size);
          --ad-subtitle-weight: var(--ad-mobile-subtitle-weight);
          --ad-subtitle-align: var(--ad-mobile-subtitle-align);
          --ad-subtitle-x: var(--ad-mobile-subtitle-x);
          --ad-subtitle-y: var(--ad-mobile-subtitle-y);
          --ad-subtitle-max: var(--ad-mobile-subtitle-max);
          --ad-subtitle-opacity: var(--ad-mobile-subtitle-opacity);
          --ad-subtitle-line: var(--ad-mobile-subtitle-line);
          --ad-secondary-size: var(--ad-mobile-secondary-size);
          --ad-secondary-weight: var(--ad-mobile-secondary-weight);
          --ad-secondary-align: var(--ad-mobile-secondary-align);
          --ad-secondary-x: var(--ad-mobile-secondary-x);
          --ad-secondary-y: var(--ad-mobile-secondary-y);
          --ad-secondary-max: var(--ad-mobile-secondary-max);
          --ad-secondary-opacity: var(--ad-mobile-secondary-opacity);
          --ad-secondary-line: var(--ad-mobile-secondary-line);
          --ad-button-align: var(--ad-mobile-button-align);
          --ad-button-x: var(--ad-mobile-button-x);
          --ad-button-y: var(--ad-mobile-button-y);
          --ad-button-size: var(--ad-mobile-button-size);
          --ad-button-px: var(--ad-mobile-button-px);
          --ad-button-py: var(--ad-mobile-button-py);
          --ad-button-radius: var(--ad-mobile-button-radius);
          --ad-button-opacity: var(--ad-mobile-button-opacity);
          height: var(--selpa-ad-mobile-height, ${AD_BANNER_DIMENSIONS.mobileHeight}px);
          min-height: var(--selpa-ad-mobile-height, ${AD_BANNER_DIMENSIONS.mobileHeight}px);
        }

        .selpaAdBanner.is-render-mobile .selpaAdBannerBg {
          background: var(--ad-mobile-bg);
          opacity: var(--ad-mobile-bg-opacity);
        }

        .selpaAdBanner.is-render-mobile .selpaAdBannerOverlay {
          background: rgba(var(--ad-mobile-overlay-color), var(--ad-mobile-overlay-opacity));
        }

        .selpaAdBanner.is-render-mobile .selpaAdBannerImage {
          opacity: var(--ad-mobile-image-opacity);
          width: var(--ad-mobile-image-width);
        }

        .selpaAdBanner.is-render-mobile .selpaAdBannerImage img {
          object-fit: var(--ad-mobile-image-fit);
          transform: translate(var(--ad-mobile-image-x), var(--ad-mobile-image-y)) scale(var(--ad-mobile-image-scale)) scaleX(var(--ad-mobile-image-stretch-x));
        }

        .selpaAdBanner.is-render-mobile .selpaAdBannerSubtitle {
          color: var(--ad-mobile-subtitle-color);
          font-size: var(--ad-mobile-subtitle-size);
          font-weight: var(--ad-mobile-subtitle-weight);
          line-height: var(--ad-mobile-subtitle-line);
          max-width: var(--ad-mobile-subtitle-max);
          opacity: var(--ad-mobile-subtitle-opacity);
          text-align: var(--ad-mobile-subtitle-align);
          transform: translate(var(--ad-mobile-subtitle-x), var(--ad-mobile-subtitle-y));
        }

        .selpaAdBanner.is-render-mobile .selpaAdBannerTitle {
          color: var(--ad-mobile-title-color);
          font-size: var(--ad-mobile-title-size);
          font-weight: var(--ad-mobile-title-weight);
          line-height: var(--ad-mobile-title-line);
          max-width: var(--ad-mobile-title-max);
          opacity: var(--ad-mobile-title-opacity);
          text-align: var(--ad-mobile-title-align);
          transform: translate(var(--ad-mobile-title-x), var(--ad-mobile-title-y));
        }

        .selpaAdBanner.is-render-mobile .selpaAdBannerSecondary {
          color: var(--ad-mobile-subtitle-color);
          font-size: var(--ad-mobile-secondary-size);
          font-weight: var(--ad-mobile-secondary-weight);
          line-height: var(--ad-mobile-secondary-line);
          max-width: var(--ad-mobile-secondary-max);
          opacity: var(--ad-mobile-secondary-opacity);
          text-align: var(--ad-mobile-secondary-align);
          transform: translate(var(--ad-mobile-secondary-x), var(--ad-mobile-secondary-y));
        }

        .selpaAdBanner.is-render-mobile .selpaAdBannerButton {
          background: var(--ad-mobile-button-bg);
          border-color: var(--ad-mobile-button-border-color);
          border-radius: var(--ad-mobile-button-radius);
          border-width: var(--ad-mobile-button-border-width);
          color: var(--ad-mobile-button-color);
          font-size: var(--ad-mobile-button-size);
          opacity: var(--ad-mobile-button-opacity);
          padding: var(--ad-mobile-button-py) var(--ad-mobile-button-px);
        }

        .selpaAdBanner.is-render-mobile.mobile-button-align-left .selpaAdBannerButton {
          left: 9px;
          right: auto;
          transform: translate(var(--ad-mobile-button-x), var(--ad-mobile-button-y));
        }

        .selpaAdBanner.is-render-mobile.mobile-layout-image-left.mobile-button-align-left .selpaAdBannerButton {
          left: 39%;
        }

        .selpaAdBanner.is-render-mobile.mobile-button-align-center .selpaAdBannerButton {
          left: 50%;
          right: auto;
          transform: translate(calc(-50% + var(--ad-mobile-button-x)), var(--ad-mobile-button-y));
        }

        .selpaAdBanner.is-render-mobile.mobile-button-align-right .selpaAdBannerButton {
          left: auto;
          right: 6px;
          transform: translate(var(--ad-mobile-button-x), var(--ad-mobile-button-y));
        }

        .selpaAdBanner.is-render-mobile.has-mobile-image-left .selpaAdBannerImage {
          left: 0;
          right: auto;
          mask-image: linear-gradient(90deg, #000 0%, #000 34%, rgba(0,0,0,.68) 58%, transparent 100%);
          -webkit-mask-image: linear-gradient(90deg, #000 0%, #000 34%, rgba(0,0,0,.68) 58%, transparent 100%);
        }

        .selpaAdBanner.is-render-mobile.has-mobile-image-center .selpaAdBannerImage {
          left: 21%;
          right: auto;
          mask-image: linear-gradient(90deg, transparent 0%, rgba(0,0,0,.72) 18%, #000 50%, rgba(0,0,0,.72) 82%, transparent 100%);
          -webkit-mask-image: linear-gradient(90deg, transparent 0%, rgba(0,0,0,.72) 18%, #000 50%, rgba(0,0,0,.72) 82%, transparent 100%);
        }

        .selpaAdBanner.is-render-mobile.has-mobile-image-right .selpaAdBannerImage {
          left: auto;
          right: 0;
          mask-image: linear-gradient(270deg, #000 0%, #000 34%, rgba(0,0,0,.68) 58%, transparent 100%);
          -webkit-mask-image: linear-gradient(270deg, #000 0%, #000 34%, rgba(0,0,0,.68) 58%, transparent 100%);
        }

        .selpaAdBanner.is-render-mobile.mobile-layout-text-only .selpaAdBannerImage { display: none; }
        .selpaAdBanner.is-render-mobile.mobile-layout-image-only .selpaAdBannerBody { display: none; }
        .selpaAdBanner.is-render-mobile .selpaAdBannerBody { gap: 2px; left: 9px; max-width: 70%; padding-right: 64px; }
        .selpaAdBanner.is-render-mobile.mobile-layout-image-left .selpaAdBannerBody { left: 39%; max-width: 55%; padding-right: 40px; }
        .selpaAdBanner.is-render-mobile.mobile-layout-text-only .selpaAdBannerBody { max-width: 78%; }
        .selpaAdBanner.is-render-mobile .selpaAdBannerBadge { font-size: 7px; padding: 3px 5px; right: 6px; top: 6px; }
        .selpaAdBanner.is-render-mobile .selpaAdBannerSecondary { display: none; }

        @media (max-width: 720px) {
          .selpaAdBanner {
            --ad-bg: var(--ad-mobile-bg);
            --ad-bg-opacity: var(--ad-mobile-bg-opacity);
            --ad-overlay-color: var(--ad-mobile-overlay-color);
            --ad-overlay-opacity: var(--ad-mobile-overlay-opacity);
            --ad-title-color: var(--ad-mobile-title-color);
            --ad-subtitle-color: var(--ad-mobile-subtitle-color);
            --ad-button-color: var(--ad-mobile-button-color);
            --ad-button-bg: var(--ad-mobile-button-bg);
            --ad-button-border-color: var(--ad-mobile-button-border-color);
            --ad-button-border-width: var(--ad-mobile-button-border-width);
            --ad-image-opacity: var(--ad-mobile-image-opacity);
            --ad-image-width: var(--ad-mobile-image-width);
            --ad-image-stretch-x: var(--ad-mobile-image-stretch-x);
            --ad-image-scale: var(--ad-mobile-image-scale);
            --ad-image-x: var(--ad-mobile-image-x);
            --ad-image-y: var(--ad-mobile-image-y);
            --ad-image-fit: var(--ad-mobile-image-fit);
            --ad-title-size: var(--ad-mobile-title-size);
            --ad-title-weight: var(--ad-mobile-title-weight);
            --ad-title-align: var(--ad-mobile-title-align);
            --ad-title-x: var(--ad-mobile-title-x);
            --ad-title-y: var(--ad-mobile-title-y);
            --ad-title-max: var(--ad-mobile-title-max);
            --ad-title-opacity: var(--ad-mobile-title-opacity);
            --ad-title-line: var(--ad-mobile-title-line);
            --ad-subtitle-size: var(--ad-mobile-subtitle-size);
            --ad-subtitle-weight: var(--ad-mobile-subtitle-weight);
            --ad-subtitle-align: var(--ad-mobile-subtitle-align);
            --ad-subtitle-x: var(--ad-mobile-subtitle-x);
            --ad-subtitle-y: var(--ad-mobile-subtitle-y);
            --ad-subtitle-max: var(--ad-mobile-subtitle-max);
            --ad-subtitle-opacity: var(--ad-mobile-subtitle-opacity);
            --ad-subtitle-line: var(--ad-mobile-subtitle-line);
            --ad-secondary-size: var(--ad-mobile-secondary-size);
            --ad-secondary-weight: var(--ad-mobile-secondary-weight);
            --ad-secondary-align: var(--ad-mobile-secondary-align);
            --ad-secondary-x: var(--ad-mobile-secondary-x);
            --ad-secondary-y: var(--ad-mobile-secondary-y);
            --ad-secondary-max: var(--ad-mobile-secondary-max);
            --ad-secondary-opacity: var(--ad-mobile-secondary-opacity);
            --ad-secondary-line: var(--ad-mobile-secondary-line);
            --ad-button-align: var(--ad-mobile-button-align);
            --ad-button-x: var(--ad-mobile-button-x);
            --ad-button-y: var(--ad-mobile-button-y);
            --ad-button-size: var(--ad-mobile-button-size);
            --ad-button-px: var(--ad-mobile-button-px);
            --ad-button-py: var(--ad-mobile-button-py);
            --ad-button-radius: var(--ad-mobile-button-radius);
            --ad-button-opacity: var(--ad-mobile-button-opacity);
            height: var(--selpa-ad-mobile-height, ${AD_BANNER_DIMENSIONS.mobileHeight}px);
            min-height: var(--selpa-ad-mobile-height, ${AD_BANNER_DIMENSIONS.mobileHeight}px);
          }
          .selpaAdBannerBg {
            background: var(--ad-mobile-bg);
            opacity: var(--ad-mobile-bg-opacity);
          }
          .selpaAdBannerOverlay {
            background: rgba(var(--ad-mobile-overlay-color), var(--ad-mobile-overlay-opacity));
          }
          .selpaAdBannerImage {
            opacity: var(--ad-mobile-image-opacity);
            width: var(--ad-mobile-image-width);
          }
          .selpaAdBanner .selpaAdBannerImage img {
            object-fit: var(--ad-mobile-image-fit);
            transform: translate(var(--ad-mobile-image-x), var(--ad-mobile-image-y)) scale(var(--ad-mobile-image-scale)) scaleX(var(--ad-mobile-image-stretch-x));
          }
          .selpaAdBannerSubtitle {
            color: var(--ad-mobile-subtitle-color);
            font-size: var(--ad-mobile-subtitle-size);
            font-weight: var(--ad-mobile-subtitle-weight);
            line-height: var(--ad-mobile-subtitle-line);
            max-width: var(--ad-mobile-subtitle-max);
            opacity: var(--ad-mobile-subtitle-opacity);
            text-align: var(--ad-mobile-subtitle-align);
            transform: translate(var(--ad-mobile-subtitle-x), var(--ad-mobile-subtitle-y));
          }
          .selpaAdBannerTitle {
            color: var(--ad-mobile-title-color);
            font-size: var(--ad-mobile-title-size);
            font-weight: var(--ad-mobile-title-weight);
            line-height: var(--ad-mobile-title-line);
            max-width: var(--ad-mobile-title-max);
            opacity: var(--ad-mobile-title-opacity);
            text-align: var(--ad-mobile-title-align);
            transform: translate(var(--ad-mobile-title-x), var(--ad-mobile-title-y));
          }
          .selpaAdBannerSecondary {
            color: var(--ad-mobile-subtitle-color);
            font-size: var(--ad-mobile-secondary-size);
            font-weight: var(--ad-mobile-secondary-weight);
            line-height: var(--ad-mobile-secondary-line);
            max-width: var(--ad-mobile-secondary-max);
            opacity: var(--ad-mobile-secondary-opacity);
            text-align: var(--ad-mobile-secondary-align);
            transform: translate(var(--ad-mobile-secondary-x), var(--ad-mobile-secondary-y));
          }
          .selpaAdBannerButton {
            background: var(--ad-mobile-button-bg);
            border-color: var(--ad-mobile-button-border-color);
            border-radius: var(--ad-mobile-button-radius);
            border-width: var(--ad-mobile-button-border-width);
            color: var(--ad-mobile-button-color);
            font-size: var(--ad-mobile-button-size);
            opacity: var(--ad-mobile-button-opacity);
            padding: var(--ad-mobile-button-py) var(--ad-mobile-button-px);
          }
          .selpaAdBanner.mobile-button-align-left .selpaAdBannerButton {
            left: 9px;
            right: auto;
            transform: translate(var(--ad-mobile-button-x), var(--ad-mobile-button-y));
          }
          .selpaAdBanner.mobile-layout-image-left.mobile-button-align-left .selpaAdBannerButton {
            left: 39%;
          }
          .selpaAdBanner.mobile-button-align-center .selpaAdBannerButton {
            left: 50%;
            right: auto;
            transform: translate(calc(-50% + var(--ad-mobile-button-x)), var(--ad-mobile-button-y));
          }
          .selpaAdBanner.mobile-button-align-right .selpaAdBannerButton {
            left: auto;
            right: 6px;
            transform: translate(var(--ad-mobile-button-x), var(--ad-mobile-button-y));
          }
          .selpaAdBanner.has-mobile-image-left .selpaAdBannerImage {
            left: 0;
            right: auto;
            mask-image: linear-gradient(90deg, #000 0%, #000 34%, rgba(0,0,0,.68) 58%, transparent 100%);
            -webkit-mask-image: linear-gradient(90deg, #000 0%, #000 34%, rgba(0,0,0,.68) 58%, transparent 100%);
          }
          .selpaAdBanner.has-mobile-image-center .selpaAdBannerImage {
            left: 21%;
            right: auto;
            mask-image: linear-gradient(90deg, transparent 0%, rgba(0,0,0,.72) 18%, #000 50%, rgba(0,0,0,.72) 82%, transparent 100%);
            -webkit-mask-image: linear-gradient(90deg, transparent 0%, rgba(0,0,0,.72) 18%, #000 50%, rgba(0,0,0,.72) 82%, transparent 100%);
          }
          .selpaAdBanner.has-mobile-image-right .selpaAdBannerImage {
            left: auto;
            right: 0;
            mask-image: linear-gradient(270deg, #000 0%, #000 34%, rgba(0,0,0,.68) 58%, transparent 100%);
            -webkit-mask-image: linear-gradient(270deg, #000 0%, #000 34%, rgba(0,0,0,.68) 58%, transparent 100%);
          }
          .selpaAdBanner.mobile-layout-text-only .selpaAdBannerImage { display: none; }
          .selpaAdBanner.mobile-layout-image-only .selpaAdBannerBody { display: none; }
          .selpaAdBannerBody { gap: 2px; left: 9px; max-width: 70%; padding-right: 64px; }
          .selpaAdBanner.mobile-layout-image-left .selpaAdBannerBody { left: 39%; max-width: 55%; padding-right: 40px; }
          .selpaAdBanner.mobile-layout-text-only .selpaAdBannerBody { max-width: 78%; }
          .selpaAdBannerBadge { font-size: 7px; padding: 3px 5px; right: 6px; top: 6px; }
          .selpaAdBannerSecondary { display: none; }
        }
      `}</style>
    </Tag>
  )
}
