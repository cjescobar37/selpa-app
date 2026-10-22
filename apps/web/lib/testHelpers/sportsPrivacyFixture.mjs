/** Local-only additions to the existing synthetic PostgreSQL fixture. */
import {readFileSync} from 'node:fs'
import {id,CLUB,SEASON} from '../../scripts/qa/block1-fixture.mjs'
export async function addSportsPrivacyFixture(db){
  await db.exec(`
    alter table competition_seasons add column is_public boolean not null default true;
    alter table competition_divisions add column is_visible boolean not null default true;
    alter table competition_branches add column is_visible boolean not null default true;
    alter table competition_branches add column is_active boolean not null default true;
    alter table competition_categories add column is_visible boolean not null default true;
    alter table competition_categories add column is_active boolean not null default true;
    create table competition_segments(id uuid,club_id uuid,is_active boolean,is_visible boolean);
    create table competition_series(id uuid,club_id uuid,season_id uuid,is_public boolean,status text,archived_at timestamptz);
    create table competition_series_events(id uuid,club_id uuid,series_id uuid,season_id uuid,is_public boolean,status text,archived_at timestamptz);
    alter table competition_series_event_divisions add column event_id uuid;
    alter table competition_series_event_divisions add column status text default 'COMPLETED';
    alter table competition_series_event_divisions add column is_active boolean not null default true;
    alter table competition_series_event_divisions add column removed_at timestamptz;
  `)
  await db.query('insert into competition_series(id,club_id,season_id,is_public,status) values($1,$2,$3,true,$4)',[id(98001),CLUB,SEASON,'ACTIVE'])
  for(let n=1;n<=9;n++){
    await db.query('insert into competition_series_events(id,club_id,series_id,season_id,is_public,status) values($1,$2,$3,$4,true,$5)',[id(13000+n),CLUB,id(98001),SEASON,'COMPLETED'])
    await db.query('insert into competition_series_event_divisions(id,club_id,series_division_id,event_id,status) values($1,$2,$3,$4,$5)',[id(99000+n),CLUB,id(90),id(13000+n),'COMPLETED'])
    await db.query('update competition_event_homologations set event_division_id=$1 where event_id=$2',[id(99000+n),id(13000+n)])
  }
  await db.exec(readFileSync(new URL('../../supabase/migrations/20261022135243_public_sports_visibility_reads.sql',import.meta.url),'utf8'))
  await db.exec('grant select on all tables in schema public to service_role')
}
