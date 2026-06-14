-- Vero — 0015 shell users + signup store hints
-- Shell users are admin-created placeholders. When a real person signs up,
-- admin manually maps them to a shell, which copies role/job title/stores.

create table public.shell_users (
  id         text primary key,          -- admin-assigned or auto-generated (e.g. SK-A1B2)
  display_name text not null,
  job_title_id uuid references public.job_titles(id) on delete set null,
  role_id      uuid references public.roles(id)      on delete set null,
  created_at   timestamptz not null default now()
);

create table public.shell_user_stores (
  shell_user_id text references public.shell_users(id) on delete cascade,
  store_id      uuid references public.stores(id)      on delete cascade,
  primary key (shell_user_id, store_id)
);

-- Store IDs the user declared on signup — hint for admin during mapping
alter table public.profiles
  add column if not exists signup_store_ids uuid[] not null default '{}';

-- RLS — admin-only
alter table public.shell_users       enable row level security;
alter table public.shell_user_stores enable row level security;

create policy "Admin full access on shell_users"
  on public.shell_users for all
  using (is_admin())
  with check (is_admin());

create policy "Admin full access on shell_user_stores"
  on public.shell_user_stores for all
  using (is_admin())
  with check (is_admin());
