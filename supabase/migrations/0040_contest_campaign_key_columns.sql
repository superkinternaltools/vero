-- Vero — 0040 contest campaign key columns
-- "Which rows belong to this campaign" is decided by comparing a
-- case/whitespace-normalized version of raw_campaign_name (see
-- normalizeName() in src/modules/contest-impact/queries.ts). Until now that
-- comparison could only happen in JavaScript, which meant fetching the
-- raw_campaign_name column for EVERY row in a table just to find the ones
-- that match — for contest_inventory_rows alone that's 60,000+ rows scanned
-- on every single Contest Impact page load, and it only grows.
--
-- This adds a generated, indexed campaign_key column so Postgres can answer
-- "which rows belong to this campaign" directly with an index lookup,
-- instead of a full table scan. The generated expression must stay in sync
-- with normalizeName(): trim, collapse internal whitespace runs to a single
-- space, lowercase.

alter table public.contest_campaign_rows
  add column campaign_key text generated always as (lower(regexp_replace(btrim(raw_campaign_name), '\s+', ' ', 'g'))) stored;
create index contest_campaign_rows_key_month_idx on public.contest_campaign_rows (campaign_key, month);

alter table public.contest_inventory_rows
  add column campaign_key text generated always as (lower(regexp_replace(btrim(raw_campaign_name), '\s+', ' ', 'g'))) stored;
create index contest_inventory_rows_key_month_idx on public.contest_inventory_rows (campaign_key, month);

alter table public.contest_sell_side_rows
  add column campaign_key text generated always as (lower(regexp_replace(btrim(raw_campaign_name), '\s+', ' ', 'g'))) stored;
create index contest_sell_side_rows_key_month_idx on public.contest_sell_side_rows (campaign_key, month);
