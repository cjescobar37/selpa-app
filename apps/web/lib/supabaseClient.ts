import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

declare global {
  // eslint-disable-next-line no-var
  var __supabase__: SupabaseClient<any> | undefined
}

export const supabase: SupabaseClient<any> =
  globalThis.__supabase__ ??
  createClient<any>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })

if (process.env.NODE_ENV !== 'production') globalThis.__supabase__ = supabase
