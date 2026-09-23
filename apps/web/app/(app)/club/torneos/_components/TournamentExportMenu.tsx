'use client'

import { useMemo, useRef, useState } from 'react'
import { Download, FileDown, Image as ImageIcon, Share2 } from 'lucide-react'
import type { TournamentExportData } from './tournamentExportData'
import styles from './TournamentExportMenu.module.css'

function download(file: File) {
  const url = URL.createObjectURL(file), a = document.createElement('a')
  a.href = url; a.download = file.name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
export default function TournamentExportMenu({ data, kind }: { data: TournamentExportData; kind: 'playoff' | 'groups' }) {
  const [busy, setBusy] = useState(false)
  const [prepared, setPrepared] = useState<{ key: string; file: File } | null>(null)
  const [message, setMessage] = useState('')
  const root = useRef<HTMLDetailsElement>(null)
  // Refetches may replace object references without changing printable content.
  const dataKey = useMemo(() => JSON.stringify(data), [data])
  const file = prepared?.key.startsWith(`${dataKey}:`) ? prepared.file : null
  const create = async (variant: 'full-pdf' | 'summary-pdf' | 'summary-png') => {
    setBusy(true); setMessage(variant === 'full-pdf' ? 'Preparando PDF…' : 'Preparando resumen…')
    try {
      const safeName = data.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').slice(0, 80)
      const section = kind === 'groups' ? 'Grupos' : 'Playoff'
      let blob: Blob
      let filename: string
      if (variant === 'full-pdf') {
        const { tournamentPdf } = await import('./tournamentPdf')
        blob = tournamentPdf(data, kind)
        filename = `SELPA-${safeName}-${section}.pdf`
      } else {
        const { tournamentSummaryPdf, tournamentSummaryPng } = await import('./tournamentSummaryExport')
        blob = variant === 'summary-pdf' ? tournamentSummaryPdf(data, kind) : await tournamentSummaryPng(data, kind)
        filename = `SELPA-${safeName}-${section}-Resumen.${variant === 'summary-pdf' ? 'pdf' : 'png'}`
      }
      const result = new File([blob], filename, { type: blob.type })
      setPrepared({ key: `${dataKey}:${variant}`, file: result }); setMessage(`${variant === 'summary-png' ? 'Imagen' : 'PDF'} listo para descargar o compartir.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No pudimos generar la exportación. Intentá nuevamente.') }
    finally { setBusy(false) }
  }
  const share = async () => {
    if (!file) return
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: `${data.name} · ${kind === 'groups' ? 'Grupos' : 'Playoff'}` })
      else { download(file); setMessage('Este navegador no comparte archivos: descargamos el archivo.') }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      download(file); setMessage('No se pudo compartir. Descargamos el PDF.')
    }
  }
  return <details ref={root} className={styles.menu} data-kind={kind} onKeyDown={(event) => { if (event.key === 'Escape' && root.current) { root.current.open = false; root.current.querySelector('summary')?.focus() } }}>
    <summary aria-label={`Exportar ${kind === 'groups' ? 'Grupos' : 'Playoff'}`}><FileDown size={15} /> Exportar</summary>
    <div className={styles.popover}>
      <button type="button" disabled={busy} onClick={() => void create('full-pdf')}><FileDown size={14} /> PDF completo</button>
      <button type="button" disabled={busy} onClick={() => void create('summary-pdf')}><FileDown size={14} /> Resumen 1 hoja · PDF</button>
      <button type="button" disabled={busy} onClick={() => void create('summary-png')}><ImageIcon size={14} /> Resumen para compartir · PNG</button>
      {file ? <div className={styles.prepared}><button type="button" onClick={() => download(file)}><Download size={14} /> Descargar {file.type === 'image/png' ? 'imagen' : 'PDF'}</button><button type="button" onClick={share}><Share2 size={14} /> Compartir {file.type === 'image/png' ? 'imagen' : 'PDF'}</button></div> : null}
      <span role="status">{message}</span>
    </div>
  </details>
}
