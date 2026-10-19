// Capability first. UA checks only select truthful manual instructions.
export type InstallMethod = 'native' | 'ios-safari' | 'ios-chrome' | 'ios-browser' | 'android-chrome' | 'android-samsung' | null
export const INSTALL_DISMISS_KEY = 'selpa:pwa-install-dismissed:v1'
export const INSTALL_DISMISS_MS = 7 * 24 * 60 * 60 * 1000
// Independent from the inline row: declining the popup must leave it available.
export const INSTALL_POPUP_SESSION_KEY = 'selpa:pwa-popup-seen:v1'
export const INSTALL_POPUP_DISMISS_KEY = 'selpa:pwa-popup-dismissed:v1'
export const INSTALL_POPUP_NEVER_KEY = 'selpa:pwa-popup-never:v1'
export const INSTALL_POPUP_PHONE_QUERY = '(max-width: 600px), (max-height: 600px) and (max-width: 980px) and (orientation: landscape)'
export type PopupInstallMethod = Exclude<InstallMethod, null> | 'embedded-ios' | 'embedded-android' | 'android-browser'

export function getPopupInstallMethod(ua: string, platform: string, touchPoints: number, nativePrompt: boolean): PopupInstallMethod | null {
  // No automatic promotion on tablets or desktop, including touch-enabled iPads.
  if (/iPad|Tablet/i.test(ua) || (platform === 'MacIntel' && touchPoints > 1)) return null
  const ios = /iPhone|iPod/.test(ua)
  const android = /Android/.test(ua) && /Mobile/.test(ua)
  if (!ios && !android) return null
  const embedded = /FBAN|FBAV|Instagram|WhatsApp|Line\/|; wv[);]|GSA\//i.test(ua)
    || (ios && !/Safari\/|CriOS|FxiOS|EdgiOS|OPiOS/.test(ua))
  if (embedded) return ios ? 'embedded-ios' : 'embedded-android'
  return getInstallMethod(ua, platform, touchPoints, nativePrompt) ?? 'android-browser'
}

export function getInstallMethod(ua: string, platform: string, touchPoints: number, nativePrompt: boolean): InstallMethod {
  if (nativePrompt) return 'native'
  const ios = /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && touchPoints > 1)
  if (ios) {
    // Do not promise an install command inside embedded app browsers.
    if (/FBAN|FBAV|Instagram|Line\/|; wv/.test(ua)) return null
    if (/CriOS\//.test(ua)) return 'ios-chrome'
    return /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? 'ios-safari' : 'ios-browser'
  }
  if (!/Android/.test(ua) || /; wv\)|; wv;/.test(ua)) return null
  if (/SamsungBrowser\//.test(ua)) return 'android-samsung'
  if (/Chrome\//.test(ua) && !/EdgA|OPR|Firefox/.test(ua)) return 'android-chrome'
  return null
}

export function isInstallDismissed(value: string | null, now: number): boolean {
  if (!value) return false
  const at = Number(value)
  return Number.isFinite(at) && at > 0 && at <= now && now - at < INSTALL_DISMISS_MS
}

// The inline invitation's dismissal is deliberately not an input here.
export function getInstallPopupStorageReason(session: string | null, dismissal: string | null, now: number, never: string | null = null) {
  if (never === '1') return 'dismissed-permanently'
  if (session === '1') return 'session-seen'
  return isInstallDismissed(dismissal, now) ? 'dismissed-7days' : null
}

export function showInstallOnRoute(pathname: string): boolean {
  // Contextual installation only on the two homes, never a transaction route.
  return pathname === '/' || pathname === '/player'
}
