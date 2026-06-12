-- Vero — 0005 campaign reference images
-- Adds a reference_images array on campaigns + a public storage bucket with admin-write policies.

alter table public.campaigns add column reference_images text[] not null default '{}';

insert into storage.buckets (id, name, public)
values ('campaign-references', 'campaign-references', true)
on conflict (id) do nothing;

create policy "auth read campaign refs"
  on storage.objects for select to authenticated
  using (bucket_id = 'campaign-references');

create policy "admin upload campaign refs"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'campaign-references' and public.is_admin());

create policy "admin delete campaign refs"
  on storage.objects for delete to authenticated
  using (bucket_id = 'campaign-references' and public.is_admin());
