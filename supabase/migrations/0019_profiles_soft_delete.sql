-- Soft-delete for profiles: active/inactive users are hidden (not erased) when
-- an admin removes them, since submissions.submitted_by has no ON DELETE rule
-- and a hard delete would fail for anyone who has ever submitted a photo.
-- Pending signups (never approved, no submissions) are still hard-deleted via
-- Supabase Auth admin API elsewhere in the app — this column doesn't apply to them.
alter table public.profiles add column deleted_at timestamptz;
