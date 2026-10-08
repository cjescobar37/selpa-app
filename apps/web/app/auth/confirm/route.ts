import { NextRequest, NextResponse } from 'next/server'
import { createClient, type EmailOtpType } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)

  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const requestedNext = searchParams.get('next') || '/login'
  const next = requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/login'

  if (!token_hash || !type) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('missing_token')}`)
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { error } = await supabase.auth.verifyOtp({
    token_hash,
    type: type as EmailOtpType,
  })

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('invalid_or_expired_link')}`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
