'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

export default function RankingRetryButton({className}:{className:string}) {
  const router=useRouter(),[pending,startTransition]=useTransition()
  return <button className={className} type="button" disabled={pending} aria-busy={pending}
    onClick={()=>startTransition(()=>router.refresh())}>{pending?'Reintentando…':'Reintentar'}</button>
}
