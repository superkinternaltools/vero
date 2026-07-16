-- Vero — 0020 attendance & rostering (Phase 1)
-- Shift presets, rosters (with members + per-person/day assignments), a per-user
-- reference face, and geofenced photo punches. Face-match columns are reserved
-- for Phase 2 but left null for now.

-- 1) Reusable shift presets. Store is NOT here — it's chosen per assignment.
create table public.attendance_shift_presets (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  mode          text not null default 'fixed',           -- 'fixed' | 'open'
  windows       jsonb not null default '[]'::jsonb,        -- fixed: [{label,start,end,grace_min}] · open: {punches:2}
  mid_photo_min int not null default 0,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

-- 2) A named scheduling period. Carries the overtime cap + holiday list.
create table public.attendance_rosters (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  start_date         date not null,
  end_date           date not null,
  overtime_cap_hours numeric,                              -- null = uncapped
  holiday_dates      date[] not null default '{}',
  created_by         uuid references public.profiles (id),
  created_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

-- 3) Who is on a roster (grid rows).
create table public.attendance_roster_members (
  roster_id uuid not null references public.attendance_rosters (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  primary key (roster_id, user_id)
);

-- 4) One row per person per working day (grid cells). No row = off.
create table public.attendance_assignments (
  id         uuid primary key default gen_random_uuid(),
  roster_id  uuid not null references public.attendance_rosters (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  work_date  date not null,                                -- night shifts anchor to the START day
  preset_id  uuid references public.attendance_shift_presets (id) on delete set null,
  mode       text not null default 'fixed',
  windows    jsonb not null default '[]'::jsonb,           -- resolved for that day (copied from preset or custom)
  store_id   uuid not null references public.stores (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, work_date)
);

-- 5) One enrolled reference face per person (first punch fills it; admin can reset).
create table public.attendance_references (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  photo_url   text not null,
  photo_path  text not null,
  captured_at timestamptz not null default now(),
  set_by      uuid references public.profiles (id),
  created_at  timestamptz not null default now()
);

-- 6) Every photo taken. Never blocked — failed checks attach as soft flags.
create table public.attendance_punches (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  assignment_id       uuid references public.attendance_assignments (id) on delete set null,
  roster_id           uuid references public.attendance_rosters (id) on delete set null,
  work_date           date not null,
  kind                text not null,                       -- 'check_in' | 'check_out' | 'mid'
  captured_at         timestamptz not null default now(),
  photo_url           text not null,
  photo_path          text not null,
  store_id            uuid references public.stores (id) on delete set null,
  latitude            double precision,
  longitude           double precision,
  geofence_distance_m numeric,
  geofence_flag       boolean not null default false,
  no_location_flag    boolean not null default false,
  face_match_score    numeric,                             -- Phase 2
  face_mismatch_flag  boolean not null default false,      -- Phase 2
  reviewed_at         timestamptz,
  reviewed_by         uuid references public.profiles (id),
  created_at          timestamptz not null default now()
);

create index on public.attendance_assignments (roster_id, work_date);
create index on public.attendance_assignments (user_id, work_date);
create index on public.attendance_punches (user_id, work_date);

-- RLS ---------------------------------------------------------------------
alter table public.attendance_shift_presets  enable row level security;
alter table public.attendance_rosters         enable row level security;
alter table public.attendance_roster_members  enable row level security;
alter table public.attendance_assignments     enable row level security;
alter table public.attendance_references       enable row level security;
alter table public.attendance_punches          enable row level security;

-- Presets & rosters: readable by any signed-in user; admin writes.
create policy "read presets" on public.attendance_shift_presets for select to authenticated using (true);
create policy "admin write presets" on public.attendance_shift_presets for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "read rosters" on public.attendance_rosters for select to authenticated using (true);
create policy "admin write rosters" on public.attendance_rosters for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "read roster_members" on public.attendance_roster_members for select to authenticated using (true);
create policy "admin write roster_members" on public.attendance_roster_members for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Assignments: a user reads their own; admin full. (Cross-user reads for the
-- log/grid go through the service-role client, gated in app code.)
create policy "read own assignments" on public.attendance_assignments for select to authenticated using (user_id = auth.uid());
create policy "admin write assignments" on public.attendance_assignments for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- References: a user reads their own; admin full. (Writes happen server-side.)
create policy "read own reference" on public.attendance_references for select to authenticated using (user_id = auth.uid());
create policy "admin write references" on public.attendance_references for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Punches: a user reads + inserts their own; admin full.
create policy "read own punches" on public.attendance_punches for select to authenticated using (user_id = auth.uid());
create policy "insert own punches" on public.attendance_punches for insert to authenticated with check (user_id = auth.uid());
create policy "admin write punches" on public.attendance_punches for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Storage bucket for punch + reference photos.
insert into storage.buckets (id, name, public)
values ('attendance', 'attendance', true)
on conflict (id) do nothing;

create policy "auth read attendance photos" on storage.objects for select to authenticated using (bucket_id = 'attendance');
create policy "auth upload attendance photos" on storage.objects for insert to authenticated with check (bucket_id = 'attendance');

-- Separate geofence radius for attendance (metres) — tunable for dark stores.
insert into public.app_settings (key, value) values ('attendance_geofence_radius_m', '150')
on conflict (key) do nothing;
