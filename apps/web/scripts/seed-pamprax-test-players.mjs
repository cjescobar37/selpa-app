import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const CLUB_ID = '7c70723b-8244-4117-9a2e-b9a129f661a9'
const DEFAULT_PLAYER_COUNT = 35
const CATEGORY = 5
const GENDER = 'M'
const EMAIL_PREFIX = 'pamprax.seed35+player'
const OLD_EMAIL_PREFIX = 'pamprax.test+player'

function readArgs() {
  const args = new Map()
  for (const arg of process.argv.slice(2)) {
    const [rawKey, rawValue = 'true'] = arg.replace(/^--/, '').split('=', 2)
    args.set(rawKey, rawValue)
  }

  const from = Number(args.get('from') ?? 1)
  const count = Number(args.get('count') ?? DEFAULT_PLAYER_COUNT)
  return {
    from: Number.isFinite(from) && from > 0 ? from : 1,
    count: Number.isFinite(count) && count > 0 ? count : DEFAULT_PLAYER_COUNT,
    keepExisting: args.has('keep-existing'),
  }
}

function loadEnvFile(path) {
  const envPath = resolve(path)
  const content = readFileSync(envPath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const clean = line.trim()
    if (!clean || clean.startsWith('#')) continue
    const separatorIndex = clean.indexOf('=')
    if (separatorIndex < 0) continue
    const key = clean.slice(0, separatorIndex).trim()
    let value = clean.slice(separatorIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] ??= value
  }
}

function isTestEmail(email) {
  const clean = String(email ?? '').trim().toLowerCase()
  return clean.startsWith(EMAIL_PREFIX) || clean.startsWith(OLD_EMAIL_PREFIX)
}

function chunk(values, size = 100) {
  const chunks = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

async function requireOk(label, promise) {
  const result = await promise
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`)
  }
  return result.data
}

function buildPlayer(index) {
  const number = String(index).padStart(2, '0')
  return {
    email: `${EMAIL_PREFIX}${number}@example.test`,
    displayName: `Jugador ${number} Pamprax Test`,
    firstName: `Jugador ${number}`,
    lastName: 'Pamprax Test',
    rankingPoints: Math.max(1000 - ((index - 1) * 23), 100),
  }
}

async function listAllAuthUsers(supabase) {
  const users = []
  for (let page = 1; page < 100; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`auth.admin.listUsers: ${error.message}`)
    users.push(...(data?.users ?? []))
    if (!data?.users?.length || data.users.length < 1000) break
  }
  return users
}

async function deleteRowsByIds(supabase, table, column, ids) {
  for (const idsChunk of chunk(ids)) {
    await requireOk(`delete ${table}`, supabase.from(table).delete().in(column, idsChunk))
  }
}

async function main() {
  loadEnvFile('.env.local')
  const options = readArgs()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en apps/web/.env.local')
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  if (!options.keepExisting) {
    console.log('Buscando jugadores test anteriores...')
    const authUsers = await listAllAuthUsers(supabase)
    const authTestUsers = authUsers.filter((user) => isTestEmail(user.email))

    const [oldProfilesA, oldProfilesB] = await Promise.all([
      requireOk(
        'select old pamprax.test profiles',
        supabase
          .from('profiles')
          .select('user_id,email')
          .ilike('email', `${OLD_EMAIL_PREFIX}%@example.test`)
      ),
      requireOk(
        'select old pamprax.seed35 profiles',
        supabase
          .from('profiles')
          .select('user_id,email')
          .ilike('email', `${EMAIL_PREFIX}%@example.test`)
      ),
    ])

    const testUserIds = Array.from(new Set([
      ...authTestUsers.map((user) => user.id),
      ...[...oldProfilesA, ...oldProfilesB].map((profile) => profile.user_id).filter(Boolean),
    ]))

    if (testUserIds.length) {
      console.log(`Limpiando ${testUserIds.length} usuarios test previos...`)

      const teams = await requireOk(
        'select tournament_teams',
        supabase
          .from('tournament_teams')
          .select('id,player1_user_id,player2_user_id')
          .eq('club_id', CLUB_ID)
      )
      const teamIds = teams
        .filter((team) => testUserIds.includes(team.player1_user_id) || testUserIds.includes(team.player2_user_id))
        .map((team) => team.id)

      if (teamIds.length) {
        await deleteRowsByIds(supabase, 'tournament_registrations', 'team_id', teamIds)
        await deleteRowsByIds(supabase, 'tournament_teams', 'id', teamIds)
      }

      await deleteRowsByIds(supabase, 'club_players', 'user_id', testUserIds)
      await deleteRowsByIds(supabase, 'profiles', 'user_id', testUserIds)

      for (const user of authTestUsers) {
        const { error } = await supabase.auth.admin.deleteUser(user.id)
        if (error) throw new Error(`auth.admin.deleteUser ${user.email}: ${error.message}`)
      }
    }
  }

  console.log(`Creando ${options.count} jugadores test con Auth real desde #${options.from}...`)
  const createdPlayers = []
  for (let index = options.from; index < options.from + options.count; index += 1) {
    const player = buildPlayer(index)
    const { data, error } = await supabase.auth.admin.createUser({
      email: player.email,
      email_confirm: true,
      password: `PampraxTest${String(index).padStart(2, '0')}!2026`,
      user_metadata: {
        full_name: player.displayName,
        first_name: player.firstName,
        last_name: player.lastName,
        source: 'pamprax_seed_script',
      },
    })

    if (error || !data?.user) {
      throw new Error(`auth.admin.createUser ${player.email}: ${error?.message ?? 'sin user devuelto'}`)
    }

    createdPlayers.push({ ...player, userId: data.user.id })
  }

  await requireOk(
    'upsert profiles',
    supabase.from('profiles').upsert(
      createdPlayers.map((player) => ({
        id: player.userId,
        user_id: player.userId,
        email: player.email,
        first_name: player.firstName,
        last_name: player.lastName,
        display_name: player.displayName,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'user_id' }
    )
  )

  await requireOk(
    'upsert club_players',
    supabase.from('club_players').upsert(
      createdPlayers.map((player) => ({
        club_id: CLUB_ID,
        user_id: player.userId,
        display_name: player.displayName,
        category: CATEGORY,
        gender: GENDER,
        approved_at: new Date().toISOString(),
        approved_by: null,
        ranking_points: player.rankingPoints,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'club_id,user_id' }
    )
  )

  console.log('Listo. Jugadores creados:')
  for (const player of createdPlayers) {
    console.log(`${player.displayName} | ${player.email} | ${player.userId} | ${player.rankingPoints} pts`)
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
