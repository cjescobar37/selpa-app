import 'server-only'
import { supabaseAdmin as db } from '@/lib/supabaseAdmin'
import { assertCareerAccess, CareerAccessError, type CareerAccess } from './player-career.access'
import { readCareerIdentity, readRankingContextPublished, readRankingBranches } from './player-career.repository'
import { choosePersonalRanking, type PersonalRankingDefault } from './ranking-default.rules'
import type { RankingContext } from './player-career.types'

async function rows<T>(query:PromiseLike<{data:unknown;error:unknown}>):Promise<T[]> {
  const result=await query
  if(result.error) throw new Error('RANKING_DEFAULT_UNAVAILABLE')
  return (result.data ?? []) as T[]
}
/** Self only, no caller-supplied identity, no roster/ledger/partner DTO. Each
 * private read is bounded to the verified player's approved selected club. */
export async function readPersonalRankingDefault(access:CareerAccess,clubId:string):Promise<PersonalRankingDefault> {
  if(access.kind!=='self')throw new CareerAccessError(403)
  assertCareerAccess(access,access.userId,clubId)
  const identity=await readCareerIdentity(access.userId,clubId,access)
  const club=identity?.contexts.find(c=>c.clubId===clubId)
  if(!identity || !club)return null
  const [entries,pairs]=await Promise.all([
    rows<{division_id:string}>(db.from('competition_player_entries').select('division_id').eq('club_id',clubId).eq('club_player_id',club.clubPlayerId).eq('status','ACTIVE').is('valid_until',null).limit(201)),
    rows<{division_id:string}>(db.from('competition_pair_standings_read').select('division_id').eq('club_id',clubId).or('player1_user_id.eq.'+access.userId+',player2_user_id.eq.'+access.userId).limit(201)),
  ])
  if(entries.length>200||pairs.length>200)return null
  const ids=[...new Set([...entries,...pairs].map(e=>e.division_id))]
  if(!ids.length)return null
  const divisions=await rows<{id:string;season_id:string;category_id:string|null;branch_id:string;segment_id:string|null;modality:string}>(db.from('competition_divisions').select('id,season_id,category_id,branch_id,segment_id,modality').eq('club_id',clubId).eq('is_active',true).in('id',ids))
  if(!divisions.length)return null
  const [seasons,categories,branches,segments]=await Promise.all([
    rows<{id:string;name:string}>(db.from('competition_seasons').select('id,name').eq('club_id',clubId).in('id',[...new Set(divisions.map(d=>d.season_id))]).in('status',['ACTIVE','CLOSED']).order('starts_on',{ascending:false}).order('id')),
    rows<{id:string;name:string;legacy_category_id:number|null}>(db.from('competition_categories').select('id,name,legacy_category_id').eq('club_id',clubId).eq('is_active',true).in('id',divisions.flatMap(d=>d.category_id?[d.category_id]:[]))),
    rows<{id:string;slug:string}>(db.from('competition_branches').select('id,slug').eq('club_id',clubId).eq('is_active',true).in('id',divisions.map(d=>d.branch_id))),
    divisions.some(d=>d.segment_id) ? rows<{id:string;name:string}>(db.from('competition_segments').select('id,name').eq('club_id',clubId).eq('is_active',true).in('id',divisions.flatMap(d=>d.segment_id?[d.segment_id]:[]))) : [],
  ])
  const contexts:RankingContext[]=divisions.flatMap(d=>{
    const season=seasons.find(s=>s.id===d.season_id),category=categories.find(c=>c.id===d.category_id),branch=branches.find(b=>b.id===d.branch_id),segment=segments.find(s=>s.id===d.segment_id)
    const gender=branch?.slug==='caballeros'?'M':branch?.slug==='damas'?'F':branch?.slug==='mixto'?'MIXED':null
    if(!season||!gender||(d.category_id&&!category)||(d.segment_id&&!segment)||!['PAIRS','INDIVIDUAL'].includes(d.modality))return []
    return [{clubId,seasonId:season.id,seasonName:season.name,divisionId:d.id,category:category?.legacy_category_id??null,categoryName:category?.name??'Sin categoría',gender,modality:d.modality,categoryId:d.category_id,segmentId:d.segment_id,segmentName:segment?.name??null}]
  })
  const context=choosePersonalRanking(contexts,pairs.map(p=>p.division_id),seasons.map(s=>s.id),club)
  if(!context)return null
  const published=await readRankingContextPublished(context) && (await readRankingBranches(clubId)).includes(context.gender as 'M'|'F'|'MIXED')
  return {context,published,club:{id:clubId,name:club.clubName,logo_url:club.clubLogoUrl??null,theme_key:club.clubThemeKey??null}}
}
