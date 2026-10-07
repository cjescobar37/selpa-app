import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import styles from './PageHeader.module.css'

export default function PageBackAction({ href, label = 'Volver', className, tone = 'light' }: {
  href: string; label?: string; className?: string; tone?: 'light' | 'dark'
}) {
  return <Link href={href} aria-label={label} title={label}
    className={[styles.back, tone === 'dark' ? styles.backDark : '', className].filter(Boolean).join(' ')}>
    <ArrowLeft size={18} aria-hidden="true" />
  </Link>
}
