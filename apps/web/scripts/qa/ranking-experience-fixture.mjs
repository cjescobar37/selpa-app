/** Opt-in, local-only additions. Existing Block 1 fixtures and live data untouched. */
import {CLUB,SEASON,id} from './block1-fixture.mjs'

export async function addRankingExperienceFixture(db) {
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
}
