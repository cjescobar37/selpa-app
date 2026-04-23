do $$
begin
  if not exists (select 1 from pg_type where typname = 'tournament_format') then
    create type public.tournament_format as enum (
      'GROUPS_ELIM',
      'GROUPS_ELIMINATION',
      'GROUPS',
      'ELIMINATION',
      'DIRECT_ELIM',
      'ZONE_PLAYOFF',
      'DIRECT_ELIMINATION',
      'ROUND_ROBIN',
      'AMERICANO'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'tournament_gender') then
    create type public.tournament_gender as enum ('MALE', 'FEMALE', 'MIXED');
  end if;

  if not exists (select 1 from pg_type where typname = 'tournament_category_rule') then
    create type public.tournament_category_rule as enum ('FIXED_CATEGORY', 'CATEGORY_SUM');
  end if;
end $$;

alter type public.tournament_format add value if not exists 'GROUPS_ELIM';
alter type public.tournament_format add value if not exists 'GROUPS_ELIMINATION';
alter type public.tournament_format add value if not exists 'GROUPS';
alter type public.tournament_format add value if not exists 'ELIMINATION';
alter type public.tournament_format add value if not exists 'DIRECT_ELIM';
alter type public.tournament_format add value if not exists 'ZONE_PLAYOFF';
alter type public.tournament_format add value if not exists 'DIRECT_ELIMINATION';
alter type public.tournament_format add value if not exists 'ROUND_ROBIN';
alter type public.tournament_format add value if not exists 'AMERICANO';

alter type public.tournament_category_rule add value if not exists 'FIXED_CATEGORY';
alter type public.tournament_category_rule add value if not exists 'CATEGORY_SUM';

create table if not exists public.points_schemes (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references public.clubs(id) on delete cascade,
  name text not null,
  description text,
  is_global boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint points_schemes_scope_chk check (is_global = true or club_id is not null),
  constraint points_schemes_name_chk check (length(btrim(name)) > 0)
);

create table if not exists public.points_scheme_rules (
  id uuid primary key default gen_random_uuid(),
  scheme_id uuid not null references public.points_schemes(id) on delete cascade,
  rule_key text not null,
  points integer not null default 0,
  created_at timestamp with time zone not null default now(),
  constraint points_scheme_rules_rule_key_chk check (length(btrim(rule_key)) > 0),
  constraint points_scheme_rules_points_chk check (points >= 0),
  constraint points_scheme_rules_scheme_rule_key_key unique (scheme_id, rule_key)
);

alter table public.tournaments
  add column if not exists category_rule public.tournament_category_rule not null default 'FIXED_CATEGORY',
  add column if not exists fixed_category_id smallint references public.categories(id),
  add column if not exists category_sum_target smallint,
  add column if not exists points_enabled boolean not null default false,
  add column if not exists points_scheme_id uuid references public.points_schemes(id) on delete set null,
  add column if not exists classification_rules jsonb not null default '{}'::jsonb,
  add column if not exists score_rules jsonb not null default '{}'::jsonb,
  add column if not exists schedule_rules jsonb not null default '{}'::jsonb;

update public.tournaments
set fixed_category_id = coalesce(fixed_category_id, category_id, category::smallint)
where fixed_category_id is null
  and coalesce(category_id, category::smallint) between 1 and 7;

update public.tournaments
set classification_rules = coalesce(nullif(classification_rules, '{}'::jsonb), '{
  "group_size_preference": 3,
  "allow_groups_of_4": true,
  "classify_per_group": 2,
  "allow_best_thirds": false,
  "best_thirds_count": 0,
  "tie_breakers": [
    "match_points",
    "match_difference",
    "set_difference",
    "game_difference",
    "head_to_head"
  ]
}'::jsonb)
where classification_rules = '{}'::jsonb;

update public.tournaments
set score_rules = coalesce(nullif(score_rules, '{}'::jsonb), '{
  "default": {
    "sets_to_win": 2,
    "set_tiebreak_at": "6-6",
    "deciding_set": "SUPER_TIEBREAK_10",
    "super_tiebreak_points": 10,
    "allow_walkover": true
  },
  "by_phase": {}
}'::jsonb)
where score_rules = '{}'::jsonb;

update public.tournaments
set schedule_rules = coalesce(nullif(schedule_rules, '{}'::jsonb), '{
  "team_availability_preferences": [
    "MORNING",
    "AFTERNOON",
    "NIGHT",
    "MORNING_AFTERNOON",
    "AFTERNOON_NIGHT"
  ],
  "scheduling_enabled": false
}'::jsonb)
where schedule_rules = '{}'::jsonb;

alter table public.tournaments
  drop constraint if exists tournaments_format_chk,
  add constraint tournaments_format_chk check (
    format = any (array[
      'GROUPS_ELIMINATION',
      'GROUPS_ELIM',
      'GROUPS',
      'ELIMINATION',
      'DIRECT_ELIM',
      'ZONE_PLAYOFF',
      'DIRECT_ELIMINATION',
      'ROUND_ROBIN',
      'AMERICANO'
    ]::text[])
  );

alter table public.tournaments
  drop constraint if exists tournaments_category_rule_chk,
  add constraint tournaments_category_rule_chk check (
    (category_rule = 'FIXED_CATEGORY' and fixed_category_id is not null and category_sum_target is null)
    or
    (category_rule = 'CATEGORY_SUM' and category_sum_target between 2 and 14)
  );

alter table public.tournaments
  drop constraint if exists tournaments_points_scheme_chk,
  add constraint tournaments_points_scheme_chk check (
    points_enabled = false or points_scheme_id is not null
  );

alter table public.tournaments
  drop constraint if exists tournaments_engine_json_chk,
  add constraint tournaments_engine_json_chk check (
    jsonb_typeof(classification_rules) = 'object'
    and jsonb_typeof(score_rules) = 'object'
    and jsonb_typeof(schedule_rules) = 'object'
  );

create index if not exists points_schemes_club_id_idx
  on public.points_schemes(club_id);

create index if not exists points_schemes_active_idx
  on public.points_schemes(is_active);

create index if not exists points_scheme_rules_scheme_id_idx
  on public.points_scheme_rules(scheme_id);

create index if not exists tournaments_category_rule_idx
  on public.tournaments(category_rule);

create index if not exists tournaments_points_scheme_id_idx
  on public.tournaments(points_scheme_id);

alter table public.points_schemes enable row level security;
alter table public.points_scheme_rules enable row level security;

drop policy if exists points_schemes_select_platform_or_club on public.points_schemes;
create policy points_schemes_select_platform_or_club
  on public.points_schemes
  for select
  to authenticated
  using (
    is_global = true
    or exists (
      select 1
      from public.club_memberships cm
      where cm.club_id = points_schemes.club_id
        and cm.user_id = auth.uid()
        and cm.status = 'APPROVED'
        and cm.approved_at is not null
    )
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  );

drop policy if exists points_scheme_rules_select_platform_or_club on public.points_scheme_rules;
create policy points_scheme_rules_select_platform_or_club
  on public.points_scheme_rules
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.points_schemes ps
      where ps.id = points_scheme_rules.scheme_id
        and (
          ps.is_global = true
          or exists (
            select 1
            from public.club_memberships cm
            where cm.club_id = ps.club_id
              and cm.user_id = auth.uid()
              and cm.status = 'APPROVED'
              and cm.approved_at is not null
          )
          or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
        )
    )
  );
