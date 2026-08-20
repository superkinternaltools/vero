-- Vero — 0030 inventory data as pre-computed availability percentages
-- The Inventory sheet no longer reports raw stock counts against a target —
-- it reports store and warehouse availability as percentages directly, per
-- SKU per store per week, and carries a real SKU id (barcode) alongside the
-- product name. None of the prior stock-count columns reconcile with this
-- shape, so this is a clean rebuild: any Inventory Data imported before this
-- migration needs to be re-imported under the new sheet format.

alter table public.contest_inventory_rows
  rename column sku_name to product_name;

alter table public.contest_inventory_rows
  add column sku_id text,
  add column store_availability numeric,
  add column wh_availability numeric;

drop index if exists contest_inventory_rows_day_idx;

alter table public.contest_inventory_rows
  drop column if exists target_store_stock,
  drop column if exists in_store_stock,
  drop column if exists target_warehouse_stock,
  drop column if exists in_warehouse_stock,
  drop column if exists warehouse_2d_requirement,
  drop column if exists day;
