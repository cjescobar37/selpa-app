'use client'

import { useEffect, useState } from 'react'
import { isMobileKeyboardOpen } from '@/lib/mobileNavigation'

/** No UA guesses or focus-only hiding: a focused field without a virtual
 * keyboard (including a hardware keyboard) keeps its navigation available. */
export function useMobileKeyboard() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    let fullHeight = window.innerHeight, frame = 0
    function measure() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const focused = document.activeElement instanceof HTMLElement && document.activeElement.matches('textarea, input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), [contenteditable=true]')
        if (!focused) fullHeight = window.innerHeight
        setOpen(isMobileKeyboardOpen(fullHeight, viewport!.height, viewport!.scale, Boolean(focused)))
      })
    }
    function rotate() { fullHeight = window.innerHeight; measure() }
    viewport.addEventListener('resize', measure)
    document.addEventListener('focusin', measure); document.addEventListener('focusout', measure)
    window.addEventListener('orientationchange', rotate)
    return () => { cancelAnimationFrame(frame); viewport!.removeEventListener('resize', measure); document.removeEventListener('focusin', measure); document.removeEventListener('focusout', measure); window.removeEventListener('orientationchange', rotate) }
  }, [])
  return open
}
