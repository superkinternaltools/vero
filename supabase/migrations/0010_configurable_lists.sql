-- Vero — 0010 configurable campaign statuses + payout models

create table public.campaign_statuses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_system boolean not null default false
);
insert into public.campaign_statuses (name, is_system) values
  ('draft', true), ('active', true), ('paused', true), ('completed', true);

create table public.payout_models (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_system boolean not null default false
);
insert into public.payout_models (name, is_system) values
  ('binary', true), ('tiered', true);

alter table public.campaign_statuses enable row level security;
alter table public.payout_models enable row level security;
create policy "read campaign_statuses" on public.campaign_statuses for select to authenticated using (true);
create policy "admin write campaign_statuses" on public.campaign_statuses for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read payout_models" on public.payout_models for select to authenticated using (true);
create policy "admin write payout_models" on public.payout_models for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Relax campaigns.status from a fixed enum to text so custom statuses work.
alter table public.campaigns alter column status drop default;
alter table public.campaigns alter column status type text using status::text;
alter table public.campaigns alter column status set default 'draft';
drop type public.campaign_status;
