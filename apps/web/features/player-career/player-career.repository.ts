import 'server-only'
import { supabaseAdmin as db } from '@/lib/supabaseAdmin'
import { nonPlayerAccountIds } from '@/lib/accountRoleServer'
import { pageNumber, validId, winRate } from './player-career.rules'
import type { CareerHistoryRow, CareerIdentity, CareerRecentRow, CareerStats, CareerSummary, RankingContext, RankingPage, SportsStanding } from './player-career.types'

const STANDING = 'club_player_id,club_id,user_id,player_entry_id,full_name,avatar_url,category,category_name,gender,season_id,season_name,division_id,modality,ranking_points,position,is_tied,ordinal'
const HISTORY = 'id,tournament_id,tournament_name,sports_date,category,category_name,partner_name,result_role,final_position,points'
const PAGE_SIZE = 25
function assertRead(error: unknown) { if (error) throw new Error('SPORTS_READ_UNAVAILABLE') }

/** Pagination for small context catalogs, never for player rosters/matches/ledger. */
async function catalog<T>(read: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const rows: T[] = []
  for (let from=0;;from+=200) {
    const result = await read(from,from+199); assertRead(result.error)
    const page=(result.data ?? []) as T[]; rows.push(...page)
    if (page.length<200) return rows
  }
}

export async function readCareerIdentity(id: string, clubId?: string | null): Promise<CareerIdentity | null> {
  if (!validId(id) || (clubId && !validId(clubId))) return null
  // Legacy club_player URLs resolve deterministically. Global user URLs never
  // pick an arbitrary .limit(1) club; context is explicit or ordered by ID.
  const exact = await db.from('club_players').select('id,user_id,club_id').eq('id',id).maybeSingle()
  assertRead(exact.error)
  const userId=exact.data?.user_id ?? id
  if ((await nonPlayerAccountIds([userId])).has(userId)) return null
  const [players, memberships, profile] = await Promise.all([
    catalog<{id:string;club_id:string;category:number|null;gender:string|null;display_name:string|null}>((from,to)=>db.from('club_players')
      .select('id,club_id,category,gender,display_name').eq('user_id',userId).not('approved_at','is',null).order('id').range(from,to)),
    catalog<{club_id:string}>((from,to)=>db.from('club_memberships').select('club_id').eq('user_id',userId)
      .eq('role','PLAYER').eq('status','APPROVED').not('approved_at','is',null).order('club_id').range(from,to)),
    db.from('profiles').select('display_name,first_name,last_name,avatar_url,cover_url').eq('user_id',userId).maybeSingle(),
  ])
  assertRead(profile.error)
  const approved = new Set(memberships.map(m=>m.club_id))
  const eligible=players.filter(p=>approved.has(p.club_id))
  if (!eligible.length) return null
  const clubs=await catalog<{id:string;name:string}>((from,to)=>db.from('clubs').select('id,name')
    .in('id',eligible.map(p=>p.club_id)).eq('is_active',true).order('id').range(from,to))
  const names=new Map(clubs.map(c=>[c.id,c.name]))
  const contexts=eligible.filter(p=>names.has(p.club_id)).map(p=>({clubPlayerId:p.id,clubId:p.club_id,clubName:names.get(p.club_id)!,category:p.category,gender:p.gender}))
  const selected=contexts.find(c=>clubId ? c.clubId===clubId : c.clubPlayerId===exact.data?.id) ?? (!clubId ? contexts[0] : undefined)
  if (!selected) return null
  const p=profile.data
  const name=p?.display_name || [p?.first_name,p?.last_name].filter(Boolean).join(' ') || eligible.find(p=>p.id===selected.clubPlayerId)?.display_name || 'Jugador'
  return {userId,name,avatarUrl:p?.avatar_url ?? null,coverUrl:p?.cover_url ?? null,contexts,selectedClubPlayerId:selected.clubPlayerId,
    publicPath:`/jugadores/${userId}?clubId=${selected.clubId}`}
}

async function activeSeason(clubId: string, requested?: string | null) {
  const query=db.from('competition_seasons').select('id,name').eq('club_id',clubId).eq('status','ACTIVE')
  if (requested) { if (!validId(requested)) return null; query.eq('id',requested) }
  const result=await query.order('id').limit(2); assertRead(result.error)
  if ((result.data?.length ?? 0)>1) throw new Error('AMBIGUOUS_SEASON')
  return result.data?.[0] ?? null
}

export async function readCareerSummary(identity: CareerIdentity): Promise<CareerSummary> {
  const context=identity.contexts.find(c=>c.clubPlayerId===identity.selectedClubPlayerId)!
  const season=await activeSeason(context.clubId)
  const scope={clubId:context.clubId,clubPlayerId:context.clubPlayerId,seasonId:season?.id ?? null,seasonName:season?.name ?? null}
  const [standingResult,statsResult,partner]=await Promise.all([
    season ? db.from('competition_player_standings_read').select(STANDING).eq('club_player_id',context.clubPlayerId).eq('club_id',context.clubId)
      .eq('season_id',season.id).order('division_id').limit(2) : Promise.resolve({data:[],error:null}),
    db.rpc('read_player_career_summary',{p_club_player_id:context.clubPlayerId,p_season_id:null}),
    readCurrentPartner(context.clubPlayerId,context.clubId),
  ])
  // Identity remains usable even when the forward-only projection is missing.
  const standings=(standingResult.data ?? []) as SportsStanding[]
  if (standings.length>1) throw new Error('AMBIGUOUS_PLAYER_DIVISION')
  const raw=statsResult.data?.[0] as (Omit<CareerStats,'effectiveness'> & {best_result:string|null;best_position:number|null}) | undefined
  const stats=raw ? {tournaments_played:Number(raw.tournaments_played),matches_played:Number(raw.matches_played),wins:Number(raw.wins),losses:Number(raw.losses),titles:Number(raw.titles),finals:Number(raw.finals),semifinals:Number(raw.semifinals),effectiveness:winRate(Number(raw.wins),Number(raw.losses))} : null
  return {scope,standing:standingResult.error ? null : standings[0] ?? null,stats,
    statsAvailable:!standingResult.error && !statsResult.error,statsPeriod:'CLUB_CAREER_ALL_SEASONS',bestResult:raw?.best_result ? {role:raw.best_result,position:raw.best_position}:null,partner}
}

async function readCurrentPartner(clubPlayerId: string, clubId: string) {
  const result=await db.from('player_active_partnerships').select('player1_club_player_id,player2_club_player_id')
    .eq('club_id',clubId).eq('status','ACTIVE').or(`player1_club_player_id.eq.${clubPlayerId},player2_club_player_id.eq.${clubPlayerId}`).limit(2)
  if (result.error || result.data?.length!==1) return null
  const pair=result.data[0]
  const other=pair.player1_club_player_id===clubPlayerId ? pair.player2_club_player_id : pair.player1_club_player_id
  const identity=await readCareerIdentity(other,clubId)
  return identity ? {name:identity.name,publicPath:identity.publicPath} : null
}

export async function readCareerHistory(identity: CareerIdentity, page=1, recent=false) {
  const club=identity.contexts.find(c=>c.clubPlayerId===identity.selectedClubPlayerId)!
  const start=(pageNumber(String(page))-1)*10
  if (recent) {
    // The predicate belongs in SQL, before the page; never filter a limited list.
    const matches=await db.from('player_career_matches_read').select('id,tournament_id,tournament_name,sports_date,won')
      .eq('club_player_id',club.clubPlayerId).eq('club_id',club.clubId).eq('computable',true)
      .order('sports_date',{ascending:false,nullsFirst:false}).order('id').range(start,start+10)
    assertRead(matches.error)
    return {rows:((matches.data ?? []) as CareerRecentRow[]).slice(0,10),hasMore:(matches.data?.length ?? 0)>10,page}
  }
  const result=await db.from('player_career_results_read').select(HISTORY)
    .eq('club_player_id',club.clubPlayerId).eq('club_id',club.clubId)
    .order('sports_date',{ascending:false,nullsFirst:false}).order('id').range(start,start+10)
  assertRead(result.error)
  return {rows:((result.data ?? []) as unknown as CareerHistoryRow[]).slice(0,10),hasMore:(result.data?.length ?? 0)>10,page}
}

export async function readRankingContexts(clubId: string, seasonId?: string | null): Promise<RankingContext[]> {
  if (!validId(clubId)) return []
  const season=await activeSeason(clubId,seasonId); if (!season) return []
  const divisions=await catalog<{id:string;category_id:string;branch_id:string;modality:string}>((from,to)=>db.from('competition_divisions')
    .select('id,category_id,branch_id,modality').eq('club_id',clubId).eq('season_id',season.id).eq('is_active',true)
    .in('modality',['INDIVIDUAL','PAIRS']).is('segment_id',null).order('id').range(from,to))
  const [categories,branches]=await Promise.all([
    catalog<{id:string;legacy_category_id:number|null;name:string}>((from,to)=>db.from('competition_categories').select('id,legacy_category_id,name').eq('club_id',clubId).order('id').range(from,to)),
    catalog<{id:string;slug:string}>((from,to)=>db.from('competition_branches').select('id,slug').eq('club_id',clubId).order('id').range(from,to)),
  ])
  return divisions.map(d=>{const cat=categories.find(c=>c.id===d.category_id);const branch=branches.find(b=>b.id===d.branch_id)
    return {clubId,seasonId:season.id,seasonName:season.name,divisionId:d.id,modality:d.modality,category:cat?.legacy_category_id ?? null,categoryName:cat?.name ?? 'Sin categoría',gender:branch?.slug==='damas'?'F':branch?.slug==='caballeros'?'M':'MIXED'}
  }).filter(c=>c.modality==='PAIRS' || (c.gender!=='MIXED' && c.category!==null && c.category>=1 && c.category<=7))
    .sort((a,b)=>(a.category ?? 99)-(b.category ?? 99)||a.gender.localeCompare(b.gender)||a.divisionId.localeCompare(b.divisionId))
}

export async function readRankingPage(context: RankingContext | null, query='', page=1): Promise<RankingPage> {
  if (!context) return {rows:[],count:0,page:1,pageSize:PAGE_SIZE,context:null}
  const current=pageNumber(String(page));const start=(current-1)*PAGE_SIZE
  const request=db.from('competition_player_standings_read').select(STANDING,{count:'exact'})
    .eq('club_id',context.clubId).eq('season_id',context.seasonId).eq('division_id',context.divisionId)
  const search=query.trim().slice(0,80).replace(/[%_,()]/g,' ')
  if (search) request.ilike('full_name',`%${search}%`)
  const result=await request.order('ordinal').range(start,start+PAGE_SIZE-1);assertRead(result.error)
  return {rows:(result.data ?? []) as SportsStanding[],count:result.count ?? 0,page:current,pageSize:PAGE_SIZE,context}
}

export async function readMyRanking(identity: CareerIdentity) {
  const summary=await readCareerSummary(identity); const me=summary.standing
  if (!summary.statsAvailable) throw new Error('SPORTS_READ_UNAVAILABLE')
  if (!me) return {individual:[],leader:null,next:null,summary,meta:{generatedAt:new Date().toISOString()}}
  const base=()=>db.from('competition_player_standings_read').select(STANDING).eq('club_id',me.club_id).eq('season_id',me.season_id).eq('division_id',me.division_id)
  const [neighbors,leader,next]=await Promise.all([
    base().gte('ordinal',Math.max(1,me.ordinal-3)).lte('ordinal',me.ordinal+3).order('ordinal'),
    base().order('ordinal').limit(1),
    base().lt('position',me.position).order('ordinal',{ascending:false}).limit(1),
  ])
  for (const r of [neighbors,leader,next]) assertRead(r.error)
  const row=(s:SportsStanding)=>({...s,player_id:s.club_player_id,contextualPosition:s.position})
  return {individual:((neighbors.data ?? []) as SportsStanding[]).map(row),leader:leader.data?.[0] ? row(leader.data[0] as SportsStanding):null,
    next:next.data?.[0] ? row(next.data[0] as SportsStanding):null,summary,meta:{generatedAt:new Date().toISOString()}}
}

export async function readPublicClubs(page=1) {
  const result=await db.from('clubs').select('id,name,logo_url,theme_key',{count:'exact'}).eq('is_active',true)
    .order('name').order('id').range((pageNumber(String(page))-1)*40,pageNumber(String(page))*40-1)
  assertRead(result.error);return {clubs:result.data ?? [],count:result.count ?? 0}
}

export async function readClubRankingPreview(clubId: string) {
  const season=await activeSeason(clubId);if (!season) return []
  // One query for a bounded preview. Empty divisions create no fake leader.
  const result=await db.from('competition_player_standings_read')
    .select('division_id,category,category_name,gender,division_population,full_name,ranking_points,avatar_url')
    .eq('club_id',clubId).eq('season_id',season.id).eq('ordinal',1).order('category').order('gender').limit(12)
  assertRead(result.error)
  return (result.data ?? []).map(row=>({key:row.division_id,label:row.category ? `${row.category}ª` : row.category_name,
    gender:row.gender,players:row.division_population,leaderName:row.full_name,leaderPoints:row.ranking_points,leaderPhotoUrl:row.avatar_url}))
}

export async function readPublicClub(clubId:string) {
  if (!validId(clubId)) return {clubs:[],count:0}
  const result=await db.from('clubs').select('id,name,logo_url,theme_key').eq('id',clubId).eq('is_active',true).maybeSingle()
  assertRead(result.error);return {clubs:result.data ? [result.data]:[],count:result.data?1:0}
}

export async function readPairRankingPage(context:RankingContext|null,query='',page=1) {
  if (!context) return {rows:[],count:0}
  const request=db.from('competition_pair_standings_read').select('partnership_id,player1_user_id,player2_user_id,player1_name,player2_name,player1_avatar_url,player2_avatar_url,combined_points,position',{count:'exact'})
    .eq('club_id',context.clubId).eq('season_id',context.seasonId).eq('division_id',context.divisionId)
  const search=query.trim().slice(0,80).replace(/[%_,().]/g,' ')
  if (search) request.or(`player1_name.ilike.%${search}%,player2_name.ilike.%${search}%`)
  const result=await request.order('position').order('partnership_id').range((pageNumber(String(page))-1)*PAGE_SIZE,pageNumber(String(page))*PAGE_SIZE-1)
  assertRead(result.error)
  return {rows:(result.data ?? []).map(row=>({...row,player1_points:row.combined_points,player2_points:row.combined_points,category:context.category,gender:context.gender})),count:result.count ?? 0}
}
