import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL')

/**
 * Cliente admin (Service Role)
 *
 * Requiere configurar en .env.local:
 * SUPABASE_SERVICE_ROLE_KEY=...
 */
export const supabaseAdmin = createClient(url, service ?? 'MISSING_SERVICE_ROLE', {
  auth: { persistSession: false, autoRefreshToken: false },
})

export function assertServiceRole() {
  if (!service) {
    throw new Error(
      'Falta SUPABASE_SERVICE_ROLE_KEY en .env.local. Necesario para crear usuarios/clubes desde Platform.'
    )
  }
}
