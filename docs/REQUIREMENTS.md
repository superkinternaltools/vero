# Vero — Requirements Document (v0.4, feature-complete draft)

**Owner:** Anuj Dalvi (Program Manager, SuperK)
**Status:** Feature-complete draft — **pending sign-off**. NO code written.
**Time zone:** IST (all dates, cycles, due dates, recompute jobs).
**Last updated:** 2026-06-11

---

## 1. What Vero is

A standalone web app for **collecting and verifying proof of in-store executions**. Brands pay SuperK for in-store activities (e.g. Ariel end-cap, billing-counter tent card) and demand **recurring photo proof**. Vero structures the loop: **set up activity → field team uploads photo → AI scores it → human approves/rejects → dashboards + payout reporting + brand-ready export.**

"Vero" = Latin/Italian for *"true."*

**Money flow:** Brand pays SuperK (outside Vero). SuperK pays a **payout to the store** for completing + proving the execution. Vero **calculates & reports** payouts; it does **not** process payments.

---

## 2. Tech & infrastructure

- **App:** Next.js (App Router) + TypeScript, Tailwind + shadcn UI.
- **Backend:** Supabase (Postgres, Auth, Storage, RLS). **New dedicated project.** $25 plan.
- **AI:** **OpenAI** vision. ~700–2,000 checks/mo ≈ $2–8/mo.
- **Hosting:** Vercel, auto-deploy from GitHub.
- **Architecture:** ultra-modular plug-and-play — `core/` (auth, layout, shared) untouched by feature `modules/`. Modern, sleek UI.
- **Devices:** mobile-first for field; web for office.
- **Offline (v1):** phone queues uploads, auto-sends when back online.
- **Language:** English v1; structured for **Telugu** later.

### Branding
SuperK red `#d2262f` primary (mockups recolored from template blue). SuperK logo (red + white). Currency ₹.

### Photo storage & retention
- Photos kept **6 months**, then **auto-purged**. Before purge, **Admin can bulk-download an archive** (to keep on a physical drive). Keeps storage bounded/cheap.

---

## 3. People: Roles, Job Titles, Departments

Three editable/addable managed lists:
- **Access Roles:** Admin, Field User, Reviewer, Viewer (a user can have several).
- **Job Titles** (task targeting + leaderboard scoping): SAE, ASM, Store Manager, Store Partner, …
- **Departments** (org grouping): Store Ops, COCO Store Ops, Marketing, Private Label, Category, Supply Chain, Data, QComm (a user can be in several).

**Permissions** are managed on a **dedicated Permissions page** (Admin-only) — a toggle matrix of each permission against **Roles only** (incl. delete rights), plus each role's **default landing page**. The matrix is **dynamic** — any role added/renamed appears automatically (nothing hardcoded). **Job Titles are NOT permissions** — they only drive task-targeting + leaderboard scoping.

Reviewers default to their own department's queue; Admin can grant cross-department access; queue is filterable.

---

## 4. Sign-in & onboarding

- **Login:** "Sign in with Google" (any Gmail) primary + **email/password backup** (reset + remember-me).
- Google = login + signup; first use → **Pending** account. Separate Create-Account page only for email/password.
- **Signup field:** Display Name only.
- **Approval gate:** new account Pending (sees nothing) until **Admin approves** + sets Display Name, role(s), department(s), job title, store mapping. Admin approval is the security gate (any Gmail → no domain limit). Editable anytime.
- **Seed/bootstrap Admin:** **anuj.dalvi@superk.in**.

---

## 5. Core data model

| Entity | Key fields |
|---|---|
| **Store** | Store Code, Name, Aligned (= **signed up**), **Store Type (FOFO/COCO)**, Score (1–10 or Unrated), **GPS coordinates** (for geofence), status |
| **User** | Display Name, email, Role(s), Department(s), Job Title, mapped Store(s) (**many-to-many**), Status (Active/Inactive/Pending) |
| **Department / Role / Job Title** | Code, Name |
| **Campaign** | see §6 |
| **Task** | campaign × store × cycle, Due Date, status (Pending/Submitted/Approved/Rejected/Missed) |
| **Submission (Proof)** | photo(s), **submitting user**, comments, GPS, timestamp, **image hash** (dup detection), **geofence flag**, AI score/verdict/assessment, human verdict, rejection reason, retry history |
| **Non-submission / Rejection reasons** | admin-managed lists |
| **Audit log** | who did what & when (approvals, rejections, **verdict overrides**, edits, deletes) — viewable on an **Admin-only audit page** |

CSV bulk upload for Stores, Users, Campaigns. **Deactivating a user** keeps their past submissions (for analytics); only stops new tasks. **Soft delete** everywhere (recoverable), permission-gated.

---

## 6. Campaigns

A **Campaign** = a brand activity executed + proven across stores.

### Setup
- **Name**, **Execution Type** (managed list), **Departments** (one or more), **Frequency** (Daily/Weekly/Monthly), **Status** (configurable list; seed: **Draft / Active / Paused / Completed** — **Paused stops task generation**).
- **Start/End Date** (cycle due dates derived from frequency across the range — §7).
- **Reference media:** **one or more reference images** + **Reference Text/Instructions**.
- **Assigned Stores** (multi + CSV; **only Aligned stores eligible**).
- **Target Job Titles** (optional).
- **Allow Late Upload** toggle (off → past-due = Missed/locked; on → late allowed + flagged, and **late-but-approved earns payout**).
- **Daily skip options:** skip **weekends** and **holidays** (holiday list in Settings).

### Payout
- Enable + **Amount (₹)**; **Payout Model** from configurable list (Binary pass/fail, Tiered, …). Earned **per store, per passing cycle**.

### AI / review
- **AI Review** toggle (ON default; OFF → manual only).
- **AI Strictness** (Low/Med/High), **Pass Threshold**, **Score Mode** (Reviewer Preferred / AI Preferred / AI Auto-Approve), **AI Score Visibility** (prevent-bias), **Verdicts** (labels), **Brand Scoring Rubric** (free text → AI instructions).
- **Store Score usage:** per-campaign on/off toggle (default informational; B+C influence configurable in Settings — §16).

### Capture (per campaign)
- **Camera-only by default** (anti-fraud), gallery as exception. **1–3 photos**, scored by AI **as one set**. Camera stamps **timestamp + GPS**.

### Editing a live campaign
**Freeze past, apply changes forward** (past tasks/submissions untouched; changes affect future cycles).

### Bulk upload
Campaigns via CSV; **reference images uploaded separately** (not in CSV).

---

## 7. Task generation & field-user flow

- Active campaign → **Tasks** = campaign × eligible store × cycle (derived from Frequency across Start–End; weekly Jul 1–31 → 4 tasks/4 due dates; monthly → 1).
- Shown to a field user only if **mapped to that store** AND matching **target job title** (if set).
- **Many users per store:** all matching users see it; **any one completes it**; submission **attributed to the submitter**.
- **Tasks screen:** KPIs (Assigned / Pending / Submitted / **Need Attention = submitted-but-not-approved + about-to-expire**) + date filter; sections Pending / Submitted-Not-Approved (shows rejection reason, re-upload) / Submitted-Approved.
- **Upload pop-up:** reference image(s) + instructions + **optional Comments** + camera. Field user sees **both AI and human verdict** on their submissions.
- **Non-submission reason** closes the task for the cycle.
- **Missed** if not submitted by due date (late upload only if campaign allows).
- **Re-upload after rejection:** new submission, re-runs AI, unlimited until cycle ends.

### Anti-fraud
- **Camera-only** default. **GPS geofence** check vs store coordinates → **soft flag** for reviewer *(implemented only as a lightweight check when store coords exist; no heavy/costly processing)*. **Duplicate/old-photo detection** via image hashing → **flag** reused photos for the reviewer (not auto-reject).

---

## 8. AI review (OpenAI vision)

Scores each submission (photo set) vs **reference image(s) + rubric + strictness** → **Score (x/10)**, **Verdict** (vs threshold), **Assessment** bullets. Pending = `-/-`. **AI error/timeout → `-/-` → manual review.**

---

## 9. Manual review

- **Review screen:** Pending Review list + filters (Campaign/Store/Department/AI Verdict/date); columns Campaign, Submission Date, Department, AI Score, AI Verdict, Store, Review, delete. Recent Reviews section. Paginated.
- **Review detail:** Submission vs Reference side-by-side, **prevent-bias toggle**, **Human Verdict** Approve/Reject (+ rejection reason). Prev/next.
- **Bulk approve/reject** supported.
- **Self-review allowed.**
- **Delete (trash) = remove a submission made by mistake** (soft delete), distinct from rejecting.
- All actions audit-logged.

---

## 10. Payout (calculate & report only)

Approved cycle submission → store earns campaign payout for that cycle (per model). **No payment processing.** **No dedicated payout page** — shown on **Dashboard/Summary + export**. Reporting periods: **weekly and monthly**. **Verdict overrides retroactively adjust payout & metrics.**

---

## 11. Dashboards, metrics & export

- **KPIs:** Campaigns Active, Total Submissions, Manual Reviews Done, Manual Reviews Pending.
- **Week-Wise Campaign Data:** Campaign, Execution Type, **Submission %** (received ÷ expected), **Non-Rejection %** (not-rejected ÷ reviewed), **Payout Amount**, **Campaign Health** (thresholds editable in Settings; click → deeper view — *UI TBD*). *(Brand column dropped.)*
- **Brand-ready export:** **Excel/CSV, week-wise**, each store's **final verdict** (Approved/Rejected/Missed) per campaign/period.

---

## 12. Admin & Settings

- **Manage Stores / Users / Roles / Departments / Job Titles** — add/edit/delete + CSV bulk.
- **Manage dropdown lists** — Execution Types, Non-submission/Rejection reasons, **Holiday calendar**.
- **Permissions page** — dynamic permission × **role** matrix + per-role landing page (job titles are not permissions). See §23.
- **Settings** — configurable: campaign statuses, payout models, store-score scale/formula/weights (**formula shown in UI**) + recompute (**daily, midnight IST**), campaign-health thresholds, store-score AI-influence mode (B/C).
- **Audit page** (Admin only).
- **Photo archive/download** (before 6-month purge).

---

## 13. Sidebar navigation

Dashboard, Tasks, Review, Campaigns, Summary, Analysis, Leaderboard, Stores, Users, Roles/Departments, Settings — **each role sees only its permitted items.**

---

## 14. Out of scope for v1 (parked)

- Notifications/reminders (in-app/email/WhatsApp). Real payment processing. WhatsApp. Telugu/multilingual.

---

## 15. Additional pages

- **Settings** — see §12. *(Final walkthrough pending.)*
- **Leaderboard** — ranks Stores, Field Users, and job-title groups by **Submission % + Approval Rate**; filters campaign/date/period; **visibility scoped to viewer's own job-title group** (SAE→SAEs, etc.), **Admin sees all**; **Unrated stores shown separately**. Purpose: motivate field team + ease review.
- **Analysis** — analytics/charts. **Fully specified in §19.**
- **Summary (executions)** — week-on-week verdict matrix with drilldown, override, and export. **Fully specified in §18.**

---

## 16. Store Score (confirmed)

- **Purpose:** spot weak stores at a glance. **Informational for now**; a **B+C influence on AI** (B = adjust strictness, C = low-score → always manual) is a **Settings toggle for later**.
- **Inputs (rolling 60 days):** approval rate, on-time rate, rejection rate, missed rate, **submission rate**.
- **Scale:** 1–10. **Default weights** (formula **shown in the UI**); global default in Settings + **per-campaign on/off**.
- **New store:** **Unrated** (shown separately).
- **Manual override:** Admin can set/adjust (audit-logged).
- **Recompute:** **daily, midnight IST**.

---

## 18. Summary page (executions) — detailed

**Purpose:** week-on-week verdict tracking per campaign, with drill-down and verdict override.

**Access:** permission-controlled; default **Admin + Reviewer + Viewer**. **Row-scoped by ownership** — Reviewer/Viewer see only campaigns in **their department(s)**; **Admin sees all**.

**Flow:** top-level **campaign picker list** (columns: Campaign, Execution Type, Frequency, # Stores, overall Submission %, Campaign Health) → select a campaign → its **verdict matrix**.

**Matrix (desktop):**
- Rows = assigned stores; columns = **cycles** (adapt to frequency — days/weeks/months).
- Cells = **latest** verdict, shown by **colour + label/icon** (🟢 Approved / 🔴 Rejected / ⚪ Missed / 🟡 Pending / blank = not due) — colour-blind safe (never colour alone).
- **Store-name column frozen; horizontally scrollable** for many cycles.
- **Row total** = store approval %; **bottom row** = cycle submission %; **right column** = store **Payout earned**; **campaign payout total** at top.
- **Sort** rows by approval %, store score, or A–Z; **search** stores.

**Cell click → detail popup** (same component as the Review-detail screen): store name, campaign name, photo(s), AI score (if the campaign allows it), AI verdict, reviewer verdict, comments, submission date, submitted by. Shows the **latest** submission with an option to **view previous attempts** in that cycle. **Missed** cells show the **non-submission reason**.
- **Override (Admin/Reviewer):** change verdict — **→ Rejected requires a rejection reason** (managed list); **→ Approved requires an override note**. Both **audit-logged** and **retroactively adjust payout + metrics**. Overridden cells carry an **"edited" marker**; popup shows **original → new** history (who/when/reason).
- *(Mandatory-rejection-reason is a tool-wide rule — applies in Tasks, Review, and here.)*

**Phone view:** "one cycle at a time" — pick campaign → pick week → list of stores with that week's verdict; swipe between weeks; tap a store → popup.

**Filters:** Campaign, Month/date-range, Department, Store, Job-title group, Verdict.

**Export (both honour current filters):** **Brand-clean** (Excel, week-wise final verdict per store) and **Internal-detailed** (all attempts, comments, submitted-by, override history).

**Empty/not-started:** blank cells + friendly empty message. **Updates:** refresh/poll for v1 (live later).

---

## 19. Analysis page — detailed

**Purpose:** insight across execution performance, AI quality, integrity, and payout. *(Store/field-user rankings live on the separate Leaderboard, not here.)*

**Access:** **Admin + Reviewer + Viewer**, **row-scoped by department** (Reviewer/Viewer see only their departments; Admin sees all). **Desktop/web only** (no phone view). **Default period:** current month.

**Filters:** Date range · Campaign · Department · Store · Job-title group · Execution Type.

**Contents:**
- **Funnel:** Assigned → Submitted → AI-passed → Human-approved.
- **Rate cards + trends:** Submission %, Approval rate, Non-Rejection %, Rejection rate, Missed rate, Re-upload/retry rate.
- **AI quality:** AI ↔ Human **agreement matrix** (confusion matrix), **Override rate**, **AI reliability** (`-/-` failure/timeout rate).
- **Quality drivers:** **Top rejection reasons** (Pareto), **Non-submission reasons** breakdown.
- **Integrity flags:** geofence-flag %, duplicate-photo-flag %, late-submission %.
- **Payout:** total committed (by campaign / store / department / period), **payout trend**, **₹ per approved execution**.

**Drill-down:** clicking any chart segment (a rejection reason, a funnel stage, a flagged slice, etc.) opens the **underlying list of executions** behind it.

**Export:** **Excel** (data) + **PDF** (snapshot) for sharing.

---

## 20. Reviewer queue (detailed)

- **Shared pool**, scoped to the reviewer's **allowed department(s)** — no manual assignment. A multi-department campaign's submissions are visible to reviewers in **any** of its departments.
- **Soft-lock:** opening a submission marks it *"being reviewed by [name]"* and greys it for others; **auto-releases** after ~10 min idle or on finish. Backstop: if two act on the same item, the second gets *"already reviewed by [name]."*
- **What enters the manual queue (by campaign Score Mode):**
  - AI **OFF** → all submissions.
  - AI ON · **Reviewer Preferred** → all AI-scored items (human decides).
  - AI ON · **AI Preferred** → AI auto-decides; items still appear for **optional override**.
  - AI ON · **AI Auto-Approve** → AI **passes auto-approved** (skip queue); AI **fails → queue**.
  - **AI error / `-/-`** → always to manual.
- **Order:** FIFO (oldest first) + sort options (AI score lowest-first, due-date urgency).
- **Aging indicator:** colour items **about-to-expire / overdue** (ties to "Need Attention").
- **Bulk approve/reject** on items not locked by someone else.
- Reject → **mandatory rejection reason**. After a verdict → **Recent Reviews**; later changes go through the **Summary override** path (audit-logged). All actions audit-logged.

---

## 21. Campaign "deeper view" (Dashboard health drilldown)

Opened from a campaign's **Health** badge on the Dashboard. A **health-diagnostic view, separate from the Summary matrix** (with a link to it). Same **view + department scoping** as Summary/Analysis.

- **Top "What's wrong & who to chase" panel** (esp. when Critical): the **failing metric vs threshold** ("Submission 40% < 50%"), the **bottom 3–5 stores** dragging it down each with the **mapped field user to contact**, and the **#1 rejection/non-submission reason**.
- **Header:** name, execution type, frequency, department(s), date range, status, # stores, **health badge + why** (rule + current values).
- **KPI row:** Submission %, Non-Rejection %, Approval rate, Missed rate, Payout committed.
- **Trend:** week-on-week submission %/approval % for this campaign.
- **Store breakdown:** assigned stores with submission %, last verdict, store score — worst highlighted.
- **Mini rejection-reason Pareto** for this campaign.
- **Actions:** Edit Campaign · open Review queue filtered to this campaign · open Summary matrix · Export.

---

## 22. CSV bulk-upload column specs

Multiple values separated by `;`. Dates `YYYY-MM-DD`. `*` = required.

- **Stores:** `Store Code*` · `Store Name*` · `Aligned (yes/no)` · `Store Type (FOFO/COCO)` · `Latitude` · `Longitude` · `Status`. *(Score is auto → starts "Unrated".)*
- **Users:** `Display Name*` · `Email*` · `Role(s)` · `Department(s)` · `Job Title` · `Mapped Store Codes` · `Status`. **CSV users are pre-approved/Active** (skip Pending); when they sign in with that Google email they're **auto-linked**. *(No phone field in v1.)*
- **Campaigns (core fields only):** `Campaign Name*` · `Execution Type` · `Department(s)` · `Frequency` · `Status` · `Start Date` · `End Date` · `Instructions` · `Assigned Store Codes` · `Target Job Titles` · `Allow Late Upload` · `Skip Weekends` · `Skip Holidays`. **AI/payout config is defaulted and fine-tuned in the UI.** **Reference images uploaded separately**, matched by Campaign Name.

---

## 23. Settings (Admin-only) — config hub

**Access:** **Admin only.** **Extensible by design** — new setting groups drop in without rework. *(This list is not exhaustive; more settings will be added over time.)*

**A. Access & Permissions**
- **Permission matrix** — permissions **by Role** (incl. delete rights). **Dynamic:** auto-includes any role added/renamed. *(Job Titles are not permissions.)*
- **Default landing page** per role.

**B. People & Org lists** *(managed on the Roles/Departments page; dynamic — downstream selectors update automatically)*
- Roles · Departments · Job Titles.

**C. Campaign configuration lists**
- Execution Types · **Campaign Statuses** (seed Draft/Active/Paused/Completed; **Paused stops task generation**) · **Payout Models** (Binary, Tiered, …) · Non-submission reasons · Rejection reasons · **Holiday calendar**.

**D. AI & scoring defaults**
- New-campaign defaults: AI strictness, pass threshold, score mode, AI-score visibility.
- **Store Score:** 60-day window · 1–10 scale · formula/weights (shown in UI) · recompute daily midnight IST · AI-influence mode (Informational / B adjust-strictness / C low-score→manual).

**E. Health & integrity**
- **Campaign-health thresholds & rules** (On Track / Needs Attention / Critical).
- **Geofence radius** — default **150 m**, configurable.
- **Duplicate-detection** on/off + sensitivity.

**F. Data & retention**
- **Photo retention** (6 months) + **Archive download** (ZIP) before purge.
- **Audit log** access (Admin).

---

## 17. Open items — STATUS

All major areas are specified. **Resolved confirmations:** permissions by **Role only** (job titles = targeting/leaderboard); geofence **150 m** soft-flag (configurable); duplicate-detection = reviewer **flag** (not auto-reject); campaign status seed **Draft/Active/Paused/Completed** (Paused stops generation); archive = **ZIP**; Settings = **Admin-only, extensible**.

**Remaining:** none blocking. Additional Settings groups may be added over time (Settings is built extensible). → **Document ready for sign-off.**
