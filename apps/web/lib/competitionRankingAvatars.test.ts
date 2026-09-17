import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
const { enrichCompetitionRankingAvatars }=await import(new URL('../features/competition/ranking/competition-ranking.avatars.ts',import.meta.url).href)
test('one unique profiles batch enriches individuals and both pair players',async()=>{
  let calls=0
  const client={from:(table:string)=>{assert.equal(table,'profiles');return {select:()=>({in:async(key:string,ids:string[])=>{calls++;assert.equal(key,'user_id');assert.deepEqual(ids,['a','b']);return {data:[{user_id:'a',avatar_url:' https://example.test/avatar.png '},{user_id:'b',avatar_url:null}],error:null}}})}}} as unknown as SupabaseClient
  const result=await enrichCompetitionRankingAvatars(client,[{player_id:'a',avatar_url:null},{player_id:'b',avatar_url:''}],[{player1_user_id:'a',player2_user_id:'b'}])
  assert.equal(calls,1)
  assert.equal(result.individual[0].avatar_url,'https://example.test/avatar.png')
  assert.equal(result.individual[1].avatar_url,null)
  assert.equal(result.pairs[0].player1_avatar_url,result.individual[0].avatar_url)
})
test('empty rankings do not query profiles',async()=>{
  const result=await enrichCompetitionRankingAvatars({} as SupabaseClient,[],[])
  assert.deepEqual(result,{individual:[],pairs:[]})
})
