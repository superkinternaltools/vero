-- Vero — 0012 tiered payout config per campaign
-- payout_tiers: [{min_score, max_score, pct}] — only used when payout_model = 'tiered'
alter table public.campaigns
  add column if not exists payout_tiers jsonb not null default '[]'::jsonb;
