-- Vero — 0038 campaign categories
-- Replaces the single is_brand_visibility boolean (0037) with an open-ended,
-- admin-extensible category (Brand Visibility, Marketing, Other, ...) —
-- same "configurable list" pattern as campaign_statuses/execution_types.
-- Nothing in app code branches on a specific category name, so — unlike
-- campaign_statuses — these rows are all freely renamable/deletable.

create table public.campaign_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_system boolean not null default false
);
insert into public.campaign_categories (name) values
  ('Brand Visibility'), ('Marketing'), ('Other');

alter table public.campaign_categories enable row level security;
create policy "read campaign_categories" on public.campaign_categories for select to authenticated using (true);
create policy "admin write campaign_categories" on public.campaign_categories for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.campaigns add column category_id uuid references public.campaign_categories(id) on delete set null;

update public.campaigns c
set category_id = (select id from public.campaign_categories where name = 'Brand Visibility')
where c.is_brand_visibility = true;

alter table public.campaigns drop column is_brand_visibility;
