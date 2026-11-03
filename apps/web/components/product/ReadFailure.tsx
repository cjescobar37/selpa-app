'use client'

import { useRouter } from 'next/navigation'
import styles from './ProductFlow.module.css'

export default function ReadFailure({ message = 'No pudimos cargar esta información. Intentá nuevamente.', onRetry }: { message?: string; onRetry?: () => void }) {
  const router = useRouter()
  return <div className={styles.panel} role="alert">
    <p>{message}</p><div><button className={styles.link} type="button" onClick={() => onRetry ? onRetry() : router.refresh()}>Reintentar</button></div>
  </div>
}
