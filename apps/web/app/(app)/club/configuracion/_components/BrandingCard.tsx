import { getClubInitials } from '@/lib/clubAssets'
import type { ClubThemeKey } from '@/lib/clubThemes'

type BrandingForm = {
  name: string
  brand_name: string
  legal_name: string
  cuit: string
  city: string
  province: string
  country: string
  address: string
  contact_email: string
  phone: string
  website: string
  instagram: string
  notes: string
  rules_pdf_url: string
  theme_key: ClubThemeKey
}

type BrandingCardProps = {
  value: BrandingForm
  activeClubName?: string | null
  displayLogo: string
  selectedThemeSoft: string
  uploadingLogo: boolean
  uploadingRules: boolean
  selectedRulesName: string
  onChange: (key: keyof BrandingForm, value: string) => void
  onLogoFileChange: (file: File | null) => void
  onRulesFileChange: (file: File | null) => void
}

function isRealUrl(value?: string | null) {
  if (!value) return false
  return /^https?:\/\//i.test(value.trim())
}

const inputStyle = { minHeight: 36 } as const
const labelStyle = { fontSize: 10 } as const
const panelStyle = {
  background: 'rgba(248,250,252,.72)',
  border: '1px solid rgba(15,23,42,.08)',
  borderRadius: 14,
  padding: 10,
} as const

const countryOptions = ['Argentina']
const provinceOptions = [
  'Buenos Aires',
  'CABA',
  'Catamarca',
  'Chaco',
  'Chubut',
  'Córdoba',
  'Corrientes',
  'Entre Ríos',
  'Formosa',
  'Jujuy',
  'La Pampa',
  'La Rioja',
  'Mendoza',
  'Misiones',
  'Neuquén',
  'Río Negro',
  'Salta',
  'San Juan',
  'San Luis',
  'Santa Cruz',
  'Santa Fe',
  'Santiago del Estero',
  'Tierra del Fuego',
  'Tucumán',
]
const cityOptions = ['Santa Rosa', 'General Pico', 'CABA', 'Córdoba', 'Rosario', 'Mendoza', 'Otra / manual']

export function BrandingCard({
  value,
  activeClubName,
  displayLogo,
  selectedThemeSoft,
  uploadingLogo,
  uploadingRules,
  selectedRulesName,
  onChange,
  onLogoFileChange,
  onRulesFileChange,
}: BrandingCardProps) {
  const contactFields = [
    { key: 'contact_email' as const, label: 'Email principal', value: value.contact_email },
    { key: 'phone' as const, label: 'Teléfono', value: value.phone },
  ]
  const socialFields = [
    { key: 'website' as const, label: 'Website', value: value.website },
    { key: 'instagram' as const, label: 'Instagram', value: value.instagram },
  ]
  const fiscalFields = [
    { key: 'brand_name' as const, label: 'Nombre comercial', value: value.brand_name },
    { key: 'legal_name' as const, label: 'Razón social', value: value.legal_name },
    { key: 'cuit' as const, label: 'CUIT', value: value.cuit },
  ]

  return (
    <div className="px-card px-card--flat" style={{ padding: 16 }}>
      <div style={{ alignItems: 'baseline', display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }}>
        <h2 className="px-sectionTitle" style={{ margin: 0 }}>Identidad del club</h2>
        <span className="px-help" style={{ fontSize: 12 }}>Logo, datos principales, documentos y redes.</span>
      </div>

      <div
        className="club-configBrandGrid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(150px, .34fr) minmax(260px, 1fr) minmax(240px, .82fr)',
          gap: 12,
          marginTop: 12,
          alignItems: 'stretch',
        }}
      >
        <label
          style={{
            ...panelStyle,
            alignContent: 'center',
            border: '1px dashed rgba(23,37,63,.16)',
            display: 'grid',
            gap: 9,
            justifyItems: 'center',
            cursor: 'pointer',
          }}
        >
          <div
            style={{
              width: 132,
              height: 84,
              borderRadius: 16,
              background: 'rgba(255,255,255,.90)',
              border: '1px solid rgba(23,37,63,.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              padding: 10,
            }}
          >
            {displayLogo ? (
              <img
                src={displayLogo}
                alt="Logo del club"
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  display: 'block',
                }}
              />
            ) : (
              <span
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: 16,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: selectedThemeSoft,
                  color: '#17253f',
                  fontWeight: 900,
                  fontSize: 20,
                }}
              >
                {getClubInitials(value.name || activeClubName || 'Club')}
              </span>
            )}
          </div>

          <div
            style={{
              padding: '7px 10px',
              borderRadius: 999,
              background: 'rgba(255,255,255,.92)',
              border: '1px solid rgba(23,37,63,.10)',
              fontWeight: 800,
              color: '#17253f',
              fontSize: 12,
              minHeight: 34,
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            {uploadingLogo ? 'Subiendo…' : 'Cambiar imagen'}
          </div>

          <input
            type="file"
            accept="image/*"
            onChange={(event) => onLogoFileChange(event.target.files?.[0] ?? null)}
            style={{ display: 'none' }}
          />
        </label>

        <section style={{ ...panelStyle, display: 'grid', gap: 9 }}>
          <strong style={{ color: '#061b3a', fontSize: 12, fontWeight: 950 }}>Datos principales</strong>
          <label className="px-field" style={{ gap: 4 }}>
            <span className="px-label" style={labelStyle}>Nombre del club</span>
            <input
              className="px-input"
              value={value.name}
              onChange={(event) => onChange('name', event.target.value)}
              style={inputStyle}
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            {contactFields.map((field) => (
              <label key={field.key} className="px-field" style={{ gap: 4 }}>
                <span className="px-label" style={labelStyle}>{field.label}</span>
                <input className="px-input" value={field.value} onChange={(event) => onChange(field.key, event.target.value)} style={inputStyle} />
              </label>
            ))}
          </div>
        </section>

        <section style={{ ...panelStyle, display: 'grid', gap: 9 }}>
          <strong style={{ color: '#061b3a', fontSize: 12, fontWeight: 950 }}>Documentos y redes</strong>
          <label
            style={{
              background: '#fff',
              border: '1px dashed rgba(23,37,63,.14)',
              borderRadius: 12,
              display: 'grid',
              gap: 5,
              padding: 8,
              cursor: 'pointer',
            }}
          >
            <div className="px-label" style={labelStyle}>Reglamento PDF</div>

            <div
              style={{
                alignItems: 'center',
                display: 'flex',
                minHeight: 36,
                padding: '7px 10px',
                borderRadius: 10,
                background: 'rgba(255,255,255,.92)',
                border: '1px solid rgba(23,37,63,.08)',
                color: '#17253f',
                fontWeight: 850,
                fontSize: 12,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {uploadingRules ? 'Subiendo PDF…' : selectedRulesName || 'Seleccionar PDF'}
            </div>

            {isRealUrl(value.rules_pdf_url) ? (
              <a
                href={value.rules_pdf_url}
                target="_blank"
                rel="noreferrer"
                className="px-link"
                onClick={(event) => event.stopPropagation()}
                style={{ fontSize: 12 }}
              >
                Abrir PDF actual
              </a>
            ) : (
              <div className="px-help" style={{ fontSize: 11 }}>Solo PDF</div>
            )}

            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => onRulesFileChange(event.target.files?.[0] ?? null)}
              style={{ display: 'none' }}
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            {socialFields.map((field) => (
              <label key={field.key} className="px-field" style={{ gap: 4 }}>
                <span className="px-label" style={labelStyle}>{field.label}</span>
                <input className="px-input" value={field.value} onChange={(event) => onChange(field.key, event.target.value)} style={inputStyle} />
              </label>
            ))}
          </div>
        </section>

        <section style={{ ...panelStyle, display: 'grid', gap: 9, gridColumn: '1 / -1' }}>
          <strong style={{ color: '#061b3a', fontSize: 12, fontWeight: 950 }}>Ubicación</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
            <label className="px-field" style={{ gap: 4 }}>
              <span className="px-label" style={labelStyle}>País</span>
              <select className="px-input" value={value.country || 'Argentina'} onChange={(event) => onChange('country', event.target.value)} style={inputStyle}>
                {countryOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="px-field" style={{ gap: 4 }}>
              <span className="px-label" style={labelStyle}>Provincia</span>
              <select className="px-input" value={value.province} onChange={(event) => onChange('province', event.target.value)} style={inputStyle}>
                <option value="">Seleccionar</option>
                {provinceOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="px-field" style={{ gap: 4 }}>
              <span className="px-label" style={labelStyle}>Ciudad</span>
              <input
                className="px-input"
                list="club-config-brand-city-options"
                value={value.city}
                onChange={(event) => onChange('city', event.target.value === 'Otra / manual' ? '' : event.target.value)}
                style={inputStyle}
              />
              <datalist id="club-config-brand-city-options">
                {cityOptions.map((option) => <option key={option} value={option} />)}
              </datalist>
            </label>
            <label className="px-field" style={{ gap: 4 }}>
              <span className="px-label" style={labelStyle}>Dirección</span>
              <input className="px-input" value={value.address} onChange={(event) => onChange('address', event.target.value)} style={inputStyle} />
            </label>
          </div>
        </section>

        <details
          style={{
            ...panelStyle,
            gridColumn: '1 / -1',
            padding: '9px 10px',
          }}
        >
          <summary style={{ color: '#17253f', cursor: 'pointer', fontSize: 12, fontWeight: 950 }}>Datos fiscales</summary>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, marginTop: 9 }}>
            {fiscalFields.map((field) => (
              <label key={field.key} className="px-field" style={{ gap: 4 }}>
                <span className="px-label" style={labelStyle}>{field.label}</span>
                <input className="px-input" value={field.value} onChange={(event) => onChange(field.key, event.target.value)} style={inputStyle} />
              </label>
            ))}
          </div>
        </details>

        <div className="px-field" style={{ gridColumn: '1 / -1', gap: 4 }}>
          <div className="px-label" style={labelStyle}>Notas internas</div>
          <textarea
            className="px-input"
            rows={1}
            value={value.notes}
            onChange={(event) => onChange('notes', event.target.value)}
            style={{ minHeight: 38, resize: 'vertical' }}
          />
        </div>
      </div>
    </div>
  )
}
