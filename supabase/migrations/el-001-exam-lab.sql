-- ============================================================================
-- Exam Lab (el_) — question bank, generated tests, attempts
-- Additive & idempotent. Safe to run multiple times.
-- Depends on edu-001 helper edu_is_staff() (present in this project).
-- Reads/writes happen through server route handlers using the service-role
-- client; RLS below is defense-in-depth for any direct anon/authenticated use.
-- ============================================================================

-- ---------- question bank -----------------------------------------------------
create table if not exists el_questions (
  id            uuid primary key default gen_random_uuid(),
  topic         text not null,
  subtopic      text,
  level         text not null check (level in ('LOT','HOT')),
  qtype         text not null check (qtype in ('mcq','structured')),
  paper         text not null default 'P2',
  command_word  text,
  marks         int  not null default 1,
  stem          text not null,
  options       jsonb,                      -- array of 4 strings for mcq
  answer_index  int,                        -- 0-based correct option for mcq
  scheme        jsonb not null default '[]'::jsonb,  -- array of marking points
  source        text not null default 'authored',   -- authored | ai | pastpaper
  source_ref    text,                       -- e.g. 9702/12/M/J/22 Q5
  visibility    text not null default 'portal' check (visibility in ('public','portal','both')),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists el_questions_filter_idx
  on el_questions (visibility, is_active, level, qtype, topic);

-- ---------- generated tests ---------------------------------------------------
create table if not exists el_tests (
  id            uuid primary key default gen_random_uuid(),
  share_token   text unique not null default replace(gen_random_uuid()::text, '-', ''),
  mode          text not null default 'portal' check (mode in ('public','portal')),
  config        jsonb not null default '{}'::jsonb,
  question_ids  jsonb not null default '[]'::jsonb,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- ---------- attempts ----------------------------------------------------------
create table if not exists el_attempts (
  id            uuid primary key default gen_random_uuid(),
  test_id       uuid references el_tests(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,
  answers       jsonb not null default '{}'::jsonb,
  mcq_score     int not null default 0,
  mcq_total     int not null default 0,
  submitted_at  timestamptz not null default now()
);
create index if not exists el_attempts_user_idx on el_attempts (user_id, submitted_at desc);

-- ---------- RLS ---------------------------------------------------------------
alter table el_questions enable row level security;
alter table el_tests     enable row level security;
alter table el_attempts  enable row level security;

-- questions: anyone may read PUBLIC questions; signed-in users read portal too.
drop policy if exists el_q_public_read on el_questions;
create policy el_q_public_read on el_questions for select
  using (is_active and visibility in ('public','both'));

drop policy if exists el_q_portal_read on el_questions;
create policy el_q_portal_read on el_questions for select to authenticated
  using (is_active and visibility in ('public','portal','both'));

drop policy if exists el_q_staff_manage on el_questions;
create policy el_q_staff_manage on el_questions for all to authenticated
  using (edu_is_staff()) with check (edu_is_staff());

-- tests: owner or staff may read; owner may create their own.
drop policy if exists el_t_owner_read on el_tests;
create policy el_t_owner_read on el_tests for select to authenticated
  using (created_by = auth.uid() or edu_is_staff());
drop policy if exists el_t_owner_insert on el_tests;
create policy el_t_owner_insert on el_tests for insert to authenticated
  with check (created_by = auth.uid());

-- attempts: owner or staff may read; owner may insert their own.
drop policy if exists el_a_owner_read on el_attempts;
create policy el_a_owner_read on el_attempts for select to authenticated
  using (user_id = auth.uid() or edu_is_staff());
drop policy if exists el_a_owner_insert on el_attempts;
create policy el_a_owner_insert on el_attempts for insert to authenticated
  with check (user_id = auth.uid());

-- minimal grants (RLS still governs row visibility)
grant select on el_questions to anon, authenticated;
grant select, insert on el_tests to authenticated;
grant select, insert on el_attempts to authenticated;

-- ---------- teacher review view ----------------------------------------------
create or replace view el_attempt_review as
  select a.id, a.submitted_at, a.mcq_score, a.mcq_total,
         a.user_id, p.full_name, t.config, t.question_ids
  from el_attempts a
  join el_tests t on t.id = a.test_id
  left join edu_profiles p on p.id = a.user_id;
