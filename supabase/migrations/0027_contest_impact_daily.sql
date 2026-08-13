-- Vero — 0027 contest impact, daily + SKU-level
--
-- Moves the three contest sheets from weekly to daily grain, and takes
-- sell-side down to SKU level (inventory was already per-SKU, but matched on
-- name alone — it gains a sku_code so it joins reliably to campaign_skus).
--
-- WHY `date` IS ADDED ALONGSIDE `week` RATHER THAN REPLACING IT
-- Migrations run against the shared Supabase database, so this file affects
-- production the moment it runs — the `revamp` branch does not isolate it.
-- The Contest Impact page live on main filters `.eq("week", n)`, and Postgres
-- never matches NULL with `=`. So: new daily rows carry `date` and leave
-- `week` NULL, which makes them invisible to every existing production query.
-- Nothing on main changes behaviour. `week` gets dropped once the daily
-- report ships and main is cut over.
--
-- Existing rows are left untouched. They keep their `week` and have a NULL
-- `date`, so the new daily queries skip them. There is a cleanup statement at
-- the bottom, commented out, for when you want the old test rows gone.
--
-- NAMING: the this_month_/last_month_/last_year_ prefixes are kept for the new
-- units columns even though at daily grain they mean "this date", "same date
-- last month" and "same date last year". Twelve sibling columns already use
-- that convention and splitting it across one table would be worse than the
-- imprecision. The import layer is where the real meaning is documented.

-- ---------------------------------------------------------------- campaign rows
alter table public.contest_campaign_rows
  add column date date,
  alter column week drop not null,
  add constraint contest_campaign_rows_grain_ck
    check (week is not null or date is not null);

create index contest_campaign_rows_daily_idx
  on public.contest_campaign_rows (raw_campaign_name, date);

-- --------------------------------------------------------------- inventory rows
alter table public.contest_inventory_rows
  add column date date,
  add column sku_code text,
  alter column week drop not null,
  add constraint contest_inventory_rows_grain_ck
    check (week is not null or date is not null);

create index contest_inventory_rows_daily_idx
  on public.contest_inventory_rows (raw_campaign_name, date);
create index contest_inventory_rows_sku_idx
  on public.contest_inventory_rows (raw_campaign_name, sku_code, date);

-- --------------------------------------------------------------- sell side rows
-- units are new: they are what make days-of-cover, rate of sale, overstock and
-- phantom stock computable at all. Stock is counted in units and GMV in rupees,
-- so without a units column the two can never be divided into each other.
alter table public.contest_sell_side_rows
  add column date date,
  add column sku_code text,
  add column sku_name text,
  add column this_month_units numeric,
  add column last_month_units numeric,
  add column last_year_units numeric,
  alter column week drop not null,
  add constraint contest_sell_side_rows_grain_ck
    check (week is not null or date is not null);

create index contest_sell_side_rows_daily_idx
  on public.contest_sell_side_rows (raw_campaign_name, date);
create index contest_sell_side_rows_sku_idx
  on public.contest_sell_side_rows (raw_campaign_name, sku_code, date);

-- RLS needs no changes: the policies from 0024 are table-wide (read for all
-- authenticated, write for admins) and cover new columns automatically.

-- Optional — clears the old weekly test rows. Safe to run whenever; the daily
-- queries already ignore them because their `date` is NULL.
--   delete from public.contest_campaign_rows where date is null;
--   delete from public.contest_inventory_rows where date is null;
--   delete from public.contest_sell_side_rows where date is null;
--   delete from public.contest_data_batches
--     where id not in (
--       select batch_id from public.contest_campaign_rows
--       union select batch_id from public.contest_inventory_rows
--       union select batch_id from public.contest_sell_side_rows
--     );
