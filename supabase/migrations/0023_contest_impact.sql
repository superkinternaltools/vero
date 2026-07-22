-- Vero — 0023 contest impact
-- Weekly store performance data (from the data team's sheet), name-matching
-- aliases (store + campaign), and their RLS. Verdicts reuse campaigns/tasks
-- directly — no new table needed for those.

create table public.performance_import_batches (
  id                        uuid primary key default gen_random_uuid(),
  source                    text not null default 'csv' check (source in ('csv', 'sheet')),
  imported_by               uuid references public.profiles (id),
  imported_at               timestamptz not null default now(),
  row_count                 int not null default 0,
  unmatched_store_count     int not null default 0,
  unmatched_campaign_count  int not null default 0
);

create table public.store_weekly_performance (
  id                                   uuid primary key default gen_random_uuid(),
  import_batch_id                      uuid not null references public.performance_import_batches (id) on delete cascade,
  month                                date not null,
  week_of_month                        int not null check (week_of_month between 1 and 5),
  raw_campaign_name                    text not null,
  campaign_id                         uuid references public.campaigns (id),
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
create index store_weekly_performance_lookup_idx
  on public.store_weekly_performance (campaign_id, month, week_of_month);

-- Raw sheet names are matched case/whitespace-insensitively; once an admin
-- maps a name once, it's remembered for every future import.
create table public.store_name_aliases (
  id          uuid primary key default gen_random_uuid(),
  raw_name    text not null unique,
  store_id    uuid not null references public.stores (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create table public.campaign_name_aliases (
  id            uuid primary key default gen_random_uuid(),
  raw_name      text not null unique,
  campaign_id   uuid not null references public.campaigns (id) on delete cascade,
  created_at    timestamptz not null default now()
);

alter table public.performance_import_batches enable row level security;
alter table public.store_weekly_performance enable row level security;
alter table public.store_name_aliases enable row level security;
alter table public.campaign_name_aliases enable row level security;

create policy "read performance_import_batches" on public.performance_import_batches for select to authenticated using (true);
create policy "admin write performance_import_batches" on public.performance_import_batches for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "read store_weekly_performance" on public.store_weekly_performance for select to authenticated using (true);
create policy "admin write store_weekly_performance" on public.store_weekly_performance for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "read store_name_aliases" on public.store_name_aliases for select to authenticated using (true);
create policy "admin write store_name_aliases" on public.store_name_aliases for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "read campaign_name_aliases" on public.campaign_name_aliases for select to authenticated using (true);
create policy "admin write campaign_name_aliases" on public.campaign_name_aliases for all to authenticated using (public.is_admin()) with check (public.is_admin());
