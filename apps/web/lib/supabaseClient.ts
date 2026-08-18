import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

declare global {
  var __supabase__: SupabaseClient | undefined
}

export const supabase: SupabaseClient =
  globalThis.__supabase__ ??
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })

if (process.env.NODE_ENV !== 'production') globalThis.__supabase__ = supabase

// Auth-js serializa el acceso al token en el navegador. Durante un redirect de
// login, el callback, el provider y la pantalla puente pueden pedir la sesión
// en el mismo tick; esta compuerta evita que compitan por ese lock.
let sessionReadPromise: ReturnType<typeof supabase.auth.getSession> | null = null

export function getCurrentSession() {
  if (!sessionReadPromise) {
    sessionReadPromise = supabase.auth.getSession().finally(() => {
      sessionReadPromise = null
    })
  }

  return sessionReadPromise
}
