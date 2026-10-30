'use client'

import { useState } from 'react'

export default function RankingRetryButton({className}:{className:string}) {
  const [pending,setPending]=useState(false)
  return <button className={className} type="button" disabled={pending} aria-busy={pending}
    onClick={()=>{
      setPending(true)
      // Re-fetch the server-rendered read at this exact URL, preserving filters.
      window.location.reload()
    }}>{pending?'Reintentando…':'Reintentar'}</button>
}
