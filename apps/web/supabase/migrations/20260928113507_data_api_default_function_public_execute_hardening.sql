begin;

-- PostgreSQL grants EXECUTE on newly created functions to PUBLIC by
-- built-in default. Schema-scoped default privileges cannot remove
-- that global default, so future postgres-owned functions must opt in.
alter default privileges for role postgres
revoke execute on functions
from public;

commit;
