begin;

do $$ begin
  if to_regclass('public.competition_branches') is null
     or to_regclass('public.competition_segments') is null
     or to_regclass('public.competition_categories') is null
     or to_regclass('public.competition_divisions') is null then
    raise exception 'Competition catalogs are required before catalog management.';
  end if;
end $$;

create or replace function public.manage_competition_catalog_entry(
  p_club_id uuid,
  p_catalog text,
  p_operation text,
  p_entry_id uuid default null,
  p_name text default null,
  p_slug text default null,
  p_short_label text default null,
  p_sort_order integer default 0,
  p_accent_kind text default 'DEFAULT'
)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  actor uuid:=auth.uid(); catalog text:=lower(btrim(coalesce(p_catalog,''))); operation text:=upper(btrim(coalesce(p_operation,'')));
  clean_name text:=nullif(btrim(coalesce(p_name,'')), ''); clean_slug text:=lower(nullif(btrim(coalesce(p_slug,'')),'')); clean_label text:=nullif(btrim(coalesce(p_short_label,'')), ''); entry jsonb;
begin
  if actor is null then raise exception 'Sesión inválida.' using errcode='28000'; end if;
  if not public.is_platform_admin() and not public.has_club_capability(p_club_id,'ranking:manage') then raise exception 'No tenés permisos para configurar el catálogo competitivo.' using errcode='42501'; end if;
  if catalog not in ('branch','segment','category') or operation not in ('CREATE','ACTIVATE','DEACTIVATE') then raise exception 'Operación de catálogo inválida.' using errcode='22023'; end if;
  if operation='CREATE' and (clean_name is null or clean_slug is null or (catalog='category' and clean_label is null)) then raise exception 'Completá nombre, clave y etiqueta cuando corresponda.' using errcode='22023'; end if;
  if operation <> 'CREATE' and p_entry_id is null then raise exception 'La entrada de catálogo es obligatoria.' using errcode='22023'; end if;
  if operation='DEACTIVATE' then
    if catalog='branch' and exists(select 1 from public.competition_divisions d where d.club_id=p_club_id and d.branch_id=p_entry_id and d.is_active) then raise exception 'No podés desactivar este género porque está en uso por divisiones activas.' using errcode='23514'; end if;
    if catalog='segment' and exists(select 1 from public.competition_divisions d where d.club_id=p_club_id and d.segment_id=p_entry_id and d.is_active) then raise exception 'No podés desactivar este grupo porque está en uso por divisiones activas.' using errcode='23514'; end if;
    if catalog='category' and exists(select 1 from public.competition_divisions d where d.club_id=p_club_id and d.category_id=p_entry_id and d.is_active) then raise exception 'No podés desactivar esta categoría porque está en uso por divisiones activas.' using errcode='23514'; end if;
  end if;
  if catalog='branch' then
    if operation='CREATE' then insert into public.competition_branches(club_id,name,slug,accent_kind,sort_order) values(p_club_id,clean_name,clean_slug,upper(coalesce(p_accent_kind,'DEFAULT')),p_sort_order) returning to_jsonb(competition_branches) into entry;
    else update public.competition_branches set is_active=(operation='ACTIVATE'),is_visible=(operation='ACTIVATE') where id=p_entry_id and club_id=p_club_id returning to_jsonb(competition_branches) into entry; end if;
  elsif catalog='segment' then
    if operation='CREATE' then insert into public.competition_segments(club_id,name,slug,sort_order) values(p_club_id,clean_name,clean_slug,p_sort_order) returning to_jsonb(competition_segments) into entry;
    else update public.competition_segments set is_active=(operation='ACTIVATE'),is_visible=(operation='ACTIVATE') where id=p_entry_id and club_id=p_club_id returning to_jsonb(competition_segments) into entry; end if;
  else
    if operation='CREATE' then insert into public.competition_categories(club_id,name,short_label,slug,sort_order) values(p_club_id,clean_name,clean_label,clean_slug,p_sort_order) returning to_jsonb(competition_categories) into entry;
    else update public.competition_categories set is_active=(operation='ACTIVATE'),is_visible=(operation='ACTIVATE') where id=p_entry_id and club_id=p_club_id returning to_jsonb(competition_categories) into entry; end if;
  end if;
  if entry is null then raise exception 'La entrada no pertenece al club.' using errcode='P0002'; end if;
  return entry;
end $$;

revoke all on function public.manage_competition_catalog_entry(uuid,text,text,uuid,text,text,text,integer,text) from public,anon;
grant execute on function public.manage_competition_catalog_entry(uuid,text,text,uuid,text,text,text,integer,text) to authenticated,service_role;
comment on function public.manage_competition_catalog_entry(uuid,text,text,uuid,text,text,text,integer,text) is 'Primitive acotada para crear o activar/desactivar géneros, grupos y categorías competitivas del propio club. Nunca muta divisiones ni elegibilidad.';
commit;
