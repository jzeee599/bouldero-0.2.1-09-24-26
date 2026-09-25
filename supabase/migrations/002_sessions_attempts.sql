-- Milestone 2A: gym sessions and per-route attempt notes.
create table public.climbing_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  gym text not null check (length(trim(gym)) between 1 and 100),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  check (ended_at is null or ended_at >= started_at)
);

create unique index one_active_session_per_user
  on public.climbing_sessions(user_id) where ended_at is null;
create index climbing_sessions_owner_started
  on public.climbing_sessions(user_id, started_at desc);

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  session_id uuid not null references public.climbing_sessions(id) on delete cascade,
  result text not null check (result in ('attempt','sent')),
  notes text not null default '' check (length(notes) <= 500),
  created_at timestamptz not null default now()
);

create index attempts_project_created on public.attempts(project_id, created_at desc);
create index attempts_session_created on public.attempts(session_id, created_at);

alter table public.climbing_sessions enable row level security;
alter table public.attempts enable row level security;

create policy own_sessions on public.climbing_sessions for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy own_attempts on public.attempts for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.climbing_sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
        and s.ended_at is null
    )
  );

grant select, insert, update, delete on public.climbing_sessions, public.attempts to authenticated;
