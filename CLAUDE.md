@AGENTS.md

# Vero — Project Brief

## What is Vero?

Vero is a standalone web app for **SuperK** (an Indian retail chain). Brands pay SuperK for in-store execution activities (end-caps, tent cards, displays). Brands demand weekly photo proof that the execution happened correctly.

Vero structures this workflow:
1. Admin creates a **Campaign** (what activity, which stores, how often, how to score it)
2. Field team (SAEs, ASMs, Store Partners) see their **Tasks** and upload photos
3. AI scores the photo against a rubric
4. A human **Reviewer** approves or rejects
5. Dashboard, Summary, Leaderboard and Payout reports for visibility

Owner: Anuj Dalvi (Program Manager, non-developer). Location: `~/Developer/vero`.

---

## Tech Stack

- **Next.js 16** App Router + TypeScript (params/searchParams are **Promises** — always `await` them)
- **Tailwind CSS v4**
- **Supabase** — Postgres + Auth + Storage + Row-Level Security
- **OpenAI gpt-4o-mini** — vision API for scoring photos
- **Vercel** — deployment target

Environment variables in `.env.local` (git-ignored):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — **SECRET, server-only**
- `OPENAI_API_KEY`

---

## Architecture: core/ + modules/

```
src/
  core/          # Shared building blocks. Never modified by features.
  modules/       # Isolated feature modules. Never import from each other.
  app/           # Next.js route tree.
  middleware.ts  # Supabase session refresh on all routes.
```

**Rule**: Features import from `core/` only. `core/` never imports from `modules/`.

---

## Core Files

| File | Purpose |
|------|---------|
| `src/core/auth/permissions.ts` | `PERMISSION_KEYS` const — import-free, safe for both server and client |
| `src/core/auth/access.ts` | `getAccess()` — resolves allowed modules + landing for current user; `requireAccess(key)` — page guard |
| `src/core/auth/session.ts` | `getCurrentProfile()`, `requireAdmin()` |
| `src/core/db/client.ts` | Browser Supabase client |
| `src/core/db/server.ts` | Server Supabase client (async cookies) |
| `src/core/db/admin.ts` | Service-role client — **SERVER-ONLY, bypasses RLS** |
| `src/core/db/middleware.ts` | `updateSession()` for Next middleware |
| `src/core/layout/sidebar.tsx` | Permission-aware sidebar (client, usePathname) |
| `src/core/layout/app-shell.tsx` | Server component: sidebar + mobile header |
| `src/core/lib/geo.ts` | Haversine distance in metres |
| `src/core/lib/utils.ts` | `cn()` className helper |
| `src/core/ui/button.tsx` | Button (variant: default/outline/ghost, size: sm/md/lg) |
| `src/core/ui/input.tsx` | Input |
| `src/core/ui/modal.tsx` | Modal |
| `src/core/ui/multi-select.tsx` | Dropdown with removable pills + search |
| `src/core/ui/list-manager.tsx` | CRUD list for settings panels |

---

## Module Map

### auth
- `actions.ts` — signIn, signUp, signInWithGoogle (redirects `/auth/callback`), signOut; after login → `/` (role landing)
- `components/` — login-form, signup-form, auth-card, google-icon, or-divider

### campaigns
- `types.ts` — CampaignFormValues, CampaignListRow, CampaignStatus (string, not enum — configurable)
- `actions.ts` — createCampaign, updateCampaign
- `queries.ts` — getCampaigns, getCampaignById, getCampaignFormData
- `stats.ts` — getCampaignHealthRows(), getCampaignDeepStats() — reads health thresholds from app_settings
- `components/campaign-form.tsx` — 7-section form: Basics, Schedule, Instructions & reference, Targeting, Payout, AI & review, Photo capture
- `components/generate-tasks-button.tsx` — triggers idempotent task generation
- `components/health-badge.tsx` — On Track / Needs Attention / At Risk

### tasks
- `generate.ts` — `computeCycles(start, end, frequency, skipWeekends)` → due dates
- `actions.ts` — `generateTasks()` (idempotent upsert), `submitProof()` (geofence + duplicate + AI), `markNonSubmission()`
- `components/tasks-client.tsx` — pending tasks with "Can't do it?" dropdown; SHA-256 duplicate detection

### ai-review
- `engine.ts` — `runAiScoring(params)` — **single engine** for both real submissions and test
- `score.ts` — `scoreSubmission(id)` — called after every real upload
- `actions.ts` — `testAiPrompt(input)` — **server action for campaign form tester** (UI not yet built — see Pending Tasks)

### review
- `queries.ts` — getReviewQueue()
- `actions.ts` — approveSubmission, rejectSubmission
- `components/review-client.tsx` — table + modal, prev/next navigation, AI score toggle, flag display

### settings
- `queries.ts` — all settings data
- `actions.ts` — save permissions, thresholds, list items
- `components/settings-client.tsx` — 3 sections: permissions matrix, thresholds, configurable lists
- `components/permissions-matrix.tsx` — role × module toggle grid

### users / org / stores
- Standard CRUD with `queries.ts`, `actions.ts`, `components/*-client.tsx`
- Users: invite by email, map to roles/departments/stores, approve/activate
- Org: manage roles, departments, job titles
- Stores: FOFO/COCO, GPS coordinates, linked users

### summary / leaderboard / analysis / dashboard
- Server-rendered pages with query files; mostly read-only data views

---

## Database Migrations (run in order in Supabase SQL Editor)

| File | What it creates |
|------|----------------|
| `0001_auth.sql` | profiles, user_status enum, handle_new_user trigger. Bootstrap admin: `anuj.dalvi@superk.in` → active + is_admin |
| `0002_stores.sql` | `is_admin()` SECURITY DEFINER helper, store_type enum (FOFO/COCO), stores table |
| `0003_org_users.sql` | roles (seeded: admin/field-user/reviewer/viewer), departments (8), job_titles (4), join tables, profile RLS policies |
| `0004_campaigns.sql` | execution_types, campaigns table |
| `0005_campaign_references.sql` | campaigns.reference_images text[], `campaign-references` storage bucket |
| `0006_tasks_submissions.sql` | task_status enum, tasks (unique: campaign+store+due_date), submissions table, `submissions` storage bucket |
| `0007_reasons.sql` | rejection_reasons (5 seeded), non_submission_reasons (4 seeded) |
| `0008_settings.sql` | app_settings k/v table (health_on_track=80, health_needs_attention=50, store_score_window_days=60) |
| `0009_permissions_flags.sql` | role_permissions + roles.landing_page, submissions integrity flags (geofence_flag, geofence_distance_m, duplicate_flag, photo_hashes[]), tasks.non_submission_reason, geofence_radius_m=150, task_status 'not_done' |
| `0010_configurable_lists.sql` | campaign_statuses + payout_models tables; campaigns.status column changed from enum → text |

---

## Key Patterns

### Permission system
- Dynamic DB-driven matrix (not hardcoded)
- `role_permissions` table: role × module key → boolean
- Admin always has full access regardless of matrix
- Add a role in Settings → it appears in the permission grid automatically
- Page guard: `await requireAccess("campaigns")` at top of every protected page

### Authentication flow
1. Email/password or Google OAuth → Supabase Auth
2. `handle_new_user` trigger creates a `profiles` row with status `pending`
3. Admin approves user in Users tab → status becomes `active`
4. `anuj.dalvi@superk.in` is hardcoded in migration as bootstrap admin (active + is_admin on first sign-up)
5. After login → `getAccess()` → role-specific landing page

### Task generation
- `computeCycles()` derives due dates from campaign frequency + date range
- `generateTasks()` uses `onConflict: "campaign_id,store_id,due_date"` — safe to run multiple times
- Task statuses: pending → submitted → approved/rejected, or not_done (can't submit)

### AI scoring pipeline
The AI gets: **fixed system instruction** (in code) + **campaign Instructions** + **Brand Scoring Rubric** (main user-controlled prompt) + **strictness level** + **pass threshold** + **reference images** + **submitted photos**.

The rubric is the most important field — written per campaign, describes what good execution looks like.

Response format: `{ score: 0–10, assessment: ["bullet1", "bullet2", ...] }` → verdict = score ≥ passThreshold.

### Anti-fraud flags (soft — never block, only inform reviewer)
- **Geofence**: haversine distance between photo GPS and store coords. Flag if > `geofence_radius_m` (default 150m). Stored in `geofence_flag`, `geofence_distance_m`.
- **Duplicate**: SHA-256 hash of photo file. Flag if hash matches any prior submission for same campaign. Stored in `duplicate_flag`, `photo_hashes[]`.

### Payout model (hybrid approach)
- Model type logic lives in code (Binary is implemented: full payout if approved, zero if rejected)
- Tiered model: pending Anuj's definition of tier thresholds before building
- Tunable numbers (amount, model type) set per campaign in the form
- More models can be added in Settings → Configurable Lists → Payout models

---

## Pending Tasks

### 1. Prompt Tester UI (IMMEDIATE — was cut off)
**What exists**: `src/modules/ai-review/actions.ts` has `testAiPrompt()` server action, ready to call.

**What to build**: A "Test your prompt" subsection inside the AI & review section of `src/modules/campaigns/components/campaign-form.tsx` (after line 368, before the closing `</Section>`):
- File upload input for a test photo (client-side upload to a temp path in Supabase storage, get public URL)
- "Run AI test" button — calls `testAiPrompt()` with current unsaved form values: `v.reference_images`, `v.instructions`, `v.scoring_rubric`, `v.ai_strictness`, `v.pass_threshold`
- Result display: score/10, verdict badge (approved = green, rejected = red), assessment bullets
- Clear label: "This tests your current (unsaved) prompt settings"

The `testAiPrompt()` signature:
```ts
testAiPrompt({
  referenceImages: string[],
  testPhotos: string[],      // URLs after upload
  instructions: string,
  rubric: string,
  strictness: string,
  passThreshold: number,
}) → Promise<{ result?: AiResult; error?: string }>
// AiResult = { score: number; verdict: "approved"|"rejected"; assessment: string }
```

### 2. Tiered payout model
Needs Anuj to define tier thresholds (e.g. score ranges? weeks consistent? submission %) before code is written.

### 3. Not yet tested
Anuj has not run any migrations yet. All 10 migrations need to be run in Supabase SQL Editor in order before the app can be used. OpenAI key is already set in `.env.local`.

### 4. Deferred (later phases)
- Store-score auto-computation background job
- Auto-mark tasks "Missed" after deadline job
- Audit log page
- Brand PDF export
- Offline upload queue for field team
- Push/SMS notifications
- Telugu language support (i18n)
- SMTP for invite emails (currently console-only)

---

## UI / Style Notes

- Primary color: SuperK red (`--primary`)
- Auth screens: neutral background, white card, red as accent only (no full red backgrounds)
- All user/role/store pickers: use `MultiSelect` component (dropdown with removable pills + search) — NOT chips or checkboxes inline
- Modals: `max-w-3xl`, `rounded-2xl`, `border border-border bg-card p-6 shadow-xl`
- Tables: `rounded-2xl border border-border bg-card`, thead uppercase tracking-wide text-xs
- Badges: `rounded-full px-2.5 py-0.5 text-xs font-medium` with bg-success/10 or bg-danger/10

---

## Security Rules

- `SUPABASE_SERVICE_ROLE_KEY` is SECRET — never expose client-side
- `src/core/db/admin.ts` is SERVER-ONLY — never import into client components or `"use client"` files
- All server actions validate access with `getAccess()` before doing anything
- RLS is on for all tables — admin client (`createAdminClient()`) used only for system operations
- `.env.local` is git-ignored

---

## Common Mistakes to Avoid

1. **Next.js 16**: `params` and `searchParams` in page components are **Promises** — always `await params` before using `.id` etc.
2. **Server actions file**: Use `async function foo()` style exports, NOT `const foo = async () =>` (arrow functions not allowed in `"use server"` files)
3. **Importing from `access.ts` in client components**: Don't — it has server imports. Use `permissions.ts` for constants instead.
4. **`CampaignStatus`**: Is `string` (not an enum) — configurable via Settings. Don't add enum constraints.
5. **Port 3000**: If already running a dev server, don't try to start another — use the existing one.
