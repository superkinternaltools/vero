-- Vero — 0034 contest AI headlines
-- One AI-written headline + 2-line summary per campaign + month, cached so
-- the report doesn't call OpenAI on every view. Regenerated only when
-- data_fingerprint no longer matches the month's current numbers (see
-- headline.ts) — not user-scoped, since it's a shared read for anyone
-- viewing that campaign/month, not personal chat history.

create table public.contest_ai_headlines (
  id               uuid primary key default gen_random_uuid(),
  campaign_key     text not null,
  month            date not null,
  headline         text not null,
  summary          text not null,
  data_fingerprint text not null,
  created_at       timestamptz not null default now(),
  unique (campaign_key, month)
);

create index contest_ai_headlines_lookup_idx
  on public.contest_ai_headlines (campaign_key, month);

alter table public.contest_ai_headlines enable row level security;

create policy "authenticated read ai headlines" on public.contest_ai_headlines
  for select to authenticated using (true);

create policy "authenticated insert ai headlines" on public.contest_ai_headlines
  for insert to authenticated with check (true);

create policy "authenticated update ai headlines" on public.contest_ai_headlines
  for update to authenticated using (true);
