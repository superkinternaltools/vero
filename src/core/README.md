# core/

Shared foundation for Vero — **never modified by feature modules.**

Holds cross-cutting concerns:
- `auth/` — authentication, session, role/permission guards
- `db/` — Supabase client + typed helpers
- `ui/` — shared UI primitives (buttons, inputs, tables, dialogs, badges)
- `layout/` — app shell (sidebar nav, header)
- `lib/` — utilities (dates/IST, formatting, csv, image hashing, geofence)
- `config/` — runtime/config access (settings-driven values)

**Rule:** feature modules import FROM core; core never imports from modules.
