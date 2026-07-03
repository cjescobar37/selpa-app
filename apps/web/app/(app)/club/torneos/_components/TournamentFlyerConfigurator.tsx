'use client'

import { useEffect, useMemo, useState, type CSSProperties, type DragEvent } from 'react'
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
export type FlyerDataStyle = 'COMPACT' | 'GLASS' | 'SOLID' | 'EDITORIAL'
export type FlyerTitleSize = 'SMALL' | 'MEDIUM' | 'LARGE' | 'IMPACT'

export type FlyerVisibleFields = {
  date: boolean
  registrationDeadline: boolean
  price: boolean
  category: boolean
  system: boolean
  venue: boolean
  club: boolean
  typeBadge: boolean
}

export type FlyerManualAsset = {
  previewUrl: string
  publicUrl?: string | null
  name: string
  size: number
  width: number
  height: number
  file?: File
}

export type FlyerConfig = {
  mode: FlyerMode
  backgroundId: string
  titleColor: string
  textColor: string
  accentColor: string
  badgeColor: string
  dateBlockColor: string
  dataCardColor: string
  dataCardOpacity: number
  dataCardRadius: number
  dataStyle: FlyerDataStyle
  titleSize: FlyerTitleSize
  visibleFields: FlyerVisibleFields
  fontFamily: FlyerFont
  fontWeight: FlyerFontWeight
  style: FlyerStyle
  textAlign: FlyerTextAlign
  manualFlyer: FlyerManualAsset | null
}

export type FlyerPreviewData = {
  clubName?: string | null
  name: string
  type: string
  gender: string
  categoryLabel: string
  publicDescription?: string | null
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
  advancedControls?: boolean
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

const dataStyleOptions: Array<{ value: FlyerDataStyle; label: string }> = [
  { value: 'COMPACT', label: 'Compacto' },
  { value: 'GLASS', label: 'Glass' },
  { value: 'SOLID', label: 'Solido' },
  { value: 'EDITORIAL', label: 'Editorial' },
]

const titleSizeOptions: Array<{ value: FlyerTitleSize; label: string }> = [
  { value: 'SMALL', label: 'Chico' },
  { value: 'MEDIUM', label: 'Medio' },
  { value: 'LARGE', label: 'Grande' },
  { value: 'IMPACT', label: 'Impacto' },
]

const visibleFieldOptions: Array<{ key: keyof FlyerVisibleFields; label: string }> = [
  { key: 'date', label: 'Fecha' },
  { key: 'registrationDeadline', label: 'Cierre de inscripcion' },
  { key: 'price', label: 'Precio' },
  { key: 'category', label: 'Descripcion publica' },
  { key: 'system', label: 'Sistema' },
  { key: 'venue', label: 'Sede' },
  { key: 'club', label: 'Club' },
  { key: 'typeBadge', label: 'Badge tipo' },
]

const manualFlyerMaxSize = 5 * 1024 * 1024
const manualFlyerAllowedExtensions = new Set(['jpg', 'jpeg', 'png', 'webp'])
const manualFlyerAllowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

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

const defaultVisibleFields: FlyerVisibleFields = {
  date: true,
  registrationDeadline: true,
  price: true,
  category: true,
  system: true,
  venue: true,
  club: true,
  typeBadge: true,
}

const tournamentTypePresets = {
  MASTER: {
    accentColor: '#fb7185',
    badgeColor: '#f43f5e',
    dateBlockColor: '#be123c',
    dataCardColor: '#881337',
  },
  OPEN: {
    accentColor: '#38bdf8',
    badgeColor: '#2563eb',
    dateBlockColor: '#1d4ed8',
    dataCardColor: '#0f3b78',
  },
  CHALLENGER: {
    accentColor: '#fbbf24',
    badgeColor: '#d97706',
    dateBlockColor: '#b45309',
    dataCardColor: '#78350f',
  },
  AMERICANO: {
    accentColor: '#22d3ee',
    badgeColor: '#10b981',
    dateBlockColor: '#0f766e',
    dataCardColor: '#064e3b',
  },
  MIXTO: {
    accentColor: '#ec4899',
    badgeColor: '#8b5cf6',
    dateBlockColor: '#0ea5e9',
    dataCardColor: '#312e81',
  },
  DEFAULT: {
    accentColor: '#67e8f9',
    badgeColor: '#06b6d4',
    dateBlockColor: '#0891b2',
    dataCardColor: '#0f172a',
  },
}

function getTournamentTypePreset(type: string) {
  const normalized = type.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  if (normalized.includes('MASTER')) return tournamentTypePresets.MASTER
  if (normalized.includes('CHALLENGER')) return tournamentTypePresets.CHALLENGER
  if (normalized.includes('AMERICANO')) return tournamentTypePresets.AMERICANO
  if (normalized.includes('MIXTO') || normalized.includes('MIXED')) return tournamentTypePresets.MIXTO
  if (normalized.includes('OPEN')) return tournamentTypePresets.OPEN
  return tournamentTypePresets.DEFAULT
}

function usePresetColor(current: string, fallback: string, preset: string) {
  return !current || current.toLowerCase() === fallback.toLowerCase() ? preset : current
}

export function resolveAutoFlyerConfig(value: FlyerConfig, tournamentType: string): FlyerConfig {
  if (value.mode !== 'AUTO') return value
  const preset = getTournamentTypePreset(tournamentType)
  return {
    ...value,
    accentColor: usePresetColor(value.accentColor, defaultFlyerConfig.accentColor, preset.accentColor),
    badgeColor: usePresetColor(value.badgeColor, defaultFlyerConfig.badgeColor, preset.badgeColor),
    dateBlockColor: usePresetColor(value.dateBlockColor, defaultFlyerConfig.dateBlockColor, preset.dateBlockColor),
    dataCardColor: usePresetColor(value.dataCardColor, defaultFlyerConfig.dataCardColor, preset.dataCardColor),
  }
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

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(size / 1024))} KB`
}

function getFileExtension(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() ?? ''
}

function formatFlyerGender(value: string) {
  const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  if (normalized === 'MASCULINO' || normalized === 'MALE') return 'Caballeros'
  if (normalized === 'FEMENINO' || normalized === 'FEMALE') return 'Damas'
  if (normalized === 'MIXTO' || normalized === 'MIXED') return 'Mixto'
  return value || 'Rama por definir'
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
  badgeColor: '#06b6d4',
  dateBlockColor: '#0891b2',
  dataCardColor: '#0f172a',
  dataCardOpacity: 0.72,
  dataCardRadius: 16,
  dataStyle: 'GLASS',
  titleSize: 'LARGE',
  visibleFields: defaultVisibleFields,
  fontFamily: 'SPORT',
  fontWeight: 'MEDIUM',
  style: 'MODERN',
  textAlign: 'left',
  manualFlyer: null,
}

export function readFlyerConfigFromRules(rules: Record<string, unknown> | null | undefined): FlyerConfig {
  if (!rules) return defaultFlyerConfig

  const mode = typeof rules.flyer_mode === 'string' ? rules.flyer_mode : defaultFlyerConfig.mode
  const backgroundId = typeof rules.flyer_background === 'string' ? rules.flyer_background : defaultFlyerConfig.backgroundId
  const titleColor = typeof rules.flyer_title_color === 'string' ? rules.flyer_title_color : defaultFlyerConfig.titleColor
  const textColor = typeof rules.flyer_text_color === 'string' ? rules.flyer_text_color : defaultFlyerConfig.textColor
  const accentColor = typeof rules.flyer_accent_color === 'string' ? rules.flyer_accent_color : defaultFlyerConfig.accentColor
  const badgeColor = typeof rules.flyer_badge_color === 'string' ? rules.flyer_badge_color : defaultFlyerConfig.badgeColor
  const dateBlockColor = typeof rules.flyer_date_block_color === 'string' ? rules.flyer_date_block_color : defaultFlyerConfig.dateBlockColor
  const dataCardColor = typeof rules.flyer_data_card_color === 'string' ? rules.flyer_data_card_color : defaultFlyerConfig.dataCardColor
  const dataCardOpacity = typeof rules.flyer_data_card_opacity === 'number' ? rules.flyer_data_card_opacity : defaultFlyerConfig.dataCardOpacity
  const dataCardRadius = typeof rules.flyer_data_card_radius === 'number' ? rules.flyer_data_card_radius : defaultFlyerConfig.dataCardRadius
  const dataStyle = typeof rules.flyer_data_style === 'string' ? rules.flyer_data_style : defaultFlyerConfig.dataStyle
  const titleSize = typeof rules.flyer_title_size === 'string' ? rules.flyer_title_size : defaultFlyerConfig.titleSize
  const manualUrl = typeof rules.flyer_manual_url === 'string'
    ? rules.flyer_manual_url
    : typeof rules.flyer_url === 'string'
      ? rules.flyer_url
      : typeof rules.poster_url === 'string'
        ? rules.poster_url
        : null
  const manualName = typeof rules.flyer_manual_name === 'string' ? rules.flyer_manual_name : 'Flyer manual'
  const manualSize = typeof rules.flyer_manual_size === 'number' ? rules.flyer_manual_size : 0
  const manualWidth = typeof rules.flyer_manual_width === 'number' ? rules.flyer_manual_width : 0
  const manualHeight = typeof rules.flyer_manual_height === 'number' ? rules.flyer_manual_height : 0
  const visibleFields = typeof rules.flyer_visible_fields === 'object' && rules.flyer_visible_fields !== null
    ? {
      ...defaultVisibleFields,
      ...(rules.flyer_visible_fields as Partial<FlyerVisibleFields>),
    }
    : defaultVisibleFields
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
    badgeColor,
    dateBlockColor,
    dataCardColor,
    dataCardOpacity: Math.min(1, Math.max(0, dataCardOpacity)),
    dataCardRadius: Math.min(28, Math.max(8, dataCardRadius)),
    dataStyle: dataStyle === 'COMPACT' || dataStyle === 'GLASS' || dataStyle === 'SOLID' || dataStyle === 'EDITORIAL'
      ? dataStyle
      : defaultFlyerConfig.dataStyle,
    titleSize: titleSize === 'SMALL' || titleSize === 'MEDIUM' || titleSize === 'LARGE' || titleSize === 'IMPACT'
      ? titleSize
      : defaultFlyerConfig.titleSize,
    visibleFields,
    manualFlyer: manualUrl
      ? {
        previewUrl: manualUrl,
        publicUrl: manualUrl,
        name: manualName,
        size: manualSize,
        width: manualWidth,
        height: manualHeight,
      }
      : null,
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
  const isManualMode = value.mode === 'MANUAL'
  const flyerGender = formatFlyerGender(previewData.gender)
  const sportLine = [
    previewData.categoryLabel || 'Categoria por definir',
    flyerGender,
    previewData.segmentLabel || null,
  ].filter(Boolean).join(' · ')
  const tournamentType = previewData.type || 'Open'
  const clubName = previewData.clubName || 'Club por definir'
  const startDate = formatDate(previewData.startDate)
  const endDate = previewData.endDate ? formatDate(previewData.endDate) : ''
  const deadline = formatDateTime(previewData.registrationDeadline)
  const price = formatPrice(previewData.pricePerPlayer)
  const publicDescription = previewData.publicDescription?.trim() || 'Informacion del torneo por definir.'
  const highlightWeight = fontWeightByOption[value.fontWeight]
  const labelWeight = value.fontWeight === 'BOLD' ? 800 : 700
  const bodyWeight = value.fontWeight === 'LIGHT' ? 500 : 650
  const fields = value.visibleFields
  const dataOpacityPercent = `${Math.round(value.dataCardOpacity * 100)}%`
  const dataAccentPercent = `${Math.round(value.dataCardOpacity * 46)}%`
  const cardStyle = {
    '--flyer-data-color': value.dataCardColor,
    '--flyer-data-opacity': String(value.dataCardOpacity),
    '--flyer-data-alpha': dataOpacityPercent,
    '--flyer-data-accent-alpha': dataAccentPercent,
    '--flyer-data-blur': value.dataCardOpacity === 0 ? '0px' : '12px',
    '--flyer-data-radius': `${value.dataCardRadius}px`,
    '--flyer-badge-color': value.badgeColor,
    '--flyer-date-color': value.dateBlockColor,
    '--flyer-accent-color': value.accentColor,
  } as CSSProperties
  const metaItems = [
    fields.registrationDeadline
      ? { key: 'deadline', label: 'Cierre inscripcion', value: deadline, tone: 'deadline' }
      : null,
    fields.price
      ? { key: 'price', label: 'Precio por jugador', value: price, tone: 'price' }
      : null,
    fields.category
      ? { key: 'category', label: 'Descripcion publica', value: publicDescription, tone: 'primary' }
      : null,
    fields.system && previewData.competitionSystemLabel
      ? { key: 'system', label: 'Sistema', value: previewData.competitionSystemLabel, tone: 'secondary' }
      : null,
    fields.venue && previewData.venueName
      ? { key: 'venue', label: 'Sede', value: previewData.venueName, tone: 'secondary' }
      : null,
  ].filter(Boolean) as Array<{ key: string; label: string; value: string; tone: string }>

  return (
    <div className="flyerPreviewShell">
      {variant === 'editor' ? <span className="flyerPreviewLabel">Preview</span> : null}
      <div
        className={`flyerPreview flyerPreview--${value.mode.toLowerCase()} flyerPreview--${variant} flyerPreview--data-${value.dataStyle.toLowerCase()} flyerPreview--title-${value.titleSize.toLowerCase()}`}
        style={{
          ...(isManualMode && value.manualFlyer
            ? {
              backgroundImage: `linear-gradient(180deg, rgba(2,6,23,.42), rgba(2,6,23,.56)), url("${value.manualFlyer.previewUrl}")`,
              backgroundPosition: 'center',
              backgroundSize: 'cover',
            }
            : previewStyle),
          fontFamily: fontStacks[value.fontFamily],
          color: value.textColor,
          textAlign: value.textAlign,
          ...cardStyle,
        }}
      >
        {!isManualMode ? (
          <>
          <div className="flyerPreviewTop">
            {fields.club ? <span className="flyerPreviewClub" style={{ fontWeight: labelWeight }}>{clubName}</span> : <span />}
            {fields.typeBadge ? (
              <span
                className="flyerPreviewType"
                style={{
                  borderColor: `${value.badgeColor}99`,
                  color: value.titleColor,
                  fontWeight: highlightWeight,
                }}
              >
                {tournamentType}
              </span>
            ) : null}
          </div>

          <div className="flyerPreviewBody">
            <div className="flyerPreviewMain">
              <span className="flyerPreviewEyebrow" style={{ color: value.accentColor, fontWeight: labelWeight }}>Padel competitivo</span>
              <h3 style={{ color: value.titleColor, fontWeight: highlightWeight }}>{headline}</h3>
              <p style={{ fontWeight: bodyWeight }}>{sportLine}</p>
            </div>

            {fields.date ? (
              <div className="flyerPreviewDate" style={{ borderColor: `${value.dateBlockColor}80` }}>
                <div className="flyerPreviewDateRow">
                  <span>Inicio</span>
                  <strong style={{ color: value.titleColor, fontWeight: highlightWeight }}>{startDate}</strong>
                </div>
                {endDate ? (
                  <div className="flyerPreviewDateRow">
                    <span>Fin</span>
                    <strong style={{ color: value.titleColor, fontWeight: highlightWeight }}>{endDate}</strong>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {metaItems.length > 0 ? (
            <div className="flyerPreviewMeta">
              {metaItems.map((item) => (
                <div key={item.key} className={`flyerPreviewMetaItem flyerPreviewMetaItem--${item.tone}`}>
                  <span>{item.label}</span>
                  <strong style={{ fontWeight: highlightWeight }}>{item.value}</strong>
                </div>
              ))}
            </div>
          ) : null}
          </>
        ) : null}

        {value.mode === 'MANUAL' ? (
          value.manualFlyer ? (
            <div className="flyerManualImageFrame">
              <img src={value.manualFlyer.previewUrl} alt={`Preview de ${value.manualFlyer.name}`} />
            </div>
          ) : (
            <div className="flyerManualOverlay">
              <strong>Flyer manual</strong>
              <span>Subi una imagen vertical para ver aca tu pieza final completa.</span>
            </div>
          )
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

export function TournamentFlyerConfigurator({ value, onChange, previewData, helperText, advancedControls = false }: Props) {
  const showLargePreview = value.mode === 'AUTO' || value.mode === 'MANUAL'
  const [manualError, setManualError] = useState('')
  const resolvedValue = resolveAutoFlyerConfig(value, `${previewData.type} ${previewData.gender}`)
  const manualWarning = value.manualFlyer && value.manualFlyer.width > value.manualFlyer.height
    ? 'El flyer deberia ser vertical para verse bien.'
    : ''

  useEffect(() => {
    const previewUrl = value.manualFlyer?.previewUrl
    return () => {
      if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
    }
  }, [value.manualFlyer?.previewUrl])

  const clearManualFlyer = () => {
    if (value.manualFlyer?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(value.manualFlyer.previewUrl)
    setManualError('')
    onChange({ ...value, manualFlyer: null })
  }

  const readManualFlyer = (file: File | null | undefined) => {
    setManualError('')
    if (!file) return

    const extension = getFileExtension(file.name)
    if (!manualFlyerAllowedExtensions.has(extension) || (file.type && !manualFlyerAllowedTypes.has(file.type))) {
      setManualError('Formato invalido. Subi una imagen JPG, PNG o WEBP.')
      return
    }

    if (file.size > manualFlyerMaxSize) {
      setManualError('El archivo es demasiado pesado. El maximo recomendado es 5 MB.')
      return
    }

    const previewUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      if (value.manualFlyer?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(value.manualFlyer.previewUrl)
      onChange({
        ...value,
        manualFlyer: {
          file,
          previewUrl,
          publicUrl: null,
          name: file.name,
          size: file.size,
          width: image.naturalWidth,
          height: image.naturalHeight,
        },
      })
    }
    image.onerror = () => {
      URL.revokeObjectURL(previewUrl)
      setManualError('No pude leer la imagen. Probá con otro archivo JPG, PNG o WEBP.')
    }
    image.src = previewUrl
  }

  const handleManualDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    readManualFlyer(event.dataTransfer.files?.[0])
  }

  const updateVisibleField = (key: keyof FlyerVisibleFields, checked: boolean) => {
    onChange({
      ...value,
      visibleFields: {
        ...value.visibleFields,
        [key]: checked,
      },
    })
  }

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
            <div className="flyerManualUploader">
              <label
                className={`flyerManualDropzone${value.manualFlyer ? ' has-file' : ''}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleManualDrop}
              >
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  onChange={(event) => readManualFlyer(event.target.files?.[0])}
                />
                <span>Subi tu flyer</span>
                <strong>PNG, JPG o WEBP · recomendado 1080x1350 px</strong>
                <small>Tambien acepta vertical 1080x1920 px. Maximo 5 MB.</small>
              </label>

              {manualError ? <p className="flyerManualMessage flyerManualMessage--error">{manualError}</p> : null}
              {manualWarning ? <p className="flyerManualMessage flyerManualMessage--warning">{manualWarning}</p> : null}

              {value.manualFlyer ? (
                <div className="flyerManualFile">
                  <div>
                    <strong>{value.manualFlyer.name}</strong>
                    <span>{formatFileSize(value.manualFlyer.size)} · {value.manualFlyer.width}x{value.manualFlyer.height}px</span>
                  </div>
                  <div className="flyerManualActions">
                    <label className="club-secondaryBtn club-secondaryBtn--compact">
                      Cambiar flyer
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                        onChange={(event) => readManualFlyer(event.target.files?.[0])}
                      />
                    </label>
                    <button type="button" className="club-secondaryBtn club-secondaryBtn--compact" onClick={clearManualFlyer}>Quitar flyer</button>
                  </div>
                </div>
              ) : null}
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

              {advancedControls ? (
                <div className="flyerPersonalization">
                  <div className="flyerPersonalizationHead">
                    <span className="flyerControlTitle">Personalizacion del flyer</span>
                    <p className="flyerControlHint">Automatico sugiere una paleta segun el tipo de torneo. Si editas un color, se conserva tu eleccion.</p>
                  </div>

                  <div className="flyerPersonalizationGrid">
                    <div className="flyerControlSection flyerControlSection--compact">
                      <span className="flyerControlTitle">Colores</span>
                      <div className="flyerControlRow flyerControlRow--colors">
                        <label className="flyerColorField">
                          <span>Titulo</span>
                          <input type="color" value={resolvedValue.titleColor} onChange={(event) => onChange({ ...value, titleColor: event.target.value })} />
                        </label>
                        <label className="flyerColorField">
                          <span>Texto</span>
                          <input type="color" value={resolvedValue.textColor} onChange={(event) => onChange({ ...value, textColor: event.target.value })} />
                        </label>
                        <label className="flyerColorField">
                          <span>Acento</span>
                          <input type="color" value={resolvedValue.accentColor} onChange={(event) => onChange({ ...value, accentColor: event.target.value })} />
                        </label>
                        <label className="flyerColorField">
                          <span>Badge tipo</span>
                          <input type="color" value={resolvedValue.badgeColor} onChange={(event) => onChange({ ...value, badgeColor: event.target.value })} />
                        </label>
                        <label className="flyerColorField">
                          <span>Bloque fecha</span>
                          <input type="color" value={resolvedValue.dateBlockColor} onChange={(event) => onChange({ ...value, dateBlockColor: event.target.value })} />
                        </label>
                        <label className="flyerColorField">
                          <span>Tarjetas datos</span>
                          <input type="color" value={resolvedValue.dataCardColor} onChange={(event) => onChange({ ...value, dataCardColor: event.target.value })} />
                        </label>
                      </div>
                    </div>

                    <div className="flyerControlSection flyerControlSection--compact">
                      <span className="flyerControlTitle">Tipografia</span>
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
                          <span>Tamano titulo</span>
                          <select className="px-input" value={value.titleSize} onChange={(event) => onChange({ ...value, titleSize: event.target.value as FlyerTitleSize })}>
                            {titleSizeOptions.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>

                        <label className="flyerSelectField">
                          <span>Alineacion</span>
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
                    </div>

                    <div className="flyerControlSection flyerControlSection--compact">
                      <span className="flyerControlTitle">Estilo de datos</span>
                      <div className="flyerControlRow flyerControlRow--selects">
                        <label className="flyerSelectField">
                          <span>Estilo flyer</span>
                          <select className="px-input" value={value.style} onChange={(event) => onChange({ ...value, style: event.target.value as FlyerStyle })}>
                            {styleOptions.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>

                        <label className="flyerSelectField">
                          <span>Datos</span>
                          <select className="px-input" value={value.dataStyle} onChange={(event) => onChange({ ...value, dataStyle: event.target.value as FlyerDataStyle })}>
                            {dataStyleOptions.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>

                        <label className="flyerRangeField">
                          <span>Opacidad tarjetas</span>
                          <input type="range" min="0" max="1" step="0.01" value={value.dataCardOpacity} onChange={(event) => onChange({ ...value, dataCardOpacity: Number(event.target.value) })} />
                          <small>{Math.round(value.dataCardOpacity * 100)}%</small>
                        </label>

                        <label className="flyerRangeField">
                          <span>Radio tarjetas</span>
                          <input type="range" min="8" max="28" step="1" value={value.dataCardRadius} onChange={(event) => onChange({ ...value, dataCardRadius: Number(event.target.value) })} />
                          <small>{value.dataCardRadius}px</small>
                        </label>
                      </div>
                    </div>

                    <div className="flyerControlSection flyerControlSection--compact">
                      <span className="flyerControlTitle">Datos visibles</span>
                      <div className="flyerVisibleGrid">
                        {visibleFieldOptions.map((option) => (
                          <label key={option.key} className="flyerToggleField">
                            <input
                              type="checkbox"
                              checked={value.visibleFields[option.key]}
                              onChange={(event) => updateVisibleField(option.key, event.target.checked)}
                            />
                            <span>{option.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
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
                      <span>Alineacion de textos</span>
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
              )}
            </>
          ) : null}
        </div>

        {showLargePreview ? (
          <TournamentFlyerPreviewCard value={resolvedValue} previewData={previewData} variant="editor" />
        ) : null}
      </div>
    </section>
  )
}
