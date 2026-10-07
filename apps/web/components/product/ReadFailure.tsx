'use client'

import { useRouter } from 'next/navigation'
import styles from './ProductFlow.module.css'

export default function ReadFailure({ message = 'No pudimos cargar esta información. Intentá nuevamente.' }: { message?: string }) {
  const router = useRouter()
  return <div className={styles.panel} role="alert">
    <p>{message}</p><div><button className={styles.link} type="button" onClick={() => router.refresh()}>Reintentar</button></div>
  </div>
}
