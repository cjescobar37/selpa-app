import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const CLUB_ID = '7c70723b-8244-4117-9a2e-b9a129f661a9'

if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const players = [
  ['Mateo', 'Rivas', 'demo.cristal01@pamprax.test'],
  ['Tomás', 'Quiroga', 'demo.cristal02@pamprax.test'],
  ['Lucas', 'Ferreyra', 'demo.cristal03@pamprax.test'],
  ['Benjamín', 'Sosa', 'demo.cristal04@pamprax.test'],
  ['Joaquín', 'Pereyra', 'demo.cristal05@pamprax.test'],
  ['Thiago', 'Molina', 'demo.cristal06@pamprax.test'],
  ['Valentín', 'Acosta', 'demo.cristal07@pamprax.test'],
  ['Santino', 'Cabrera', 'demo.cristal08@pamprax.test'],
  ['Bautista', 'Roldán', 'demo.cristal09@pamprax.test'],
  ['Francisco', 'Vega', 'demo.cristal10@pamprax.test'],
  ['Agustín', 'Ponce', 'demo.cristal11@pamprax.test'],
  ['Nicolás', 'Farías', 'demo.cristal12@pamprax.test'],
  ['Bruno', 'Ibarra', 'demo.cristal13@pamprax.test'],
  ['Ramiro', 'Suárez', 'demo.cristal14@pamprax.test'],
  ['Lautaro', 'Godoy', 'demo.cristal15@pamprax.test'],
  ['Felipe', 'Navarro', 'demo.cristal16@pamprax.test'],
  ['Máximo', 'Leiva', 'demo.cristal17@pamprax.test'],
  ['Simón', 'Ledesma', 'demo.cristal18@pamprax.test'],
  ['Franco', 'Peralta', 'demo.cristal19@pamprax.test'],
  ['Juan Ignacio', 'Gil', 'demo.cristal20@pamprax.test'],
  ['Gonzalo', 'Silva', 'demo.cristal21@pamprax.test'],
  ['Enzo', 'Bustos', 'demo.cristal22@pamprax.test'],
  ['Kevin', 'Alaniz', 'demo.cristal23@pamprax.test'],
  ['Axel', 'Carrizo', 'demo.cristal24@pamprax.test'],
  ['Facundo', 'Nievas', 'demo.cristal25@pamprax.test'],
  ['Imanol', 'Paz', 'demo.cristal26@pamprax.test'],
]

async function ensureUser(firstName, lastName, email) {
  const { data: existing } = await supabase.auth.admin.listUsers()
  const found = existing.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (found) return found

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: 'DemoPamprax123!',
    email_confirm: true,
    user_metadata: {
      first_name: firstName,
      last_name: lastName,
      display_name: `${firstName} ${lastName}`,
    },
  })
  if (error) throw error
  return data.user
}

async function upsertProfile(user, firstName, lastName, email) {
  const payload = {
    id: user.id,
    user_id: user.id,
    email,
    first_name: firstName,
    last_name: lastName,
    display_name: `${firstName} ${lastName}`,
    city: 'Santa Rosa',
    dominant_hand: 'RIGHT',
    status: 'ACTIVE',
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' })
  if (error) throw error
}

async function ensureMembership(userId) {
  const { data: existing, error: findError } = await supabase
    .from('club_memberships')
    .select('user_id')
    .eq('club_id', CLUB_ID)
    .eq('user_id', userId)
    .maybeSingle()

  if (findError) throw findError
  if (existing) return

  const { error } = await supabase.from('club_memberships').insert({
    club_id: CLUB_ID,
    user_id: userId,
    role: 'PLAYER',
    status: 'APPROVED',
    approved_at: new Date().toISOString(),
  })
  if (error) throw error
}

async function ensureClubPlayer(userId, displayName) {
  const { data: existing, error: findError } = await supabase
    .from('club_players')
    .select('id')
    .eq('club_id', CLUB_ID)
    .eq('user_id', userId)
    .maybeSingle()

  if (findError) throw findError
  if (existing) return

  const { error } = await supabase.from('club_players').insert({
    club_id: CLUB_ID,
    user_id: userId,
    display_name: displayName,
    category: 5,
    gender: 'M',
    approved_at: new Date().toISOString(),
  })
  if (error) throw error
}

for (const [firstName, lastName, email] of players) {
  const user = await ensureUser(firstName, lastName, email)
  await upsertProfile(user, firstName, lastName, email)
  await ensureMembership(user.id)
  await ensureClubPlayer(user.id, `${firstName} ${lastName}`)
  console.log(`OK: ${firstName} ${lastName}`)
}

console.log('Listo. Se cargaron/aseguraron 26 jugadores demo en Cristal.')