'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function RankingMasculinoPage() {
  const router = useRouter()
  useEffect(() => { router.replace('/ranking?gender=M') }, [router])
  return <div className="px-wrap"><div className="px-help">Redirigiendo al ranking masculino…</div></div>
}
