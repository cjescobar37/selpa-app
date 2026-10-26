'use client'

import Image from 'next/image'
import { useState } from 'react'
import { ZoomIn, ZoomOut } from 'lucide-react'
import ModalDialog from '@/components/ui/ModalDialog'
import styles from './ProfilePhotoViewer.module.css'

export default function ProfilePhotoViewer({ src, title, onClose }: { src: string; title: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(false)
  const [failed, setFailed] = useState(false)
  return <ModalDialog title={title} onClose={onClose} fullscreen>
    <div className={`${styles.stage} ${zoom ? styles.zoomed : ''}`}>
      {failed ? <p role="status">No pudimos cargar esta foto. Cerrá el visor y reintentá.</p> : <Image src={src} alt={title} width={1600} height={1200} unoptimized priority onError={() => setFailed(true)} />}
    </div>
    {!failed ? <button className={styles.zoom} type="button" onClick={() => setZoom(value => !value)} aria-pressed={zoom}>
      {zoom ? <ZoomOut size={18} /> : <ZoomIn size={18} />}{zoom ? 'Ver foto completa' : 'Ampliar'}
    </button> : null}
  </ModalDialog>
}
