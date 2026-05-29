import type { NextConfig } from 'next'

const supabaseImageHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : 'nenupmpjrzdxfrnwsmkx.supabase.co'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: supabaseImageHost,
        pathname: '/storage/v1/object/public/player-assets/**',
      },
    ],
  },
}

export default nextConfig
