-- SOLO LECTURA. Candidatos QA sin email, teléfono ni otros datos privados.
-- Es informativo: las suites QA ya realizan este descubrimiento automáticamente.
select m.club_id,c.name club_name,m.id membership_id,m.user_id,m.role,m.status,m.approved_at,
 coalesce(p.display_name,concat_ws(' ',p.first_name,p.last_name),'Usuario') display_name,cp.id club_player_id
from public.club_memberships m join public.clubs c on c.id=m.club_id
left join public.profiles p on p.user_id=m.user_id
left join public.club_players cp on cp.club_id=m.club_id and cp.user_id=m.user_id
order by c.name,m.role,m.status,display_name;

select club_id,role,status,count(*) candidates from public.club_memberships
group by club_id,role,status order by club_id,role,status;

with club_a as (
  select club_id from public.club_memberships where role='OWNER' and status='APPROVED' and approved_at is not null
  order by created_at limit 1
), requirements(label,role,status) as (values
  ('OWNER','OWNER'::public.club_role,'APPROVED'::public.membership_status),
  ('ADMIN','ADMIN'::public.club_role,'APPROVED'::public.membership_status),
  ('PLANILLERO','PLANILLERO'::public.club_role,'APPROVED'::public.membership_status),
  ('PLAYER','PLAYER'::public.club_role,'APPROVED'::public.membership_status),
  ('PENDING','PLAYER'::public.club_role,'PENDING'::public.membership_status),
  ('REJECTED','PLAYER'::public.club_role,'REJECTED'::public.membership_status),
  ('BANNED','PLAYER'::public.club_role,'BANNED'::public.membership_status)
)
select r.label,case when exists(select 1 from public.club_memberships m,club_a a
 where m.club_id=a.club_id and m.role=r.role and m.status=r.status
 and (r.status<>'APPROVED' or m.approved_at is not null)) then 'FOUND' else 'AUTO-CREATE IN QA' end qa_resolution
from requirements r;

select i.id invite_id,i.club_id,c.name club_name,i.role,i.status,i.target_user_id,i.created_at
from public.club_user_invites i join public.clubs c on c.id=i.club_id order by i.created_at desc limit 30;

select t.club_id,t.id tournament_id,t.name,
 (select r.id from public.tournament_registrations r where r.tournament_id=t.id limit 1) registration_id,
 (select m.id from public.tournament_matches m where m.tournament_id=t.id limit 1) match_id
from public.tournaments t order by coalesce(t.created_at,now()) desc limit 30;
