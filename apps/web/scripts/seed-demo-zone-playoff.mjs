import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEMO_PREFIX = 'PAMPrax Demo ZONE_PLAYOFF'
const DEFAULT_CLUB_ID = '7c70723b-8244-4117-9a2e-b9a129f661a9'
const PLAYER_COUNT = 16
const TEAM_COUNT = 8

function loadEnvFile(path) {
  const envPath = resolve(path)
  if (!existsSync(envPath)) return

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue

    const index = trimmed.indexOf('=')
    const key = trimmed.slice(0, index).trim()
    const raw = trimmed.slice(index + 1).trim()
    const value = raw.replace(/^['"]|['"]$/g, '')
    if (key && process.env[key] === undefined) process.env[key] = value
  }
}

function getArg(name) {
  const prefix = `--${name}=`
  const arg = process.argv.find((value) => value.startsWith(prefix))
  return arg ? arg.slice(prefix.length).trim() : null
}

function requireValue(value, message) {
  if (!value) throw new Error(message)
  return value
}

function todayPlus(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function isoPlus(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString()
}

async function insertOne(supabase, table, payload, label) {
  const { data, error } = await supabase.from(table).insert(payload).select('*').single()
  if (error) throw new Error(`${label}: ${error.message}`)
  return data
}

async function upsertRows(supabase, table, rows, onConflict, label) {
  const { error } = await supabase.from(table).upsert(rows, { onConflict })
  if (error) throw new Error(`${label}: ${error.message}`)
}

function buildGroupPairings(groupTeams, groupIndex) {
  const [one, two, three, four] = groupTeams
  const baseOrder = groupIndex * 6
  return [
    { team1_id: one.id, team2_id: two.id, round: 1, match_order: baseOrder + 1 },
    { team1_id: three.id, team2_id: four.id, round: 1, match_order: baseOrder + 2 },
    { team1_id: one.id, team2_id: three.id, round: 2, match_order: baseOrder + 3 },
    { team1_id: two.id, team2_id: four.id, round: 2, match_order: baseOrder + 4 },
    { team1_id: one.id, team2_id: four.id, round: 3, match_order: baseOrder + 5 },
    { team1_id: two.id, team2_id: three.id, round: 3, match_order: baseOrder + 6 },
  ]
}

async function main() {
  const scriptDir = resolve(fileURLToPath(import.meta.url), '..')
  loadEnvFile(resolve(process.cwd(), '.env.local'))
  loadEnvFile(resolve(scriptDir, '..', '.env.local'))

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE
  const clubId = getArg('club-id') || process.env.PAMPRAX_DEMO_CLUB_ID || DEFAULT_CLUB_ID
  const shouldReset = process.argv.includes('--reset')

  requireValue(supabaseUrl, 'Falta SUPABASE_URL o NEXT_PUBLIC_SUPABASE_URL.')
  requireValue(serviceRoleKey, 'Falta SUPABASE_SERVICE_ROLE_KEY.')

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: club, error: clubError } = await supabase
    .from('clubs')
    .select('id,name,status,is_active')
    .eq('id', clubId)
    .maybeSingle()

  if (clubError) throw new Error(`No pude validar el club: ${clubError.message}`)
  if (!club?.id) throw new Error(`No existe club con id ${clubId}.`)

  if (shouldReset) {
    const { error: resetError } = await supabase
      .from('tournaments')
      .delete()
      .eq('club_id', clubId)
      .like('name', `${DEMO_PREFIX}%`)

    if (resetError) throw new Error(`No pude limpiar demos previas: ${resetError.message}`)
  }

  const { data: clubPlayers, error: clubPlayersError } = await supabase
    .from('club_players')
    .select('user_id,display_name,category,gender,approved_at,created_at')
    .eq('club_id', clubId)
    .not('approved_at', 'is', null)
    .order('created_at', { ascending: true })
    .limit(PLAYER_COUNT)

  if (clubPlayersError) throw new Error(`No pude leer jugadores del club: ${clubPlayersError.message}`)
  if ((clubPlayers ?? []).length < PLAYER_COUNT) {
    throw new Error(
      `Necesito ${PLAYER_COUNT} club_players aprobados para el club. Encontré ${(clubPlayers ?? []).length}. ` +
        'Este seed no crea usuarios, profiles, memberships ni club_players.'
    )
  }

  const players = clubPlayers.slice(0, PLAYER_COUNT)
  const creatorUserId = players[0].user_id
  const now = new Date().toISOString()

  const { data: categories, error: categoriesError } = await supabase
    .from('categories')
    .select('id,name')
    .in('id', [6, 7])
    .order('id', { ascending: false })

  if (categoriesError) throw new Error(`No pude leer categorías: ${categoriesError.message}`)
  const categoryId = categories?.[0]?.id
  if (!categoryId) throw new Error('No encontré categorías 6 o 7 para crear el torneo demo.')

  const tournamentName = `${DEMO_PREFIX} ${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`
  const tournament = await insertOne(
    supabase,
    'tournaments',
    {
      club_id: clubId,
      name: tournamentName,
      type: 'OPEN',
      format: 'GROUPS_ELIMINATION',
      gender: 'MALE',
      category_id: categoryId,
      category: categoryId,
      category_rule: 'FIXED_CATEGORY',
fixed_category_id: categoryId,
category_sum_target: null,
      start_date: todayPlus(1),
      status: 'RUNNING',
      category: categoryId,
      starts_on: todayPlus(1),
      ends_on: todayPlus(2),
      signup_deadline: isoPlus(1),
      price_per_player: 0,
      max_pairs: TEAM_COUNT,
      points_total: 0,
      tournament_type: 'OPEN',
      description: 'Torneo demo creado para probar equipos e inscripciones. Grupos y partidos quedan pendientes hasta aplicar schema de motor.',
      rules_json: {
        demo: true,
        source: 'seed-demo-zone-playoff',
        intended_format: 'ZONE_PLAYOFF',
        groups_pending_schema: true,
      },
      updated_at: now,
      min_pairs: TEAM_COUNT,
      registration_deadline: isoPlus(1),
      rules: {
        demo: true,
        source: 'seed-demo-zone-playoff',
        intended_format: 'ZONE_PLAYOFF',
        groups_pending_schema: true,
      },
      end_date: todayPlus(2),
      created_at: now,
    },
    'No pude crear el torneo demo'
  )

  const teamInputs = Array.from({ length: TEAM_COUNT }, (_, index) => {
    const player1 = players[index * 2]
    const player2 = players[index * 2 + 1]
    return {
      tournament_id: tournament.id,
      club_id: clubId,
      player1_user_id: player1.user_id,
      player2_user_id: player2.user_id,
      created_by: creatorUserId,
    }
  })

  const { data: teams, error: teamsError } = await supabase
    .from('tournament_teams')
    .insert(teamInputs)
    .select('*')

  if (teamsError) throw new Error(`No pude crear equipos demo: ${teamsError.message}`)
  if ((teams ?? []).length !== TEAM_COUNT) throw new Error('No se crearon los 8 equipos demo esperados.')

  await upsertRows(
    supabase,
    'tournament_registrations',
    teams.map((team) => ({
      tournament_id: tournament.id,
      club_id: clubId,
      team_id: team.id,
      status: 'CONFIRMED',
      created_by: creatorUserId,
    })),
    'tournament_id,team_id',
    'No pude crear inscripciones demo'
  )

  const { data: groups, error: groupsError } = await supabase
    .from('tournament_groups')
    .insert([
      { tournament_id: tournament.id, name: 'A', size: 4, order: 1 },
      { tournament_id: tournament.id, name: 'B', size: 4, order: 2 },
    ])
    .select('*')
    .order('order', { ascending: true })

  if (groupsError) throw new Error(`No pude crear grupos demo: ${groupsError.message}`)
  if ((groups ?? []).length !== 2) throw new Error('No se crearon los 2 grupos demo esperados.')

  const groupATeams = teams.slice(0, 4)
  const groupBTeams = teams.slice(4, 8)
  const groupTeamRows = [
    ...groupATeams.map((team, index) => ({
      tournament_id: tournament.id,
      group_id: groups[0].id,
      team_id: team.id,
      seed: index + 1,
      position: null,
    })),
    ...groupBTeams.map((team, index) => ({
      tournament_id: tournament.id,
      group_id: groups[1].id,
      team_id: team.id,
      seed: index + 1,
      position: null,
    })),
  ]

  const { error: groupTeamsError } = await supabase.from('tournament_group_teams').insert(groupTeamRows)
  if (groupTeamsError) throw new Error(`No pude asignar equipos a grupos: ${groupTeamsError.message}`)

  const matches = [
    ...buildGroupPairings(groupATeams, 0).map((match) => ({
      tournament_id: tournament.id,
      club_id: clubId,
      group_id: groups[0].id,
      phase: 'GROUP',
      status: 'PENDING',
      score: {},
      scheduled_at: null,
      ...match,
    })),
    ...buildGroupPairings(groupBTeams, 1).map((match) => ({
      tournament_id: tournament.id,
      club_id: clubId,
      group_id: groups[1].id,
      phase: 'GROUP',
      status: 'PENDING',
      score: {},
      scheduled_at: null,
      ...match,
    })),
  ]

  const { error: matchesError } = await supabase.from('tournament_matches').insert(matches)
  if (matchesError) throw new Error(`No pude crear partidos de zona demo: ${matchesError.message}`)

  console.log('Demo completo compatible con schema remoto creado correctamente.')
  console.log(`Club: ${club.name ?? club.id}`)
  console.log(`Club ID: ${club.id}`)
  console.log(`Torneo: ${tournament.name}`)
  console.log(`Torneo ID: ${tournament.id}`)
  console.log(`Jugadores usados: ${players.length}`)
  console.log(`Equipos creados: ${teams.length}`)
  console.log(`Inscripciones confirmadas: ${teams.length}`)
  console.log('Grupos creados: 2')
  console.log(`Equipos asignados a grupos: ${groupTeamRows.length}`)
  console.log(`Partidos GROUP creados: ${matches.length}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
