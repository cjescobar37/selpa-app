import { NextRequest, NextResponse } from 'next/server'
import { authorizeCompetitionSeries } from '@/features/competition/series/competition-series.auth'
import { seriesErrorResponse } from '@/features/competition/series/competition-series.http'
import { projectCircuitPointHistory, type CircuitAward, type CircuitMovement, type CircuitRankingEntry } from '@/features/competition/series/competition-series.point-history'
import { isUuid } from '@/features/competition/series/competition-series.validation'

type Context = { params: Promise<{ clubId: string; seriesId: string }> }
type RankingRow = CircuitRankingEntry & {
  ranking_position: number
  series_division_id: string
  club_player_id?: string
  player_id?: string
  display_name?: string
  player1_user_id?: string
  player2_user_id?: string
  player1_name?: string
  player2_name?: string
  pair_key?: string
}

function checked<T>(result: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (result.error) throw Object.assign(new Error(result.error.message), { code: result.error.code })
  return result.data as T
}

export async function GET(request: NextRequest, context: Context) {
  const { clubId, seriesId } = await context.params
  const divisionId = request.nextUrl.searchParams.get('divisionId') ?? ''
  const mode = request.nextUrl.searchParams.get('mode')
  const playerId = request.nextUrl.searchParams.get('playerId') ?? ''
  const pairKey = request.nextUrl.searchParams.get('pairKey') ?? ''
  const pairIds = pairKey.split(':')
  if (![clubId, seriesId, divisionId].every(isUuid) || !['individual', 'pairs'].includes(mode ?? '') ||
    (mode === 'individual' && !isUuid(playerId)) ||
    (mode === 'pairs' && (pairIds.length !== 2 || !pairIds.every(isUuid) || pairIds[0] >= pairIds[1]))) {
    return NextResponse.json({ error: 'Identificador inválido.' }, { status: 400 })
  }
  const auth = await authorizeCompetitionSeries(request, clubId, 'read')
  if (auth.error || !auth.client) return auth.error
  const client = auth.client
  try {
    const series = checked(await client.from('competition_series').select('id,status,season_id')
      .eq('club_id', clubId).eq('id', seriesId).maybeSingle()) as { status: string; season_id: string } | null
    if (!series) return NextResponse.json({ error: 'Circuito inexistente.' }, { status: 404 })

    const ranking = series.status === 'CLOSED'
      ? checked(await client.from(mode === 'pairs' ? 'competition_series_final_pair_rankings' : 'competition_series_final_rankings')
        .select('*').eq('club_id', clubId).eq('series_id', seriesId).eq('series_division_id', divisionId))
      : checked(await client.rpc(mode === 'pairs' ? 'get_competition_series_pair_ranking' : 'get_competition_series_ranking_by_division',
        { p_club_id: clubId, p_series_id: seriesId }))
    const row = ((ranking ?? []) as RankingRow[]).find(candidate => candidate.series_division_id === divisionId &&
      (mode === 'pairs' ? candidate.pair_key === pairKey : candidate.club_player_id === playerId))
    if (!row) return NextResponse.json({ error: 'Posición inexistente en este circuito.' }, { status: 404 })
    const playerIds = mode === 'pairs' ? [row.player1_user_id!, row.player2_user_id!] : [row.player_id!]
    const entry: CircuitRankingEntry = {
      position: Number(row.ranking_position), points: Number(row.points),
      events_played: Number(row.events_played), titles: Number(row.titles), rule_snapshot: row.rule_snapshot,
    }
    const players = checked(await client.from('club_players').select('id,user_id').eq('club_id', clubId).in('user_id', playerIds)) as Array<{ id: string; user_id: string }>
    const playerRecordIds = players.map(player => player.id)
    if (playerRecordIds.length !== playerIds.length) return NextResponse.json({ error: 'Historial no disponible.' }, { status: 404 })

    const events = checked(await client.from('competition_series_events')
      .select('id,name,planned_starts_at,actual_starts_at,planned_ends_at,actual_ends_at,updated_at').eq('club_id', clubId).eq('series_id', seriesId)
      .eq('status', 'COMPLETED')) as Array<{ id: string; name: string; planned_starts_at: string | null; actual_starts_at: string | null; planned_ends_at: string | null; actual_ends_at: string | null; updated_at: string }>
    const eventById = new Map(events.map(event => [event.id, event]))
    let awards: CircuitAward[] = []
    let movements: CircuitMovement[] = []
    if (events.length) {
      const divisions = checked(await client.from('competition_series_event_divisions')
        .select('id,event_id').eq('club_id', clubId).eq('series_division_id', divisionId)
        .eq('status', 'COMPLETED').eq('scoring_mode', 'POINTS').in('event_id', events.map(event => event.id))) as Array<{ id: string; event_id: string }>
      if (divisions.length) {
        const divisionById = new Map(divisions.map(division => [division.id, division]))
        const settlements = checked(await client.from('competition_event_settlements')
          .select('id,event_division_id,homologation_id,corrected_from_id').eq('club_id', clubId)
          .eq('status', 'PUBLISHED').in('event_division_id', divisions.map(division => division.id))) as Array<{
            id: string; event_division_id: string; homologation_id: string; corrected_from_id: string | null
          }>
        if (settlements.length) {
          const settlementById = new Map(settlements.map(settlement => [settlement.id, settlement]))
          const awardRows = checked(await client.from('competition_event_settlement_awards')
            .select('id,player_id,settlement_id,homologation_participant_id,result_code,base_points,bonus_points,penalty_points,multiplier,total_points')
            .eq('club_id', clubId).in('settlement_id', settlements.map(settlement => settlement.id))
            .in('player_id', playerIds).eq('scoring_eligibility_status', 'ELIGIBLE')) as Array<{
              id: string; player_id: string; settlement_id: string; homologation_participant_id: string;
              result_code: string; base_points: number; bonus_points: number; penalty_points: number;
              multiplier: number; total_points: number
            }>
          if (awardRows.length) {
            const participants = checked(await client.from('competition_event_homologation_participants')
              .select('id,tournament_team_id').eq('club_id', clubId)
              .in('id', awardRows.map(award => award.homologation_participant_id))) as Array<{ id: string; tournament_team_id: string }>
            const teamByParticipant = new Map(participants.map(participant => [participant.id, participant.tournament_team_id]))
            const homologations = checked(await client.from('competition_event_homologations')
              .select('id,tournament_id').eq('club_id', clubId)
              .in('id', settlements.map(settlement => settlement.homologation_id))) as Array<{ id: string; tournament_id: string }>
            const tournamentByHomologation = new Map(homologations.map(item => [item.id, item.tournament_id]))
            const tournaments = homologations.length ? checked(await client.from('tournaments')
              .select('id,name,start_date').eq('club_id', clubId)
              .in('id', [...new Set(homologations.map(item => item.tournament_id))])) as Array<{ id: string; name: string; start_date: string | null }> : []
            const tournamentById = new Map(tournaments.map(tournament => [tournament.id, tournament]))
            awards = awardRows.flatMap(award => {
              const settlement = settlementById.get(award.settlement_id)
              const division = settlement && divisionById.get(settlement.event_division_id)
              const event = division && eventById.get(division.event_id)
              const teamId = teamByParticipant.get(award.homologation_participant_id)
              if (!settlement || !event || !teamId) return []
              const tournament = tournamentById.get(tournamentByHomologation.get(settlement.homologation_id) ?? '')
              return [{ ...award, event_id: event.id, event_name: event.name,
                event_date: tournament?.start_date ?? event.actual_starts_at ?? event.planned_starts_at,
                ranking_at: event.actual_ends_at ?? event.planned_ends_at ?? event.updated_at,
                tournament_name: tournament?.name ?? null, tournament_team_id: teamId,
                corrected_from_id: settlement.corrected_from_id }]
            })
          }
        }
      }
    }
    // Read the immutable ledger through the authenticated client's RLS. Reversal
    // rows point to their original; their own metadata need not contain an award.
    if (awards.length) {
      for (let offset = 0; ; offset += 500) {
        const page = checked(await client.from('competition_point_transactions')
          .select('id,points,reversed_transaction_id,metadata').eq('club_id', clubId)
          .eq('season_id', series.season_id).eq('source_concept', 'COMPETITION_EVENT_SETTLEMENT')
          .in('club_player_id', playerRecordIds).order('id').range(offset, offset + 499)) as CircuitMovement[]
        movements.push(...page)
        if (page.length < 500) break
      }
      const awardIds = new Set(awards.map(award => award.id))
      const originals = new Set(movements.filter(row => !row.reversed_transaction_id && awardIds.has(String(row.metadata?.award_id ?? ''))).map(row => row.id))
      movements = movements.filter(row => row.reversed_transaction_id ? originals.has(row.reversed_transaction_id) : originals.has(row.id))
    }
    const detail = projectCircuitPointHistory(entry, awards, movements, playerIds, mode as 'individual' | 'pairs')
    return NextResponse.json({ ...detail, name: mode === 'pairs' ? `${row.player1_name} / ${row.player2_name}` : row.display_name,
      finalized: series.status === 'CLOSED' }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return seriesErrorResponse(error)
  }
}
