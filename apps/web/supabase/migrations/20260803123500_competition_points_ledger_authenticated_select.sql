begin;

do $$
begin
  if to_regclass('public.competition_point_transactions') is null then
    raise exception 'Competition Points Ledger Stage 4 debe estar aplicado.';
  end if;
end
$$;

grant select on table public.competition_point_transactions to authenticated;

revoke all on table public.competition_point_transactions from public, anon;

commit;
