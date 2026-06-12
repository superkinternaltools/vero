-- Vero — 0004 campaigns
-- Execution types (managed list) + campaigns + targeting joins + RLS.

create type public.campaign_frequency as enum ('daily', 'weekly', 'monthly');
create type public.campaign_status as enum ('draft', 'active', 'paused', 'completed');
create type public.score_mode as enum ('reviewer_preferred', 'ai_preferred', 'ai_auto_approve');
create type public.ai_strictness as enum ('low', 'medium', 'high');
create type public.capture_mode as enum ('camera', 'gallery');

create table public.execution_types (
  id uuid primary key default gen_random_uuid(),
  name text not null
);
insert into public.execution_types (name) values
  ('End Cap'), ('Shelf'), ('Tent Card'), ('Standee'), ('Poster'), ('Store Front Banner');

create table public.campaigns (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  execution_type_id uuid references public.execution_types (id),
  frequency         public.campaign_frequency not null default 'weekly',
  status            public.campaign_status not null default 'draft',
  start_date        date,
  end_date          date,
  instructions      text,
  payout_enabled    boolean not null default false,
  payout_amount     numeric not null default 0,
  payout_model      text not null default 'binary',
  ai_review         boolean not null default true,
  ai_strictness     public.ai_strictness not null default 'medium',
  pass_threshold    numeric not null default 7,
  score_mode        public.score_mode not null default 'reviewer_preferred',
  ai_score_visible  boolean not null default true,
  scoring_rubric    text,
  capture_mode      public.capture_mode not null default 'camera',
  num_photos        int not null default 1,
  allow_late        boolean not null default false,
  skip_weekends     boolean not null default false,
  skip_holidays     boolean not null default false,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now()
);

create table public.campaign_departments (
  campaign_id uuid references public.campaigns (id) on delete cascade,
  department_id uuid references public.departments (id) on delete cascade,
  primary key (campaign_id, department_id)
);
create table public.campaign_stores (
  campaign_id uuid references public.campaigns (id) on delete cascade,
  store_id uuid references public.stores (id) on delete cascade,
  primary key (campaign_id, store_id)
);
create table public.campaign_job_titles (
  campaign_id uuid references public.campaigns (id) on delete cascade,
  job_title_id uuid references public.job_titles (id) on delete cascade,
  primary key (campaign_id, job_title_id)
);

alter table public.execution_types enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_departments enable row level security;
alter table public.campaign_stores enable row level security;
alter table public.campaign_job_titles enable row level security;

create policy "read execution_types" on public.execution_types for select to authenticated using (true);
create policy "admin write execution_types" on public.execution_types for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read campaigns" on public.campaigns for select to authenticated using (true);
create policy "admin write campaigns" on public.campaigns for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read campaign_departments" on public.campaign_departments for select to authenticated using (true);
create policy "admin write campaign_departments" on public.campaign_departments for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read campaign_stores" on public.campaign_stores for select to authenticated using (true);
create policy "admin write campaign_stores" on public.campaign_stores for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read campaign_job_titles" on public.campaign_job_titles for select to authenticated using (true);
create policy "admin write campaign_job_titles" on public.campaign_job_titles for all to authenticated using (public.is_admin()) with check (public.is_admin());
