-- Vero — 0017 campaign submission time window
-- Optional daily time window within which submissions are accepted.
-- Both columns are stored as "HH:MM" text (IST) and are nullable —
-- null means no restriction (submittable any time of day).

alter table public.campaigns
  add column if not exists submission_window_start text,
  add column if not exists submission_window_end   text;
