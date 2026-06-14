-- Vero — 0014 per-campaign date exclusions for daily schedules
alter table public.campaigns
  add column if not exists skip_dates date[] not null default '{}';
