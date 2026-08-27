-- Vero — 0039 campaign brands
-- Clubs monthly Brand Visibility campaigns ("Tide - August", "Tide - July",
-- "Tide - June"...) under one brand bucket ("Tide"), same configurable-list
-- pattern as campaign_categories. is_brand_category marks which category
-- IS the brand-visibility one, so the Brand dropdown can gate on it
-- reliably even if an admin renames the category later.

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_system boolean not null default false
);
alter table public.brands enable row level security;
create policy "read brands" on public.brands for select to authenticated using (true);
create policy "admin write brands" on public.brands for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.campaigns add column brand_id uuid references public.brands(id) on delete set null;
create index campaigns_brand_id_idx on public.campaigns (brand_id);

alter table public.campaign_categories add column is_brand_category boolean not null default false;
update public.campaign_categories set is_brand_category = true where name = 'Brand Visibility';
