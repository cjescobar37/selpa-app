import { supabaseAdmin } from '@/lib/supabaseAdmin'
import type {
  CompetitionAgeCategory,
  CompetitionAgeCategoryWrite,
  CompetitionEventTier,
  CompetitionEventTierWrite,
} from './competition-catalogs.types'

type CatalogTable = 'competition_age_categories' | 'competition_event_tiers'

function catalogError(operation: string, error: { message?: string; code?: string } | null) {
  const wrapped = new Error(`${operation}: ${error?.message ?? 'error desconocido de Supabase'}`)
  return Object.assign(wrapped, { code: error?.code })
}

export async function listAgeCategories(clubId: string) {
  const { data, error } = await supabaseAdmin
    .from('competition_age_categories')
    .select('*')
    .eq('club_id', clubId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw catalogError('No pude listar las categorías de edad', error)
  return (data ?? []) as CompetitionAgeCategory[]
}

export async function createAgeCategory(clubId: string, actorId: string, value: CompetitionAgeCategoryWrite) {
  const { data, error } = await supabaseAdmin
    .from('competition_age_categories')
    .insert({ club_id: clubId, created_by: actorId, ...value })
    .select('*')
    .single()
  if (error) throw catalogError('No pude crear la categoría de edad', error)
  return data as CompetitionAgeCategory
}

export async function getAgeCategory(clubId: string, id: string) {
  return getCatalog<CompetitionAgeCategory>('competition_age_categories', clubId, id)
}

export async function updateAgeCategory(clubId: string, id: string, value: CompetitionAgeCategoryWrite) {
  return updateCatalog<CompetitionAgeCategory>('competition_age_categories', clubId, id, value)
}

export async function listEventTiers(clubId: string) {
  const { data, error } = await supabaseAdmin
    .from('competition_event_tiers')
    .select('*')
    .eq('club_id', clubId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw catalogError('No pude listar las jerarquías de eventos', error)
  return (data ?? []) as CompetitionEventTier[]
}

export async function createEventTier(clubId: string, actorId: string, value: CompetitionEventTierWrite) {
  const { data, error } = await supabaseAdmin
    .from('competition_event_tiers')
    .insert({ club_id: clubId, created_by: actorId, ...value })
    .select('*')
    .single()
  if (error) throw catalogError('No pude crear la jerarquía de evento', error)
  return data as CompetitionEventTier
}

export async function getEventTier(clubId: string, id: string) {
  return getCatalog<CompetitionEventTier>('competition_event_tiers', clubId, id)
}

export async function updateEventTier(clubId: string, id: string, value: CompetitionEventTierWrite) {
  return updateCatalog<CompetitionEventTier>('competition_event_tiers', clubId, id, value)
}

async function updateCatalog<T>(table: CatalogTable, clubId: string, id: string, value: object) {
  const { data, error } = await supabaseAdmin
    .from(table)
    .update(value)
    .eq('id', id)
    .eq('club_id', clubId)
    .select('*')
    .maybeSingle()
  if (error) throw catalogError('No pude actualizar el catálogo', error)
  if (!data) throw Object.assign(new Error('El registro no existe en este club.'), { code: 'PGRST116' })
  return data as T
}

async function getCatalog<T>(table: CatalogTable, clubId: string, id: string) {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select('*')
    .eq('id', id)
    .eq('club_id', clubId)
    .maybeSingle()
  if (error) throw catalogError('No pude leer el catálogo', error)
  if (!data) throw Object.assign(new Error('El registro no existe en este club.'), { code: 'PGRST116' })
  return data as T
}
