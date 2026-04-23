'use client'

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
    <div className={cls} role="status" aria-live="polite">
      <span className="px-alertDot" aria-hidden="true" />
      <div>
        <p className="px-alertTitle">{title}</p>
        {message ? <p className="px-alertText">{message}</p> : null}
      </div>
    </div>
  )
}