# modules/

Isolated, plug-and-play feature modules. Each is self-contained and **never imports from another module** — only from `core/`.

Planned modules (per docs/REQUIREMENTS.md):
- `auth` — login, signup, pending approval
- `dashboard`
- `tasks` — field-user task list + photo upload
- `review` — reviewer queue + review detail
- `campaigns` — list, create/edit, deeper-view, bulk upload
- `summary` — week-on-week verdict matrix
- `analysis` — analytics/charts
- `leaderboard`
- `stores` — manage stores
- `users` — manage users + approvals
- `org` — roles / departments / job titles
- `settings` — permissions matrix, configurable lists, store-score, thresholds
- `payout` — payout calculation/reporting (surfaced in dashboard/summary/export)
- `ai-review` — OpenAI vision scoring pipeline

Each module typically exposes: routes/pages, components, server actions, and a data layer — all scoped to itself.
