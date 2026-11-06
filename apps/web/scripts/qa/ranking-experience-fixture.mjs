/** Opt-in, local-only additions. Existing Block 1 fixtures and live data untouched. */
import {CLUB,SEASON,DIVISION,id} from './block1-fixture.mjs'

export async function addRankingExperienceFixture(db) {
  await db.query('update profiles set avatar_url=$1,cover_url=$2 where user_id=$3',['/mock/player.jpg','/mock/avatar.jpg',id(1006)])
  await db.query('insert into profiles(user_id,id,display_name,avatar_url,cover_url) values($1,$1,$2,$3,$4)',[id(90000),'Jugador sin club','/mock/player.jpg','/mock/avatar.jpg'])
  await db.query('update clubs set logo_url=$1 where id=$2',['/brand/selpa-isotipo.png',CLUB])
  await db.query('update profiles set avatar_url=$1 where user_id=$2',['/mock/avatar.jpg',id(1001)])
  await db.query('update profiles set avatar_url=$1 where user_id=$2',['/mock/player.jpg',id(1003)])
  await db.query('update profiles set avatar_url=$1 where user_id=$2',['/mock/qa-image-missing.jpg',id(1004)])
  await db.query('insert into competition_branches(id,club_id,slug) values($1,$2,$3)',[id(33),CLUB,'damas'])
  await db.query('insert into competition_categories(id,club_id,legacy_category_id,name) values($1,$2,$3,$4)',[id(47),CLUB,7,'7ª categoría'])
  for (const [division,category,branch] of [[24,41,33],[25,47,31]]) {
    await db.query('insert into competition_divisions(id,club_id,season_id,branch_id,category_id,modality,is_active) values($1,$2,$3,$4,$5,$6,true)',[id(division),CLUB,SEASON,id(branch),id(category),'INDIVIDUAL'])
  }
  for(let n=1;n<=3;n++) {
    await db.query('insert into profiles(user_id,id,display_name,avatar_url) values($1,$1,$2,$3)',[id(21000+n),n===1?'Victoria · apellido largo para prueba mobile':`Jugadora ${n}`,n===1?'/mock/player.jpg':null])
    await db.query('insert into club_players(id,club_id,user_id,category,gender,approved_at,ranking_points) values($1,$2,$3,6,$4,now(),999999)',[id(22000+n),CLUB,id(21000+n),'F'])
    await db.query('insert into club_memberships(id,club_id,user_id,role,status,approved_at) values($1,$2,$3,$4,$5,now())',[id(23000+n),CLUB,id(21000+n),'PLAYER','APPROVED'])
    await db.query('insert into competition_player_entries(id,club_id,club_player_id,division_id,status) values($1,$2,$3,$4,$5)',[id(24000+n),CLUB,id(22000+n),id(24),'ACTIVE'])
    await db.query('insert into competition_point_transactions(id,club_id,season_id,division_id,player_entry_id,club_player_id,points,metadata,source_concept) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id(25000+n),CLUB,SEASON,id(24),id(24000+n),id(22000+n),n===1?500:400,{},'OPENING_BALANCE'])
  }
  if(process.env.SELPA_QA_RANKING_V2==='true')await addPremiumRankingFixture(db)
  if(process.env.SELPA_QA_RANKING_V24==='true')await addRanking24Fixture(db)
}

/** Synthetic published awards, never a replacement for engine acceptance QA.
 * The production projection computes every displayed position/point itself. */
async function addPremiumRankingFixture(db) {
  await db.query('update clubs set name=$1 where id=$2',['Club QA · Ranking',CLUB])
  // Distinct synthetic identities and two deliberately long names for layout QA.
  // Never rewrite a real player's name or deduplicate actual people by name.
  for (const [userId,name] of [[id(1005),'Bruno Ferreyra'],[id(1006),'Alejandro Fernández de la Vega'],[id(1010),'Maximiliano Rodríguez de los Santos']]) {
    await db.query('update profiles set display_name=$1 where user_id=$2',[name,userId])
  }
  await db.query("update competition_branches set name=case slug when 'caballeros' then 'Caballeros' else 'Damas' end")
  await db.query('insert into competition_segments(id,club_id,name,is_active,is_visible) values($1,$2,$3,true,true)',[id(35),CLUB,'Libres'])
  await db.query('update competition_divisions set segment_id=$1 where id=$2',[id(35),id(21)])
  await db.query('insert into competition_divisions(id,club_id,season_id,branch_id,category_id,modality,is_active) values($1,$2,$3,$4,$5,$6,true)',[id(23),CLUB,SEASON,id(31),id(41),'PAIRS'])
  await db.query('insert into competition_branches(id,club_id,slug,name,sort_order) values($1,$2,$3,$4,30)',[id(34),CLUB,'mixto','Mixto'])
  for(const [division,mode,segment] of [[26,'PAIRS',id(35)],[27,'INDIVIDUAL',null]]) {
    await db.query('insert into competition_divisions(id,club_id,season_id,branch_id,category_id,modality,segment_id,is_active) values($1,$2,$3,$4,$5,$6,$7,true)',[id(division),CLUB,SEASON,id(34),id(41),mode,segment])
  }
  const numbers=Array.from({length:40},(_,n)=>n+1).filter(n=>![2,6,10,20].includes(n))
  async function pair(n,players,division=DIVISION,pairsDivision=id(21)) {
    const settlement=id(96000+n),team=id(96100+n),homologation=id(96200+n)
    await db.query('insert into competition_event_settlements(id,club_id,homologation_id,event_division_id,status) values($1,$2,$3,$4,$5)',[settlement,CLUB,homologation,id(99006),'PUBLISHED'])
    for(const [index,player] of players.entries()) {
      const participant=id(96300+n*2+index),award=id(96400+n*2+index)
      await db.query('insert into competition_event_homologation_participants(id,club_id,homologation_id,club_player_id,player_id,tournament_team_id) values($1,$2,$3,$4,$5,$6)',[participant,CLUB,homologation,player.clubPlayerId,player.userId,team])
      await db.query('insert into competition_event_settlement_awards(id,club_id,player_id,settlement_id,homologation_participant_id) values($1,$2,$3,$4,$5)',[award,CLUB,player.userId,settlement,participant])
      await db.query('insert into competition_point_transactions(id,club_id,season_id,division_id,player_entry_id,club_player_id,points,metadata,source_concept) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id(96500+n*2+index),CLUB,SEASON,division,player.entryId,player.clubPlayerId,(19-n)*100,{award_id:award,pairs_division_id:pairsDivision},'COMPETITION_EVENT_SETTLEMENT'])
    }
  }
  for(let n=0;n<18;n++)await pair(n,numbers.slice(n*2,n*2+2).map(value=>({userId:id(1000+value),clubPlayerId:id(2000+value),entryId:id(3000+value)})))
  const mixed=[{userId:id(1020),clubPlayerId:id(2020),entryId:id(97800)},{userId:id(21001),clubPlayerId:id(22001),entryId:id(97801)}]
  for(const player of mixed)await db.query('insert into competition_player_entries(id,club_id,club_player_id,division_id,status) values($1,$2,$3,$4,$5)',[player.entryId,CLUB,player.clubPlayerId,id(27),'ACTIVE'])
  await pair(18,mixed,id(27),id(26))
}

/** Ranking 2.4 layout/default QA, strictly opt-in and synthetic. */
async function addRanking24Fixture(db) {
  for(let category=1;category<=12;category++){
    if([6,7].includes(category))continue
    await db.query('insert into competition_categories(id,club_id,legacy_category_id,name) values($1,$2,$3,$4)',[id(60000+category),CLUB,category,category+'ª categoría'])
    for(const [mode,offset] of [['PAIRS',0],['INDIVIDUAL',20]])await db.query('insert into competition_divisions(id,club_id,season_id,branch_id,category_id,modality,segment_id,is_active) values($1,$2,$3,$4,$5,$6,$7,true)',[id(60100+category+offset),CLUB,SEASON,id(31),id(60000+category),mode,mode==='PAIRS'?id(35):null])
  }
  // The QA player has an unambiguous official Damas 7 / Parejas / Libres entry.
  await db.query('insert into competition_divisions(id,club_id,season_id,branch_id,category_id,modality,segment_id,is_active) values($1,$2,$3,$4,$5,$6,$7,true)',[id(60200),CLUB,SEASON,id(33),id(47),'PAIRS',id(35)])
  await db.query('insert into competition_player_entries(id,club_id,club_player_id,division_id,status) values($1,$2,$3,$4,$5)',[id(60300),CLUB,id(2006),id(60200),'ACTIVE'])
  await db.query('update club_players set gender=$1,category=7 where id=$2',['F',id(2006)])
}
