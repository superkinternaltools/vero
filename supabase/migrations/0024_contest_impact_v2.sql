-- Vero — 0024 contest impact v2
-- Replaces the tasks/campaigns-based verdict model with three independently
-- uploadable sheets (Campaign Data, Inventory Data, Sell Side Data), joined
-- purely on (campaign name, month, week, store). Campaign Data's Status
-- column is now the sole source of grouping — no more guessing at Vero's
-- own task cycles. store_name_aliases is kept from 0023; campaign names are
-- no longer matched against Vero's campaigns table at all, so
-- campaign_name_aliases is dropped along with the old single-sheet tables.

drop table if exists public.store_weekly_performance;
drop table if exists public.performance_import_batches;
drop table if exists public.campaign_name_aliases;

create table public.contest_data_batches (
  id           uuid primary key default gen_random_uuid(),
  source_type  text not null check (source_type in ('campaign', 'inventory', 'sell_side')),
  origin       text not null default 'csv' check (origin in ('csv', 'sheet', 'dummy')),
  imported_by  uuid references public.profiles (id),
  imported_at  timestamptz not null default now(),
  row_count    int not null default 0
);
create index contest_data_batches_lookup_idx on public.contest_data_batches (source_type, origin);

create table public.contest_campaign_rows (
  id                 uuid primary key default gen_random_uuid(),
  batch_id           uuid not null references public.contest_data_batches (id) on delete cascade,
  month              date not null,
  week               int not null check (week between 1 and 5),
  raw_campaign_name  text not null,
  raw_store_name     text not null,
  store_id           uuid references public.stores (id),
  status             text not null,
  created_at         timestamptz not null default now()
);
create index contest_campaign_rows_lookup_idx on public.contest_campaign_rows (raw_campaign_name, month, week);

create table public.contest_inventory_rows (
  id                        uuid primary key default gen_random_uuid(),
  batch_id                  uuid not null references public.contest_data_batches (id) on delete cascade,
  month                     date not null,
  week                      int not null check (week between 1 and 5),
  raw_campaign_name         text not null,
  raw_store_name            text not null,
  store_id                  uuid references public.stores (id),
  sku_name                  text not null,
  target_store_stock        numeric,
  in_store_stock             numeric,
  target_warehouse_stock     numeric,
  in_warehouse_stock         numeric,
  created_at                timestamptz not null default now()
);
create index contest_inventory_rows_lookup_idx on public.contest_inventory_rows (raw_campaign_name, month, week);

create table public.contest_sell_side_rows (
  id                                   uuid primary key default gen_random_uuid(),
  batch_id                             uuid not null references public.contest_data_batches (id) on delete cascade,
  month                                date not null,
  week                                 int not null check (week between 1 and 5),
  raw_campaign_name                    text not null,
  raw_store_name                       text not null,
  store_id                             uuid references public.stores (id),
  this_month_gmv                       numeric,
  last_month_gmv                       numeric,
  last_year_gmv                        numeric,
  this_month_penetration               numeric,
  last_month_penetration               numeric,
  last_year_penetration                numeric,
  this_month_avg_unit                  numeric,
  last_month_avg_unit                  numeric,
  last_year_avg_unit                   numeric,
  this_month_category_contribution     numeric,
  last_month_category_contribution     numeric,
  last_year_category_contribution      numeric,
  in_store_value                       numeric,
  created_at                           timestamptz not null default now()
);
create index contest_sell_side_rows_lookup_idx on public.contest_sell_side_rows (raw_campaign_name, month, week);

alter table public.contest_data_batches enable row level security;
alter table public.contest_campaign_rows enable row level security;
alter table public.contest_inventory_rows enable row level security;
alter table public.contest_sell_side_rows enable row level security;

create policy "read contest_data_batches" on public.contest_data_batches for select to authenticated using (true);
create policy "admin write contest_data_batches" on public.contest_data_batches for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "read contest_campaign_rows" on public.contest_campaign_rows for select to authenticated using (true);
create policy "admin write contest_campaign_rows" on public.contest_campaign_rows for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "read contest_inventory_rows" on public.contest_inventory_rows for select to authenticated using (true);
create policy "admin write contest_inventory_rows" on public.contest_inventory_rows for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "read contest_sell_side_rows" on public.contest_sell_side_rows for select to authenticated using (true);
create policy "admin write contest_sell_side_rows" on public.contest_sell_side_rows for all to authenticated using (public.is_admin()) with check (public.is_admin());
