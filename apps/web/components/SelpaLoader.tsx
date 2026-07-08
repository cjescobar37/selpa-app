type SelpaLoaderProps = {
  title: string
  subtitle: string
  className?: string
}

export default function SelpaLoader({ title, subtitle, className = '' }: SelpaLoaderProps) {
  const classes = ['px-loginLoading', className].filter(Boolean).join(' ')

  return (
    <div className={classes} role="status" aria-live="polite">
      <span className="px-loginLoading__mark" aria-hidden="true">
        <span className="px-spinner" />
      </span>
      <div>
        <strong>{title}</strong>
        <p>{subtitle}</p>
      </div>
      <span className="px-loginLoading__line" aria-hidden="true" />
    </div>
  )
}
