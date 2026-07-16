-- Allow a person to be scheduled at more than one store on the same day
-- (e.g. 3 stores Monday, 2 different ones Tuesday). Previously each person
-- could have exactly one assignment per work_date; now it's one per
-- (person, day, store) — a day can hold multiple independent shifts, each
-- with its own store, mode/windows, and its own check-in/check-out via the
-- punch screen.
do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.attendance_assignments'::regclass
    and contype = 'u'
    and pg_get_constraintdef(oid) ilike '%(user_id, work_date)%';
  if cname is not null then
    execute format('alter table public.attendance_assignments drop constraint %I', cname);
  end if;
end $$;

alter table public.attendance_assignments
  add constraint attendance_assignments_user_id_work_date_store_id_key
  unique (user_id, work_date, store_id);
