-- Vero — 0008 app settings (key/value config)

create table public.app_settings (
  key   text primary key,
  value text
);
insert into public.app_settings (key, value) values
  ('health_on_track', '80'),
  ('health_needs_attention', '50'),
  ('store_score_window_days', '60')
on conflict (key) do nothing;

alter table public.app_settings enable row level security;
create policy "read app_settings" on public.app_settings for select to authenticated using (true);
create policy "admin write app_settings" on public.app_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
