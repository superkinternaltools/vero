-- Vero — 0013 store selected payout tier label on submissions
alter table public.submissions
  add column if not exists payout_tier_label text;
