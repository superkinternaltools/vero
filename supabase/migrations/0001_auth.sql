-- Vero — 0001 auth foundation
-- Profiles (one row per auth user) + status + bootstrap-admin trigger + RLS.

-- account lifecycle status
create type public.user_status as enum ('pending', 'active', 'inactive');

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text,
  status       public.user_status not null default 'pending',
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- A signed-in user may read their own profile (no recursion: only references auth.uid()).
create policy "read own profile"
  on public.profiles
  for select
  using (auth.uid() = id);

-- Auto-create a profile when a new auth user is created.
-- Bootstrap admin (anuj.dalvi@superk.in) is created active + admin; everyone else is pending.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, status, is_admin)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    case when new.email = 'anuj.dalvi@superk.in' then 'active'::public.user_status
         else 'pending'::public.user_status end,
    (new.email = 'anuj.dalvi@superk.in')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
