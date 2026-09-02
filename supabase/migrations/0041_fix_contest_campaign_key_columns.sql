-- Vero — 0041 fix contest campaign key columns
-- 0040's campaign_key columns came back all-null on every row after running
-- it — impossible for a working "generated always as (...) stored" column
-- against rows that all have a real raw_campaign_name, so it must have been
-- created as a plain (non-generated) column instead. Dropping and
-- recreating it explicitly here is safe either way: it's a derived column,
-- no source data involved, and this is idempotent regardless of whatever
-- state it's currently in.

alter table public.contest_campaign_rows drop column if exists campaign_key;
drop index if exists contest_campaign_rows_key_month_idx;
alter table public.contest_campaign_rows
  add column campaign_key text generated always as (lower(regexp_replace(btrim(raw_campaign_name), '\s+', ' ', 'g'))) stored;
create index contest_campaign_rows_key_month_idx on public.contest_campaign_rows (campaign_key, month);

alter table public.contest_inventory_rows drop column if exists campaign_key;
drop index if exists contest_inventory_rows_key_month_idx;
alter table public.contest_inventory_rows
  add column campaign_key text generated always as (lower(regexp_replace(btrim(raw_campaign_name), '\s+', ' ', 'g'))) stored;
create index contest_inventory_rows_key_month_idx on public.contest_inventory_rows (campaign_key, month);

alter table public.contest_sell_side_rows drop column if exists campaign_key;
drop index if exists contest_sell_side_rows_key_month_idx;
alter table public.contest_sell_side_rows
  add column campaign_key text generated always as (lower(regexp_replace(btrim(raw_campaign_name), '\s+', ' ', 'g'))) stored;
create index contest_sell_side_rows_key_month_idx on public.contest_sell_side_rows (campaign_key, month);
