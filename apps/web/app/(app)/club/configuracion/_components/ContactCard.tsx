type ContactForm = {
  brand_name: string
  legal_name: string
  cuit: string
  contact_email: string
  phone: string
  website: string
  instagram: string
}

type ContactCardProps = {
  value: ContactForm
  onChange: (key: keyof ContactForm, value: string) => void
}

export function ContactCard({ value, onChange }: ContactCardProps) {
  const groups = [
    {
      title: 'Datos comerciales',
      fields: [
        { key: 'brand_name' as const, label: 'Nombre comercial', value: value.brand_name },
        { key: 'legal_name' as const, label: 'Razón social', value: value.legal_name },
        { key: 'cuit' as const, label: 'CUIT', value: value.cuit },
      ],
    },
    {
      title: 'Contacto',
      fields: [
        { key: 'contact_email' as const, label: 'Email contacto', value: value.contact_email },
        { key: 'phone' as const, label: 'Teléfono', value: value.phone },
      ],
    },
    {
      title: 'Redes',
      fields: [
        { key: 'website' as const, label: 'Website', value: value.website },
        { key: 'instagram' as const, label: 'Instagram', value: value.instagram },
      ],
    },
  ]

  return (
    <div className="px-card px-card--flat" style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div className="px-sectionTitle">Identidad y contacto</div>
        <span className="px-help" style={{ fontSize: 12 }}>Datos visibles y administrativos del club.</span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 10,
          marginTop: 12,
        }}
      >
        {groups.map((group) => (
          <section
            key={group.title}
            style={{
              background: 'rgba(248,250,252,.76)',
              border: '1px solid rgba(15,23,42,.08)',
              borderRadius: 14,
              display: 'grid',
              gap: 8,
              padding: 10,
            }}
          >
            <strong style={{ color: '#17253f', fontSize: 12, fontWeight: 950 }}>{group.title}</strong>
            <div style={{ display: 'grid', gap: 8 }}>
              {group.fields.map((field) => (
                <label key={field.key} className="px-field" style={{ gap: 4 }}>
                  <span className="px-label" style={{ fontSize: 10 }}>{field.label}</span>
                  <input
                    className="px-input"
                    value={field.value}
                    onChange={(event) => onChange(field.key, event.target.value)}
                    style={{ minHeight: 36 }}
                  />
                </label>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
