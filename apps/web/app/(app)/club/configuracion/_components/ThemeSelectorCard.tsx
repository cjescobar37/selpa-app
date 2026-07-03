import { useState } from 'react'
import { CLUB_THEME_LABELS, type ClubThemeKey } from '@/lib/clubThemes'

type ClubThemeOption = {
  key: ClubThemeKey
  vars: {
    accent: string
    accent2: string
    hero: string
    glow: string
    soft: string
  }
}

type ThemeSelectorCardProps = {
  themes: ClubThemeOption[]
  selectedTheme: ClubThemeOption
  themeLocked: boolean
  canChooseTheme: boolean
  pendingThemeKey: ClubThemeKey | null
  onSubmitThemeRequest: (themeKey: ClubThemeKey) => void
}

const visiblePalettePairs: Partial<Record<ClubThemeKey, { accent: string; accent2: string; hero: string; glow: string; soft: string }>> = {
  forest: {
    accent: '#166534',
    accent2: '#a3e635',
    hero: '#166534 0%, #166534 50%, #a3e635 50%, #a3e635 100%',
    glow: 'rgba(22,101,52,.18)',
    soft: 'rgba(163,230,53,.18)',
  },
  ocean: {
    accent: '#1e3a8a',
    accent2: '#f59e0b',
    hero: '#1e3a8a 0%, #1e3a8a 50%, #f59e0b 50%, #f59e0b 100%',
    glow: 'rgba(30,58,138,.18)',
    soft: 'rgba(245,158,11,.16)',
  },
  terracotta: {
    accent: '#c2410c',
    accent2: '#e7c68f',
    hero: '#c2410c 0%, #c2410c 50%, #e7c68f 50%, #e7c68f 100%',
    glow: 'rgba(194,65,12,.18)',
    soft: 'rgba(231,198,143,.22)',
  },
  royal: {
    accent: '#1d4ed8',
    accent2: '#bae6fd',
    hero: '#1d4ed8 0%, #1d4ed8 50%, #bae6fd 50%, #bae6fd 100%',
    glow: 'rgba(29,78,216,.18)',
    soft: 'rgba(186,230,253,.24)',
  },
  titanium: {
    accent: '#dc2626',
    accent2: '#020617',
    hero: '#dc2626 0%, #dc2626 50%, #020617 50%, #020617 100%',
    glow: 'rgba(220,38,38,.16)',
    soft: 'rgba(220,38,38,.12)',
  },
  emerald: {
    accent: '#7c3aed',
    accent2: '#fb7185',
    hero: '#7c3aed 0%, #7c3aed 50%, #fb7185 50%, #fb7185 100%',
    glow: 'rgba(124,58,237,.16)',
    soft: 'rgba(251,113,133,.15)',
  },
  crimson: {
    accent: '#0f766e',
    accent2: '#6ee7b7',
    hero: '#0f766e 0%, #0f766e 50%, #6ee7b7 50%, #6ee7b7 100%',
    glow: 'rgba(15,118,110,.16)',
    soft: 'rgba(110,231,183,.18)',
  },
  sunset: {
    accent: '#334155',
    accent2: '#f97316',
    hero: '#334155 0%, #334155 50%, #f97316 50%, #f97316 100%',
    glow: 'rgba(51,65,85,.16)',
    soft: 'rgba(249,115,22,.14)',
  },
  sand: {
    accent: '#9f1239',
    accent2: '#fda4af',
    hero: '#9f1239 0%, #9f1239 50%, #fda4af 50%, #fda4af 100%',
    glow: 'rgba(159,18,57,.16)',
    soft: 'rgba(253,164,175,.20)',
  },
  violet: {
    accent: '#059669',
    accent2: '#78716c',
    hero: '#059669 0%, #059669 50%, #78716c 50%, #78716c 100%',
    glow: 'rgba(5,150,105,.16)',
    soft: 'rgba(120,113,108,.14)',
  },
  copper: {
    accent: '#b45309',
    accent2: '#0f172a',
    hero: '#b45309 0%, #b45309 50%, #0f172a 50%, #0f172a 100%',
    glow: 'rgba(180,83,9,.16)',
    soft: 'rgba(180,83,9,.13)',
  },
  midnight: {
    accent: '#bae6fd',
    accent2: '#2563eb',
    hero: '#bae6fd 0%, #bae6fd 50%, #2563eb 50%, #2563eb 100%',
    glow: 'rgba(37,99,235,.16)',
    soft: 'rgba(186,230,253,.24)',
  },
  lava: {
    accent: '#92400e',
    accent2: '#4d7c0f',
    hero: '#92400e 0%, #92400e 50%, #4d7c0f 50%, #4d7c0f 100%',
    glow: 'rgba(146,64,14,.16)',
    soft: 'rgba(77,124,15,.14)',
  },
  arctic: {
    accent: '#6d28d9',
    accent2: '#38bdf8',
    hero: '#6d28d9 0%, #6d28d9 50%, #38bdf8 50%, #38bdf8 100%',
    glow: 'rgba(109,40,217,.16)',
    soft: 'rgba(56,189,248,.16)',
  },
  petrol: {
    accent: '#020617',
    accent2: '#eab308',
    hero: '#020617 0%, #020617 50%, #eab308 50%, #eab308 100%',
    glow: 'rgba(2,6,23,.18)',
    soft: 'rgba(234,179,8,.16)',
  },
  goldBlack: {
    accent: '#b91c1c',
    accent2: '#64748b',
    hero: '#b91c1c 0%, #b91c1c 50%, #64748b 50%, #64748b 100%',
    glow: 'rgba(185,28,28,.16)',
    soft: 'rgba(100,116,139,.14)',
  },
  wine: {
    accent: '#0d9488',
    accent2: '#d6a642',
    hero: '#0d9488 0%, #0d9488 50%, #d6a642 50%, #d6a642 100%',
    glow: 'rgba(13,148,136,.16)',
    soft: 'rgba(214,166,66,.16)',
  },
  olive: {
    accent: '#4d7c0f',
    accent2: '#fef3c7',
    hero: '#4d7c0f 0%, #4d7c0f 50%, #fef3c7 50%, #fef3c7 100%',
    glow: 'rgba(77,124,15,.16)',
    soft: 'rgba(254,243,199,.26)',
  },
  sky: {
    accent: '#4f46e5',
    accent2: '#fdba74',
    hero: '#4f46e5 0%, #4f46e5 50%, #fdba74 50%, #fdba74 100%',
    glow: 'rgba(79,70,229,.16)',
    soft: 'rgba(253,186,116,.18)',
  },
  graphite: {
    accent: '#dc2626',
    accent2: '#475569',
    hero: '#dc2626 0%, #dc2626 50%, #475569 50%, #475569 100%',
    glow: 'rgba(220,38,38,.16)',
    soft: 'rgba(71,85,105,.14)',
  },
  clay: {
    accent: '#16a34a',
    accent2: '#22d3ee',
    hero: '#16a34a 0%, #16a34a 50%, #22d3ee 50%, #22d3ee 100%',
    glow: 'rgba(22,163,74,.16)',
    soft: 'rgba(34,211,238,.16)',
  },
  lagoon: {
    accent: '#2563eb',
    accent2: '#a3e635',
    hero: '#2563eb 0%, #2563eb 50%, #a3e635 50%, #a3e635 100%',
    glow: 'rgba(37,99,235,.16)',
    soft: 'rgba(163,230,53,.18)',
  },
  purpleRain: {
    accent: '#f97316',
    accent2: '#7e22ce',
    hero: '#f97316 0%, #f97316 50%, #7e22ce 50%, #7e22ce 100%',
    glow: 'rgba(249,115,22,.16)',
    soft: 'rgba(126,34,206,.14)',
  },
  racingRed: {
    accent: '#d6a642',
    accent2: '#0f766e',
    hero: '#d6a642 0%, #d6a642 50%, #0f766e 50%, #0f766e 100%',
    glow: 'rgba(214,166,66,.16)',
    soft: 'rgba(15,118,110,.14)',
  },
}

function getDisplayTheme(theme: ClubThemeOption): ClubThemeOption {
  const pair = visiblePalettePairs[theme.key]
  if (!pair) return theme
  return {
    ...theme,
    vars: {
      ...theme.vars,
      ...pair,
    },
  }
}

export function ThemeSelectorCard({
  themes,
  selectedTheme,
  themeLocked,
  pendingThemeKey,
  onSubmitThemeRequest,
}: ThemeSelectorCardProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [previewThemeKey, setPreviewThemeKey] = useState<ClubThemeKey>(selectedTheme.key)
  const displayedSelectedTheme = getDisplayTheme(selectedTheme)
  const previewTheme = getDisplayTheme(themes.find((theme) => theme.key === previewThemeKey) ?? selectedTheme)
  const hasPendingRequest = Boolean(pendingThemeKey)
  const canSubmitRequest = previewTheme.key !== selectedTheme.key && !hasPendingRequest

  return (
    <div className="px-card px-card--flat" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="px-sectionTitle">Identidad visual</div>
          <p className="px-help" style={{ marginTop: 4 }}>
            La identidad actual se mantiene activa. Los cambios quedan preparados para revisión.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          style={{
            background: '#061b3a',
            border: '1px solid rgba(6,27,58,.18)',
            borderRadius: 999,
            color: '#fff',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 950,
            minHeight: 36,
            padding: '8px 13px',
          }}
        >
          {hasPendingRequest ? 'Solicitud pendiente' : 'Solicitar cambio de identidad'}
        </button>
      </div>

      <div
        style={{
          alignItems: 'center',
          background: 'rgba(248,250,252,.82)',
          border: '1px solid rgba(15,23,42,.08)',
          borderRadius: 16,
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'minmax(160px, .42fr) minmax(0, 1fr) auto',
          marginTop: 12,
          padding: 10,
        }}
      >
        <span
          style={{
            background: `linear-gradient(135deg, ${displayedSelectedTheme.vars.hero})`,
            borderRadius: 12,
            display: 'block',
            minHeight: 54,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <i
            aria-hidden="true"
            style={{
              background: `linear-gradient(90deg, ${displayedSelectedTheme.vars.accent}, ${displayedSelectedTheme.vars.accent2})`,
              borderRadius: 999,
              bottom: 10,
              height: 6,
              left: 10,
              position: 'absolute',
              width: 58,
            }}
          />
        </span>
        <div>
          <strong style={{ color: '#061b3a', display: 'block', fontSize: 15 }}>{CLUB_THEME_LABELS[selectedTheme.key]}</strong>
          <span className="px-help">Identidad actual del club</span>
        </div>
        <span
          style={{
            borderRadius: 999,
            background: displayedSelectedTheme.vars.soft,
            color: displayedSelectedTheme.vars.accent,
            fontSize: 11,
            fontWeight: 950,
            padding: '7px 9px',
            whiteSpace: 'nowrap',
          }}
        >
          {hasPendingRequest ? 'SOLICITUD PENDIENTE' : themeLocked ? 'FIJADA' : 'ACTIVA'}
        </span>
      </div>

      <div
        className="club-themePaletteGrid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          gap: 8,
          marginTop: 12,
        }}
      >
        {themes.map((theme) => {
          const displayTheme = getDisplayTheme(theme)
          const isSelected = theme.key === previewThemeKey

          return (
            <button
              key={theme.key}
              type="button"
              onClick={() => setPreviewThemeKey(theme.key)}
              aria-pressed={isSelected}
              style={{
                border: isSelected ? `2px solid ${displayTheme.vars.accent}` : '1px solid rgba(23,37,63,.10)',
                borderRadius: 12,
                background: '#fff',
                boxShadow: isSelected
                  ? `0 10px 24px ${displayTheme.vars.glow}, 0 0 0 3px ${displayTheme.vars.soft}`
                  : '0 6px 14px rgba(15,23,42,.045)',
                cursor: 'pointer',
                display: 'grid',
                gap: 6,
                overflow: 'hidden',
                padding: 0,
                textAlign: 'left',
                transition: 'transform .16s ease, box-shadow .16s ease, border-color .16s ease',
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <div
                style={{
                  minHeight: 46,
                  padding: 8,
                  background: `linear-gradient(135deg, ${displayTheme.vars.hero})`,
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: `linear-gradient(135deg, rgba(255,255,255,.18), transparent 38%)`,
                  }}
                />
                <div
                  style={{
                    position: 'relative',
                    display: 'grid',
                    gap: 5,
                    maxWidth: 92,
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 6,
                      borderRadius: 999,
                      background: `linear-gradient(90deg, ${displayTheme.vars.accent}, ${displayTheme.vars.accent2})`,
                      boxShadow: `0 0 14px ${displayTheme.vars.glow}`,
                    }}
                  />
                  <div
                    style={{
                      borderRadius: 11,
                      border: '1px solid rgba(255,255,255,.24)',
                      background: 'rgba(255,255,255,.16)',
                      height: 18,
                      backdropFilter: 'blur(10px)',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gap: 6, padding: '0 9px 9px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <strong style={{ color: '#17253f', fontSize: 12 }}>{CLUB_THEME_LABELS[theme.key]}</strong>
                  {isSelected ? (
                    <span
                      style={{
                        borderRadius: 999,
                        background: displayTheme.vars.soft,
                        color: displayTheme.vars.accent,
                        fontSize: 9,
                        fontWeight: 900,
                        padding: '4px 7px',
                      }}
                    >
                      Previsualizando
                    </span>
                  ) : null}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {modalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            alignItems: 'center',
            background: 'rgba(2,6,23,.48)',
            display: 'flex',
            inset: 0,
            justifyContent: 'center',
            padding: 18,
            position: 'fixed',
            zIndex: 80,
          }}
          onClick={() => setModalOpen(false)}
        >
          <div
            style={{
              background: '#fff',
              border: '1px solid rgba(15,23,42,.10)',
              borderRadius: 20,
              boxShadow: '0 28px 80px rgba(2,6,23,.24)',
              display: 'grid',
              gap: 14,
              maxWidth: 520,
              padding: 18,
              width: '100%',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                background: `linear-gradient(135deg, ${previewTheme.vars.hero})`,
                borderRadius: 16,
                minHeight: 90,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <i
                aria-hidden="true"
                style={{
                  background: `linear-gradient(90deg, ${previewTheme.vars.accent}, ${previewTheme.vars.accent2})`,
                  borderRadius: 999,
                  bottom: 16,
                  height: 8,
                  left: 16,
                  position: 'absolute',
                  width: 88,
                }}
              />
            </div>

            <div>
              <h3 style={{ color: '#061b3a', fontSize: 22, margin: 0 }}>Solicitud de identidad</h3>
              <p className="px-help" style={{ marginTop: 6 }}>
                La identidad actual sigue activa. Esta acción prepara una solicitud para revisión de superadmin.
              </p>
            </div>

            <div style={{ background: 'rgba(248,250,252,.82)', border: '1px solid rgba(15,23,42,.08)', borderRadius: 14, padding: 12 }}>
              <span className="px-help">Identidad seleccionada</span>
              <strong style={{ color: '#061b3a', display: 'block', fontSize: 16, marginTop: 3 }}>{CLUB_THEME_LABELS[previewTheme.key]}</strong>
              {hasPendingRequest ? (
                <span style={{ color: '#9a3412', display: 'block', fontSize: 12, fontWeight: 900, marginTop: 6 }}>
                  Solicitud pendiente: {CLUB_THEME_LABELS[pendingThemeKey!]}
                </span>
              ) : null}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{
                  background: '#fff',
                  border: '1px solid rgba(15,23,42,.12)',
                  borderRadius: 999,
                  color: '#061b3a',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 900,
                  padding: '9px 13px',
                }}
              >
                Cerrar
              </button>
              <button
                type="button"
                disabled={!canSubmitRequest}
                onClick={() => {
                  if (!canSubmitRequest) return
                  onSubmitThemeRequest(previewTheme.key)
                  setModalOpen(false)
                }}
                style={{
                  background: '#061b3a',
                  border: '1px solid rgba(6,27,58,.18)',
                  borderRadius: 999,
                  color: '#fff',
                  cursor: canSubmitRequest ? 'pointer' : 'not-allowed',
                  fontSize: 13,
                  fontWeight: 900,
                  opacity: canSubmitRequest ? 1 : 0.58,
                  padding: '9px 13px',
                }}
              >
                {hasPendingRequest ? 'Solicitud pendiente' : previewTheme.key === selectedTheme.key ? 'Elegí otra paleta' : 'Enviar solicitud'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
