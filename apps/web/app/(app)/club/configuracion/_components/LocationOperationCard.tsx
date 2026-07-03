type LocationOperationForm = {
  city: string
  province: string
  country: string
  address: string
  courts_count: string
  courts_surface: string
  opening_hours: string
}

type LocationOperationCardProps = {
  value: LocationOperationForm
  onChange: (key: keyof LocationOperationForm, value: string) => void
}

const countryOptions = ['Argentina', 'Uruguay', 'Chile', 'Paraguay']
const provinceOptions = ['La Pampa', 'Buenos Aires', 'Córdoba', 'Santa Fe', 'Mendoza', 'Neuquén']
const cityOptions = ['Santa Rosa', 'General Pico', 'CABA', 'Córdoba', 'Rosario', 'Mendoza']
const dayRows = [
  { label: 'Lunes a viernes', value: '08:00 - 23:00' },
  { label: 'Sábado', value: '09:00 - 21:00' },
  { label: 'Domingo', value: 'A definir' },
]

export function LocationOperationCard({ value, onChange }: LocationOperationCardProps) {
  return (
    <div className="px-card px-card--flat" style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div className="px-sectionTitle">Ubicación y operación</div>
        <span className="px-help" style={{ fontSize: 12 }}>Sede, infraestructura y horarios operativos.</span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.15fr) minmax(250px, .85fr)',
          gap: 10,
          marginTop: 12,
        }}
      >
        <section
          style={{
            background: 'rgba(248,250,252,.76)',
            border: '1px solid rgba(15,23,42,.08)',
            borderRadius: 14,
            display: 'grid',
            gap: 8,
            padding: 10,
          }}
        >
          <strong style={{ color: '#17253f', fontSize: 12, fontWeight: 950 }}>Ubicación</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            <label className="px-field" style={{ gap: 4 }}>
              <span className="px-label" style={{ fontSize: 10 }}>País</span>
              <select className="px-input" value={value.country} onChange={(event) => onChange('country', event.target.value)} style={{ minHeight: 36 }}>
                {countryOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="px-field" style={{ gap: 4 }}>
              <span className="px-label" style={{ fontSize: 10 }}>Provincia</span>
              <select className="px-input" value={value.province} onChange={(event) => onChange('province', event.target.value)} style={{ minHeight: 36 }}>
                <option value="">Seleccionar</option>
                {provinceOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="px-field" style={{ gap: 4 }}>
              <span className="px-label" style={{ fontSize: 10 }}>Ciudad</span>
              <input className="px-input" list="club-config-city-options" value={value.city} onChange={(event) => onChange('city', event.target.value)} style={{ minHeight: 36 }} />
              <datalist id="club-config-city-options">
                {cityOptions.map((option) => <option key={option} value={option} />)}
              </datalist>
            </label>
            <label className="px-field" style={{ gap: 4 }}>
              <span className="px-label" style={{ fontSize: 10 }}>Dirección</span>
              <input className="px-input" value={value.address} onChange={(event) => onChange('address', event.target.value)} style={{ minHeight: 36 }} />
            </label>
          </div>
        </section>

        <div style={{ display: 'grid', gap: 10 }}>
          <section
            style={{
              background: 'rgba(248,250,252,.76)',
              border: '1px solid rgba(15,23,42,.08)',
              borderRadius: 14,
              display: 'grid',
              gap: 8,
              padding: 10,
            }}
          >
            <strong style={{ color: '#17253f', fontSize: 12, fontWeight: 950 }}>Infraestructura</strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              <label className="px-field" style={{ gap: 4 }}>
                <span className="px-label" style={{ fontSize: 10 }}>Canchas</span>
                <input className="px-input" value={value.courts_count} onChange={(event) => onChange('courts_count', event.target.value)} style={{ minHeight: 36 }} />
              </label>
              <label className="px-field" style={{ gap: 4 }}>
                <span className="px-label" style={{ fontSize: 10 }}>Superficie</span>
                <input className="px-input" value={value.courts_surface} onChange={(event) => onChange('courts_surface', event.target.value)} style={{ minHeight: 36 }} />
              </label>
            </div>
          </section>

          <section
            style={{
              background: 'rgba(248,250,252,.76)',
              border: '1px solid rgba(15,23,42,.08)',
              borderRadius: 14,
              display: 'grid',
              gap: 8,
              padding: 10,
            }}
          >
            <strong style={{ color: '#17253f', fontSize: 12, fontWeight: 950 }}>Operación</strong>
            <div style={{ display: 'grid', gap: 6 }}>
              {dayRows.map((row) => (
                <div
                  key={row.label}
                  style={{
                    alignItems: 'center',
                    background: '#fff',
                    border: '1px solid rgba(15,23,42,.08)',
                    borderRadius: 10,
                    display: 'flex',
                    gap: 8,
                    justifyContent: 'space-between',
                    padding: '7px 9px',
                  }}
                >
                  <span style={{ color: '#475569', fontSize: 11, fontWeight: 900 }}>{row.label}</span>
                  <strong style={{ color: '#061b3a', fontSize: 11 }}>{row.value}</strong>
                </div>
              ))}
            </div>
            <label className="px-field" style={{ gap: 4 }}>
              <span className="px-label" style={{ fontSize: 10 }}>Horarios actuales</span>
              <input className="px-input" value={value.opening_hours} onChange={(event) => onChange('opening_hours', event.target.value)} placeholder="Ej: Lun a vie 8 a 23 hs" style={{ minHeight: 36 }} />
            </label>
          </section>
        </div>
      </div>
    </div>
  )
}
