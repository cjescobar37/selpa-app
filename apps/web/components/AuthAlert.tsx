'use client'

import { humanizeUiError } from '@/lib/productPresentation'

type Variant = 'success' | 'warning' | 'error' | 'info'

export default function AuthAlert({
  variant = 'info',
  title,
  message,
}: {
  variant?: Variant
  title: string
  message?: string
}) {
  const cls =
    variant === 'success'
      ? 'px-alert px-alert--success'
      : variant === 'warning'
      ? 'px-alert px-alert--warning'
      : variant === 'error'
      ? 'px-alert px-alert--error'
      : 'px-alert'

  return (
    <div className={cls} role={variant === 'error' ? 'alert' : 'status'} aria-live={variant === 'error' ? 'assertive' : 'polite'}>
      <span className="px-alertDot" aria-hidden="true" />
      <div>
        <p className="px-alertTitle">{humanizeUiError(title, 'Revisá esta acción')}</p>
        {message ? <p className="px-alertText">{humanizeUiError(message)}</p> : null}
      </div>
    </div>
  )
}
