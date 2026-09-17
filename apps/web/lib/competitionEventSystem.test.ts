import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

const { getEventDetail } = await import(new URL('../features/competition/events/competition-events.repository.ts', import.meta.url).href) as typeof import('../features/competition/events/competition-events.repository')

test('event detail reads each active linked tournament system from rules, never type or legacy format', async () => {
  const tables: Record<string, Array<Record<string, unknown>>> = {
    competition_series_events: [{ id:'event',club_id:'club',series_id:'series',season_id:'season' }],
    competition_series: [{id:'series',club_id:'club'}],
    competition_seasons: [{id:'season',club_id:'club'}],
    competition_series_event_divisions: [
      {id:'a',club_id:'club',event_id:'event'}, {id:'b',club_id:'club',event_id:'event'}, {id:'c',club_id:'club',event_id:'event'},
    ],
    competition_series_event_schedule_history: [],
    competition_series_event_tournament_links: [
      {event_division_id:'a',club_id:'club',tournament_id:'old',status:'REPLACED'},
      {event_division_id:'a',club_id:'club',tournament_id:'direct',status:'ACTIVE'},
      {event_division_id:'b',club_id:'club',tournament_id:'groups',status:'ACTIVE'},
      {event_division_id:'c',club_id:'club',tournament_id:'legacy',status:'ACTIVE'},
    ],
    tournaments: [
      {id:'old',club_id:'club',rules_json:{competition_system:'ROUND_ROBIN'}},
      {id:'direct',club_id:'club',type:'MASTER',format:'GROUPS_ELIMINATION',rules_json:{competition_system:'DIRECT_ELIMINATION'}},
      {id:'groups',club_id:'club',type:'MASTER',rules_json:{competition_system:'GROUPS_PLAYOFF'}},
      {id:'legacy',club_id:'club',type:'MASTER',format:'DIRECT_ELIM',rules_json:{}},
    ],
  }
  const client = {
    from(table: string) {
      let rows = [...(tables[table] ?? [])]
      const query = {
        select: () => query,
        eq: (field: string, value: unknown) => { rows = rows.filter(row => row[field] === value); return query },
        in: (field: string, values: unknown[]) => { rows = rows.filter(row => values.includes(row[field])); return query },
        order: () => query,
        single: async () => ({ data:rows[0],error:null }),
        maybeSingle: async () => ({ data:rows[0] ?? null,error:null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({data:rows,error:null}).then(resolve),
      }
      return query
    },
    rpc: async () => ({data:{blockers:[],warnings:[]},error:null}),
  } as unknown as SupabaseClient
  const result = await getEventDetail(client,'club','event')
  assert.deepEqual(result.divisions.map(division => division.competition_system), ['DIRECT_ELIMINATION','GROUPS_PLAYOFF',null])
  assert.equal(result.divisions[0].active_tournament_link?.tournament_id,'direct')
})
