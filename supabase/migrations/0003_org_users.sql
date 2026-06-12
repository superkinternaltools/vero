-- Vero — 0003 org + user assignments
-- Roles, Departments, Job Titles (managed lists) + user join tables + admin RLS on profiles.

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null
);
insert into public.roles (slug, name) values
  ('admin', 'Admin'),
  ('field-user', 'Field User'),
  ('reviewer', 'Reviewer'),
  ('viewer', 'Viewer');

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null
);
insert into public.departments (name) values
  ('Store Ops'), ('COCO Store Ops'), ('Marketing'), ('Private Label'),
  ('Category'), ('Supply Chain'), ('Data'), ('QComm');

create table public.job_titles (
  id uuid primary key default gen_random_uuid(),
  name text not null
);
insert into public.job_titles (name) values
  ('SAE'), ('ASM'), ('Store Manager'), ('Store Partner');

alter table public.profiles add column job_title_id uuid references public.job_titles (id);

create table public.user_roles (
  user_id uuid references public.profiles (id) on delete cascade,
  role_id uuid references public.roles (id) on delete cascade,
  primary key (user_id, role_id)
);
create table public.user_departments (
  user_id uuid references public.profiles (id) on delete cascade,
  department_id uuid references public.departments (id) on delete cascade,
  primary key (user_id, department_id)
);
create table public.user_stores (
  user_id uuid references public.profiles (id) on delete cascade,
  store_id uuid references public.stores (id) on delete cascade,
  primary key (user_id, store_id)
);

alter table public.roles enable row level security;
alter table public.departments enable row level security;
alter table public.job_titles enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_departments enable row level security;
alter table public.user_stores enable row level security;

create policy "read roles" on public.roles for select to authenticated using (true);
create policy "admin write roles" on public.roles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read departments" on public.departments for select to authenticated using (true);
create policy "admin write departments" on public.departments for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read job_titles" on public.job_titles for select to authenticated using (true);
create policy "admin write job_titles" on public.job_titles for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "read user_roles" on public.user_roles for select to authenticated using (true);
create policy "admin write user_roles" on public.user_roles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read user_departments" on public.user_departments for select to authenticated using (true);
create policy "admin write user_departments" on public.user_departments for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read user_stores" on public.user_stores for select to authenticated using (true);
create policy "admin write user_stores" on public.user_stores for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Admins can read and update every profile.
create policy "admins read all profiles" on public.profiles for select to authenticated using (public.is_admin());
create policy "admins update profiles" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Backfill: give existing admins the Admin role.
insert into public.user_roles (user_id, role_id)
select p.id, r.id from public.profiles p cross join public.roles r
where p.is_admin = true and r.slug = 'admin'
on conflict do nothing;
