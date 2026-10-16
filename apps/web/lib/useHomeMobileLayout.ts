'use client'

import { useSyncExternalStore } from 'react'
import { HOME_MOBILE_PILOT_ENABLED } from '@/lib/homeMobilePilot'

const query = '(max-width: 980px)'
function subscribe(notify: () => void) {
  const media = window.matchMedia(query)
  media.addEventListener('change', notify)
  return () => media.removeEventListener('change', notify)
}
const getSnapshot = () => HOME_MOBILE_PILOT_ENABLED && window.matchMedia(query).matches
const getServerSnapshot = () => false

export function useHomeMobileLayout() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
