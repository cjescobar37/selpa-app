import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { financePage } from '@/lib/clubFinanceF1C'
import { parsePlayerFinanceQuery, type PlayerFinanceObligation, type PlayerFinanceMovement } from '@/lib/playerFinanceF1D'
import { paymentMovementLabels, playerPaymentOptions } from '@/lib/paymentProviderReadsF1E'
import { playerAccountDenial } from '@/lib/accountRoleServer'

export const dynamic = 'force-dynamic'
const pageSize = 20
const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(req: NextRequest) {
  const authorization = req.headers.get('authorization') ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) return NextResponse.json({ error: 'Ingresá para ver tus pagos.' }, { status: 401, headers })
  const query = parsePlayerFinanceQuery(req.nextUrl.searchParams)
  if (!query) return NextResponse.json({ error: 'Filtros inválidos.' }, { status: 400, headers })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    return NextResponse.json({ error: 'Tus pagos todavía no están disponibles.' }, { status: 503, headers })
  }
  // Use the player's verified JWT for every RPC. DB derives identity through auth.uid().
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  })
  try {
    const { data: user, error: authError } = await client.auth.getUser(token)
    if (authError || !user.user) {
      return NextResponse.json({ error: 'Tu sesión venció. Volvé a ingresar.' }, { status: 401, headers })
    }
    const roleDenied = await playerAccountDenial(user.user.id)
    if (roleDenied) return roleDenied
    const obligationParams = {
      p_club_id: query.clubId, p_filter: query.filter, p_limit: pageSize + 1,
      p_before_created_at: query.view === 'obligations' ? query.cursor?.at ?? null : null,
      p_before_id: query.view === 'obligations' ? query.cursor?.id ?? null : null,
    }
    const movementParams = {
      p_club_id: query.clubId, p_limit: pageSize + 1,
      p_before_paid_at: query.view === 'movements' ? query.cursor?.at ?? null : null,
      p_before_id: query.view === 'movements' ? query.cursor?.id ?? null : null,
    }
    const failure = (error: { code?: string }) => NextResponse.json({
      error: error.code === '42501' ? 'No tenés acceso a esos pagos.' : 'No pudimos cargar tus pagos. Probá nuevamente.',
    }, { status: error.code === '42501' ? 403 : 503, headers })
    if (query.view === 'obligations') {
      const result = await client.rpc('list_player_finance_obligations_f1d', obligationParams)
      if (result.error) return failure(result.error)
      const rows = ((result.data ?? []) as Array<{ item: PlayerFinanceObligation }>).map(row => row.item)
      return NextResponse.json({ obligations: financePage(await playerPaymentOptions(client, rows), pageSize, 'created_at') }, { headers })
    }
    if (query.view === 'movements') {
      const result = await client.rpc('list_player_finance_movements_f1d', movementParams)
      if (result.error) return failure(result.error)
      const rows = ((result.data ?? []) as Array<{ item: PlayerFinanceMovement }>).map(row => row.item)
      return NextResponse.json({ movements: financePage(await paymentMovementLabels(client, null, rows), pageSize, 'paid_at') }, { headers })
    }
    const [overview, obligations, movements] = await Promise.all([
      client.rpc('get_player_finance_overview_f1d', { p_club_id: query.clubId }),
      client.rpc('list_player_finance_obligations_f1d', obligationParams),
      client.rpc('list_player_finance_movements_f1d', movementParams),
    ])
    const error = overview.error ?? obligations.error ?? movements.error
    if (error) return failure(error)
    return NextResponse.json({
      overview: overview.data,
      obligations: financePage(await playerPaymentOptions(client, ((obligations.data ?? []) as Array<{ item: PlayerFinanceObligation }>).map(row => row.item)), pageSize, 'created_at'),
      movements: financePage(await paymentMovementLabels(client, null, ((movements.data ?? []) as Array<{ item: PlayerFinanceMovement }>).map(row => row.item)), pageSize, 'paid_at'),
    }, { headers })
  } catch {
    return NextResponse.json({ error: 'No pudimos cargar tus pagos. Probá nuevamente.' }, { status: 503, headers })
  }
}
