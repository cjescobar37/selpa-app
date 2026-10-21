// Launcher canvas matches the navy startup artwork. This is not the Home/body
// surface: that remains the existing --bg token after the opening dissolves.
export const PWA_COLORS = { theme: '#313b4c', background: '#061b3a' } as const

// Exact iOS launch-image sizes; unmatched devices use the OS fallback. No JS
// splash, delay, redirect, device fingerprint, or user-specific startup image.
export const PWA_STARTUP_SCREENS = [
  { width: 320, height: 568, scale: 2 },
  { width: 375, height: 667, scale: 2 },
  { width: 375, height: 812, scale: 3 },
  { width: 390, height: 844, scale: 3 },
  { width: 393, height: 852, scale: 3 },
  { width: 402, height: 874, scale: 3 },
  { width: 414, height: 896, scale: 2 },
  { width: 414, height: 896, scale: 3 },
  { width: 428, height: 926, scale: 3 },
  { width: 430, height: 932, scale: 3 },
  { width: 440, height: 956, scale: 3 },
].flatMap(screen => (['portrait', 'landscape'] as const).map(orientation => ({
  ...screen,
  orientation,
  id: `${screen.width}x${screen.height}-${screen.scale}-${orientation}`,
  pixelWidth: (orientation === 'portrait' ? screen.width : screen.height) * screen.scale,
  pixelHeight: (orientation === 'portrait' ? screen.height : screen.width) * screen.scale,
  media: `(device-width: ${screen.width}px) and (device-height: ${screen.height}px) and (-webkit-device-pixel-ratio: ${screen.scale}) and (orientation: ${orientation})`,
})))
