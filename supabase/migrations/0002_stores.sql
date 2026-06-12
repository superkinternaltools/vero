-- Vero — 0002 stores
-- Adds an is_admin() helper, the stores table, and RLS (admins write, all authenticated read).

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create type public.store_type as enum ('FOFO', 'COCO');

create table public.stores (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  aligned     boolean not null default false,
  store_type  public.store_type,
  latitude    double precision,
  longitude   double precision,
  score       numeric,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.stores enable row level security;

create policy "read stores" on public.stores
  for select to authenticated using (true);
create policy "admins insert stores" on public.stores
  for insert to authenticated with check (public.is_admin());
create policy "admins update stores" on public.stores
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete stores" on public.stores
  for delete to authenticated using (public.is_admin());
