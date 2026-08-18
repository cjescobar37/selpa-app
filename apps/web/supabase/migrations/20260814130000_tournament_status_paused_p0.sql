-- Stage P0: add the durable lifecycle value in its own migration.
-- PostgreSQL does not permit relying on a newly-added enum value in the same
-- transaction, so RPCs are installed in the subsequent migration.
alter type public.tournament_status add value if not exists 'PAUSED' after 'OPEN';
