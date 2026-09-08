'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

const clamp = (value: number) => Math.max(.6, Math.min(1.6, value))

/** Zooms around a content coordinate, not the top-left corner. One finger keeps native pan. */
export function useBracketViewport(width: number, height: number, autoFit: boolean) {
  const viewport = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(1)
  const target = useRef<{ x: number; y: number; localX: number; localY: number } | null>(null)
  const fitNext = useRef(autoFit)
  const [fitVersion, setFitVersion] = useState(0)
  const zoomAt = useCallback((value: number, point?: { x: number; y: number }, world?: { x: number; y: number }) => {
    const el = viewport.current
    if (!el) return
    const localX = point?.x ?? el.clientWidth / 2, localY = point?.y ?? el.clientHeight / 2
    target.current = { x: world?.x ?? (el.scrollLeft + localX) / zoomRef.current, y: world?.y ?? (el.scrollTop + localY) / zoomRef.current, localX, localY }
    zoomRef.current = clamp(value)
    setZoom(zoomRef.current)
  }, [])
  const fit = useCallback(() => { fitNext.current = true; setFitVersion((v) => v + 1) }, [])
  useLayoutEffect(() => {
    const el = viewport.current
    if (!el) return
    if (fitNext.current) {
      fitNext.current = false
      const value = clamp(Math.min(el.clientWidth / width, el.clientHeight / height))
      zoomRef.current = value
      setZoom(value)
      target.current = { x: Math.min(width / 2, el.clientWidth / (2 * value)), y: height / 2, localX: el.clientWidth / 2, localY: el.clientHeight / 2 }
    }
    if (target.current) {
      const p = target.current
      el.scrollLeft = Math.max(0, p.x * zoomRef.current - p.localX)
      el.scrollTop = Math.max(0, p.y * zoomRef.current - p.localY)
      // A fitted scale gets its new scroll extent on the next layout pass.
      if (zoom === zoomRef.current) target.current = null
    }
  }, [zoom, width, height, fitVersion])
  useEffect(() => {
    const el = viewport.current
    if (!el) return
    let pinch: { distance: number; zoom: number; x: number; y: number } | null = null
    const points = (event: TouchEvent) => {
      const [a, b] = Array.from(event.touches), box = el.getBoundingClientRect()
      return { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), x: (a.clientX + b.clientX) / 2 - box.left, y: (a.clientY + b.clientY) / 2 - box.top }
    }
    const start = (event: TouchEvent) => {
      if (event.touches.length !== 2) return
      event.preventDefault()
      const p = points(event)
      pinch = { distance: p.distance, zoom: zoomRef.current, x: (el.scrollLeft + p.x) / zoomRef.current, y: (el.scrollTop + p.y) / zoomRef.current }
    }
    const move = (event: TouchEvent) => {
      if (!pinch || event.touches.length !== 2) return
      event.preventDefault()
      const p = points(event)
      zoomAt(pinch.zoom * p.distance / Math.max(1, pinch.distance), p, pinch)
    }
    const end = () => { pinch = null }
    el.addEventListener('touchstart', start, { passive: false })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => { el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', end); el.removeEventListener('touchcancel', end) }
  }, [zoomAt])
  return { viewport, zoom, zoomAt, fit }
}
