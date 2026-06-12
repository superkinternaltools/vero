-- Vero — 0007 managed reason lists (rejection + non-submission)

create table public.rejection_reasons (
  id uuid primary key default gen_random_uuid(),
  name text not null
);
insert into public.rejection_reasons (name) values
  ('Not enough SKUs in place'), ('Wrong placement'), ('Branding/signage missing'),
  ('Display not set up'), ('Poor photo quality');

create table public.non_submission_reasons (
  id uuid primary key default gen_random_uuid(),
  name text not null
);
insert into public.non_submission_reasons (name) values
  ('Store closed'), ('Stock not available'), ('Display removed'), ('Not enough space');

alter table public.rejection_reasons enable row level security;
alter table public.non_submission_reasons enable row level security;

create policy "read rejection_reasons" on public.rejection_reasons for select to authenticated using (true);
create policy "admin write rejection_reasons" on public.rejection_reasons for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read non_submission_reasons" on public.non_submission_reasons for select to authenticated using (true);
create policy "admin write non_submission_reasons" on public.non_submission_reasons for all to authenticated using (public.is_admin()) with check (public.is_admin());
