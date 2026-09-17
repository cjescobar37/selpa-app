import type { SupabaseClient } from '@supabase/supabase-js'
import { validCompetitionTimezone } from '@/lib/competitionTimezone'

export async function getConfiguredClubTimezone(client: SupabaseClient, clubId: string) {
  // The checked-in dump has no timezone column. select(*) also supports an
  // explicitly configured timezone in deployments that have added that field.
  const { data, error } = await client.from('clubs').select('*').eq('id', clubId).maybeSingle()
  if (error) throw Object.assign(new Error('No pudimos consultar la zona horaria del club.'), { code: error.code })
  const configured = data?.timezone
  if (configured && !validCompetitionTimezone(configured)) throw new Error('La zona horaria configurada del club no es válida.')
  return validCompetitionTimezone(configured)
}
