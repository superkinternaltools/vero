-- Vero — 0029 inventory + sell-side field updates
-- Inventory Data no longer carries a Day column — the sheet is back to a
-- plain Week number like the other two sources — but it now brings a new
-- "2D WH Reqmt" figure. Sell Side Data adds last-month and last-year
-- in-store value, where previously only the current month existed.

alter table public.contest_inventory_rows
  add column warehouse_2d_requirement numeric;

alter table public.contest_sell_side_rows
  rename column in_store_value to this_month_in_store_value;

alter table public.contest_sell_side_rows
  add column last_month_in_store_value numeric,
  add column last_year_in_store_value numeric;
