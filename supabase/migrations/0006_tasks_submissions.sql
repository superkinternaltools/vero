-- Vero — 0006 tasks + submissions
-- Tasks (campaign × store × cycle) and submissions (proof uploads), with RLS + a photos bucket.

create type public.task_status as enum ('pending', 'submitted', 'approved', 'rejected', 'missed');

create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  store_id    uuid not null references public.stores (id) on delete cascade,
  cycle_start date not null,
  cycle_end   date not null,
  due_date    date not null,
  status      public.task_status not null default 'pending',
  created_at  timestamptz not null default now(),
  unique (campaign_id, store_id, due_date)
);

create table public.submissions (
  id              uuid primary key default gen_random_uuid(),
  task_id         uuid not null references public.tasks (id) on delete cascade,
  campaign_id     uuid not null references public.campaigns (id) on delete cascade,
  store_id        uuid not null references public.stores (id) on delete cascade,
  submitted_by    uuid references public.profiles (id),
  photos          text[] not null default '{}',
  comments        text,
  latitude        double precision,
  longitude       double precision,
  ai_score        numeric,
  ai_verdict      text,
  ai_assessment   text,
  human_verdict   text,
  rejection_reason text,
  status          text not null default 'pending_review',
  created_at      timestamptz not null default now()
);

alter table public.tasks enable row level security;
alter table public.submissions enable row level security;

create policy "admins read tasks" on public.tasks for select to authenticated using (public.is_admin());
create policy "field read store tasks" on public.tasks for select to authenticated using (
  exists (select 1 from public.user_stores us where us.user_id = auth.uid() and us.store_id = tasks.store_id)
);
create policy "admins write tasks" on public.tasks for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "field update store tasks" on public.tasks for update to authenticated
  using (exists (select 1 from public.user_stores us where us.user_id = auth.uid() and us.store_id = tasks.store_id))
  with check (exists (select 1 from public.user_stores us where us.user_id = auth.uid() and us.store_id = tasks.store_id));

create policy "admins read submissions" on public.submissions for select to authenticated using (public.is_admin());
create policy "field read store submissions" on public.submissions for select to authenticated using (
  exists (select 1 from public.user_stores us where us.user_id = auth.uid() and us.store_id = submissions.store_id)
);
create policy "field insert submissions" on public.submissions for insert to authenticated with check (
  submitted_by = auth.uid()
  and exists (select 1 from public.user_stores us where us.user_id = auth.uid() and us.store_id = submissions.store_id)
);
create policy "admins write submissions" on public.submissions for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public)
values ('submissions', 'submissions', true)
on conflict (id) do nothing;

create policy "auth read submission photos" on storage.objects for select to authenticated using (bucket_id = 'submissions');
create policy "auth upload submission photos" on storage.objects for insert to authenticated with check (bucket_id = 'submissions');
