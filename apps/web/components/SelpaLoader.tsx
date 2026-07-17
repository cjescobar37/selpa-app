'use client'

import { useEffect, useRef } from 'react'

type SelpaLoaderProps = {
  title: string
  subtitle: string
  className?: string
}

export default function SelpaLoader({ title, subtitle, className = '' }: SelpaLoaderProps) {
  const spinnerRef = useRef<HTMLSpanElement>(null)
  const barRef = useRef<HTMLSpanElement>(null)
  const classes = ['px-loginLoading', className].filter(Boolean).join(' ')

  useEffect(() => {
    const spinner = spinnerRef.current
    const bar = barRef.current

    if (!spinner?.animate || !bar?.animate) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const spinnerAnimation = spinner.animate(
      [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
      {
        duration: reducedMotion ? 1600 : 850,
        easing: reducedMotion ? 'steps(4, end)' : 'linear',
        iterations: Infinity,
      },
    )
    const barAnimation = bar.animate(
      [{ transform: 'translateX(-120%)' }, { transform: 'translateX(320%)' }],
      {
        duration: reducedMotion ? 1800 : 1150,
        easing: 'ease-in-out',
        iterations: Infinity,
      },
    )

    return () => {
      spinnerAnimation.cancel()
      barAnimation.cancel()
    }
  }, [])

  return (
    <div className={classes} role="status" aria-live="polite" aria-busy="true">
      <span className="px-loginLoading__mark" aria-hidden="true">
        <span ref={spinnerRef} className="px-spinner selpaLoaderSpinner" />
      </span>
      <div>
        <strong>{title}</strong>
        <p>{subtitle}</p>
      </div>
      <span className="px-loginLoading__line selpaLoaderTrack" aria-hidden="true"><span ref={barRef} className="selpaLoaderBar" /></span>
      <span className="px-visuallyHidden">{`${title} ${subtitle}`}</span>
    </div>
  )
}
