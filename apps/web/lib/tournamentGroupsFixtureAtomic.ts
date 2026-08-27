import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type TournamentGroupsFixtureResult = {
  status: 'GENERATED' | 'REGENERATED' | 'ALREADY_GENERATED'
  tournamentId: string
  groupCount: number
  teamsAssigned: number
  matchesCreated: number
  seedHash: string
  sizes: number[]
  groups: Array<{ name: string; size: number; order: number; teamSeeds: number[] }>
}

type RpcPayload = {
  status?: unknown
  tournament_id?: unknown
  group_count?: unknown
  teams_assigned?: unknown
  matches_created?: unknown
  seed_hash?: unknown
  sizes?: unknown
  groups?: unknown
}

const ERROR_MAP: Record<string, { code: string; message: string; status: number }> = {
  UNAUTHORIZED: { code: 'UNAUTHORIZED', message: 'Tu sesión venció. Volvé a ingresar.', status: 401 },
  TOURNAMENT_GROUPS_FORBIDDEN: { code: 'TOURNAMENT_GROUPS_FORBIDDEN', message: 'No tenés permisos para generar los grupos.', status: 403 },
  TOURNAMENT_NOT_FOUND: { code: 'TOURNAMENT_NOT_FOUND', message: 'No encontramos el torneo.', status: 404 },
  TOURNAMENT_GROUPS_LIFECYCLE_BLOCKED: { code: 'TOURNAMENT_GROUPS_LIFECYCLE_BLOCKED', message: 'Los grupos ya no pueden generarse en el estado actual del torneo.', status: 409 },
  TOURNAMENT_GROUP_HISTORY_EXISTS: { code: 'TOURNAMENT_GROUP_HISTORY_EXISTS', message: 'El torneo ya tiene actividad deportiva y no permite regenerar los grupos.', status: 409 },
  SEED_SNAPSHOT_REQUIRED: { code: 'SEED_SNAPSHOT_REQUIRED', message: 'Primero generá el orden competitivo de las parejas.', status: 409 },
  INSUFFICIENT_ELIGIBLE_TEAMS_FOR_GROUPS: { code: 'INSUFFICIENT_ELIGIBLE_TEAMS_FOR_GROUPS', message: 'Se necesitan al menos 6 parejas para generar los grupos.', status: 422 },
  INVALID_SEED_CONFIGURATION: { code: 'INVALID_SEED_CONFIGURATION', message: 'El orden competitivo de las parejas no es válido.', status: 422 },
  INVALID_GROUP_CONFIGURATION: { code: 'INVALID_GROUP_CONFIGURATION', message: 'La cantidad de parejas no permite formar grupos válidos.', status: 422 },
  GROUP_ASSIGNMENT_INCOMPLETE: { code: 'GROUP_ASSIGNMENT_INCOMPLETE', message: 'No se pudieron asignar todas las parejas a sus grupos.', status: 422 },
  GROUP_FIXTURE_COUNT_MISMATCH: { code: 'GROUP_FIXTURE_COUNT_MISMATCH', message: 'No se pudo completar el fixture de grupos.', status: 422 },
}

export class TournamentGroupsFixtureAtomicError extends Error {
  code: string
  status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'TournamentGroupsFixtureAtomicError'
    this.code = code
    this.status = status
  }
}

function getAuthenticatedClient(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new TournamentGroupsFixtureAtomicError('SUPABASE_CONFIG_MISSING', 'No pudimos conectar con SELPA.', 500)
  }

  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function mapRpcError(error: { message?: string | null }) {
  const raw = String(error.message ?? '')
  const match = Object.entries(ERROR_MAP).find(([code]) => raw.includes(code))
  if (match) {
    const [, mapped] = match
    return new TournamentGroupsFixtureAtomicError(mapped.code, mapped.message, mapped.status)
  }
  return new TournamentGroupsFixtureAtomicError(
    'TOURNAMENT_GROUPS_GENERATION_FAILED',
    'No pudimos generar los grupos y partidos. Intentá nuevamente.',
    500,
  )
}

export async function generateTournamentGroupsAndFixtureAtomic(input: {
  token: string
  clubId: string
  tournamentId: string
  regenerate?: boolean
  client?: SupabaseClient
}): Promise<TournamentGroupsFixtureResult> {
  const client = input.client ?? getAuthenticatedClient(input.token)
  const { data, error } = await client.rpc('generate_tournament_groups_and_fixture_atomic', {
    p_club_id: input.clubId,
    p_tournament_id: input.tournamentId,
    p_regenerate: input.regenerate ?? false,
  })

  if (error) throw mapRpcError(error)
  const payload = (data ?? {}) as RpcPayload
  const status = String(payload.status ?? '')
  if (!['GENERATED', 'REGENERATED', 'ALREADY_GENERATED'].includes(status)) {
    throw new TournamentGroupsFixtureAtomicError(
      'TOURNAMENT_GROUPS_INVALID_RESPONSE',
      'SELPA no pudo confirmar la generación de los grupos.',
      500,
    )
  }

  return {
    status: status as TournamentGroupsFixtureResult['status'],
    tournamentId: String(payload.tournament_id ?? input.tournamentId),
    groupCount: Number(payload.group_count ?? 0),
    teamsAssigned: Number(payload.teams_assigned ?? 0),
    matchesCreated: Number(payload.matches_created ?? 0),
    seedHash: String(payload.seed_hash ?? ''),
    sizes: Array.isArray(payload.sizes) ? payload.sizes.map(Number) : [],
    groups: Array.isArray(payload.groups)
      ? payload.groups.map((group) => {
          const value = (group ?? {}) as Record<string, unknown>
          return {
            name: String(value.name ?? ''),
            size: Number(value.size ?? 0),
            order: Number(value.order ?? 0),
            teamSeeds: Array.isArray(value.teamSeeds) ? value.teamSeeds.map(Number) : [],
          }
        })
      : [],
  }
}
