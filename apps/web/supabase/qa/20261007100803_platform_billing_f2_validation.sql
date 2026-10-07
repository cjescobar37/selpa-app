-- DISPOSABLE DB ONLY. Requires the F2 migration and 3 existing auth users,
-- one of them platform_admin. No providers/cron/backfill; every fixture rolls back.
begin;
do $$
declare
  actor uuid; owner_user uuid; player_user uuid; club_a uuid:=gen_random_uuid(); club_b uuid:=gen_random_uuid();
  prefix text:='QA_F2_' || replace(gen_random_uuid()::text,'-','');
  plan_free uuid; plan_month uuid; plan_new uuid; plan_zero uuid; sub_a uuid; sub_b uuid;
  inv_a uuid; inv_b uuid; pay_a uuid; pay_b uuid; zero_invoice uuid; result jsonb; repeated jsonb;
  original jsonb; period_start date:=date_trunc('month',now() at time zone 'America/Argentina/Buenos_Aires')::date;
  period_end date; v_revision bigint; base jsonb; key_a text;
begin
  select user_id into actor from public.platform_admins limit 1;
  select id into owner_user from auth.users where id<>actor and not exists(select 1 from public.platform_admins where user_id=id) limit 1;
  select id into player_user from auth.users where id<>actor and id<>owner_user and not exists(select 1 from public.platform_admins where user_id=id) limit 1;
  if actor is null or owner_user is null or player_user is null then raise exception 'QA_F2_FIXTURE_USERS_REQUIRED'; end if;
  insert into public.clubs(id,name,slug) values(club_a,prefix || ' A',lower(prefix)||'-a'),(club_b,prefix || ' B',lower(prefix)||'-b');
  insert into public.club_memberships(club_id,user_id,role,status,approved_at)
    values(club_a,owner_user,'OWNER','APPROVED',now()),(club_a,player_user,'PLAYER','APPROVED',now());
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  begin
    perform public.execute_platform_billing_f2('SAVE_PLAN',prefix||'_nan',jsonb_build_object('code',prefix||'_B','name','QA invalid','billing_interval','MONTHLY','price','NaN'));
    raise exception 'QA_F2_FINITE_MONEY_FAILED';
  exception when check_violation then null; end;
  result:=public.execute_platform_billing_f2('SAVE_PLAN',prefix||'_free',jsonb_build_object('code',prefix||'_F','name','QA Free','billing_interval','FREE','price',0));
  plan_free:=(result->>'id')::uuid;
  result:=public.execute_platform_billing_f2('SAVE_PLAN',prefix||'_month',jsonb_build_object('code',prefix||'_M','name','QA Mensual','billing_interval','MONTHLY','price',100));
  plan_month:=(result->>'id')::uuid;
  result:=public.execute_platform_billing_f2('SAVE_PLAN',prefix||'_new',jsonb_build_object('code',prefix||'_N','name','QA Anual','billing_interval','ANNUAL','price',1200));
  plan_new:=(result->>'id')::uuid;
  result:=public.execute_platform_billing_f2('SAVE_PLAN',prefix||'_zero',jsonb_build_object('code',prefix||'_Z','name','QA Mensual cero','billing_interval','MONTHLY','price',0));
  plan_zero:=(result->>'id')::uuid;
  result:=public.execute_platform_billing_f2('ASSIGN_PLAN',prefix||'_assign_a',jsonb_build_object('club_id',club_a,'plan_id',plan_month,'starts_on',period_start));
  sub_a:=(result->>'id')::uuid;
  begin
    perform public.execute_platform_billing_f2('ASSIGN_PLAN',prefix||'_duplicate_sub',jsonb_build_object('club_id',club_a,'plan_id',plan_month,'starts_on',period_start));
    raise exception 'QA_F2_ONE_SUBSCRIPTION_FAILED';
  exception when raise_exception then if sqlerrm <> 'BILLING_CURRENT_SUBSCRIPTION_EXISTS' then raise; end if; end;
  result:=public.execute_platform_billing_f2('ASSIGN_PLAN',prefix||'_assign_b',jsonb_build_object('club_id',club_b,'plan_id',plan_free,'starts_on',period_start));
  sub_b:=(result->>'id')::uuid;
  result:=public.execute_platform_billing_f2('GENERATE_PERIOD',prefix||'_free_period',jsonb_build_object('club_id',club_b,'id',sub_b,'period_start',period_start));
  if result->>'invoice_id' is not null or exists(select 1 from public.platform_billing_invoices where club_id=club_b) then raise exception 'QA_F2_FREE'; end if;

  key_a:=prefix||'_period_a';
  begin
    perform public.execute_platform_billing_f2('GENERATE_PERIOD',prefix||'_stale_price',jsonb_build_object('club_id',club_a,'id',sub_a,
      'period_start',period_start,'due_on',current_date,'expected_price',101));
    raise exception 'QA_F2_EXPECTED_PRICE_FAILED';
  exception when raise_exception then if sqlerrm<>'BILLING_REVISION_CONFLICT' then raise; end if; end;
  result:=public.execute_platform_billing_f2('GENERATE_PERIOD',key_a,jsonb_build_object('club_id',club_a,'id',sub_a,'period_start',period_start,'due_on',current_date-1));
  inv_a:=(result->>'invoice_id')::uuid;
  repeated:=public.execute_platform_billing_f2('GENERATE_PERIOD',key_a,jsonb_build_object('club_id',club_a,'id',sub_a,'period_start',period_start,'due_on',current_date-1));
  if repeated <> result then raise exception 'QA_F2_IDEMPOTENCY'; end if;
  repeated:=public.execute_platform_billing_f2('GENERATE_PERIOD',prefix||'_period_retry_key',jsonb_build_object('club_id',club_a,'id',sub_a,'period_start',period_start,'due_on',current_date-1));
  if repeated->>'invoice_id' <> inv_a::text or (select count(*) from public.platform_billing_invoices where subscription_id=sub_a) <> 1 then raise exception 'QA_F2_ONE_INVOICE'; end if;
  begin
    perform public.execute_platform_billing_f2('GENERATE_PERIOD',key_a,jsonb_build_object('club_id',club_a,'id',sub_a,'period_start',period_start,'due_on',current_date));
    raise exception 'QA_F2_IDEMPOTENCY_CONFLICT_FAILED';
  exception when raise_exception then if sqlerrm <> 'BILLING_IDEMPOTENCY_CONFLICT' then raise; end if; end;
  if (select financial_status from public.platform_billing_invoice_projection_f2 where id=inv_a) <> 'OVERDUE' or
     (select financial_status from public.platform_billing_subscription_projection_f2 where id=sub_a) <> 'PAST_DUE' then raise exception 'QA_F2_OVERDUE_PAST_DUE'; end if;
  select to_jsonb(i) into original from public.platform_billing_invoices i where id=inv_a;
  select s.current_period_end,s.revision into period_end,v_revision from public.platform_billing_subscriptions s where id=sub_a;
  perform public.execute_platform_billing_f2('CHANGE_PLAN',prefix||'_change',jsonb_build_object('club_id',club_a,'id',sub_a,'plan_id',plan_new,'revision',v_revision));
  if (select plan_id from public.platform_billing_subscriptions where id=sub_a) <> plan_month or
     (select next_plan_id from public.platform_billing_subscriptions where id=sub_a) <> plan_new then raise exception 'QA_F2_NEXT_PLAN'; end if;
  result:=public.execute_platform_billing_f2('GENERATE_PERIOD',prefix||'_next_period',jsonb_build_object('club_id',club_a,'id',sub_a,'period_start',period_end,'due_on',current_date+30));
  inv_b:=(result->>'invoice_id')::uuid;
  if (select total from public.platform_billing_invoices where id=inv_b) <> 1200 or
     (select to_jsonb(i) from public.platform_billing_invoices i where id=inv_a) <> original then raise exception 'QA_F2_PLAN_SNAPSHOT'; end if;
  base:=public.get_platform_billing_overview_f2(club_a);
  result:=public.execute_platform_billing_f2('REGISTER_PAYMENT',prefix||'_partial',jsonb_build_object('club_id',club_a,'amount',20,'method','CASH','paid_at',now(),
    'allocations',jsonb_build_array(jsonb_build_object('invoice_id',inv_a,'amount',20))));
  pay_a:=(result->>'id')::uuid;
  if (select balance from public.platform_billing_invoice_projection_f2 where id=inv_a) <> 80 then raise exception 'QA_F2_PARTIAL'; end if;
  begin
    perform public.execute_platform_billing_f2('VOID_INVOICE',prefix||'_paid_void',jsonb_build_object('club_id',club_a,'id',inv_a,'reason','QA invalid paid void'));
    raise exception 'QA_F2_PAID_VOID_FAILED';
  exception when raise_exception then if sqlerrm <> 'BILLING_REVERSE_PAYMENTS_BEFORE_VOID' then raise; end if; end;
  begin
    perform public.execute_platform_billing_f2('REGISTER_PAYMENT',prefix||'_over',jsonb_build_object('club_id',club_a,'amount',81,'method','CASH','paid_at',now(),
      'allocations',jsonb_build_array(jsonb_build_object('invoice_id',inv_a,'amount',81))));
    raise exception 'QA_F2_OVER_ALLOCATION_FAILED';
  exception when raise_exception then if sqlerrm <> 'BILLING_OVER_ALLOCATION' then raise; end if; end;
  result:=public.execute_platform_billing_f2('REGISTER_PAYMENT',prefix||'_multi',jsonb_build_object('club_id',club_a,'amount',180,'method','BANK_TRANSFER','paid_at',now(),
    'allocations',jsonb_build_array(jsonb_build_object('invoice_id',inv_a,'amount',80),jsonb_build_object('invoice_id',inv_b,'amount',100))));
  pay_b:=(result->>'id')::uuid;
  if (select financial_status from public.platform_billing_invoice_projection_f2 where id=inv_a) <> 'PAID' or
     (select financial_status from public.platform_billing_invoice_projection_f2 where id=inv_b) <> 'PARTIAL' or
     (select count(*) from public.platform_billing_allocations where payment_id=pay_b) <> 2 then raise exception 'QA_F2_FULL_MULTI'; end if;
  perform public.execute_platform_billing_f2('REVERSE_PAYMENT',prefix||'_reverse_b',jsonb_build_object('club_id',club_a,'id',pay_b,'reason','QA reverse multi'));
  perform public.execute_platform_billing_f2('REVERSE_PAYMENT',prefix||'_reverse_a',jsonb_build_object('club_id',club_a,'id',pay_a,'reason','QA reverse partial'));
  if (select balance from public.platform_billing_invoice_projection_f2 where id=inv_a)<>100 or
     (public.get_platform_billing_overview_f2(club_a)->>'received')::numeric <> (base->>'received')::numeric then raise exception 'QA_F2_REVERSAL'; end if;
  perform public.execute_platform_billing_f2('VOID_INVOICE',prefix||'_void',jsonb_build_object('club_id',club_a,'id',inv_a,'reason','QA void'));
  if (select balance from public.platform_billing_invoice_projection_f2 where id=inv_a)<>0 or
     (select financial_status from public.platform_billing_subscription_projection_f2 where id=sub_a)<>'ACTIVE' then raise exception 'QA_F2_VOID'; end if;
  select s.revision into v_revision from public.platform_billing_subscriptions s where id=sub_a;
  perform public.execute_platform_billing_f2('SUSPEND',prefix||'_suspend',jsonb_build_object('club_id',club_a,'id',sub_a,'revision',v_revision));
  if (select status from public.platform_billing_subscriptions where id=sub_a)<>'SUSPENDED' then raise exception 'QA_F2_SUSPEND'; end if;
  begin
    perform public.execute_platform_billing_f2('GENERATE_PERIOD',prefix||'_suspended_period',jsonb_build_object('club_id',club_a,'id',sub_a,
      'period_start',(select current_period_end from public.platform_billing_subscriptions where id=sub_a),'due_on',current_date));
    raise exception 'QA_F2_SUSPENDED_GENERATION_FAILED';
  exception when raise_exception then if sqlerrm<>'BILLING_SUBSCRIPTION_SUSPENDED' then raise; end if; end;
  select s.revision into v_revision from public.platform_billing_subscriptions s where id=sub_a;
  perform public.execute_platform_billing_f2('REACTIVATE',prefix||'_reactivate',jsonb_build_object('club_id',club_a,'id',sub_a,'revision',v_revision));
  if (select status from public.platform_billing_subscriptions where id=sub_a)<>'ACTIVE' then raise exception 'QA_F2_REACTIVATE'; end if;

  -- A paid billing interval may have a zero commercial price; issue one $0 invoice, no ledger revenue.
  select s.revision,s.current_period_end into v_revision,period_end from public.platform_billing_subscriptions s where id=sub_b;
  perform public.execute_platform_billing_f2('CHANGE_PLAN',prefix||'_zero_change',jsonb_build_object('club_id',club_b,'id',sub_b,'plan_id',plan_zero,'revision',v_revision));
  result:=public.execute_platform_billing_f2('GENERATE_PERIOD',prefix||'_zero_period',jsonb_build_object('club_id',club_b,'id',sub_b,'period_start',period_end,'due_on',current_date));
  zero_invoice:=(result->>'invoice_id')::uuid;
  if zero_invoice is null or (select financial_status from public.platform_billing_invoice_projection_f2 where id=zero_invoice)<>'PAID' or
     exists(select 1 from public.platform_billing_journals where invoice_id=zero_invoice) then raise exception 'QA_F2_ZERO_INVOICE'; end if;

  -- Deferred checks must execute before rollback, not merely be queued.
  set constraints all immediate;
  if exists(select 1 from public.platform_billing_postings p join public.platform_billing_journals j on j.id=p.journal_id
      where j.club_id in (club_a,club_b) group by j.id having sum(p.amount)<>0 or count(*)<>2) then raise exception 'QA_F2_LEDGER'; end if;
  if exists(select 1 from public.platform_billing_journals where club_id in (club_a,club_b) and actor_id<>actor) then raise exception 'QA_F2_ACTOR'; end if;
  begin
    update public.platform_billing_journals set actor_id=owner_user where club_id=club_a;
    raise exception 'QA_F2_JOURNAL_IMMUTABLE_FAILED';
  exception when raise_exception then if sqlerrm<>'BILLING_IMMUTABLE' then raise; end if; end;
  begin
    update public.platform_billing_payments set amount=1 where id=pay_a;
    raise exception 'QA_F2_PAYMENT_IMMUTABLE_FAILED';
  exception when raise_exception then if sqlerrm<>'BILLING_PAYMENT_IMMUTABLE' then raise; end if; end;
  begin
    update public.platform_billing_invoices set total=1 where id=inv_b;
    raise exception 'QA_F2_INVOICE_IMMUTABLE_FAILED';
  exception when raise_exception then if sqlerrm<>'BILLING_INVOICE_ECONOMICS_IMMUTABLE' then raise; end if; end;
  begin
    update public.platform_billing_commands set payload='{}' where actor_id=actor and idempotency_key=key_a;
    raise exception 'QA_F2_COMMAND_IMMUTABLE_FAILED';
  exception when raise_exception then if sqlerrm<>'BILLING_COMMAND_IMMUTABLE' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',owner_user::text,true);
  perform public.get_platform_billing_overview_f2(club_a);
  perform public.list_platform_billing_f2('invoices',club_a);
  begin perform public.get_platform_billing_overview_f2(club_b);raise exception 'QA_F2_CROSS_CLUB';exception when insufficient_privilege then null;end;
  begin perform public.get_platform_billing_overview_f2();raise exception 'QA_F2_CLUB_PLATFORM_SUMMARY';exception when insufficient_privilege then null;end;
  begin perform public.list_platform_billing_f2('plans',club_a);raise exception 'QA_F2_CLUB_CATALOGUE';exception when insufficient_privilege then null;end;
  begin perform public.execute_platform_billing_f2('SUSPEND',prefix||'_club_write','{}');raise exception 'QA_F2_CLUB_WRITE';exception when insufficient_privilege then null;end;
  -- Exercise grants as actual Data API roles, not only auth.uid() under postgres.
  execute 'set local role authenticated';
  perform public.get_platform_billing_overview_f2(club_a);
  begin
    insert into public.platform_billing_payments(club_id,amount,method,paid_at,status,created_by) values(club_a,1,'CASH',now(),'POSTED',owner_user);
    raise exception 'QA_F2_AUTHENTICATED_DIRECT_WRITE';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  update public.club_memberships set role='ADMIN' where club_id=club_a and user_id=owner_user;
  perform public.get_platform_billing_overview_f2(club_a);
  update public.club_memberships set role='PLANILLERO' where club_id=club_a and user_id=owner_user;
  begin perform public.get_platform_billing_overview_f2(club_a);raise exception 'QA_F2_PLANILLERO';exception when insufficient_privilege then null;end;
  update public.club_memberships set role='OWNER' where club_id=club_a and user_id=owner_user;
  perform set_config('request.jwt.claim.sub',player_user::text,true);
  begin perform public.get_platform_billing_overview_f2(club_a);raise exception 'QA_F2_PLAYER';exception when insufficient_privilege then null;end;
  perform set_config('request.jwt.claim.sub','',true);
  begin perform public.get_platform_billing_overview_f2(club_a);raise exception 'QA_F2_ANON';exception when insufficient_privilege then null;end;
    if has_function_privilege('anon','public.execute_platform_billing_f2(text,text,jsonb)','EXECUTE') or
       has_function_privilege('service_role','public.execute_platform_billing_f2(text,text,jsonb)','EXECUTE') or
       not has_function_privilege('authenticated','public.execute_platform_billing_f2(text,text,jsonb)','EXECUTE') then raise exception 'QA_F2_ACL'; end if;
  if exists(select 1 from pg_class c join pg_namespace ns on ns.oid=c.relnamespace where ns.nspname='public'
    and c.relname like 'platform_billing_%' and c.relkind='r' and (not c.relrowsecurity or
      has_table_privilege('authenticated',c.oid,'INSERT') or has_table_privilege('service_role',c.oid,'UPDATE'))) then raise exception 'QA_F2_DIRECT_WRITES_RLS'; end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  execute 'set local role service_role';
  begin perform public.execute_platform_billing_f2('SUSPEND',prefix||'_service_write','{}');raise exception 'QA_F2_SERVICE_RPC';exception when insufficient_privilege then null;end;
  execute 'reset role';
  execute 'set local role authenticated';
  perform public.list_platform_billing_f2('history',club_a);
  execute 'reset role';
  raise notice 'QA_F2_PASS: FREE/monthly/annual/$0; idempotency; snapshots; partial/full/multi/reverse/void; ledger; ACL/roles; immutable';
end $$;
rollback;
