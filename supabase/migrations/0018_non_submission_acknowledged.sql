-- Vero — 0018 non-submission acknowledgement
-- Lets admins mark a "can't do it" reason as reviewed.
-- false = pending admin review, true = admin accepted the reason.

alter table public.tasks
  add column non_submission_acknowledged boolean not null default false;
