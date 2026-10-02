-- F1B: new registration confirmations produce one canonical club obligation.
-- Existing CONFIRMED registrations are intentionally not backfilled.
begin;

create index club_finance_obligation_tournament_f1b_idx
  on public.club_finance_obligations(club_id, tournament_id, registration_id)
  where source_type = 'TOURNAMENT_REGISTRATION';

-- A service-role request has no auth.uid(). Only the server-only transition
-- RPC may supply its authenticated human actor; direct writes fail closed.
create function public.club_finance_registration_actor_f1b(p_club_id uuid)
returns uuid language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := coalesce(
    auth.uid(), nullif(current_setting('selpa.f1b_actor_id', true), '')::uuid
  );
  v_capability text := case when auth.uid() is not null
    then 'registrations:manage'
    else coalesce(nullif(current_setting('selpa.f1b_capability', true), ''),
      'registrations:manage') end;
  v_role text;
begin
  if v_actor is null
     or (auth.uid() is not null and auth.uid() <> v_actor)
     or v_capability not in ('registrations:manage', 'payments:manage') then
    raise exception 'CLUB_FINANCE_ACTOR_FORBIDDEN' using errcode = '42501';
  end if;
  if exists (select 1 from public.platform_admins where user_id = v_actor) then
    return v_actor;
  end if;
  select m.role::text into v_role from public.club_memberships m
  where m.club_id = p_club_id and m.user_id = v_actor
    and m.status = 'APPROVED' and m.approved_at is not null;
  if v_role in ('OWNER', 'ADMIN')
     or (v_role = 'OPERADOR' and v_capability = 'registrations:manage') then
    return v_actor;
  end if;
  raise exception 'CLUB_FINANCE_ACTOR_FORBIDDEN' using errcode = '42501';
end;
$$;

revoke all on function public.club_finance_registration_actor_f1b(uuid)
  from public, anon, authenticated, service_role;

-- PostgREST executes this RPC in one transaction: status, obligation and
-- journal either all commit or all roll back. Frontend never supplies actor.
create function public.transition_tournament_registration_finance_f1b(
  p_club_id uuid, p_tournament_id uuid, p_registration_id uuid,
  p_status text, p_actor_id uuid, p_legacy_payment_id uuid default null
) returns public.tournament_registrations
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_registration public.tournament_registrations%rowtype;
  v_capability text := case when p_legacy_payment_id is null
    then 'registrations:manage' else 'payments:manage' end;
begin
  if p_status not in ('CONFIRMED', 'CANCELLED')
     or (p_legacy_payment_id is not null and p_status <> 'CONFIRMED') then
    raise exception 'CLUB_FINANCE_REGISTRATION_STATUS_INVALID' using errcode = '22023';
  end if;
  if auth.uid() is not null and auth.uid() <> p_actor_id then
    raise exception 'CLUB_FINANCE_ACTOR_FORBIDDEN' using errcode = '42501';
  end if;
  perform set_config('selpa.f1b_actor_id', coalesce(p_actor_id::text, ''), true);
  perform set_config('selpa.f1b_capability', v_capability, true);
  perform public.club_finance_registration_actor_f1b(p_club_id);
  if p_legacy_payment_id is not null and not exists (
    select 1 from public.tournament_payments p
    where p.id = p_legacy_payment_id and p.club_id = p_club_id
      and p.tournament_id = p_tournament_id
      and p.registration_id = p_registration_id and p.status = 'PENDING'
  ) then
    raise exception 'CLUB_FINANCE_LEGACY_REQUEST_INVALID' using errcode = '23514';
  end if;
  select * into v_registration from public.tournament_registrations r
  where r.id = p_registration_id and r.club_id = p_club_id
    and r.tournament_id = p_tournament_id for update;
  if not found then
    raise exception 'CLUB_FINANCE_REGISTRATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_registration.status::text = p_status then
    perform set_config('selpa.f1b_actor_id', '', true);
    perform set_config('selpa.f1b_capability', '', true);
    return v_registration;
  end if;
  if v_registration.status = 'CANCELLED' then
    raise exception 'CLUB_FINANCE_REGISTRATION_CANCELLED' using errcode = '23514';
  end if;
  update public.tournament_registrations
  set status = p_status::public.tournament_reg_status
  where id = p_registration_id and club_id = p_club_id
    and tournament_id = p_tournament_id returning * into v_registration;
  perform set_config('selpa.f1b_actor_id', '', true);
  perform set_config('selpa.f1b_capability', '', true);
  return v_registration;
end;
$$;

revoke all on function public.transition_tournament_registration_finance_f1b(
  uuid, uuid, uuid, text, uuid, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.transition_tournament_registration_finance_f1b(
  uuid, uuid, uuid, text, uuid, uuid
) to service_role;

create function public.sync_tournament_registration_finance_f1b()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_tournament public.tournaments%rowtype;
  v_team public.tournament_teams%rowtype;
  v_obligation public.club_finance_obligations%rowtype;
  v_amount numeric(14,2);
  v_journal_id uuid;
  v_actor uuid;
begin
  if tg_op = 'UPDATE' then
    if old.status = new.status then
      return new;
    end if;
  end if;
  if new.status not in ('CONFIRMED', 'CANCELLED') then
    return new;
  end if;

  -- A status transition locks the registration row. The source unique index
  -- remains the final protection against retries and competing writers.
  if new.status = 'CONFIRMED' then
    select * into v_tournament from public.tournaments
    where id = new.tournament_id and club_id = new.club_id for share;
    select * into v_team from public.tournament_teams
    where id = new.team_id and tournament_id = new.tournament_id
      and club_id = new.club_id for share;
    if v_tournament.id is null or v_team.id is null
       or v_team.player1_user_id is null or v_team.player2_user_id is null
       or v_team.player1_user_id = v_team.player2_user_id then
      raise exception 'CLUB_FINANCE_REGISTRATION_SCOPE_INVALID' using errcode = '23503';
    end if;
    if v_tournament.price_per_player is null
       or v_tournament.price_per_player < 0
       or v_tournament.price_per_player::text in ('NaN', 'Infinity', '-Infinity') then
      raise exception 'CLUB_FINANCE_TOURNAMENT_PRICE_INVALID' using errcode = '22023';
    end if;
    v_amount := v_tournament.price_per_player * 2;

    select * into v_obligation from public.club_finance_obligations
    where club_id = new.club_id and source_type = 'TOURNAMENT_REGISTRATION'
      and source_id = new.id for update;
    if v_amount = 0 and v_obligation.id is null then
      return new; -- An accepted free registration has NO_CHARGE.
    end if;
    v_actor := public.club_finance_registration_actor_f1b(new.club_id);
    if v_obligation.id is null then
      insert into public.club_finance_obligations(
        club_id, debtor_type, debtor_team_id, source_type, source_id,
        tournament_id, registration_id, team_id, concept, currency_code,
        original_amount, created_by, metadata
      ) values (
        new.club_id, 'TEAM', new.team_id, 'TOURNAMENT_REGISTRATION', new.id,
        new.tournament_id, new.id, new.team_id,
        left('Inscripción · ' || v_tournament.name, 180), 'ARS',
        v_amount, v_actor,
        jsonb_build_object('unit_price', v_tournament.price_per_player, 'players', 2)
      )
      on conflict (club_id, source_type, source_id) where source_id is not null
      do nothing returning * into v_obligation;
      if v_obligation.id is null then
        select * into v_obligation from public.club_finance_obligations
        where club_id = new.club_id and source_type = 'TOURNAMENT_REGISTRATION'
          and source_id = new.id for update;
      else
        insert into public.club_finance_journals(
          club_id, currency_code, event_type, obligation_id, actor_id
        ) values (
          new.club_id, 'ARS', 'OBLIGATION_CREATED', v_obligation.id, v_actor
        ) returning id into v_journal_id;
        insert into public.club_finance_postings(
          club_id, journal_id, currency_code, line_number, account, side, amount
        ) values
          (new.club_id, v_journal_id, 'ARS', 1, 'ACCOUNTS_RECEIVABLE', 'DEBIT', v_amount),
          (new.club_id, v_journal_id, 'ARS', 2, 'OBLIGATION_CLEARING', 'CREDIT', v_amount);
      end if;
    end if;
    if v_obligation.id is null
       or v_obligation.registration_id <> new.id
       or v_obligation.tournament_id <> new.tournament_id
       or v_obligation.team_id <> new.team_id
       or v_obligation.debtor_type <> 'TEAM'
       or v_obligation.debtor_team_id <> new.team_id
       or v_obligation.currency_code <> 'ARS'
       or v_obligation.original_amount <> v_amount
       or v_obligation.status <> 'OPEN' then
      raise exception 'CLUB_FINANCE_REGISTRATION_OBLIGATION_CONFLICT' using errcode = '23514';
    end if;
    return new;
  end if;

  -- CANCELLED is the only sporting rejection/withdrawal value in this enum.
  select * into v_obligation from public.club_finance_obligations
  where club_id = new.club_id and source_type = 'TOURNAMENT_REGISTRATION'
    and source_id = new.id for update;
  if v_obligation.id is null or v_obligation.status = 'CANCELLED' then
    return new;
  end if;
  v_actor := public.club_finance_registration_actor_f1b(new.club_id);
  if exists (
    select 1 from public.club_finance_allocations a
    join public.club_finance_payments p on p.club_id = a.club_id and p.id = a.payment_id
    where a.club_id = new.club_id and a.obligation_id = v_obligation.id
      and p.status = 'POSTED'
  ) then
    raise exception 'CLUB_FINANCE_REGISTRATION_REQUIRES_PAYMENT_RESOLUTION'
      using errcode = '23514';
  end if;
  perform set_config('selpa.club_finance_write', 'allowed', true);
  update public.club_finance_obligations
  set status = 'CANCELLED', revision = revision + 1,
      cancelled_by = v_actor,
      cancelled_at = now(), cancel_reason = 'Inscripción cancelada'
  where id = v_obligation.id and club_id = new.club_id and status = 'OPEN';
  insert into public.club_finance_journals(
    club_id, currency_code, event_type, obligation_id, actor_id, reason
  ) values (
    new.club_id, v_obligation.currency_code, 'OBLIGATION_CANCELLED',
    v_obligation.id, v_actor,
    'Inscripción cancelada'
  ) returning id into v_journal_id;
  insert into public.club_finance_postings(
    club_id, journal_id, currency_code, line_number, account, side, amount
  ) values
    (new.club_id, v_journal_id, v_obligation.currency_code, 1,
      'OBLIGATION_CLEARING', 'DEBIT', v_obligation.original_amount),
    (new.club_id, v_journal_id, v_obligation.currency_code, 2,
      'ACCOUNTS_RECEIVABLE', 'CREDIT', v_obligation.original_amount);
  return new;
end;
$$;

revoke all on function public.sync_tournament_registration_finance_f1b()
  from public, anon, authenticated, service_role;

create trigger tournament_registration_finance_f1b
after insert or update of status on public.tournament_registrations
for each row execute function public.sync_tournament_registration_finance_f1b();

-- One authorized batch call for the Club Admin list; F1A owns the projection.
create function public.get_tournament_registration_finance_f1b(
  p_club_id uuid, p_tournament_id uuid
) returns table(registration_id uuid, finance jsonb)
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.has_club_capability(p_club_id, 'finance:view') then
    raise exception 'CLUB_FINANCE_FORBIDDEN' using errcode = '42501';
  end if;
  return query
    select o.registration_id,
      public.club_finance_obligation_projection_internal(o.club_id, o.id)
    from public.club_finance_obligations o
    where o.club_id = p_club_id and o.tournament_id = p_tournament_id
      and o.source_type = 'TOURNAMENT_REGISTRATION'
      and o.registration_id is not null;
end;
$$;

revoke all on function public.get_tournament_registration_finance_f1b(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_tournament_registration_finance_f1b(uuid, uuid)
  to authenticated;

commit;
