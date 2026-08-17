-- Vero — 0026 contest impact daily stock
-- The Inventory Data sheet carries a real date per row (not just a week
-- number), so a daily stock chart can be built — but only if the date
-- survives into the database. Adds an optional `day` alongside the existing
-- `week`, populated whenever the source sheet has a Day/Date column.

alter table public.contest_inventory_rows
  add column day date;

create index contest_inventory_rows_day_idx
  on public.contest_inventory_rows (raw_campaign_name, month, day);
