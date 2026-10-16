// Local Sprint 2B pilot. One switch restores the Sprint 2A layout and footer
// invitation without reverting unrelated PWA or application work.
export const HOME_MOBILE_PILOT_ENABLED = true

export function isHomeMobilePilotRoute(pathname: string): boolean {
  return HOME_MOBILE_PILOT_ENABLED && (pathname === '/' || pathname === '/player')
}
