import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import styles from './ClubBackLink.module.css'

export default function ClubBackLink({ href = '/club/admin', label = 'Club', className }: { href?: string; label?: string; className?: string }) {
  return (
    <Link className={[styles.back, className].filter(Boolean).join(' ')} href={href}>
      <ArrowLeft aria-hidden="true" size={17} />
      {label}
    </Link>
  )
}
