'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import {
  getPlatformAdResponsiveConfig,
  normalizePlatformAdRenderConfig,
  type PlatformAdRenderConfig,
} from '@/lib/platformAdConfig'
import ConfigurableAdBanner, { AD_BANNER_DIMENSIONS } from '@/components/ads/ConfigurableAdBanner'

type EditorSection = 'general' | 'background' | 'image' | 'texts' | 'button'
type PreviewMode = 'desktop' | 'mobile'
type PreviewZoom = 1 | 0.75 | 0.5

type AdVisualEditorProps = {
  title: string
  description: string
  linkUrl: string
  imageUrl: string | null
  renderConfig: PlatformAdRenderConfig
  slotLabel: string
  note?: string
  generalFields: ReactNode
  imageField?: ReactNode
  onTitleChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onRenderConfigChange: (patch: Partial<PlatformAdRenderConfig>) => void
  onCancel: () => void
  onSave?: () => void
  saving?: boolean
  saveLabel: string
  savingLabel?: string
  submitMode?: boolean
}

const sections: Array<{ id: EditorSection; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'background', label: 'Fondo y overlay' },
  { id: 'image', label: 'Imagen' },
  { id: 'texts', label: 'Textos' },
  { id: 'button', label: 'Botón' },
]

function FieldLabel({ children, label }: { children: ReactNode; label: string }) {
  return <label><span>{label}</span>{children}</label>
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="adEditorColorControl">
      <span>{label}</span>
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function TextControlGroup({
  label,
  prefix,
  children,
  size,
  weight,
  align,
  x,
  y,
  maxWidth,
  opacity,
  lineHeight,
  onChange,
}: {
  label: string
  prefix: 'title' | 'subtitle' | 'secondary'
  children: ReactNode
  size: number
  weight: PlatformAdRenderConfig['titleWeight']
  align: PlatformAdRenderConfig['titleAlign']
  x: number
  y: number
  maxWidth: number
  opacity: number
  lineHeight: number
  onChange: (patch: Partial<PlatformAdRenderConfig>) => void
}) {
  return (
    <details className="adControlGroup" open>
      <summary>{label}</summary>
      <div className="adControlContent">{children}</div>
      <div className="adEditorSplit is-three">
        <RangeField label="Tamaño" value={size} display={`${size}px`} min={7} max={42} step={1} onChange={(value) => onChange({ [`${prefix}Size`]: value } as Partial<PlatformAdRenderConfig>)} />
        <FieldLabel label="Peso">
          <select value={weight} onChange={(event) => onChange({ [`${prefix}Weight`]: Number(event.target.value) } as Partial<PlatformAdRenderConfig>)}>
            {[400, 500, 600, 700, 800, 900, 950].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </FieldLabel>
        <FieldLabel label="Alineación">
          <select value={align} onChange={(event) => onChange({ [`${prefix}Align`]: event.target.value } as Partial<PlatformAdRenderConfig>)}>
            <option value="left">Izquierda</option>
            <option value="center">Centro</option>
            <option value="right">Derecha</option>
          </select>
        </FieldLabel>
      </div>
      <div className="adEditorSplit is-three">
        <RangeField label="Ancho" value={maxWidth} display={`${maxWidth}%`} min={24} max={100} step={2} onChange={(value) => onChange({ [`${prefix}MaxWidth`]: value } as Partial<PlatformAdRenderConfig>)} />
        <RangeField label="Opacidad" value={opacity} display={`${Math.round(opacity * 100)}%`} min={0} max={1} step={0.05} onChange={(value) => onChange({ [`${prefix}Opacity`]: value } as Partial<PlatformAdRenderConfig>)} />
        <RangeField label="Línea" value={lineHeight} display={lineHeight.toFixed(2)} min={0.85} max={1.8} step={0.05} onChange={(value) => onChange({ [`${prefix}LineHeight`]: value } as Partial<PlatformAdRenderConfig>)} />
      </div>
      <div className="adEditorSplit is-two">
        <RangeField label="X" value={x} display={`${x}px`} min={-120} max={120} step={2} onChange={(value) => onChange({ [`${prefix}X`]: value } as Partial<PlatformAdRenderConfig>)} />
        <RangeField label="Y" value={y} display={`${y}px`} min={-80} max={80} step={2} onChange={(value) => onChange({ [`${prefix}Y`]: value } as Partial<PlatformAdRenderConfig>)} />
      </div>
    </details>
  )
}

function RangeField({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  display: string
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <label className="adEditorRangeControl">
      <span>{label} <b>{display}</b></span>
      <div className="adEditorRangeInputs">
        <input type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
        <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      </div>
    </label>
  )
}

export default function AdVisualEditor({
  title,
  description,
  linkUrl,
  imageUrl,
  renderConfig,
  slotLabel,
  note,
  generalFields,
  imageField,
  onTitleChange,
  onDescriptionChange,
  onRenderConfigChange,
  onCancel,
  onSave,
  saving = false,
  saveLabel,
  savingLabel = 'Guardando...',
  submitMode = false,
}: AdVisualEditorProps) {
  const [activeSection, setActiveSection] = useState<EditorSection>('general')
  const [previewMode, setPreviewMode] = useState<PreviewMode>('desktop')
  const [previewZoom, setPreviewZoom] = useState<PreviewZoom>(1)
  const config = normalizePlatformAdRenderConfig(renderConfig)
  const activeConfig = getPlatformAdResponsiveConfig(config, previewMode)
  const visibleSections = !config.enabled
    ? sections.filter((section) => section.id === 'general')
    : sections.filter((section) => {
      if (config.layout === 'text-only') return section.id !== 'image'
      if (config.layout === 'image-only') return !['texts', 'button'].includes(section.id)
      return true
    })

  useEffect(() => {
    setActiveSection('general')
    setPreviewMode('desktop')
    setPreviewZoom(1)
  }, [slotLabel])

  useEffect(() => {
    if (!config.enabled && activeSection !== 'general') setActiveSection('general')
    if (config.enabled && !visibleSections.some((section) => section.id === activeSection)) setActiveSection('general')
  }, [activeSection, config.enabled, visibleSections])

  function updateConfig(patch: Partial<PlatformAdRenderConfig>) {
    onRenderConfigChange(normalizePlatformAdRenderConfig({ ...config, ...patch }))
  }

  function updateVisualConfig(patch: Partial<PlatformAdRenderConfig>) {
    if (previewMode === 'mobile') {
      onRenderConfigChange(normalizePlatformAdRenderConfig({ ...config, mobile: { ...config.mobile, ...patch } }))
      return
    }
    updateConfig(patch)
  }

  function copyDesktopToMobile() {
    const { mobile: _mobile, version: _version, enabled: _enabled, themeMode: _themeMode, subtitle, secondaryText, buttonText, buttonUrl, buttonEnabled, ...desktopVisual } = config
    onRenderConfigChange(normalizePlatformAdRenderConfig({ ...config, mobile: desktopVisual }))
  }

  const frameStyle = {
    ['--ad-preview-scale' as string]: String(previewZoom),
    ['--ad-preview-fit' as string]: previewMode === 'desktop' ? '0.39' : '1',
  } satisfies CSSProperties
  const frameClass = `adPreviewFrame is-${previewMode} is-zoom-${String(previewZoom).replace('.', '')}`

  return (
    <div className="adVisualEditor">
      <div className="adEditorControls">
        <div className="adEditorNav" aria-label="Secciones del editor">
          {visibleSections.map((item) => (
            <button
              key={item.id}
              type="button"
              className={activeSection === item.id ? 'is-active' : ''}
              onClick={() => setActiveSection(item.id)}
              aria-expanded={activeSection === item.id}
            >
              {item.label}
            </button>
          ))}
        </div>

        {activeSection === 'general' ? (
          <section className="adEditorSection">
            <div className="adEditorSectionHead"><h4>General</h4><span>Estado, posición y modo</span></div>
            {generalFields}
            <details className="adLegacyDetails" open={!config.enabled}>
              <summary>Descripción legacy</summary>
              <FieldLabel label="Texto alternativo">
                <textarea rows={2} value={description} onChange={(event) => onDescriptionChange(event.target.value)} />
              </FieldLabel>
            </details>
          </section>
        ) : null}

        {activeSection === 'background' ? (
          <section className="adEditorSection">
            <div className="adEditorSectionHead"><h4>Fondo y overlay</h4><span>Base visual del banner</span></div>
            <div className="adEditorSplit is-three">
              <FieldLabel label="Fondo">
                <select value={activeConfig.backgroundMode} onChange={(event) => updateVisualConfig({ backgroundMode: event.target.value as PlatformAdRenderConfig['backgroundMode'] })}>
                  <option value="gradient">Degradado</option>
                  <option value="solid">Color sólido</option>
                </select>
              </FieldLabel>
              <ColorField label="Color" value={activeConfig.backgroundColor} onChange={(value) => updateVisualConfig({ backgroundColor: value })} />
              <FieldLabel label="Overlay">
                <select value={activeConfig.overlay} onChange={(event) => updateVisualConfig({ overlay: event.target.value as PlatformAdRenderConfig['overlay'] })}>
                  <option value="dark">Oscuro</option>
                  <option value="light">Claro</option>
                  <option value="none">Sin overlay</option>
                </select>
              </FieldLabel>
            </div>
            <div className="adEditorColorGrid is-two">
              <ColorField label="Degradado inicial" value={activeConfig.gradientFrom} onChange={(value) => updateVisualConfig({ gradientFrom: value })} />
              <ColorField label="Degradado final" value={activeConfig.gradientTo} onChange={(value) => updateVisualConfig({ gradientTo: value })} />
            </div>
            <div className="adEditorSplit is-two">
              <RangeField label="Opacidad fondo" value={activeConfig.backgroundOpacity} display={`${Math.round(activeConfig.backgroundOpacity * 100)}%`} min={0.35} max={1} step={0.05} onChange={(value) => updateVisualConfig({ backgroundOpacity: value })} />
              <RangeField label="Intensidad overlay" value={activeConfig.overlayOpacity} display={`${Math.round(activeConfig.overlayOpacity * 100)}%`} min={0} max={0.75} step={0.05} onChange={(value) => updateVisualConfig({ overlayOpacity: value })} />
            </div>
          </section>
        ) : null}

        {activeSection === 'image' ? (
          <section className="adEditorSection">
            <div className="adEditorSectionHead"><h4>Imagen</h4><span>Ubicación y presencia</span></div>
            <div className="adEditorSplit">
              <FieldLabel label="Posición">
                <select value={activeConfig.imagePosition} onChange={(event) => updateVisualConfig({ imagePosition: event.target.value as PlatformAdRenderConfig['imagePosition'] })}>
                  <option value="left">Izquierda</option>
                  <option value="center">Centro</option>
                  <option value="right">Derecha</option>
                </select>
              </FieldLabel>
              <FieldLabel label="Ajuste">
                <select value={activeConfig.imageFit} onChange={(event) => updateVisualConfig({ imageFit: event.target.value as PlatformAdRenderConfig['imageFit'] })}>
                  <option value="contain">Contain</option>
                  <option value="cover">Cover</option>
                </select>
              </FieldLabel>
              {imageField}
            </div>
            <div className="adEditorSplit is-three">
              <RangeField label="Opacidad" value={activeConfig.imageOpacity} display={`${Math.round(activeConfig.imageOpacity * 100)}%`} min={0} max={1} step={0.05} onChange={(value) => updateVisualConfig({ imageOpacity: value })} />
              <RangeField label="Escala" value={activeConfig.imageScale} display={`${activeConfig.imageScale.toFixed(2)}x`} min={0.55} max={1.8} step={0.05} onChange={(value) => updateVisualConfig({ imageScale: value })} />
              <RangeField label="Ancho imagen" value={activeConfig.imageWidth} display={`${activeConfig.imageWidth}%`} min={20} max={100} step={1} onChange={(value) => updateVisualConfig({ imageWidth: value })} />
            </div>
            <div className="adEditorSplit is-three">
              <RangeField label="X" value={activeConfig.imageX} display={`${activeConfig.imageX}px`} min={-80} max={80} step={2} onChange={(value) => updateVisualConfig({ imageX: value })} />
              <RangeField label="Y" value={activeConfig.imageY} display={`${activeConfig.imageY}px`} min={-60} max={60} step={2} onChange={(value) => updateVisualConfig({ imageY: value })} />
              <RangeField label="Estirar ancho" value={activeConfig.imageStretchX} display={`${activeConfig.imageStretchX.toFixed(2)}x`} min={0.5} max={2.5} step={0.05} onChange={(value) => updateVisualConfig({ imageStretchX: value })} />
            </div>
          </section>
        ) : null}

        {activeSection === 'texts' ? (
          <section className="adEditorSection">
            <div className="adEditorSectionHead"><h4>Textos</h4><span>Jerarquía y color</span></div>
            <div className="adEditorColorGrid is-two">
              <ColorField label="Color título" value={activeConfig.titleColor} onChange={(value) => updateVisualConfig({ titleColor: value })} />
              <ColorField label="Color subtítulo" value={activeConfig.subtitleColor} onChange={(value) => updateVisualConfig({ subtitleColor: value })} />
            </div>
            <TextControlGroup
              label="Título"
              prefix="title"
              size={activeConfig.titleSize}
              weight={activeConfig.titleWeight}
              align={activeConfig.titleAlign}
              x={activeConfig.titleX}
              y={activeConfig.titleY}
              maxWidth={activeConfig.titleMaxWidth}
              opacity={activeConfig.titleOpacity}
              lineHeight={activeConfig.titleLineHeight}
              onChange={updateVisualConfig}
            >
              <FieldLabel label="Contenido">
                <input value={title} onChange={(event) => onTitleChange(event.target.value)} />
              </FieldLabel>
            </TextControlGroup>
            <TextControlGroup
              label="Subtítulo"
              prefix="subtitle"
              size={activeConfig.subtitleSize}
              weight={activeConfig.subtitleWeight}
              align={activeConfig.subtitleAlign}
              x={activeConfig.subtitleX}
              y={activeConfig.subtitleY}
              maxWidth={activeConfig.subtitleMaxWidth}
              opacity={activeConfig.subtitleOpacity}
              lineHeight={activeConfig.subtitleLineHeight}
              onChange={updateVisualConfig}
            >
              <FieldLabel label="Contenido">
                <input value={config.subtitle} onChange={(event) => updateConfig({ subtitle: event.target.value })} />
              </FieldLabel>
            </TextControlGroup>
            <TextControlGroup
              label="Texto secundario"
              prefix="secondary"
              size={activeConfig.secondarySize}
              weight={activeConfig.secondaryWeight}
              align={activeConfig.secondaryAlign}
              x={activeConfig.secondaryX}
              y={activeConfig.secondaryY}
              maxWidth={activeConfig.secondaryMaxWidth}
              opacity={activeConfig.secondaryOpacity}
              lineHeight={activeConfig.secondaryLineHeight}
              onChange={updateVisualConfig}
            >
              <FieldLabel label="Contenido">
                <input value={config.secondaryText} onChange={(event) => updateConfig({ secondaryText: event.target.value })} />
              </FieldLabel>
            </TextControlGroup>
          </section>
        ) : null}

        {activeSection === 'button' ? (
          <section className="adEditorSection">
            <div className="adEditorSectionHead"><h4>Botón</h4><span>CTA opcional</span></div>
            <div className="adEditorSplit">
              <FieldLabel label="Estado">
                <select value={config.buttonEnabled ? 'yes' : 'no'} onChange={(event) => updateConfig({ buttonEnabled: event.target.value === 'yes' })}>
                  <option value="yes">Visible</option>
                  <option value="no">Oculto</option>
                </select>
              </FieldLabel>
              <FieldLabel label="Texto">
                <input value={config.buttonText} onChange={(event) => updateConfig({ buttonText: event.target.value })} />
              </FieldLabel>
              <FieldLabel label="URL">
                <input value={config.buttonUrl || linkUrl} onChange={(event) => updateConfig({ buttonUrl: event.target.value })} />
              </FieldLabel>
            </div>
            <div className="adEditorSplit is-three">
              <FieldLabel label="Alineación">
                <select value={activeConfig.buttonAlign} onChange={(event) => updateVisualConfig({ buttonAlign: event.target.value as PlatformAdRenderConfig['buttonAlign'] })}>
                  <option value="left">Izquierda</option>
                  <option value="center">Centro</option>
                  <option value="right">Derecha</option>
                </select>
              </FieldLabel>
              <RangeField label="Tamaño" value={activeConfig.buttonSize} display={`${activeConfig.buttonSize}px`} min={7} max={24} step={1} onChange={(value) => updateVisualConfig({ buttonSize: value })} />
              <RangeField label="Opacidad" value={activeConfig.buttonOpacity} display={`${Math.round(activeConfig.buttonOpacity * 100)}%`} min={0} max={1} step={0.05} onChange={(value) => updateVisualConfig({ buttonOpacity: value })} />
            </div>
            <div className="adEditorSplit is-three">
              <RangeField label="X" value={activeConfig.buttonX} display={`${activeConfig.buttonX}px`} min={-360} max={360} step={2} onChange={(value) => updateVisualConfig({ buttonX: value })} />
              <RangeField label="Y" value={activeConfig.buttonY} display={`${activeConfig.buttonY}px`} min={-80} max={80} step={2} onChange={(value) => updateVisualConfig({ buttonY: value })} />
              <RangeField label="Radio" value={activeConfig.buttonRadius} display={`${activeConfig.buttonRadius}px`} min={0} max={999} step={4} onChange={(value) => updateVisualConfig({ buttonRadius: value })} />
            </div>
            <div className="adEditorSplit is-three">
              <RangeField label="Padding X" value={activeConfig.buttonPaddingX} display={`${activeConfig.buttonPaddingX}px`} min={4} max={28} step={1} onChange={(value) => updateVisualConfig({ buttonPaddingX: value })} />
              <RangeField label="Padding Y" value={activeConfig.buttonPaddingY} display={`${activeConfig.buttonPaddingY}px`} min={3} max={18} step={1} onChange={(value) => updateVisualConfig({ buttonPaddingY: value })} />
              <RangeField label="Borde" value={activeConfig.buttonBorderWidth} display={`${activeConfig.buttonBorderWidth}px`} min={0} max={4} step={1} onChange={(value) => updateVisualConfig({ buttonBorderWidth: value })} />
            </div>
            <div className="adEditorColorGrid is-three">
              <ColorField label="Fondo botón" value={activeConfig.buttonBackgroundColor} onChange={(value) => updateVisualConfig({ buttonBackgroundColor: value })} />
              <ColorField label="Texto botón" value={activeConfig.buttonTextColor} onChange={(value) => updateVisualConfig({ buttonTextColor: value })} />
              <ColorField label="Borde" value={activeConfig.buttonBorderColor} onChange={(value) => updateVisualConfig({ buttonBorderColor: value })} />
            </div>
          </section>
        ) : null}
      </div>

      <aside className="adPreviewPanel">
        <div className="adPreviewHead">
          <div><h4>Preview</h4><span>{slotLabel}</span></div>
          <div className="adPreviewTools">
            <span>
              <button type="button" className={previewMode === 'desktop' ? 'is-active' : ''} onClick={() => setPreviewMode('desktop')}>Desktop</button>
              <button type="button" className={previewMode === 'mobile' ? 'is-active' : ''} onClick={() => setPreviewMode('mobile')}>Mobile</button>
            </span>
            <span>
              {[1, 0.75, 0.5].map((zoom) => (
                <button key={zoom} type="button" className={previewZoom === zoom ? 'is-active' : ''} onClick={() => setPreviewZoom(zoom as PreviewZoom)}>{Math.round(zoom * 100)}%</button>
              ))}
            </span>
          </div>
        </div>
        {previewMode === 'mobile' ? (
          <button className="adCopyBreakpoint" type="button" onClick={copyDesktopToMobile}>Copiar desktop a mobile</button>
        ) : null}
        {config.enabled ? (
          <div className={frameClass} style={frameStyle}>
            <ConfigurableAdBanner
              className="adDesignerPreview"
              config={config}
              description={description}
              imageUrl={imageUrl}
              title={title || 'Nombre de campaña'}
              viewport={previewMode}
            />
            <span className="adPreviewSafeZone" aria-hidden="true" />
          </div>
        ) : (
          <div className={frameClass} style={frameStyle}>
            <div className="adLegacyPreview">
              {imageUrl ? <img src={imageUrl} alt={title || 'Preview campaña'} /> : <div>Sin imagen</div>}
              <span><strong>{title || 'Nombre de campaña'}</strong><p>{description || 'La pieza legacy se mantiene como imagen completa.'}</p></span>
            </div>
          </div>
        )}
        <div className="adEditorNote">{note ?? (config.enabled ? `Editando versión ${previewMode === 'mobile' ? 'mobile' : 'desktop'}.` : 'Modo compatible: se publica como imagen legacy.')}</div>
      </aside>

      <div className="adEditorActions">
        <button type="button" onClick={onCancel}>Cancelar</button>
        <button type={submitMode ? 'submit' : 'button'} onClick={submitMode ? undefined : onSave} disabled={saving}>{saving ? savingLabel : saveLabel}</button>
      </div>

      <style jsx global>{`
        .adVisualEditor { display: grid; gap: var(--ds-space-3, 12px); grid-template-columns: minmax(0, 1fr) minmax(440px, 40%); overflow: visible; }
        .adEditorControls { display: grid; gap: var(--ds-space-2, 8px); min-width: 0; }
        .adEditorNav { background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: var(--ds-radius-sm, 8px); display: grid; gap: 4px; grid-template-columns: repeat(5, minmax(0, 1fr)); padding: 5px; position: sticky; top: 0; z-index: 2; }
        .adEditorNav button { border: 0; border-radius: var(--ds-radius-xs, 6px); background: transparent; color: rgba(23,37,63,.66); cursor: pointer; font: inherit; font-size: var(--ds-font-size-label, 11.5px); font-weight: 800; min-height: var(--ds-control-h-sm, 34px); padding: 0 7px; transition: background var(--ds-motion-fast, 160ms ease), color var(--ds-motion-fast, 160ms ease), box-shadow var(--ds-motion-fast, 160ms ease); }
        .adEditorNav button.is-active { background: rgba(15,23,42,.08); color: #0f172a; }
        .adEditorNav button:focus-visible,
        .adEditorActions button:focus-visible,
        .adPreviewTools button:focus-visible { box-shadow: var(--ds-focus-ring, 0 0 0 3px rgba(34,211,238,.14)); outline: 0; }
        .adEditorSection { background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: var(--ds-radius-sm, 8px); display: grid; gap: var(--ds-space-2, 8px); min-height: 286px; padding: 10px; }
        .adEditorSectionHead { align-items: baseline; display: flex; gap: 8px; justify-content: space-between; }
        .adEditorSectionHead h4, .adPreviewHead h4 { margin: 0; font-size: 14px; }
        .adEditorSectionHead span { color: rgba(23,37,63,.54); font-size: 11px; font-weight: 700; }
        .adVisualEditor .adEditorSection label,
        .adVisualEditor .adLegacyDetails label,
        .adVisualEditor .px-mediaCheckbox { color: rgba(23,37,63,.84); display: grid; font-size: var(--ds-font-size-control, 13px); font-weight: var(--ds-font-weight-label, 700); gap: 5px; min-width: 0; }
        .adVisualEditor .px-mediaCheckbox { align-items: center; display: flex; min-height: var(--ds-control-h-sm, 34px); }
        .adVisualEditor .adEditorSection label span,
        .adVisualEditor .adLegacyDetails label span { color: rgba(23,37,63,.62); font-size: var(--ds-font-size-label, 11.5px); font-weight: var(--ds-font-weight-label, 700); line-height: 1.1; }
        .adVisualEditor .adEditorSection input,
        .adVisualEditor .adEditorSection select,
        .adVisualEditor .adEditorSection textarea,
        .adVisualEditor .adLegacyDetails input,
        .adVisualEditor .adLegacyDetails select,
        .adVisualEditor .adLegacyDetails textarea { appearance: none; background: #fff; border: 1px solid rgba(15,23,42,.14); border-radius: var(--ds-radius-sm, 8px); color: #0f172a; font: inherit; font-size: var(--ds-font-size-control, 13px); font-weight: var(--ds-font-weight-control, 700); min-height: var(--ds-control-h-sm, 34px); min-width: 0; padding: 7px var(--ds-control-pad-x, 12px); transition: border-color var(--ds-motion-fast, 160ms ease), box-shadow var(--ds-motion-fast, 160ms ease), background var(--ds-motion-fast, 160ms ease); width: 100%; }
        .adVisualEditor .adEditorSection select,
        .adVisualEditor .adLegacyDetails select { background-image: linear-gradient(45deg, transparent 50%, #64748b 50%), linear-gradient(135deg, #64748b 50%, transparent 50%); background-position: calc(100% - 15px) 50%, calc(100% - 10px) 50%; background-repeat: no-repeat; background-size: 5px 5px, 5px 5px; padding-right: 30px; }
        .adVisualEditor .adEditorSection input:focus-visible,
        .adVisualEditor .adEditorSection select:focus-visible,
        .adVisualEditor .adEditorSection textarea:focus-visible,
        .adVisualEditor .adLegacyDetails input:focus-visible,
        .adVisualEditor .adLegacyDetails select:focus-visible,
        .adVisualEditor .adLegacyDetails textarea:focus-visible { border-color: rgba(34,211,238,.72); box-shadow: var(--ds-focus-ring, 0 0 0 3px rgba(34,211,238,.14)); outline: 0; }
        .adVisualEditor .adEditorSection input[type="file"],
        .adVisualEditor .adLegacyDetails input[type="file"] { background: rgba(248,250,252,.96); cursor: pointer; line-height: 1.2; padding: 6px var(--ds-control-pad-x, 12px); }
        .adVisualEditor .adEditorSection input[type="file"]::file-selector-button,
        .adVisualEditor .adLegacyDetails input[type="file"]::file-selector-button { background: linear-gradient(135deg,#020617,#061b3a); border: 0; border-radius: var(--ds-radius-pill, 999px); color: #fff; cursor: pointer; font: inherit; font-size: 11px; font-weight: 850; margin-right: 10px; min-height: 24px; padding: 0 10px; }
        .adVisualEditor .adEditorSection input[readonly] { background: rgba(248,250,252,.8); color: rgba(15,23,42,.64); }
        .adEditorSection textarea { min-height: 58px; resize: vertical; }
        .adGeneralRow { display: grid; gap: 8px; }
        .adGeneralRow.is-two { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
        .adGeneralRow.is-three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .adGeneralRow.is-full { grid-template-columns: 1fr; }
        .adEditorSplit { display: grid; gap: 8px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .adEditorSplit.is-four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .adEditorSplit.is-three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .adEditorSplit.is-two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .adEditorColorGrid { display: grid; gap: 8px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .adEditorColorGrid.is-two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .adEditorColorGrid.is-three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .adEditorColorControl { align-items: center; display: grid !important; grid-template-columns: minmax(0, 1fr) 36px; gap: 8px !important; }
        .adEditorColorControl input[type="color"] { appearance: none; background: #fff; border-radius: var(--ds-radius-sm, 8px); height: var(--ds-control-h-sm, 34px); min-height: var(--ds-control-h-sm, 34px); padding: 3px; }
        .adEditorColorControl input[type="color"]::-webkit-color-swatch-wrapper { padding: 0; }
        .adEditorColorControl input[type="color"]::-webkit-color-swatch { border: 0; border-radius: 6px; }
        .adEditorRangeControl { display: grid !important; gap: 6px !important; }
        .adEditorRangeControl span { align-items: center; display: flex; justify-content: space-between; gap: 8px; }
        .adEditorRangeControl b { color: #0f172a; font-size: 11px; font-weight: 900; }
        .adEditorRangeInputs { align-items: center; display: grid; gap: 8px; grid-template-columns: 76px minmax(0, 1fr); }
        .adEditorRangeInputs input[type="number"] { min-height: 30px; padding: 5px 8px; }
        .adVisualEditor .adEditorRangeControl input[type="range"] { appearance: none; background: transparent; border: 0; min-height: 28px; padding: 0; }
        .adVisualEditor .adEditorRangeControl input[type="range"]::-webkit-slider-runnable-track { background: linear-gradient(90deg,#22d3ee,#ec4899); border-radius: var(--ds-radius-pill, 999px); height: 5px; }
        .adVisualEditor .adEditorRangeControl input[type="range"]::-webkit-slider-thumb { appearance: none; background: #fff; border: 2px solid #06b6d4; border-radius: 999px; box-shadow: var(--ds-shadow-xs, 0 6px 14px rgba(15,23,42,.055)); height: 16px; margin-top: -5px; width: 16px; }
        .adControlGroup { background: rgba(248,250,252,.74); border: 1px solid rgba(15,23,42,.07); border-radius: var(--ds-radius-sm, 8px); display: grid; gap: 8px; padding: 8px; }
        .adControlGroup summary { color: rgba(15,23,42,.78); cursor: pointer; font-size: var(--ds-font-size-label, 11.5px); font-weight: 900; list-style-position: inside; }
        .adControlContent { display: grid; gap: 8px; }
        .adLegacyDetails { background: rgba(248,250,252,.72); border: 1px solid rgba(15,23,42,.07); border-radius: 8px; display: grid; gap: 8px; padding: 8px; }
        .adLegacyDetails summary { color: rgba(23,37,63,.58); cursor: pointer; font-size: 11px; font-weight: 850; list-style-position: inside; }
        .adLegacyDetails[open] summary { color: #0f172a; }
        .adPreviewPanel { align-self: start; background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 8px; display: grid; gap: 12px; max-height: calc(100dvh - 114px); overflow: visible; padding: 12px; position: sticky; top: 88px; }
        .adPreviewHead { align-items: flex-start; display: flex; gap: 10px; justify-content: space-between; }
        .adPreviewHead > div:first-child { display: grid; gap: 6px; }
        .adPreviewHead > div:first-child span { align-items: center; background: rgba(59,130,246,.12); border-radius: 999px; color: #1d4ed8; display: inline-flex; font-size: 11px; font-weight: 700; min-height: 24px; padding: 0 8px; width: max-content; }
        .adPreviewTools { display: grid; gap: 6px; justify-items: end; }
        .adPreviewTools span { background: rgba(15,23,42,.06); border-radius: 999px; display: inline-flex; gap: 2px; padding: 2px; }
        .adPreviewTools button { border: 0; border-radius: 999px; background: transparent; color: rgba(23,37,63,.64); cursor: pointer; font-size: 10px; font-weight: 850; min-height: 24px; padding: 0 8px; }
        .adPreviewTools button.is-active { background: #fff; box-shadow: 0 2px 8px rgba(15,23,42,.08); color: #0f172a; }
        .adCopyBreakpoint { background: rgba(34,211,238,.1); border: 1px solid rgba(34,211,238,.24); border-radius: var(--ds-radius-pill, 999px); color: #075985; cursor: pointer; font: inherit; font-size: 11px; font-weight: 850; justify-self: start; min-height: 28px; padding: 0 10px; }
        .adPreviewFrame { align-items: center; background: #f1f5f9; border: 1px solid rgba(15,23,42,.06); border-radius: var(--ds-radius-sm, 8px); display: grid; justify-content: center; min-height: 162px; overflow: hidden; padding: 12px; position: relative; }
        .adPreviewFrame.is-desktop .adDesignerPreview, .adPreviewFrame.is-desktop .adLegacyPreview { height: ${AD_BANNER_DIMENSIONS.desktopHeight}px; min-height: ${AD_BANNER_DIMENSIONS.desktopHeight}px; width: ${AD_BANNER_DIMENSIONS.desktopWidth}px; }
        .adPreviewFrame.is-mobile .adDesignerPreview, .adPreviewFrame.is-mobile .adLegacyPreview { height: ${AD_BANNER_DIMENSIONS.mobileHeight}px; min-height: ${AD_BANNER_DIMENSIONS.mobileHeight}px; width: ${AD_BANNER_DIMENSIONS.mobileWidth}px; }
        .adPreviewFrame > .adDesignerPreview, .adPreviewFrame > .adLegacyPreview, .adPreviewFrame > .adPreviewSafeZone { grid-area: 1 / 1; transform: scale(calc(var(--ad-preview-scale) * var(--ad-preview-fit))); transform-origin: center; }
        .adPreviewFrame.is-zoom-075 { min-height: 150px; }
        .adPreviewFrame.is-zoom-05 { min-height: 116px; }
        .adDesignerPreview { border-radius: var(--ds-radius-md, 12px); box-shadow: var(--ds-shadow-md, 0 16px 36px rgba(15,23,42,.09)); }
        .adPreviewSafeZone { border: 1px dashed rgba(255,255,255,.72); border-radius: 7px; height: calc(100% - 20px); pointer-events: none; width: calc(100% - 28px); z-index: 7; }
        .adLegacyPreview { display: grid; gap: 10px; }
        .adLegacyPreview img, .adLegacyPreview > div { background: rgba(148,163,184,.16); border-radius: 10px; display: grid; height: 120px; object-fit: cover; place-items: center; width: 100%; }
        .adLegacyPreview span { display: grid; gap: 6px; }
        .adLegacyPreview strong { color: #0f172a; font-size: 16px; }
        .adLegacyPreview p { color: rgba(23,37,63,.66); font-size: 13px; line-height: 1.45; margin: 0; }
        .adEditorNote { background: rgba(248,250,252,.86); border: 1px solid rgba(15,23,42,.08); border-radius: 8px; color: rgba(23,37,63,.62); font-size: 12px; line-height: 1.35; padding: 10px; }
        .adEditorActions { background: linear-gradient(180deg, rgba(248,250,252,.74), #f8fafc 36%); bottom: 0; display: flex; gap: 8px; grid-column: 1 / -1; justify-content: flex-end; margin: 0 -2px -2px; padding: 10px 2px 2px; position: sticky; z-index: 4; }
        .adEditorActions button { border-radius: 999px; cursor: pointer; font: inherit; font-size: 12px; font-weight: 850; min-height: 36px; padding: 0 14px; }
        .adEditorActions button:first-child { background: #fff; border: 1px solid rgba(15,23,42,.12); color: #0f172a; }
        .adEditorActions button:last-child { background: linear-gradient(135deg,#020617,#061b3a); border: 1px solid rgba(34,211,238,.22); color: #fff; }
        .adEditorActions button:disabled { cursor: wait; opacity: .72; }
        @media (max-width: 980px) {
          .adVisualEditor { grid-template-columns: 1fr; }
          .adPreviewPanel { max-height: none; order: -1; position: static; }
          .adEditorNav { grid-template-columns: repeat(3, minmax(0, 1fr)); position: static; }
          .adGeneralRow.is-two, .adGeneralRow.is-three { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .adEditorSplit { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 720px) {
          .adEditorNav, .adEditorSplit, .adEditorSplit.is-two, .adEditorSplit.is-three, .adEditorSplit.is-four, .adEditorColorGrid, .adEditorColorGrid.is-two, .adEditorColorGrid.is-three, .adGeneralRow.is-two, .adGeneralRow.is-three { grid-template-columns: 1fr; }
          .adEditorRangeControl { grid-template-columns: 1fr; gap: 4px !important; }
          .adEditorRangeInputs { grid-template-columns: 72px minmax(0, 1fr); }
          .adEditorColorControl { grid-template-columns: minmax(0, 1fr) 44px; }
          .adEditorActions { flex-direction: column; }
        }
      `}</style>
    </div>
  )
}
