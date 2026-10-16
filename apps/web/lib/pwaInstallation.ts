// Capability first. UA checks only select truthful manual instructions.
export type InstallMethod = 'native' | 'ios-safari' | 'ios-browser' | 'android-chrome' | 'android-samsung' | null
export const INSTALL_DISMISS_KEY = 'selpa:pwa-install-dismissed:v1'
export const INSTALL_DISMISS_MS = 7 * 24 * 60 * 60 * 1000

export function getInstallMethod(ua: string, platform: string, touchPoints: number, nativePrompt: boolean): InstallMethod {
  if (nativePrompt) return 'native'
  const ios = /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && touchPoints > 1)
  if (ios) {
    // Do not promise an install command inside embedded app browsers.
    if (/FBAN|FBAV|Instagram|Line\/|; wv/.test(ua)) return null
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

export function showInstallOnRoute(pathname: string): boolean {
  // Contextual invitation only at the end of the two homes. Never a form,
  // payment, tournament, blocking modal or fixed overlay.
  return pathname === '/' || pathname === '/player'
}
