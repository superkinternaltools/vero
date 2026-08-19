-- Vero — 0028 store activity dates
-- A store without a closed_at is active indefinitely; one without an
-- opened_at has always existed (both null = no constraint, so existing
-- stores aren't accidentally excluded from historical reports until someone
-- sets real dates). Used by Contest Impact to decide which stores are valid
-- control-group candidates for a given month — a store that hadn't opened
-- yet, or had already closed, shouldn't count as "did nothing" baseline.

alter table public.stores
  add column opened_at date,
  add column closed_at date;
