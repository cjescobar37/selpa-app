# Supabase migration security contract

SELPA uses a default-deny contract for new objects owned by `postgres` in the
`public` schema. Creating an object does not make it a Data API surface.

Every migration that creates a table, view, function, or sequence must classify
it before adding grants:

- `CLIENT REQUIRED`: enable RLS, add narrowly scoped policies, and grant only
  the operations required by `anon` or `authenticated`.
- `SERVER REQUIRED`: do not grant browser roles. Grant `service_role` only when
  server code accesses the object directly.
- `RPC REQUIRED`: revoke `PUBLIC` execution and grant `EXECUTE` only to the
  caller roles. A `SECURITY DEFINER` RPC must authorize its actor internally and
  set a safe `search_path`.
- `PUBLIC INTENTIONAL`: document why anonymous access is required and expose
  only the minimum DTO or operations.
- `TRIGGER / INTERNAL`: do not grant Data API execution.

RLS and grants are separate controls. Any client-accessible table must have both
the minimum table grants and RLS policies. Views exposed to clients must use
`security_invoker` where supported, or remain inaccessible to client roles.

## New migration checklist

1. State the object's classification in the migration comment.
2. For client tables, enable RLS before granting access.
3. Add explicit, least-privilege grants; never rely on defaults.
4. Revoke function execution from `PUBLIC` before granting an RPC role.
5. Keep trigger/internal helpers unavailable to Data API roles.
6. Grant sequence access only when a caller genuinely uses the sequence.
7. Add focal QA for ACL, RLS, policies, authorization, and `search_path`.
8. Run the SQL statically and `git diff --check` before live application.

For functions, revoke Data API roles in the exposed `public` schema and revoke
the global built-in `PUBLIC EXECUTE` default. Then grant `EXECUTE` explicitly
only to the roles required by each RPC contract.

The `supabase_admin` defaults are platform-managed and are intentionally not
changed by SELPA migrations without separate evidence and impact analysis.
