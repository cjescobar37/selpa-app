-- Preflight de solo lectura para 20260723_club_roles_stage1.sql.
-- Ejecutar completo en Supabase SQL Editor. No crea ni modifica objetos o datos.

-- 1. Valores actuales de public.club_role.
select
  enum_value.enumsortorder as sort_order,
  enum_value.enumlabel as role
from pg_catalog.pg_enum enum_value
join pg_catalog.pg_type enum_type on enum_type.oid = enum_value.enumtypid
join pg_catalog.pg_namespace namespace on namespace.oid = enum_type.typnamespace
where namespace.nspname = 'public'
  and enum_type.typname = 'club_role'
order by enum_value.enumsortorder;

-- 2. Cantidad de memberships por role.
select
  membership.role::text as role,
  count(*) as membership_count
from public.club_memberships membership
group by membership.role
order by membership.role::text;

-- 3. Detección de convivencia OPERATIVO/OPERADOR.
with role_presence as (
  select
    bool_or(enum_value.enumlabel = 'OPERATIVO') as has_operativo,
    bool_or(enum_value.enumlabel = 'OPERADOR') as has_operador
  from pg_catalog.pg_enum enum_value
  where enum_value.enumtypid = 'public.club_role'::regtype
)
select
  has_operativo,
  has_operador,
  has_operativo and has_operador as coexist,
  case
    when has_operativo and has_operador then 'BLOCK | OPERATIVO y OPERADOR coexisten'
    when has_operativo then 'PASS | la migración renombrará OPERATIVO a OPERADOR'
    when has_operador then 'PASS | OPERADOR ya está normalizado'
    else 'PASS | la migración agregará OPERADOR'
  end as diagnostic
from role_presence;

-- 4A. Columnas y defaults cuyo tipo es public.club_role.
select
  namespace.nspname as schema_name,
  relation.relname as relation_name,
  attribute.attname as column_name,
  pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) as data_type,
  pg_catalog.pg_get_expr(attribute_default.adbin, attribute_default.adrelid) as column_default
from pg_catalog.pg_attribute attribute
join pg_catalog.pg_class relation on relation.oid = attribute.attrelid
join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
left join pg_catalog.pg_attrdef attribute_default
  on attribute_default.adrelid = attribute.attrelid
 and attribute_default.adnum = attribute.attnum
where attribute.atttypid = 'public.club_role'::regtype
  and attribute.attnum > 0
  and not attribute.attisdropped
order by namespace.nspname, relation.relname, attribute.attnum;

-- 4B. Constraints que dependen directamente del enum o mencionan sus columnas/valores.
select distinct
  namespace.nspname as schema_name,
  relation.relname as relation_name,
  constraint_def.conname as constraint_name,
  constraint_def.contype as constraint_type,
  pg_catalog.pg_get_constraintdef(constraint_def.oid, true) as definition
from pg_catalog.pg_constraint constraint_def
join pg_catalog.pg_class relation on relation.oid = constraint_def.conrelid
join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
left join pg_catalog.pg_depend dependency
  on dependency.classid = 'pg_constraint'::regclass
 and dependency.objid = constraint_def.oid
where dependency.refobjid = 'public.club_role'::regtype
   or pg_catalog.pg_get_constraintdef(constraint_def.oid, true) ~* '(club_role|OPERATIVO|OPERADOR|PLANILLERO|PLAYER)'
order by schema_name, relation_name, constraint_name;

-- 4C. Funciones con argumentos/retorno club_role o dependencia catalogada del enum.
select distinct
  namespace.nspname as schema_name,
  procedure.proname as function_name,
  procedure.oid::regprocedure::text as signature,
  pg_catalog.pg_get_function_result(procedure.oid) as result_type,
  procedure.prosecdef as security_definer,
  procedure.proconfig as settings
from pg_catalog.pg_proc procedure
join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
left join pg_catalog.pg_depend dependency
  on dependency.classid = 'pg_proc'::regclass
 and dependency.objid = procedure.oid
where namespace.nspname = 'public'
  and (
    dependency.refobjid = 'public.club_role'::regtype
    or procedure.proargtypes::oid[] @> array['public.club_role'::regtype::oid]
    or procedure.prorettype = 'public.club_role'::regtype
  )
order by schema_name, function_name, signature;

-- 5A. Funciones que todavía contienen roles o comparaciones PLAYER.
with function_source as (
  select
    namespace.nspname as schema_name,
    procedure.proname as object_name,
    procedure.oid::regprocedure::text as signature,
    pg_catalog.pg_get_functiondef(procedure.oid) as definition
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.prokind in ('f', 'p')
)
select
  'FUNCTION' as object_type,
  schema_name,
  object_name,
  signature,
  array_remove(array[
    case when definition ~* '\mOPERATIVO\M' then 'OPERATIVO' end,
    case when definition ~* '\mOPERADOR\M' then 'OPERADOR' end,
    case when definition ~* '\mPLANILLERO\M' then 'PLANILLERO' end,
    case when definition ~* 'role\s*=\s*''PLAYER''' then 'role = PLAYER' end
  ], null) as matches,
  definition
from function_source
where definition ~* '(OPERATIVO|OPERADOR|PLANILLERO|role\s*=\s*''PLAYER'')'
order by schema_name, object_name, signature;

-- 5B. Policies que todavía contienen roles o comparaciones PLAYER.
select
  'POLICY' as object_type,
  policy.schemaname as schema_name,
  policy.tablename as relation_name,
  policy.policyname as object_name,
  array_remove(array[
    case when concat_ws(' ', policy.qual, policy.with_check) ~* '\mOPERATIVO\M' then 'OPERATIVO' end,
    case when concat_ws(' ', policy.qual, policy.with_check) ~* '\mOPERADOR\M' then 'OPERADOR' end,
    case when concat_ws(' ', policy.qual, policy.with_check) ~* '\mPLANILLERO\M' then 'PLANILLERO' end,
    case when concat_ws(' ', policy.qual, policy.with_check) ~* 'role\s*=\s*''PLAYER''' then 'role = PLAYER' end
  ], null) as matches,
  policy.qual,
  policy.with_check
from pg_catalog.pg_policies policy
where policy.schemaname = 'public'
  and concat_ws(' ', policy.qual, policy.with_check) ~* '(OPERATIVO|OPERADOR|PLANILLERO|role\s*=\s*''PLAYER'')'
order by policy.tablename, policy.policyname;

-- 5C. Vistas/materialized views que todavía contienen esos patrones.
select
  case relation.relkind when 'm' then 'MATERIALIZED VIEW' else 'VIEW' end as object_type,
  namespace.nspname as schema_name,
  relation.relname as object_name,
  array_remove(array[
    case when pg_catalog.pg_get_viewdef(relation.oid, true) ~* '\mOPERATIVO\M' then 'OPERATIVO' end,
    case when pg_catalog.pg_get_viewdef(relation.oid, true) ~* '\mOPERADOR\M' then 'OPERADOR' end,
    case when pg_catalog.pg_get_viewdef(relation.oid, true) ~* '\mPLANILLERO\M' then 'PLANILLERO' end,
    case when pg_catalog.pg_get_viewdef(relation.oid, true) ~* 'role\s*=\s*''PLAYER''' then 'role = PLAYER' end
  ], null) as matches,
  pg_catalog.pg_get_viewdef(relation.oid, true) as definition
from pg_catalog.pg_class relation
join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
where namespace.nspname = 'public'
  and relation.relkind in ('v', 'm')
  and pg_catalog.pg_get_viewdef(relation.oid, true) ~* '(OPERATIVO|OPERADOR|PLANILLERO|role\s*=\s*''PLAYER'')'
order by schema_name, object_name;

-- 6A. Columnas reales de public.club_players.
select
  column_info.ordinal_position,
  column_info.column_name,
  column_info.data_type,
  column_info.udt_schema,
  column_info.udt_name,
  column_info.is_nullable,
  column_info.column_default
from information_schema.columns column_info
where column_info.table_schema = 'public'
  and column_info.table_name = 'club_players'
order by column_info.ordinal_position;

-- 6B. Constraints de club_players.
select
  constraint_def.conname as constraint_name,
  constraint_def.contype as constraint_type,
  pg_catalog.pg_get_constraintdef(constraint_def.oid, true) as definition
from pg_catalog.pg_constraint constraint_def
where constraint_def.conrelid = 'public.club_players'::regclass
order by constraint_def.contype, constraint_def.conname;

-- 6C. Índices de club_players.
select
  index_info.indexname,
  index_info.indexdef
from pg_catalog.pg_indexes index_info
where index_info.schemaname = 'public'
  and index_info.tablename = 'club_players'
order by index_info.indexname;

-- 6D. Foreign keys de club_players con acciones referenciales.
select
  constraint_def.conname as foreign_key,
  pg_catalog.pg_get_constraintdef(constraint_def.oid, true) as definition,
  constraint_def.confdeltype as delete_action_code,
  constraint_def.confupdtype as update_action_code
from pg_catalog.pg_constraint constraint_def
where constraint_def.conrelid = 'public.club_players'::regclass
  and constraint_def.contype = 'f'
order by constraint_def.conname;

-- 6E/7. Señales disponibles de estado/aprobación y conclusión canónica actual.
with signals as (
  select
    bool_or(column_name = 'approved_at') as has_approved_at,
    bool_or(column_name = 'status') as has_status,
    bool_or(column_name in ('active', 'is_active')) as has_active,
    array_agg(column_name order by ordinal_position)
      filter (where column_name ~* '(status|state|active|approved|enabled|disabled)') as state_columns
  from information_schema.columns
  where table_schema = 'public' and table_name = 'club_players'
)
select
  has_approved_at,
  has_status,
  has_active,
  coalesce(state_columns, array[]::text[]) as state_or_approval_columns,
  case
    when has_approved_at and not has_status and not has_active
      then 'approved_at IS NOT NULL es la única señal deportiva explícita actual'
    when has_approved_at
      then 'REVIEW | approved_at coexiste con otra señal; revisar semántica antes de aplicar'
    else 'BLOCK | club_players no posee approved_at'
  end as canonical_signal_diagnostic
from signals;

-- 8. Integridad actual de club_players respecto de memberships.
select
  count(*) as total_club_players,
  count(*) filter (where membership.id is null) as without_membership,
  count(*) filter (
    where membership.id is not null
      and (membership.status::text <> 'APPROVED' or membership.approved_at is null)
  ) as with_non_approved_membership,
  count(*) filter (where player.approved_at is null) as player_approved_at_null
from public.club_players player
left join public.club_memberships membership
  on membership.club_id = player.club_id
 and membership.user_id = player.user_id;

select
  player.club_id,
  player.user_id,
  count(*) as duplicate_count
from public.club_players player
group by player.club_id, player.user_id
having count(*) > 1
order by duplicate_count desc, player.club_id, player.user_id;

-- 9. Veredicto automático de aplicabilidad. Cualquier fila BLOCK impide aplicar.
with facts as (
  select
    to_regtype('public.club_role') is not null as enum_exists,
    to_regclass('public.club_memberships') is not null as memberships_exists,
    to_regclass('public.club_players') is not null as players_exists,
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'club_players' and column_name = 'approved_at'
    ) as player_approved_at_exists,
    not exists (
      select 1 from pg_catalog.pg_proc
      where oid = to_regprocedure('public.is_club_player(uuid,uuid)')
        and prorettype <> 'pg_catalog.bool'::regtype
    ) as player_helper_signature_compatible,
    exists (
      select 1 from pg_catalog.pg_enum
      where enumtypid = 'public.club_role'::regtype and enumlabel = 'OPERATIVO'
    ) as has_operativo,
    exists (
      select 1 from pg_catalog.pg_enum
      where enumtypid = 'public.club_role'::regtype and enumlabel = 'OPERADOR'
    ) as has_operador,
    coalesce((
      select bool_and(required_role = any(enum_labels))
      from (
        select array_agg(enumlabel) as enum_labels
        from pg_catalog.pg_enum where enumtypid = 'public.club_role'::regtype
      ) labels
      cross join unnest(array['OWNER','ADMIN','PLANILLERO','PLAYER']) required_role
    ), false) as base_roles_exist
), checks as (
  select * from (values
    ('public.club_role existe', (select enum_exists from facts)),
    ('roles base OWNER/ADMIN/PLANILLERO/PLAYER existen', (select base_roles_exist from facts)),
    ('OPERATIVO y OPERADOR no coexisten', (select not (has_operativo and has_operador) from facts)),
    ('public.club_memberships existe', (select memberships_exists from facts)),
    ('public.club_players existe', (select players_exists from facts)),
    ('club_players.approved_at existe', (select player_approved_at_exists from facts)),
    ('is_club_player(uuid,uuid) ausente o con retorno boolean compatible', (select player_helper_signature_compatible from facts))
  ) as validation(check_name, passed)
)
select
  case when passed then 'PASS' else 'BLOCK' end as status,
  check_name
from checks
order by status desc, check_name;

with blocking_state as (
  select
    to_regtype('public.club_role') is null
    or to_regclass('public.club_memberships') is null
    or to_regclass('public.club_players') is null
    or not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'club_players' and column_name = 'approved_at'
    )
    or exists (
      select 1 from pg_catalog.pg_proc
      where oid = to_regprocedure('public.is_club_player(uuid,uuid)')
        and prorettype <> 'pg_catalog.bool'::regtype
    )
    or (
      exists (select 1 from pg_catalog.pg_enum where enumtypid = 'public.club_role'::regtype and enumlabel = 'OPERATIVO')
      and exists (select 1 from pg_catalog.pg_enum where enumtypid = 'public.club_role'::regtype and enumlabel = 'OPERADOR')
    )
    or exists (
      select 1
      from unnest(array['OWNER','ADMIN','PLANILLERO','PLAYER']) required_role
      where not exists (
        select 1 from pg_catalog.pg_enum
        where enumtypid = 'public.club_role'::regtype and enumlabel = required_role
      )
    ) as blocked
)
select case
  when blocked then 'BLOCK | no aplicar 20260723_club_roles_stage1.sql; revisar checks anteriores'
  else 'PASS | 20260723_club_roles_stage1.sql es compatible con el estado estructural detectado'
end as final_preflight
from blocking_state;
