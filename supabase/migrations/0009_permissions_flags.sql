-- Vero — 0009 role permissions, integrity flags, non-submission, geofence setting

-- 1) Role permissions (dynamic matrix) + per-role landing page
create table public.role_permissions (
  role_id    uuid references public.roles (id) on delete cascade,
  permission text not null,
  primary key (role_id, permission)
);
alter table public.roles add column landing_page text;

alter table public.role_permissions enable row level security;
create policy "read role_permissions" on public.role_permissions for select to authenticated using (true);
create policy "admin write role_permissions" on public.role_permissions for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Seed sensible defaults per role
insert into public.role_permissions (role_id, permission)
select r.id, p.perm
from public.roles r
cross join lateral unnest(
  case r.slug
    when 'admin'      then array['dashboard','tasks','review','campaigns','summary','analysis','leaderboard','stores','users','org']
    when 'field-user' then array['dashboard','tasks','leaderboard']
    when 'reviewer'   then array['dashboard','review','summary','leaderboard']
    when 'viewer'     then array['dashboard','summary','analysis','leaderboard']
    else array['dashboard']
  end
) as p(perm)
on conflict do nothing;

update public.roles set landing_page = '/tasks' where slug = 'field-user';
update public.roles set landing_page = '/review' where slug = 'reviewer';
update public.roles set landing_page = '/dashboard' where slug in ('admin', 'viewer');

-- 2) Integrity flags on submissions
alter table public.submissions add column photo_hashes text[] not null default '{}';
alter table public.submissions add column geofence_flag boolean not null default false;
alter table public.submissions add column geofence_distance_m numeric;
alter table public.submissions add column duplicate_flag boolean not null default false;

-- 3) Non-submission reason on tasks
alter table public.tasks add column non_submission_reason text;

-- 4) Geofence radius setting (metres)
insert into public.app_settings (key, value) values ('geofence_radius_m', '150')
on conflict (key) do nothing;

-- 5) New task status for "couldn't do it" (kept last; not used within this migration)
alter type public.task_status add value if not exists 'not_done';
