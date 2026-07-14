export type PlatformAdThemeMode = 'AUTO' | 'MANUAL'
export type PlatformAdBackgroundMode = 'solid' | 'gradient'
export type PlatformAdOverlayMode = 'none' | 'dark' | 'light'
export type PlatformAdImagePosition = 'left' | 'center' | 'right'
export type PlatformAdImageFit = 'contain' | 'cover'
export type PlatformAdLayout = 'image-left' | 'image-right' | 'image-only' | 'text-only'
export type PlatformAdTextAlign = 'left' | 'center' | 'right'
export type PlatformAdFontWeight = 400 | 500 | 600 | 700 | 800 | 900 | 950
export type PlatformAdMobileOverrides = Partial<{
  backgroundMode: PlatformAdBackgroundMode
  backgroundColor: string
  gradientFrom: string
  gradientTo: string
  backgroundOpacity: number
  overlay: PlatformAdOverlayMode
  overlayOpacity: number
  imagePosition: PlatformAdImagePosition
  imageFit: PlatformAdImageFit
  imageWidth: number
  imageStretchX: number
  imageScale: number
  imageOpacity: number
  imageX: number
  imageY: number
  titleColor: string
  subtitleColor: string
  buttonTextColor: string
  buttonBackgroundColor: string
  titleSize: number
  titleWeight: PlatformAdFontWeight
  titleAlign: PlatformAdTextAlign
  titleX: number
  titleY: number
  titleMaxWidth: number
  titleOpacity: number
  titleLineHeight: number
  subtitleSize: number
  subtitleWeight: PlatformAdFontWeight
  subtitleAlign: PlatformAdTextAlign
  subtitleX: number
  subtitleY: number
  subtitleMaxWidth: number
  subtitleOpacity: number
  subtitleLineHeight: number
  secondarySize: number
  secondaryWeight: PlatformAdFontWeight
  secondaryAlign: PlatformAdTextAlign
  secondaryX: number
  secondaryY: number
  secondaryMaxWidth: number
  secondaryOpacity: number
  secondaryLineHeight: number
  buttonAlign: PlatformAdTextAlign
  buttonX: number
  buttonY: number
  buttonSize: number
  buttonPaddingX: number
  buttonPaddingY: number
  buttonRadius: number
  buttonBorderColor: string
  buttonBorderWidth: number
  buttonOpacity: number
  layout: PlatformAdLayout
}>

export type PlatformAdRenderConfig = {
  version: 1
  enabled: boolean
  themeMode: PlatformAdThemeMode
  backgroundMode: PlatformAdBackgroundMode
  backgroundColor: string
  gradientFrom: string
  gradientTo: string
  backgroundOpacity: number
  overlay: PlatformAdOverlayMode
  overlayOpacity: number
  imagePosition: PlatformAdImagePosition
  imageFit: PlatformAdImageFit
  imageWidth: number
  imageStretchX: number
  imageScale: number
  imageOpacity: number
  imageX: number
  imageY: number
  subtitle: string
  secondaryText: string
  buttonEnabled: boolean
  buttonText: string
  buttonUrl: string
  titleColor: string
  subtitleColor: string
  buttonTextColor: string
  buttonBackgroundColor: string
  titleSize: number
  titleWeight: PlatformAdFontWeight
  titleAlign: PlatformAdTextAlign
  titleX: number
  titleY: number
  titleMaxWidth: number
  titleOpacity: number
  titleLineHeight: number
  subtitleSize: number
  subtitleWeight: PlatformAdFontWeight
  subtitleAlign: PlatformAdTextAlign
  subtitleX: number
  subtitleY: number
  subtitleMaxWidth: number
  subtitleOpacity: number
  subtitleLineHeight: number
  secondarySize: number
  secondaryWeight: PlatformAdFontWeight
  secondaryAlign: PlatformAdTextAlign
  secondaryX: number
  secondaryY: number
  secondaryMaxWidth: number
  secondaryOpacity: number
  secondaryLineHeight: number
  buttonAlign: PlatformAdTextAlign
  buttonX: number
  buttonY: number
  buttonSize: number
  buttonPaddingX: number
  buttonPaddingY: number
  buttonRadius: number
  buttonBorderColor: string
  buttonBorderWidth: number
  buttonOpacity: number
  layout: PlatformAdLayout
  mobile: PlatformAdMobileOverrides
}

export const defaultPlatformAdRenderConfig: PlatformAdRenderConfig = {
  version: 1,
  enabled: false,
  themeMode: 'MANUAL',
  backgroundMode: 'gradient',
  backgroundColor: '#061b3a',
  gradientFrom: '#061b3a',
  gradientTo: '#0f274a',
  backgroundOpacity: 1,
  overlay: 'dark',
  overlayOpacity: 0.28,
  imagePosition: 'right',
  imageFit: 'contain',
  imageWidth: 64,
  imageStretchX: 1,
  imageScale: 1,
  imageOpacity: 0.82,
  imageX: 0,
  imageY: 0,
  subtitle: '',
  secondaryText: '',
  buttonEnabled: false,
  buttonText: 'Conocer más',
  buttonUrl: '',
  titleColor: '#ffffff',
  subtitleColor: '#dff8ff',
  buttonTextColor: '#061b3a',
  buttonBackgroundColor: '#ffffff',
  titleSize: 19,
  titleWeight: 950,
  titleAlign: 'left',
  titleX: 0,
  titleY: 0,
  titleMaxWidth: 68,
  titleOpacity: 1,
  titleLineHeight: 1.02,
  subtitleSize: 9,
  subtitleWeight: 950,
  subtitleAlign: 'left',
  subtitleX: 0,
  subtitleY: 0,
  subtitleMaxWidth: 72,
  subtitleOpacity: 1,
  subtitleLineHeight: 1,
  secondarySize: 10,
  secondaryWeight: 700,
  secondaryAlign: 'left',
  secondaryX: 0,
  secondaryY: 0,
  secondaryMaxWidth: 72,
  secondaryOpacity: 0.9,
  secondaryLineHeight: 1.18,
  buttonAlign: 'left',
  buttonX: 0,
  buttonY: 0,
  buttonSize: 9,
  buttonPaddingX: 8,
  buttonPaddingY: 6,
  buttonRadius: 999,
  buttonBorderColor: 'transparent',
  buttonBorderWidth: 0,
  buttonOpacity: 1,
  layout: 'image-right',
  mobile: {},
}

function finiteNumber(value: unknown, fallback: number, min: number, max: number) {
  const next = Number(value)
  if (!Number.isFinite(next)) return fallback
  return Math.min(max, Math.max(min, next))
}

function oneOf<T extends string | number>(value: unknown, allowed: readonly T[], fallback: T) {
  return allowed.includes(value as T) ? value as T : fallback
}

function text(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function hasOwn(input: object, key: string) {
  return Object.prototype.hasOwnProperty.call(input, key)
}

function normalizePlatformAdMobileOverrides(value: unknown, base: PlatformAdRenderConfig): PlatformAdMobileOverrides {
  const input = typeof value === 'object' && value !== null ? value as PlatformAdMobileOverrides : {}
  const next: PlatformAdMobileOverrides = {}
  if (hasOwn(input, 'backgroundMode')) next.backgroundMode = oneOf(input.backgroundMode, ['solid', 'gradient'] as const, base.backgroundMode)
  if (hasOwn(input, 'backgroundColor')) next.backgroundColor = text(input.backgroundColor, base.backgroundColor)
  if (hasOwn(input, 'gradientFrom')) next.gradientFrom = text(input.gradientFrom, base.gradientFrom)
  if (hasOwn(input, 'gradientTo')) next.gradientTo = text(input.gradientTo, base.gradientTo)
  if (hasOwn(input, 'backgroundOpacity')) next.backgroundOpacity = finiteNumber(input.backgroundOpacity, base.backgroundOpacity, 0, 1)
  if (hasOwn(input, 'overlay')) next.overlay = oneOf(input.overlay, ['none', 'dark', 'light'] as const, base.overlay)
  if (hasOwn(input, 'overlayOpacity')) next.overlayOpacity = finiteNumber(input.overlayOpacity, base.overlayOpacity, 0, 1)
  if (hasOwn(input, 'imagePosition')) next.imagePosition = oneOf(input.imagePosition, ['left', 'center', 'right'] as const, base.imagePosition)
  if (hasOwn(input, 'imageFit')) next.imageFit = oneOf(input.imageFit, ['contain', 'cover'] as const, base.imageFit)
  if (hasOwn(input, 'imageWidth')) next.imageWidth = finiteNumber(input.imageWidth, base.imageWidth, 20, 100)
  if (hasOwn(input, 'imageStretchX')) next.imageStretchX = finiteNumber(input.imageStretchX, base.imageStretchX, 0.5, 2.5)
  if (hasOwn(input, 'imageScale')) next.imageScale = finiteNumber(input.imageScale, base.imageScale, 0.4, 2.2)
  if (hasOwn(input, 'imageOpacity')) next.imageOpacity = finiteNumber(input.imageOpacity, base.imageOpacity, 0, 1)
  if (hasOwn(input, 'imageX')) next.imageX = finiteNumber(input.imageX, base.imageX, -80, 80)
  if (hasOwn(input, 'imageY')) next.imageY = finiteNumber(input.imageY, base.imageY, -60, 60)
  if (hasOwn(input, 'titleColor')) next.titleColor = text(input.titleColor, base.titleColor)
  if (hasOwn(input, 'subtitleColor')) next.subtitleColor = text(input.subtitleColor, base.subtitleColor)
  if (hasOwn(input, 'buttonTextColor')) next.buttonTextColor = text(input.buttonTextColor, base.buttonTextColor)
  if (hasOwn(input, 'buttonBackgroundColor')) next.buttonBackgroundColor = text(input.buttonBackgroundColor, base.buttonBackgroundColor)
  if (hasOwn(input, 'titleSize')) next.titleSize = finiteNumber(input.titleSize, base.titleSize, 10, 42)
  if (hasOwn(input, 'titleWeight')) next.titleWeight = oneOf(input.titleWeight, [400, 500, 600, 700, 800, 900, 950] as const, base.titleWeight)
  if (hasOwn(input, 'titleAlign')) next.titleAlign = oneOf(input.titleAlign, ['left', 'center', 'right'] as const, base.titleAlign)
  if (hasOwn(input, 'titleX')) next.titleX = finiteNumber(input.titleX, base.titleX, -120, 120)
  if (hasOwn(input, 'titleY')) next.titleY = finiteNumber(input.titleY, base.titleY, -80, 80)
  if (hasOwn(input, 'titleMaxWidth')) next.titleMaxWidth = finiteNumber(input.titleMaxWidth, base.titleMaxWidth, 24, 100)
  if (hasOwn(input, 'titleOpacity')) next.titleOpacity = finiteNumber(input.titleOpacity, base.titleOpacity, 0, 1)
  if (hasOwn(input, 'titleLineHeight')) next.titleLineHeight = finiteNumber(input.titleLineHeight, base.titleLineHeight, 0.85, 1.8)
  if (hasOwn(input, 'subtitleSize')) next.subtitleSize = finiteNumber(input.subtitleSize, base.subtitleSize, 7, 28)
  if (hasOwn(input, 'subtitleWeight')) next.subtitleWeight = oneOf(input.subtitleWeight, [400, 500, 600, 700, 800, 900, 950] as const, base.subtitleWeight)
  if (hasOwn(input, 'subtitleAlign')) next.subtitleAlign = oneOf(input.subtitleAlign, ['left', 'center', 'right'] as const, base.subtitleAlign)
  if (hasOwn(input, 'subtitleX')) next.subtitleX = finiteNumber(input.subtitleX, base.subtitleX, -120, 120)
  if (hasOwn(input, 'subtitleY')) next.subtitleY = finiteNumber(input.subtitleY, base.subtitleY, -80, 80)
  if (hasOwn(input, 'subtitleMaxWidth')) next.subtitleMaxWidth = finiteNumber(input.subtitleMaxWidth, base.subtitleMaxWidth, 24, 100)
  if (hasOwn(input, 'subtitleOpacity')) next.subtitleOpacity = finiteNumber(input.subtitleOpacity, base.subtitleOpacity, 0, 1)
  if (hasOwn(input, 'subtitleLineHeight')) next.subtitleLineHeight = finiteNumber(input.subtitleLineHeight, base.subtitleLineHeight, 0.85, 1.8)
  if (hasOwn(input, 'secondarySize')) next.secondarySize = finiteNumber(input.secondarySize, base.secondarySize, 7, 28)
  if (hasOwn(input, 'secondaryWeight')) next.secondaryWeight = oneOf(input.secondaryWeight, [400, 500, 600, 700, 800, 900, 950] as const, base.secondaryWeight)
  if (hasOwn(input, 'secondaryAlign')) next.secondaryAlign = oneOf(input.secondaryAlign, ['left', 'center', 'right'] as const, base.secondaryAlign)
  if (hasOwn(input, 'secondaryX')) next.secondaryX = finiteNumber(input.secondaryX, base.secondaryX, -120, 120)
  if (hasOwn(input, 'secondaryY')) next.secondaryY = finiteNumber(input.secondaryY, base.secondaryY, -80, 80)
  if (hasOwn(input, 'secondaryMaxWidth')) next.secondaryMaxWidth = finiteNumber(input.secondaryMaxWidth, base.secondaryMaxWidth, 24, 100)
  if (hasOwn(input, 'secondaryOpacity')) next.secondaryOpacity = finiteNumber(input.secondaryOpacity, base.secondaryOpacity, 0, 1)
  if (hasOwn(input, 'secondaryLineHeight')) next.secondaryLineHeight = finiteNumber(input.secondaryLineHeight, base.secondaryLineHeight, 0.85, 1.8)
  if (hasOwn(input, 'buttonAlign')) next.buttonAlign = oneOf(input.buttonAlign, ['left', 'center', 'right'] as const, base.buttonAlign)
  if (hasOwn(input, 'buttonX')) next.buttonX = finiteNumber(input.buttonX, base.buttonX, -360, 360)
  if (hasOwn(input, 'buttonY')) next.buttonY = finiteNumber(input.buttonY, base.buttonY, -80, 80)
  if (hasOwn(input, 'buttonSize')) next.buttonSize = finiteNumber(input.buttonSize, base.buttonSize, 7, 24)
  if (hasOwn(input, 'buttonPaddingX')) next.buttonPaddingX = finiteNumber(input.buttonPaddingX, base.buttonPaddingX, 4, 28)
  if (hasOwn(input, 'buttonPaddingY')) next.buttonPaddingY = finiteNumber(input.buttonPaddingY, base.buttonPaddingY, 3, 18)
  if (hasOwn(input, 'buttonRadius')) next.buttonRadius = finiteNumber(input.buttonRadius, base.buttonRadius, 0, 999)
  if (hasOwn(input, 'buttonBorderColor')) next.buttonBorderColor = text(input.buttonBorderColor, base.buttonBorderColor)
  if (hasOwn(input, 'buttonBorderWidth')) next.buttonBorderWidth = finiteNumber(input.buttonBorderWidth, base.buttonBorderWidth, 0, 4)
  if (hasOwn(input, 'buttonOpacity')) next.buttonOpacity = finiteNumber(input.buttonOpacity, base.buttonOpacity, 0, 1)
  if (hasOwn(input, 'layout')) next.layout = oneOf(input.layout, ['image-left', 'image-right', 'image-only', 'text-only'] as const, base.layout)
  return next
}

export function normalizePlatformAdRenderConfig(value: unknown): PlatformAdRenderConfig {
  const input = typeof value === 'object' && value !== null ? value as Partial<PlatformAdRenderConfig> : {}
  const base = defaultPlatformAdRenderConfig
  const normalized: PlatformAdRenderConfig = {
    version: 1,
    enabled: Boolean(input.enabled),
    themeMode: oneOf(input.themeMode, ['AUTO', 'MANUAL'], base.themeMode),
    backgroundMode: oneOf(input.backgroundMode, ['solid', 'gradient'], base.backgroundMode),
    backgroundColor: text(input.backgroundColor, base.backgroundColor),
    gradientFrom: text(input.gradientFrom, base.gradientFrom),
    gradientTo: text(input.gradientTo, base.gradientTo),
    backgroundOpacity: finiteNumber(input.backgroundOpacity, base.backgroundOpacity, 0, 1),
    overlay: oneOf(input.overlay, ['none', 'dark', 'light'], base.overlay),
    overlayOpacity: finiteNumber(input.overlayOpacity, base.overlayOpacity, 0, 1),
    imagePosition: oneOf(input.imagePosition, ['left', 'center', 'right'], base.imagePosition),
    imageFit: oneOf(input.imageFit, ['contain', 'cover'], base.imageFit),
    imageWidth: finiteNumber(input.imageWidth, base.imageWidth, 20, 100),
    imageStretchX: finiteNumber(input.imageStretchX, base.imageStretchX, 0.5, 2.5),
    imageScale: finiteNumber(input.imageScale, base.imageScale, 0.4, 2.2),
    imageOpacity: finiteNumber(input.imageOpacity, base.imageOpacity, 0, 1),
    imageX: finiteNumber(input.imageX, base.imageX, -80, 80),
    imageY: finiteNumber(input.imageY, base.imageY, -60, 60),
    subtitle: text(input.subtitle, base.subtitle),
    secondaryText: text(input.secondaryText, base.secondaryText),
    buttonEnabled: Boolean(input.buttonEnabled),
    buttonText: text(input.buttonText, base.buttonText),
    buttonUrl: text(input.buttonUrl, base.buttonUrl),
    titleColor: text(input.titleColor, base.titleColor),
    subtitleColor: text(input.subtitleColor, base.subtitleColor),
    buttonTextColor: text(input.buttonTextColor, base.buttonTextColor),
    buttonBackgroundColor: text(input.buttonBackgroundColor, base.buttonBackgroundColor),
    titleSize: finiteNumber(input.titleSize, base.titleSize, 10, 42),
    titleWeight: oneOf(input.titleWeight, [400, 500, 600, 700, 800, 900, 950], base.titleWeight),
    titleAlign: oneOf(input.titleAlign, ['left', 'center', 'right'], base.titleAlign),
    titleX: finiteNumber(input.titleX, base.titleX, -120, 120),
    titleY: finiteNumber(input.titleY, base.titleY, -80, 80),
    titleMaxWidth: finiteNumber(input.titleMaxWidth, base.titleMaxWidth, 24, 100),
    titleOpacity: finiteNumber(input.titleOpacity, base.titleOpacity, 0, 1),
    titleLineHeight: finiteNumber(input.titleLineHeight, base.titleLineHeight, 0.85, 1.8),
    subtitleSize: finiteNumber(input.subtitleSize, base.subtitleSize, 7, 28),
    subtitleWeight: oneOf(input.subtitleWeight, [400, 500, 600, 700, 800, 900, 950], base.subtitleWeight),
    subtitleAlign: oneOf(input.subtitleAlign, ['left', 'center', 'right'], base.subtitleAlign),
    subtitleX: finiteNumber(input.subtitleX, base.subtitleX, -120, 120),
    subtitleY: finiteNumber(input.subtitleY, base.subtitleY, -80, 80),
    subtitleMaxWidth: finiteNumber(input.subtitleMaxWidth, base.subtitleMaxWidth, 24, 100),
    subtitleOpacity: finiteNumber(input.subtitleOpacity, base.subtitleOpacity, 0, 1),
    subtitleLineHeight: finiteNumber(input.subtitleLineHeight, base.subtitleLineHeight, 0.85, 1.8),
    secondarySize: finiteNumber(input.secondarySize, base.secondarySize, 7, 28),
    secondaryWeight: oneOf(input.secondaryWeight, [400, 500, 600, 700, 800, 900, 950], base.secondaryWeight),
    secondaryAlign: oneOf(input.secondaryAlign, ['left', 'center', 'right'], base.secondaryAlign),
    secondaryX: finiteNumber(input.secondaryX, base.secondaryX, -120, 120),
    secondaryY: finiteNumber(input.secondaryY, base.secondaryY, -80, 80),
    secondaryMaxWidth: finiteNumber(input.secondaryMaxWidth, base.secondaryMaxWidth, 24, 100),
    secondaryOpacity: finiteNumber(input.secondaryOpacity, base.secondaryOpacity, 0, 1),
    secondaryLineHeight: finiteNumber(input.secondaryLineHeight, base.secondaryLineHeight, 0.85, 1.8),
    buttonAlign: oneOf(input.buttonAlign, ['left', 'center', 'right'], base.buttonAlign),
    buttonX: finiteNumber(input.buttonX, base.buttonX, -360, 360),
    buttonY: finiteNumber(input.buttonY, base.buttonY, -80, 80),
    buttonSize: finiteNumber(input.buttonSize, base.buttonSize, 7, 24),
    buttonPaddingX: finiteNumber(input.buttonPaddingX, base.buttonPaddingX, 4, 28),
    buttonPaddingY: finiteNumber(input.buttonPaddingY, base.buttonPaddingY, 3, 18),
    buttonRadius: finiteNumber(input.buttonRadius, base.buttonRadius, 0, 999),
    buttonBorderColor: text(input.buttonBorderColor, base.buttonBorderColor),
    buttonBorderWidth: finiteNumber(input.buttonBorderWidth, base.buttonBorderWidth, 0, 4),
    buttonOpacity: finiteNumber(input.buttonOpacity, base.buttonOpacity, 0, 1),
    layout: oneOf(input.layout, ['image-left', 'image-right', 'image-only', 'text-only'], base.layout),
    mobile: {},
  }
  normalized.mobile = normalizePlatformAdMobileOverrides(input.mobile, normalized)
  return normalized
}

export function getPlatformAdResponsiveConfig(config: PlatformAdRenderConfig, mode: 'desktop' | 'mobile') {
  if (mode === 'desktop') return config
  return normalizePlatformAdRenderConfig({ ...config, imageWidth: 58, ...config.mobile, mobile: config.mobile })
}

export function hasPlatformAdRenderConfig(value: unknown) {
  return normalizePlatformAdRenderConfig(value).enabled
}
