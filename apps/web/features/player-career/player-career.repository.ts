import 'server-only'
import { supabaseAdmin as db } from '@/lib/supabaseAdmin'
import { nonPlayerAccountIds } from '@/lib/accountRoleServer'
import { pageNumber, validId, winRate } from './player-career.rules'
import { rankingReadIssue } from './public-ranking.presentation'
import { myRankingState } from './my-ranking.state'
import { PUBLIC_CAREER, CareerAccessError, assertCareerAccess, type CareerAccess } from './player-career.access'
import type { CareerHistoryRow, CareerIdentity, CareerRecentRow, CareerStats, CareerSummary, RankingContext, RankingPage, SportsStanding } from './player-career.types'

const STANDING = 'club_player_id,club_id,user_id,player_entry_id,full_name,avatar_url,category,category_name,gender,season_id,season_name,division_id,modality,ranking_points,position,is_tied,ordinal'
const HISTORY = 'id,tournament_id,tournament_name,sports_date,category,category_name,partner_name,result_role,final_position,points'
const PAGE_SIZE = 25
function assertRead(error: unknown) {
  if (!error) return
  const failure=new Error('SPORTS_READ_UNAVAILABLE') as Error & {code?:string}
  const code=typeof error==='object' && 'code' in error ? String(error.code) : ''
  if (/^[A-Z0-9_]{1,32}$/.test(code)) failure.code=code
  throw failure
}

/** Pagination for small context catalogs, never for player rosters/matches/ledger. */
async function catalog<T>(read: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const rows: T[] = []
  for (let from=0;;from+=200) {
    const result = await read(from,from+199); assertRead(result.error)
    const page=(result.data ?? []) as T[]; rows.push(...page)
    if (page.length<200) return rows
  }
}

export async function readCareerIdentity(id: string, clubId?: string | null, access:CareerAccess=PUBLIC_CAREER): Promise<CareerIdentity | null> {
  if (!validId(id) || (clubId && !validId(clubId))) return null
  // Legacy club_player URLs resolve deterministically. Global user URLs never
  // pick an arbitrary .limit(1) club; context is explicit or ordered by ID.
  const exact = await db.from('club_players').select('id,user_id,club_id').eq('id',id).maybeSingle()
  assertRead(exact.error)
  const userId=exact.data?.user_id ?? id
  assertCareerAccess(access,userId,clubId)
  if(access.kind==='admin'&&exact.data&&exact.data.club_id!==access.clubId)throw new CareerAccessError(403)
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
  const eligible=players.filter(p=>approved.has(p.club_id)&&(access.kind!=='admin'||p.club_id===access.clubId))
  const clubs=eligible.length ? await catalog<{id:string;name:string;logo_url:string|null;theme_key:string|null}>((from,to)=>db.from('clubs').select('id,name,logo_url,theme_key')
    .in('id',eligible.map(p=>p.club_id)).eq('is_active',true).order('id').range(from,to)) : []
  const published=access.kind==='public'&&clubs.length ? await catalog<{club_id:string}>((from,to)=>db.from('public_competition_contexts_read')
    .select('club_id').in('club_id',clubs.map(c=>c.id)).order('club_id').range(from,to)):null
  const visible=new Set(published?.map(c=>c.club_id))
  const names=new Map(clubs.filter(c=>published===null||visible.has(c.id)).map(c=>[c.id,c.name]))
  // Current private category/branch must not leak through the identity DTO.
  const contexts=eligible.filter(p=>names.has(p.club_id)).map(p=>({clubPlayerId:p.id,clubId:p.club_id,clubName:names.get(p.club_id)!,clubLogoUrl:clubs.find(c=>c.id===p.club_id)?.logo_url ?? null,clubThemeKey:clubs.find(c=>c.id===p.club_id)?.theme_key ?? null,category:access.kind==='public'?null:p.category,gender:access.kind==='public'?null:p.gender}))
  const selected=contexts.find(c=>clubId ? c.clubId===clubId : c.clubPlayerId===exact.data?.id) ?? (!clubId ? contexts[0] : undefined)
  const p=profile.data
  if (!selected) {
    // No club is not a lost global identity. Explicit inaccessible club URLs
    // remain unavailable; STAFF was excluded above using authoritative tables.
    if (clubId || contexts.length || !p) return null
    return {userId,name:p.display_name || [p.first_name,p.last_name].filter(Boolean).join(' ') || 'Jugador',
      avatarUrl:p.avatar_url ?? null,coverUrl:p.cover_url ?? null,contexts:[],selectedClubPlayerId:'',publicPath:`/jugadores/${userId}`}
  }
  const name=p?.display_name || [p?.first_name,p?.last_name].filter(Boolean).join(' ') || eligible.find(p=>p.id===selected.clubPlayerId)?.display_name || 'Jugador'
  return {userId,name,avatarUrl:p?.avatar_url ?? null,coverUrl:p?.cover_url ?? null,contexts,selectedClubPlayerId:selected.clubPlayerId,
    publicPath:`/jugadores/${userId}?clubId=${selected.clubId}`}
}

async function activeSeason(clubId: string, requested?: string | null, access:CareerAccess=PUBLIC_CAREER) {
  const query=db.from('competition_seasons').select('id,name').eq('club_id',clubId)
  if(access.kind==='public')query.eq('is_public',true)
  if(requested && access.kind==='public')query.in('status',['ACTIVE','CLOSED'])
  else query.eq('status','ACTIVE')
  if (requested) { if (!validId(requested)) return null; query.eq('id',requested) }
  const result=await query.order('id').limit(2); assertRead(result.error)
  if ((result.data?.length ?? 0)>1) throw new Error('AMBIGUOUS_SEASON')
  return result.data?.[0] ?? null
}

export async function readCareerSummary(identity: CareerIdentity,access:CareerAccess=PUBLIC_CAREER): Promise<CareerSummary> {
  const context=identity.contexts.find(c=>c.clubPlayerId===identity.selectedClubPlayerId)!
  if (!context) throw new Error('NO_SPORTS_CONTEXT')
  assertCareerAccess(access,identity.userId,context.clubId)
  const isPublic=access.kind==='public'
  const season=await activeSeason(context.clubId,undefined,access)
  const scope={clubId:context.clubId,clubPlayerId:context.clubPlayerId,seasonId:season?.id ?? null,seasonName:season?.name ?? null}
  const [standingResult,statsResult,partner]=await Promise.all([
    season ? db.from(isPublic?'public_player_standings_read':'competition_player_standings_read').select(STANDING).eq('club_player_id',context.clubPlayerId).eq('club_id',context.clubId)
      .eq('season_id',season.id).order('division_id').limit(2) : Promise.resolve({data:[],error:null}),
    db.rpc(isPublic?'read_public_player_career_summary':'read_player_career_summary',{p_club_player_id:context.clubPlayerId,p_season_id:null}),
    isPublic?Promise.resolve(null):readCurrentPartner(context.clubPlayerId,context.clubId),
  ])
  // Identity remains usable even when the forward-only projection is missing.
  const standings=(standingResult.data ?? []) as SportsStanding[]
  if (standings.length>1) throw new Error('AMBIGUOUS_PLAYER_DIVISION')
  const raw=statsResult.data?.[0] as (Omit<CareerStats,'effectiveness'> & {best_result:string|null;best_position:number|null}) | undefined
  const stats=raw ? {tournaments_played:Number(raw.tournaments_played),matches_played:Number(raw.matches_played),wins:Number(raw.wins),losses:Number(raw.losses),titles:Number(raw.titles),finals:Number(raw.finals),semifinals:Number(raw.semifinals),effectiveness:winRate(Number(raw.wins),Number(raw.losses))} : null
  return {scope,standing:standingResult.error ? null : standings[0] ?? null,stats,
    statsAvailable:!standingResult.error && !statsResult.error,
    readIssue:standingResult.error || statsResult.error ? rankingReadIssue(standingResult.error ?? statsResult.error):null,
    statsPeriod:isPublic?'PUBLIC_CLUB_CAREER':'CLUB_CAREER_ALL_SEASONS',bestResult:raw?.best_result ? {role:raw.best_result,position:raw.best_position}:null,partner}
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

export async function readCareerHistory(identity: CareerIdentity, page=1, recent=false,access:CareerAccess=PUBLIC_CAREER) {
  const club=identity.contexts.find(c=>c.clubPlayerId===identity.selectedClubPlayerId)!
  assertCareerAccess(access,identity.userId,club.clubId)
  const isPublic=access.kind==='public'
  const start=(pageNumber(String(page))-1)*10
  if (recent) {
    // The predicate belongs in SQL, before the page; never filter a limited list.
    const matches=await db.from(isPublic?'public_player_career_matches_read':'player_career_matches_read').select('id,tournament_id,tournament_name,sports_date,won')
      .eq('club_player_id',club.clubPlayerId).eq('club_id',club.clubId).eq('computable',true)
      .order('sports_date',{ascending:false,nullsFirst:false}).order('id').range(start,start+10)
    assertRead(matches.error)
    return {rows:((matches.data ?? []) as CareerRecentRow[]).slice(0,10),hasMore:(matches.data?.length ?? 0)>10,page}
  }
  const result=await db.from(isPublic?'public_player_career_results_read':'player_career_results_read').select(HISTORY)
    .eq('club_player_id',club.clubPlayerId).eq('club_id',club.clubId)
    .order('sports_date',{ascending:false,nullsFirst:false}).order('id').range(start,start+10)
  assertRead(result.error)
  return {rows:((result.data ?? []) as unknown as CareerHistoryRow[]).slice(0,10),hasMore:(result.data?.length ?? 0)>10,page}
}

export async function readRankingContexts(clubId: string, seasonId?: string | null): Promise<RankingContext[]> {
  if (!validId(clubId)) return []
  const season=await activeSeason(clubId,seasonId); if (!season) return []
  const divisions=await catalog<{id:string;category_id:string;branch_id:string;modality:string}>((from,to)=>db.from('public_competition_contexts_read')
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

export async function readPublicRankingSeasons(clubId:string) {
  if (!validId(clubId)) return []
  return catalog<{id:string;name:string;status:string}>((from,to)=>db.from('competition_seasons').select('id,name,status')
    .eq('club_id',clubId).eq('is_public',true).in('status',['ACTIVE','CLOSED']).order('id',{ascending:false}).range(from,to))
}

export async function readRankingPage(context: RankingContext | null, query='', page=1): Promise<RankingPage> {
  if (!context) return {rows:[],count:0,page:1,pageSize:PAGE_SIZE,context:null}
  const current=pageNumber(String(page));const start=(current-1)*PAGE_SIZE
  const request=db.from('public_player_standings_read').select(STANDING,{count:'exact'})
    .eq('club_id',context.clubId).eq('season_id',context.seasonId).eq('division_id',context.divisionId)
  const search=query.trim().slice(0,80).replace(/[%_,()]/g,' ')
  if (search) request.ilike('full_name',`%${search}%`)
  const result=await request.order('ordinal').range(start,start+PAGE_SIZE-1);assertRead(result.error)
  return {rows:(result.data ?? []) as SportsStanding[],count:result.count ?? 0,page:current,pageSize:PAGE_SIZE,context}
}

/** Count the canonical universe, not configured categories or search results.
 * Bounded count reads in batches, at most one division UUID per query; no player
 * names, roster or ledger downloaded. GET preserves missing-object diagnostics
 * (the installed SDK maps an empty HEAD 404 to 204). */
export async function readPublishedRankingContexts(contexts: RankingContext[]): Promise<RankingContext[]> {
  const result: RankingContext[]=[]
  for (let offset=0;offset<contexts.length;offset+=4) {
    result.push(...await Promise.all(contexts.slice(offset,offset+4).map(async context=>{
      const read=await db.from(context.modality==='PAIRS'?'public_pair_standings_read':'public_player_standings_read')
        .select('division_id',{count:'exact'}).eq('club_id',context.clubId)
        .eq('season_id',context.seasonId).eq('division_id',context.divisionId).limit(1)
      assertRead(read.error)
      if (read.count===null) throw new Error('RANKING_COUNT_UNAVAILABLE')
      return {...context,rankedCount:read.count}
    })))
  }
  return result
}

export async function readMyRanking(identity: CareerIdentity,access:CareerAccess,page=1) {
  if(access.kind!=='self')throw new CareerAccessError(403)
  assertCareerAccess(access,identity.userId,identity.contexts.find(c=>c.clubPlayerId===identity.selectedClubPlayerId)?.clubId)
  const summary=await readCareerSummary(identity,access); const me=summary.standing
  if (!summary.statsAvailable) throw Object.assign(new Error('SPORTS_READ_UNAVAILABLE'),{code:summary.readIssue ?? 'READ_UNAVAILABLE'})
  const current=pageNumber(String(page))
  const clubId=summary.scope.clubId
  const seasonId=summary.scope.seasonId
  const [season,entry]=await Promise.all([
    seasonId ? db.from('competition_seasons').select('is_public').eq('id',seasonId).eq('club_id',clubId).maybeSingle() : Promise.resolve({data:null,error:null}),
    seasonId && !me ? db.from('competition_player_entries').select('id,competition_divisions!inner(season_id)')
      .eq('club_id',clubId).eq('club_player_id',summary.scope.clubPlayerId).eq('status','ACTIVE').is('valid_until',null)
      .eq('competition_divisions.season_id',seasonId).limit(1) : Promise.resolve({data:me?[{id:me.player_entry_id}]:[],error:null}),
  ])
  assertRead(season.error);assertRead(entry.error)
  const state=myRankingState({hasSeason:Boolean(seasonId),hasEntry:Boolean(entry.data?.length),hasStanding:Boolean(me),isPublic:season.data?.is_public===true})
  const empty={individual:[],leader:null,next:null,summary,state,participants:{page:current,pageSize:PAGE_SIZE,count:0,visible:false},meta:{generatedAt:new Date().toISOString()}}
  if (!me || state==='PRIVATE_SEASON') return empty
  const context=await db.from('public_competition_contexts_read').select('id').eq('id',me.division_id).eq('season_id',me.season_id).eq('club_id',me.club_id).maybeSingle()
  assertRead(context.error)
  if (!context.data) return empty
  // Owning a private career does not authorize reading private competitors.
  const base=()=>db.from('public_player_standings_read').select(STANDING).eq('club_id',me.club_id).eq('season_id',me.season_id).eq('division_id',me.division_id)
  const [neighbors,leader,next]=await Promise.all([
    db.from('public_player_standings_read').select(STANDING,{count:'exact'}).eq('club_id',me.club_id).eq('season_id',me.season_id).eq('division_id',me.division_id).order('ordinal').range((current-1)*PAGE_SIZE,current*PAGE_SIZE-1),
    base().order('ordinal').limit(1),
    base().lt('position',me.position).order('ordinal',{ascending:false}).limit(1),
  ])
  for (const r of [neighbors,leader,next]) assertRead(r.error)
  const row=(s:SportsStanding)=>({...s,player_id:s.club_player_id,contextualPosition:s.position})
  const visible=(neighbors.data ?? []) as SportsStanding[]
  return {individual:visible.map(row),leader:leader.data?.[0] ? row(leader.data[0] as SportsStanding):null,
    next:next.data?.[0] ? row(next.data[0] as SportsStanding):null,summary,state,participants:{page:current,pageSize:PAGE_SIZE,count:neighbors.count ?? 0,visible:true},meta:{generatedAt:new Date().toISOString()}}
}

export async function readPublicClubs(page=1) {
  const result=await db.from('clubs').select('id,name,logo_url,theme_key',{count:'exact'}).eq('is_active',true)
    .order('name').order('id').range((pageNumber(String(page))-1)*40,pageNumber(String(page))*40-1)
  assertRead(result.error);return {clubs:result.data ?? [],count:result.count ?? 0}
}

/** Batch small catalogs for the 40 visible clubs, never an N+1 roster/ledger read. */
export async function readRankingDirectory(page=1) {
  const result=await readPublicClubs(page)
  const clubs=result.clubs.map(club=>({...club,categoryCount:null as number|null}))
  if (!clubs.length) return {...result,clubs}
  try {
    const seasons=await catalog<{id:string;club_id:string}>((from,to)=>db.from('competition_seasons').select('id,club_id')
      .in('club_id',clubs.map(c=>c.id)).eq('status','ACTIVE').eq('is_public',true).order('id').range(from,to))
    const unambiguous=seasons.filter(s=>seasons.filter(other=>other.club_id===s.club_id).length===1)
    const divisions=unambiguous.length ? await catalog<{club_id:string;category_id:string}>((from,to)=>db.from('public_competition_contexts_read')
      .select('club_id,category_id').in('season_id',unambiguous.map(s=>s.id)).in('club_id',clubs.map(c=>c.id))
      .eq('modality','INDIVIDUAL').eq('is_active',true).is('segment_id',null).order('id').range(from,to)) : []
    return {...result,clubs:clubs.map(club=>({...club,categoryCount:seasons.filter(s=>s.club_id===club.id).length>1 ? null :
      new Set(divisions.filter(d=>d.club_id===club.id).map(d=>d.category_id).filter(Boolean)).size}))}
  } catch {return {...result,clubs}}
}

/** Full-division counts and a single leader; independent of search/page. */
export async function readRankingPresentation(contexts:RankingContext[],context:RankingContext|null,modality:string) {
  const unavailable={counts:{M:null as number|null,F:null as number|null},leaderPoints:null as number|null}
  if (!context) return unavailable
  const table=modality==='PAIRS'?'public_pair_standings_read':'public_player_standings_read'
  const field=modality==='PAIRS'?'combined_points':'ranking_points'
  try {
    const counts=await Promise.all(['M','F'].map(async gender=>{
      const branch=contexts.find(c=>c.modality===modality && c.category===context.category && c.gender===gender)
      if (!branch) return 0
      const result=await db.from(table).select('position',{count:'exact',head:true})
        .eq('club_id',branch.clubId).eq('season_id',branch.seasonId).eq('division_id',branch.divisionId)
      assertRead(result.error);return result.count
    }))
    const leader=await db.from(table).select(field).eq('club_id',context.clubId).eq('season_id',context.seasonId)
      .eq('division_id',context.divisionId).order('position').limit(1)
    assertRead(leader.error)
    const row=leader.data?.[0] as unknown as Record<string,number>|undefined
    return {counts:{M:counts[0],F:counts[1]},leaderPoints:row ? Number(row[field]) : null}
  } catch {return unavailable}
}

export async function readClubRankingPreview(clubId: string) {
  const season=await activeSeason(clubId);if (!season) return []
  // One query for a bounded preview. Empty divisions create no fake leader.
  const result=await db.from('public_player_standings_read')
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
  const request=db.from('public_pair_standings_read').select('partnership_id,player1_user_id,player2_user_id,player1_name,player2_name,player1_avatar_url,player2_avatar_url,combined_points,position',{count:'exact'})
    .eq('club_id',context.clubId).eq('season_id',context.seasonId).eq('division_id',context.divisionId)
  const search=query.trim().slice(0,80).replace(/[%_,().]/g,' ')
  if (search) request.or(`player1_name.ilike.%${search}%,player2_name.ilike.%${search}%`)
  const result=await request.order('position').order('partnership_id').range((pageNumber(String(page))-1)*PAGE_SIZE,pageNumber(String(page))*PAGE_SIZE-1)
  assertRead(result.error)
  return {rows:(result.data ?? []).map(row=>({...row,player1_points:row.combined_points,player2_points:row.combined_points,category:context.category,gender:context.gender})),count:result.count ?? 0}
}
