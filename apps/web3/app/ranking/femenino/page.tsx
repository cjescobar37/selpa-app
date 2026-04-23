'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function RankingFemeninoPage() {
  const router = useRouter()
  useEffect(() => { router.replace('/ranking?gender=F') }, [router])
  return <div className="px-wrap"><div className="px-help">Redirigiendo al ranking femenino…</div></div>
}
