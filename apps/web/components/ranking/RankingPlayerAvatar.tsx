import Image from 'next/image'
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
  return (
    <span className={className}>
      {imageSrc ? <Image src={imageSrc} alt="" fill sizes={sizes} style={{ objectFit: 'cover' }} unoptimized /> : getClubInitials(name)}
    </span>
  )
}
