-- Ejecutar completo en Supabase SQL Editor. No persiste datos.
begin;

create or replace function pg_temp.run_club_finance_qa()
returns table(qa_status text, qa_detail text)
language plpgsql
as $$
declare
  v_owner uuid;
  v_club uuid;
  v_other_club uuid;
  v_income uuid;
  v_expense uuid;
  v_receivable uuid;
  v_payment uuid;
  v_closure uuid;
  v_today date := current_date;
  v_first date := date_trunc('month', current_date)::date;
  v_last date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
  v_count integer;
begin
  select membership.user_id, membership.club_id
    into v_owner, v_club
  from public.club_memberships membership
  where membership.role = 'OWNER'
    and membership.status = 'APPROVED'
    and membership.approved_at is not null
  order by membership.created_at
  limit 1;

  if v_owner is null then
    return query select 'FAIL', 'QA no ejecutable: falta OWNER aprobado';
    return;
  end if;

  select club.id into v_other_club
  from public.clubs club
  where club.id <> v_club
    and not exists (
      select 1 from public.club_memberships membership
      where membership.club_id = club.id and membership.user_id = v_owner
        and membership.status = 'APPROVED' and membership.approved_at is not null
    )
  limit 1;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  if not public.has_club_capability(v_club, 'finance:manage') then
    return query select 'FAIL', 'OWNER sin finance:manage';
    return;
  end if;
  if v_other_club is not null and public.has_club_capability(v_other_club, 'finance:view') then
    return query select 'FAIL', 'Aislamiento cross-club inválido';
    return;
  end if;

  v_income := public.create_club_financial_transaction(
    v_club, 'INCOME', 'QA ingreso', 'QA', 10000, 'CASH', now(), 'QA rollback', null
  );
  v_expense := public.create_club_expense(
    v_club, 'QA gasto', 'Otros', 2500, 'BANK_TRANSFER', now(), 'QA proveedor', 'QA rollback', null
  );
  v_receivable := public.create_club_receivable(
    v_club, 'QA deudor', 'QA cuota', 6000, v_today + 10, null, 'QA', null, null, null, null, 'QA rollback'
  );
  v_payment := public.record_club_receivable_payment(v_club, v_receivable, 2000, 'CASH', now(), 'QA parcial');

  if (select receivable.status <> 'PARTIAL' or receivable.paid_amount <> 2000
      from public.club_receivables receivable where receivable.id = v_receivable) then
    return query select 'FAIL', 'Pago parcial no actualizó el cobro';
    return;
  end if;

  perform public.record_club_receivable_payment(v_club, v_receivable, 4000, 'CARD', now(), 'QA total');
  if (select receivable.status <> 'PAID' or receivable.paid_amount <> 6000
      from public.club_receivables receivable where receivable.id = v_receivable) then
    return query select 'FAIL', 'Pago total no cerró el cobro';
    return;
  end if;

  perform public.void_club_financial_transaction(v_club, v_income, 'QA anulación');
  if (select tx.status <> 'VOIDED' from public.club_financial_transactions tx where tx.id = v_income) then
    return query select 'FAIL', 'Anulación no preservó estado VOIDED';
    return;
  end if;

  v_closure := public.close_club_financial_period(v_club, v_first, v_last, 'QA cierre');
  begin
    perform public.create_club_financial_transaction(
      v_club, 'INCOME', 'QA bloqueado', 'QA', 1, 'CASH', now(), null, null
    );
    return query select 'FAIL', 'Período cerrado aceptó un movimiento';
    return;
  exception when others then
    if sqlerrm not like '%FINANCE_PERIOD_CLOSED%' then raise; end if;
  end;

  perform public.reopen_club_financial_period(v_club, v_closure, 'QA reapertura');
  perform public.create_club_financial_transaction(
    v_club, 'ADJUSTMENT', 'QA ajuste', 'QA', 100, 'OTHER', now(), null, null
  );

  select count(*) into v_count
  from public.club_financial_audit_log audit
  where audit.club_id = v_club
    and audit.entity_id in (v_income, v_receivable, v_closure);
  if v_count < 5 then
    return query select 'FAIL', 'Auditoría financiera incompleta';
    return;
  end if;

  return query select 'PASS', 'Finanzas válidas: ingreso, gasto, cobro parcial/total, anulación, cierre, reapertura, auditoría y aislamiento';
exception when others then
  return query select 'FAIL', sqlerrm;
end;
$$;

select qa_status || ' | ' || qa_detail as result
from pg_temp.run_club_finance_qa();

rollback;
