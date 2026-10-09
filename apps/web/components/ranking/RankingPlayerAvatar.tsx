'use client'

import Image from 'next/image'
import { useState } from 'react'
import { getClubInitials } from '@/lib/clubAssets'

type RankingPlayerAvatarProps = {
  className: string
  name: string
  src?: string | null
  sizes?: string
}

export default function RankingPlayerAvatar({
  className,
  name,
  src,
  sizes = '54px',
}: RankingPlayerAvatarProps) {
  const imageSrc = typeof src === 'string' ? src.trim() : ''
  const [failedSrc,setFailedSrc]=useState<string|null>(null)
  return (
    <span className={className}>
      {imageSrc && failedSrc!==imageSrc ? <Image src={imageSrc} alt="" fill sizes={sizes} style={{ objectFit: 'cover' }} unoptimized onError={()=>setFailedSrc(imageSrc)} /> : getClubInitials(name)}
    </span>
  )
}
