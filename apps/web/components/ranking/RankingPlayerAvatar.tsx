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
  return (
    <span className={className}>
      {src ? <Image src={src} alt="" fill sizes={sizes} unoptimized /> : getClubInitials(name)}
    </span>
  )
}
