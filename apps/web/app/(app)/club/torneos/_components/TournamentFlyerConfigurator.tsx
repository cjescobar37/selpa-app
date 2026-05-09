'use client'

import { useMemo } from 'react'
import fondo1 from '@/app/flyers/fondo1.png'
import fondo2 from '@/app/flyers/fondo2.png'
import fondo3 from '@/app/flyers/fondo3.png'
import fondo4 from '@/app/flyers/fondo4.png'
import fondo5 from '@/app/flyers/fondo5.png'
import fondo6 from '@/app/flyers/fondo6.png'
import fondo7 from '@/app/flyers/fondo7.png'
import fondo8 from '@/app/flyers/fondo8.png'
import fondo9 from '@/app/flyers/fondo9.png'
import fondo10 from '@/app/flyers/fondo10.png'
import fondo11 from '@/app/flyers/fondo11.png'
import fondo12 from '@/app/flyers/fondo12.png'
import fondo13 from '@/app/flyers/fondo13.png'
import fondo14 from '@/app/flyers/fondo14.png'
import fondo15 from '@/app/flyers/fondo15.png'
import fondo16 from '@/app/flyers/fondo16.png'
import fondo17 from '@/app/flyers/fondo17.png'

export type FlyerMode = 'NONE' | 'AUTO' | 'MANUAL'
export type FlyerStyle = 'CLASSIC' | 'MODERN' | 'MINIMAL' | 'DARK'
export type FlyerFont = 'SPORT' | 'DISPLAY' | 'CONDENSED' | 'ELEGANT' | 'GROTESK'
export type FlyerFontWeight = 'LIGHT' | 'MEDIUM' | 'BOLD'
export type FlyerTextAlign = 'left' | 'center' | 'right' | 'justify'

export type FlyerConfig = {
  mode: FlyerMode
  backgroundId: string
  titleColor: string
  textColor: string
  accentColor: string
  fontFamily: FlyerFont
  fontWeight: FlyerFontWeight
  style: FlyerStyle
  textAlign: FlyerTextAlign
}

export type FlyerPreviewData = {
  clubName?: string | null
  name: string
  type: string
  gender: string
  categoryLabel: string
  segmentLabel?: string | null
  competitionSystemLabel?: string | null
  venueName?: string | null
  startDate: string
  endDate: string
  registrationDeadline: string
  pricePerPlayer: string
}

type FlyerPreviewVariant = 'editor' | 'sidebar' | 'detailLarge' | 'card' | 'modal'

type Props = {
  value: FlyerConfig
  onChange: (next: FlyerConfig) => void
  previewData: FlyerPreviewData
  helperText?: string
}

const backgroundOptions = Array.from({ length: 17 }, (_, index) => ({
  id: `fondo${index + 1}`,
  label: `Fondo ${index + 1}`,
}))

const backgroundSrcById: Record<string, string> = {
  fondo1: fondo1.src,
  fondo2: fondo2.src,
  fondo3: fondo3.src,
  fondo4: fondo4.src,
  fondo5: fondo5.src,
  fondo6: fondo6.src,
  fondo7: fondo7.src,
  fondo8: fondo8.src,
  fondo9: fondo9.src,
  fondo10: fondo10.src,
  fondo11: fondo11.src,
  fondo12: fondo12.src,
  fondo13: fondo13.src,
  fondo14: fondo14.src,
  fondo15: fondo15.src,
  fondo16: fondo16.src,
  fondo17: fondo17.src,
}

const styleOptions: Array<{ value: FlyerStyle; label: string }> = [
  { value: 'CLASSIC', label: 'Clasico' },
  { value: 'MODERN', label: 'Moderno' },
  { value: 'MINIMAL', label: 'Minimal' },
  { value: 'DARK', label: 'Oscuro' },
]

const fontOptions: Array<{ value: FlyerFont; label: string }> = [
  { value: 'SPORT', label: 'Sport' },
  { value: 'DISPLAY', label: 'Display' },
  { value: 'CONDENSED', label: 'Condensed' },
  { value: 'ELEGANT', label: 'Elegant' },
  { value: 'GROTESK', label: 'Grotesk' },
]

const fontWeightOptions: Array<{ value: FlyerFontWeight; label: string; weight: number }> = [
  { value: 'LIGHT', label: 'Fina', weight: 500 },
  { value: 'MEDIUM', label: 'Media', weight: 700 },
  { value: 'BOLD', label: 'Ancha', weight: 900 },
]

const fontStacks: Record<FlyerFont, string> = {
  SPORT: '"Arial Black", "Segoe UI", sans-serif',
  DISPLAY: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
  CONDENSED: '"Roboto Condensed", "Arial Narrow", sans-serif',
  ELEGANT: 'Georgia, "Times New Roman", serif',
  GROTESK: 'Inter, "Segoe UI", sans-serif',
}

const fontWeightByOption: Record<FlyerFontWeight, number> = {
  LIGHT: 500,
  MEDIUM: 700,
  BOLD: 900,
}

function parseTournamentDate(value: string) {
  if (!value) return null
  const localDateTimeMatch = value.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/
  )
  if (localDateTimeMatch) {
    const [, year, month, day, hours = '00', minutes = '00', seconds = '00'] = localDateTimeMatch
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hours),
      Number(minutes),
      Number(seconds)
    )
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function formatDate(value: string) {
  if (!value) return 'Por definir'
  const date = parseTournamentDate(value)
  if (!date) return 'Por definir'
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function formatDateTime(value: string) {
  if (!value) return 'Por definir'
  const date = parseTournamentDate(value)
  if (!date) return 'Por definir'
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date).replace(',', ' ·')
}

function formatPrice(value: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 'A confirmar'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(parsed)
}

function getBackgroundStyle(backgroundId: string, style: FlyerStyle) {
  const overlayByStyle: Record<FlyerStyle, string> = {
    CLASSIC: 'linear-gradient(180deg, rgba(255,255,255,.06) 0%, rgba(15,23,42,.18) 100%)',
    MODERN: 'radial-gradient(circle at top right, rgba(255,255,255,.16), transparent 38%), linear-gradient(180deg, rgba(15,23,42,.04) 0%, rgba(15,23,42,.2) 100%)',
    MINIMAL: 'linear-gradient(180deg, rgba(255,255,255,.12) 0%, rgba(255,255,255,.02) 100%)',
    DARK: 'linear-gradient(180deg, rgba(2,6,23,.12) 0%, rgba(2,6,23,.48) 100%)',
  }

  return {
    backgroundImage: `${overlayByStyle[style]}, url('${backgroundSrcById[backgroundId] ?? backgroundSrcById.fondo1}')`,
    backgroundPosition: 'center',
    backgroundSize: 'cover',
  }
}

export function getTournamentFlyerSurfaceStyle(value: FlyerConfig) {
  return {
    ...getBackgroundStyle(value.backgroundId, value.style),
    backgroundSize: '112% auto',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: '78% center',
  }
}

export const defaultFlyerConfig: FlyerConfig = {
  mode: 'NONE',
  backgroundId: 'fondo1',
  titleColor: '#f8fafc',
  textColor: '#e2e8f0',
  accentColor: '#67e8f9',
  fontFamily: 'SPORT',
  fontWeight: 'MEDIUM',
  style: 'MODERN',
  textAlign: 'left',
}

export function readFlyerConfigFromRules(rules: Record<string, unknown> | null | undefined): FlyerConfig {
  if (!rules) return defaultFlyerConfig

  const mode = typeof rules.flyer_mode === 'string' ? rules.flyer_mode : defaultFlyerConfig.mode
  const backgroundId = typeof rules.flyer_background === 'string' ? rules.flyer_background : defaultFlyerConfig.backgroundId
  const titleColor = typeof rules.flyer_title_color === 'string' ? rules.flyer_title_color : defaultFlyerConfig.titleColor
  const textColor = typeof rules.flyer_text_color === 'string' ? rules.flyer_text_color : defaultFlyerConfig.textColor
  const accentColor = typeof rules.flyer_accent_color === 'string' ? rules.flyer_accent_color : defaultFlyerConfig.accentColor
  const fontFamily = typeof rules.flyer_font === 'string' ? rules.flyer_font : defaultFlyerConfig.fontFamily
  const fontWeight = typeof rules.flyer_font_weight === 'string' ? rules.flyer_font_weight : defaultFlyerConfig.fontWeight
  const style = typeof rules.flyer_style === 'string' ? rules.flyer_style : defaultFlyerConfig.style
  const textAlign = typeof rules.flyer_text_align === 'string' ? rules.flyer_text_align : defaultFlyerConfig.textAlign

  return {
    mode: mode === 'AUTO' || mode === 'MANUAL' || mode === 'NONE' ? mode : defaultFlyerConfig.mode,
    backgroundId,
    titleColor,
    textColor,
    accentColor,
    fontFamily: fontFamily === 'SPORT' || fontFamily === 'DISPLAY' || fontFamily === 'CONDENSED' || fontFamily === 'ELEGANT' || fontFamily === 'GROTESK'
      ? fontFamily
      : defaultFlyerConfig.fontFamily,
    fontWeight: fontWeight === 'LIGHT' || fontWeight === 'MEDIUM' || fontWeight === 'BOLD'
      ? fontWeight
      : defaultFlyerConfig.fontWeight,
    style: style === 'CLASSIC' || style === 'MODERN' || style === 'MINIMAL' || style === 'DARK'
      ? style
      : defaultFlyerConfig.style,
    textAlign: textAlign === 'center' || textAlign === 'right' || textAlign === 'justify' || textAlign === 'left'
      ? textAlign
      : defaultFlyerConfig.textAlign,
  }
}

export function TournamentFlyerPreviewCard({
  value,
  previewData,
  variant = 'editor',
}: {
  value: FlyerConfig
  previewData: FlyerPreviewData
  variant?: FlyerPreviewVariant
}) {
  const previewStyle = useMemo(() => getBackgroundStyle(value.backgroundId, value.style), [value.backgroundId, value.style])

  const headline = previewData.name.trim() || 'Nombre del torneo'
  const sportLine = [
    previewData.categoryLabel || 'Categoria por definir',
    previewData.gender || 'Genero por definir',
    previewData.segmentLabel || null,
  ].filter(Boolean).join(' · ')
  const tournamentType = previewData.type || 'Open'
  const clubName = previewData.clubName || 'Club por definir'
  const startDate = formatDate(previewData.startDate)
  const endDate = previewData.endDate ? formatDate(previewData.endDate) : ''
  const deadline = formatDateTime(previewData.registrationDeadline)
  const price = formatPrice(previewData.pricePerPlayer)
  const dateRange = endDate ? `${startDate} - ${endDate}` : startDate
  const highlightWeight = fontWeightByOption[value.fontWeight]
  const labelWeight = value.fontWeight === 'BOLD' ? 800 : 700
  const bodyWeight = value.fontWeight === 'LIGHT' ? 500 : 650

  return (
    <div className="flyerPreviewShell">
      {variant === 'editor' ? <span className="flyerPreviewLabel">Preview</span> : null}
      <div
        className={`flyerPreview flyerPreview--${value.mode.toLowerCase()} flyerPreview--${variant}`}
        style={{
          ...previewStyle,
          fontFamily: fontStacks[value.fontFamily],
          color: value.textColor,
          textAlign: value.textAlign,
        }}
      >
        <div className="flyerPreviewTop">
          <span className="flyerPreviewClub" style={{ fontWeight: labelWeight }}>{clubName}</span>
          <span
            className="flyerPreviewType"
            style={{
              borderColor: `${value.accentColor}99`,
              color: value.titleColor,
              fontWeight: highlightWeight,
            }}
          >
            {tournamentType}
          </span>
        </div>

        <div className="flyerPreviewBody">
          <div className="flyerPreviewMain">
            <span className="flyerPreviewEyebrow" style={{ color: value.accentColor, fontWeight: labelWeight }}>Padel competitivo</span>
            <h3 style={{ color: value.titleColor, fontWeight: highlightWeight }}>{headline}</h3>
            <p style={{ fontWeight: bodyWeight }}>{sportLine}</p>
          </div>

          <div className="flyerPreviewDate" style={{ borderColor: `${value.accentColor}80` }}>
            <span>Fecha destacada</span>
            <strong style={{ color: value.titleColor, fontWeight: highlightWeight }}>{dateRange}</strong>
          </div>
        </div>

        <div className="flyerPreviewMeta">
          <div>
            <span>Cierre inscripcion</span>
            <strong style={{ fontWeight: highlightWeight }}>{deadline}</strong>
          </div>
          <div>
            <span>Precio</span>
            <strong style={{ fontWeight: highlightWeight }}>{price}</strong>
          </div>
          <div>
            <span>Perfil deportivo</span>
            <strong style={{ fontWeight: highlightWeight }}>{sportLine}</strong>
          </div>
          {previewData.competitionSystemLabel ? (
            <div>
              <span>Sistema</span>
              <strong style={{ fontWeight: highlightWeight }}>{previewData.competitionSystemLabel}</strong>
            </div>
          ) : null}
          {previewData.venueName ? (
            <div>
              <span>Sede</span>
              <strong style={{ fontWeight: highlightWeight }}>{previewData.venueName}</strong>
            </div>
          ) : null}
        </div>

        {value.mode === 'MANUAL' ? (
          <div className="flyerManualOverlay">
            <strong>Flyer manual</strong>
            <span>Proximamente vas a poder subir tu pieza final.</span>
          </div>
        ) : null}

        {value.mode === 'NONE' ? (
          <div className="flyerNoneOverlay">
            <strong>Flyer del torneo</strong>
            <span>Cuando actives el modo automatico vas a ver aca la pieza visual lista para promocion.</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function TournamentFlyerConfigurator({ value, onChange, previewData, helperText }: Props) {
  const showLargePreview = value.mode === 'AUTO'

  return (
    <section className="flyerCard">
      <div className="flyerBlockHead">
        <div>
          <span className="flyerKicker">Flyer del torneo</span>
          <h2>Defini la identidad visual desde el alta</h2>
        </div>
        {helperText ? <p>{helperText}</p> : null}
      </div>

      <div className="flyerModeSwitch" role="tablist" aria-label="Modo de flyer">
        {[
          ['NONE', 'Sin flyer'],
          ['AUTO', 'Automatico'],
          ['MANUAL', 'Manual'],
        ].map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            className={`flyerModeChip${value.mode === mode ? ' is-active' : ''}`}
            onClick={() => onChange({ ...value, mode: mode as FlyerMode })}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={`flyerLayout${showLargePreview ? '' : ' flyerLayout--compact'}`}>
        <div className="flyerControls">
          {value.mode === 'NONE' ? (
            <div className="flyerPlaceholder flyerPlaceholder--compact">
              <strong>Sin flyer por ahora.</strong>
              <p>El torneo se crea normalmente y despues vas a poder activarlo cuando quieras trabajar la pieza visual.</p>
            </div>
          ) : null}

          {value.mode === 'MANUAL' ? (
            <div className="flyerPlaceholder flyerPlaceholder--compact">
              <strong>Manual en preparacion.</strong>
              <p>Proximamente vas a poder subir tu flyer manual con la misma vista previa del torneo.</p>
            </div>
          ) : null}

          {value.mode === 'AUTO' ? (
            <>
              <div className="flyerControlSection">
                <span className="flyerControlTitle">Fondos</span>
                <div className="flyerBackgroundGrid">
                  {backgroundOptions.map((background) => (
                    <button
                      key={background.id}
                      type="button"
                      className={`flyerBackgroundOption${value.backgroundId === background.id ? ' is-selected' : ''}`}
                      onClick={() => onChange({ ...value, backgroundId: background.id })}
                      aria-label={background.label}
                      title={background.label}
                    >
                      <span className="flyerBackgroundSwatch" style={getBackgroundStyle(background.id, value.style)} />
                      <span>{background.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flyerControlRow">
                <label className="flyerColorField">
                  <span>Titulo</span>
                  <input type="color" value={value.titleColor} onChange={(event) => onChange({ ...value, titleColor: event.target.value })} />
                </label>
                <label className="flyerColorField">
                  <span>Texto</span>
                  <input type="color" value={value.textColor} onChange={(event) => onChange({ ...value, textColor: event.target.value })} />
                </label>
                <label className="flyerColorField">
                  <span>Acento</span>
                  <input type="color" value={value.accentColor} onChange={(event) => onChange({ ...value, accentColor: event.target.value })} />
                </label>
              </div>

              <div className="flyerControlRow flyerControlRow--selects">
                <label className="flyerSelectField">
                  <span>Tipografia</span>
                  <select className="px-input" value={value.fontFamily} onChange={(event) => onChange({ ...value, fontFamily: event.target.value as FlyerFont })}>
                    {fontOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>

                <label className="flyerSelectField">
                  <span>Estilo</span>
                  <select className="px-input" value={value.style} onChange={(event) => onChange({ ...value, style: event.target.value as FlyerStyle })}>
                    {styleOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>

                <label className="flyerSelectField">
                  <span>Alineación de textos</span>
                  <select className="px-input" value={value.textAlign} onChange={(event) => onChange({ ...value, textAlign: event.target.value as FlyerTextAlign })}>
                    <option value="left">Izquierda</option>
                    <option value="center">Centro</option>
                    <option value="right">Derecha</option>
                    <option value="justify">Justificado</option>
                  </select>
                </label>

                <label className="flyerSelectField">
                  <span>Peso de letra</span>
                  <select className="px-input" value={value.fontWeight} onChange={(event) => onChange({ ...value, fontWeight: event.target.value as FlyerFontWeight })}>
                    {fontWeightOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          ) : null}
        </div>

        {showLargePreview ? (
          <TournamentFlyerPreviewCard value={value} previewData={previewData} variant="editor" />
        ) : null}
      </div>
    </section>
  )
}
