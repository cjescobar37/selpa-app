'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'

export default function RankingRetryButton({className,refresh=false,iconOnly=false}:{className:string;refresh?:boolean;iconOnly?:boolean}) {
  const [pending,setPending]=useState(false)
  const label = pending ? refresh ? 'Actualizando…' : 'Reintentando…' : refresh ? 'Actualizar' : 'Reintentar'
  return <button className={className} type="button" disabled={pending} aria-busy={pending} aria-label={iconOnly && refresh ? label : undefined} title={iconOnly && refresh ? label : undefined}
    onClick={()=>{
      setPending(true)
      // Re-fetch the server-rendered read at this exact URL, preserving filters.
      window.location.reload()
    }}>{iconOnly && refresh ? null : label}{refresh ? <RefreshCw size={17} aria-hidden="true"/> : null}</button>
}
