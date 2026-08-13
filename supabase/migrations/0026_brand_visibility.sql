-- Vero — 0026 Brand Visibility
--
-- A "contest" (e.g. Tide) holds a chain of "months" (e.g. September). A
-- month is deliberately NOT a new entity — it's a row in the existing
-- campaigns table, reusing every field it already has (dates, targeting,
-- rubric, AI settings, payout, and therefore every task/submission that
-- already hangs off campaign_id). That's what lets an existing campaign be
-- pulled into Brand Visibility by tagging it, not copying it — its tasks,
-- submissions and payout history never move.

create table public.brand_visibility_contests (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  department_id uuid references public.departments (id),
  created_at    timestamptz not null default now()
);

alter table public.campaigns
  add column brand_visibility_contest_id uuid references public.brand_visibility_contests (id);

-- One row per month describing what must be placed. Three modes:
--   all           — every row in campaign_skus is required (own shelf/qty each)
--   any_list      — min_products of the campaign_skus rows, each meeting the
--                    shared shelf/qty here
--   any_category  — no SKU rows at all; any product in `category` counts,
--                    min_products of them, qty is a total across the shelf
create table public.campaign_sku_requirements (
  campaign_id  uuid primary key references public.campaigns (id) on delete cascade,
  mode         text not null check (mode in ('all', 'any_list', 'any_category')),
  category     text,
  min_products int,
  shelf        text,
  qty_mode     text check (qty_mode in ('per_product', 'total')),
  qty          numeric
);

-- SKU rows for 'all' (shelf/qty set per row) and 'any_list' (shelf/qty stay
-- null here — the shared values live on the requirement row above). Empty
-- for 'any_category'.
create table public.campaign_skus (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  sku_code    text not null,
  sku_name    text not null,
  shelf       text,
  qty         numeric
);
create index campaign_skus_campaign_idx on public.campaign_skus (campaign_id);

alter table public.brand_visibility_contests enable row level security;
alter table public.campaign_sku_requirements enable row level security;
alter table public.campaign_skus enable row level security;

create policy "read brand_visibility_contests" on public.brand_visibility_contests for select to authenticated using (true);
create policy "admin write brand_visibility_contests" on public.brand_visibility_contests for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "read campaign_sku_requirements" on public.campaign_sku_requirements for select to authenticated using (true);
create policy "admin write campaign_sku_requirements" on public.campaign_sku_requirements for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "read campaign_skus" on public.campaign_skus for select to authenticated using (true);
create policy "admin write campaign_skus" on public.campaign_skus for all to authenticated using (public.is_admin()) with check (public.is_admin());
