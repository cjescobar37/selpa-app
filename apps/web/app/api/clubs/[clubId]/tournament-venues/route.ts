import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { userHasClubCapability } from '@/lib/clubMembershipServer'

type VenueRow = { id: string; club_id: string; name: string; is_primary: boolean }
type CourtRow = { id: string; venue_id: string; name: string; sort_order: number }

async function getTokenUser(req: NextRequest) {
  const authorization = req.headers.get('authorization') ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!token) return null
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  return error ? null : data.user
}

export async function GET(req: NextRequest, context: { params: Promise<{ clubId: string }> }) {
  try {
    const user = await getTokenUser(req)
    if (!user) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })

    const { clubId } = await context.params
    if (!await userHasClubCapability(user.id, clubId, 'tournaments:update')) {
      return NextResponse.json({ error: 'No autorizado para configurar canchas.' }, { status: 403 })
    }

    const { data: venues, error: venuesError } = await supabaseAdmin
      .from('club_venues')
      .select('id,club_id,name,is_primary')
      .eq('is_active', true)
      .order('is_primary', { ascending: false })
      .order('name')
    if (venuesError) throw venuesError

    const venueRows = (venues ?? []) as VenueRow[]
    const venueIds = venueRows.map((venue) => venue.id)
    const { data: courts, error: courtsError } = venueIds.length
      ? await supabaseAdmin
        .from('venue_courts')
        .select('id,venue_id,name,sort_order')
        .in('venue_id', venueIds)
        .eq('is_active', true)
        .order('sort_order')
        .order('name')
      : { data: [], error: null }
    if (courtsError) throw courtsError

    const courtsByVenue = new Map<string, CourtRow[]>()
    for (const court of (courts ?? []) as CourtRow[]) {
      const venue = venueRows.find((item) => item.id === court.venue_id)
      if (!venue) continue
      courtsByVenue.set(court.venue_id, [...(courtsByVenue.get(court.venue_id) ?? []), court])
    }

    return NextResponse.json({
      venues: venueRows.filter((venue) => (courtsByVenue.get(venue.id) ?? []).length > 0).map((venue) => ({
        id: venue.id,
        clubId: venue.club_id,
        name: venue.name,
        isPrimary: venue.club_id === clubId && venue.is_primary,
        isExternal: venue.club_id !== clubId,
        courts: (courtsByVenue.get(venue.id) ?? []).map((court) => ({ id: court.id, name: court.name })),
      })),
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No pude cargar los predios.' }, { status: 500 })
  }
}
