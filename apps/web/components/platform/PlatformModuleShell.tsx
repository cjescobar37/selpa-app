import type { ReactNode } from 'react'

type Metric = { label: string; value: string; hint?: string }
type QuickAction = { title: string; description: string; tag?: string }

type Props = {
  title: string
  subtitle: string
  metrics?: Metric[]
  actions?: ReactNode
  quickActions?: QuickAction[]
  children?: ReactNode
  aside?: ReactNode
}

export default function PlatformModuleShell({ title, subtitle, metrics = [], actions, quickActions = [], children, aside }: Props) {
  return (
    <div className="platform-shell">
      <div className="px-platform">
        <div className="px-platformHead">
          <div>
            <h1 className="px-platformTitle">{title}</h1>
            <div className="px-platformSub">{subtitle}</div>
          </div>
          {actions ? <div className="px-toolbar">{actions}</div> : null}
        </div>

        {metrics.length ? (
          <div className="px-kpis px-kpis--platformAdmin" style={{ marginTop: 16 }}>
            {metrics.map((metric) => (
              <div key={metric.label} className="px-platformMetricCard">
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                {metric.hint ? <small style={{ display: 'block', marginTop: 8, color: 'rgba(23,37,63,.56)', fontSize: 11 }}>{metric.hint}</small> : null}
              </div>
            ))}
          </div>
        ) : null}

        <div className="px-contentAdminGrid">
          <section className="px-platformCard">
            {quickActions.length ? (
              <div className="px-actions" style={{ marginBottom: 14 }}>
                {quickActions.map((action) => (
                  <div key={action.title} className="px-action">
                    <div className="px-actionLeft">
                      <p className="px-actionTitle">{action.title}</p>
                      <p className="px-actionSub">{action.description}</p>
                    </div>
                    {action.tag ? <span className="px-pill">{action.tag}</span> : null}
                  </div>
                ))}
              </div>
            ) : null}
            {children}
          </section>
          <aside className="px-platformAsideStack">
            {aside}
          </aside>
        </div>
      </div>
    </div>
  )
}
