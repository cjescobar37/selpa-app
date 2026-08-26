import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import styles from './ClubBackLink.module.css'

export default function ClubBackLink() {
  return (
    <Link className={styles.back} href="/club/admin">
      <ArrowLeft aria-hidden="true" size={17} />
      Club
    </Link>
  )
}
