-- Vero — 0033 contest chat messages
-- Per-user conversation history for the Contest Impact chatbot, scoped to
-- one campaign + month at a time. Each user's thread is private — nobody
-- reads anyone else's half-formed questions.

create table public.contest_chat_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  campaign_key text not null,
  month       date not null,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);

create index contest_chat_messages_thread_idx
  on public.contest_chat_messages (user_id, campaign_key, month, created_at);

alter table public.contest_chat_messages enable row level security;

create policy "users read own contest chat messages" on public.contest_chat_messages
  for select to authenticated using (user_id = auth.uid());

create policy "users insert own contest chat messages" on public.contest_chat_messages
  for insert to authenticated with check (user_id = auth.uid());
