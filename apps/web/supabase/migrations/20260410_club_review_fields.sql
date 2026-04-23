alter table public.clubs
  add column if not exists approved_at timestamp with time zone,
  add column if not exists approved_by uuid,
  add column if not exists rejected_at timestamp with time zone,
  add column if not exists rejected_by uuid,
  add column if not exists rejection_reason text,
  add column if not exists correction_requested_at timestamp with time zone,
  add column if not exists correction_requested_by uuid,
  add column if not exists correction_reason text,
  add column if not exists suspended_at timestamp with time zone,
  add column if not exists suspended_by uuid,
  add column if not exists suspension_reason text;
