'use client'

import { useMemo, useRef, useState } from 'react'
import { Download, Share2 } from 'lucide-react'
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
  const file = prepared?.key === dataKey ? prepared.file : null
  const create = async () => {
    setBusy(true); setMessage('Preparando PDF…')
    try {
      const { tournamentPdf } = await import('./tournamentPdf')
      const blob = tournamentPdf(data, kind)
      const safeName = data.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').slice(0, 80)
      const result = new File([blob], `SELPA-${safeName}-${kind === 'groups' ? 'Grupos' : 'Playoff'}.pdf`, { type: 'application/pdf' })
      setPrepared({ key: dataKey, file: result }); setMessage('PDF listo para descargar o compartir.')
    } catch { setMessage('No pudimos generar el PDF. Intentá nuevamente.') }
    finally { setBusy(false) }
  }
  const share = async () => {
    if (!file) return
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: `${data.name} · ${kind === 'groups' ? 'Grupos' : 'Playoff'}` })
      else { download(file); setMessage('Este navegador no comparte archivos: descargamos el PDF.') }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      download(file); setMessage('No se pudo compartir. Descargamos el PDF.')
    }
  }
  return <details ref={root} className={styles.menu} onKeyDown={(event) => { if (event.key === 'Escape' && root.current) { root.current.open = false; root.current.querySelector('summary')?.focus() } }}>
    <summary aria-label={`Exportar ${kind === 'groups' ? 'Grupos' : 'Playoff'}`}><Download size={14} /> Exportar</summary>
    <div className={styles.popover}>
      <button type="button" disabled={busy} onClick={create}>{busy ? 'Preparando…' : file ? 'Actualizar PDF' : 'Generar PDF'}</button>
      {file && <><button type="button" onClick={() => download(file)}><Download size={14} /> Descargar PDF</button><button type="button" onClick={share}><Share2 size={14} /> Compartir PDF</button></>}
      <span role="status">{message}</span>
    </div>
  </details>
}
