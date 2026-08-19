-- Vero — 0027 contest status classification
-- Which raw Status strings count as "approved execution" is a per-campaign
-- judgment call (different campaigns use different status vocabularies), so
-- it's captured here rather than hardcoded. Any status with no row in this
-- table is "unclassified" — the report blocks and asks for a decision before
-- it will group stores, rather than silently guessing.

create table public.contest_status_classification (
  campaign_key text not null,
  raw_status text not null,
  is_approved boolean not null,
  updated_at timestamptz not null default now(),
  primary key (campaign_key, raw_status)
);

alter table public.contest_status_classification enable row level security;

create policy "read contest_status_classification" on public.contest_status_classification
  for select to authenticated using (true);

create policy "admin write contest_status_classification" on public.contest_status_classification
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
