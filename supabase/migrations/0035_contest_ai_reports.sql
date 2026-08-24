-- Vero — 0035 contest AI reports
-- The "Is it working?" report per campaign + month: a deterministically
-- computed verdict/trend/root-cause (see diagnosis.ts) plus an AI narrative
-- that only explains that verdict, never decides it. Cached the same way as
-- contest_ai_headlines — regenerated when data_fingerprint no longer matches.

create table public.contest_ai_reports (
  id               uuid primary key default gen_random_uuid(),
  campaign_key     text not null,
  month            date not null,
  verdict          text not null,
  trend            text,
  verdict_sentence text not null,
  mechanism        text not null,
  root_cause       text not null default '',
  data_fingerprint text not null,
  created_at       timestamptz not null default now(),
  unique (campaign_key, month)
);

create index contest_ai_reports_lookup_idx
  on public.contest_ai_reports (campaign_key, month);

alter table public.contest_ai_reports enable row level security;

create policy "authenticated read ai reports" on public.contest_ai_reports
  for select to authenticated using (true);

create policy "authenticated insert ai reports" on public.contest_ai_reports
  for insert to authenticated with check (true);

create policy "authenticated update ai reports" on public.contest_ai_reports
  for update to authenticated using (true);
