-- ============================================================================
-- SAT Lab (sat_) — question bank, adaptive forms, attempts, module results
-- Additive & idempotent. Safe to run multiple times.
-- Depends on edu-001 helper edu_is_staff() (present in this project).
--
-- SERVER-ONLY WRITES; ANSWERS NEVER EXPOSED VIA POSTGREST.
-- Every write to these tables is made by the SAT route handlers with the
-- service-role client, which bypasses RLS. Nothing here lets a signed-in
-- user write through PostgREST with the anon key (they could otherwise
-- forge score_authority / score_lower / score_upper or raw_correct), and
-- sat_questions -- every answer and rationale -- has no anon/authenticated
-- access at all: the answer key never reaches the browser before a
-- question is submitted. Owners (and staff) may only READ their own forms,
-- attempts and module results.
-- ============================================================================

-- ---------- question bank -----------------------------------------------------
-- Mirrors the generated src/lib/sat/question-bank.json so the bank can be
-- queried as well as bundled. `cb_id` is College Board's own Question ID and
-- is the dedupe key (integrity rule 3), so it is unique rather than merely
-- indexed.
create table if not exists sat_questions (
  id           uuid primary key default gen_random_uuid(),
  cb_id        text unique not null,
  section      text not null check (section in ('rw','math')),
  domain       text not null,
  skill        text not null,
  difficulty   text not null check (difficulty in ('E','M','H')),
  answer       jsonb not null,           -- {kind:'mcq',correct:0..3} | {kind:'spr',accepted:[]}
  rationale    text not null,
  img          text not null,            -- bucket path, sat/ prefix
  source_ref   text not null,
  source       text not null default 'question-bank'
                 check (source in ('question-bank','practice-test')),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists sat_questions_filter_idx
  on sat_questions (section, domain, difficulty, is_active);

-- ---------- assembled forms ---------------------------------------------------
-- `sets` holds the six question-id lists of an adaptive form (spec 7).
-- `routing_threshold` is stored per form, not read from code at scoring time:
-- a form scored months later must be scored against the threshold it was
-- actually sat under, even if the site's default has since changed.
create table if not exists sat_forms (
  id                uuid primary key default gen_random_uuid(),
  kind              text not null default 'adaptive'
                      check (kind in ('adaptive','practice-test')),
  test_no           int,                 -- set for practice-test forms only
  sets              jsonb not null default '{}'::jsonb,
  routing_threshold jsonb not null default '{}'::jsonb,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now()
);

-- ---------- attempts ----------------------------------------------------------
-- `score_authority` is stored, not derived at read time. Spec 10.5 says a
-- score is official only when it came from an ingested conversion table; if
-- that provenance were recomputed later it could silently change, so the
-- claim is frozen with the attempt that earned it.
create table if not exists sat_attempts (
  id               uuid primary key default gen_random_uuid(),
  form_id          uuid references sat_forms(id) on delete cascade,
  user_id          uuid references auth.users(id) on delete set null,
  score_authority  text check (score_authority in ('official','estimated')),
  score_lower      int,
  score_upper      int,
  started_at       timestamptz not null default now(),
  submitted_at     timestamptz
);
create index if not exists sat_attempts_user_idx
  on sat_attempts (user_id, submitted_at desc);

-- ---------- per-module results ------------------------------------------------
-- One row per module sat. `routed_to` records which Module 2 the student was
-- actually given, so a score report can show the path taken.
create table if not exists sat_module_results (
  id           uuid primary key default gen_random_uuid(),
  attempt_id   uuid references sat_attempts(id) on delete cascade,
  section      text not null check (section in ('rw','math')),
  module       int  not null check (module in (1,2)),
  routed_to    text check (routed_to in ('lower','upper')),
  answers      jsonb not null default '{}'::jsonb,
  raw_correct  int  not null default 0,
  raw_total    int  not null default 0,
  submitted_at timestamptz not null default now()
);
create index if not exists sat_module_results_attempt_idx
  on sat_module_results (attempt_id);

-- ---------- RLS ---------------------------------------------------------------
alter table sat_questions      enable row level security;
alter table sat_forms          enable row level security;
alter table sat_attempts       enable row level security;
alter table sat_module_results enable row level security;

-- questions: service role only. The rows carry every answer and rationale,
-- so no signed-in user -- student, parent or staff -- may read them through
-- PostgREST; the server serves questions without their answers
-- (src/lib/sat/serve.ts). Earlier drafts' policies are dropped so a re-run
-- converges.
drop policy if exists sat_q_portal_read on sat_questions;
drop policy if exists sat_q_staff_manage on sat_questions;
revoke all on sat_questions from anon, authenticated;

-- forms, attempts, module results: the owner (or staff) may read; no one
-- but the service role writes.
drop policy if exists sat_f_owner_read on sat_forms;
create policy sat_f_owner_read on sat_forms for select to authenticated
  using (created_by = auth.uid() or edu_is_staff());
drop policy if exists sat_f_owner_insert on sat_forms;

drop policy if exists sat_a_owner_read on sat_attempts;
create policy sat_a_owner_read on sat_attempts for select to authenticated
  using (user_id = auth.uid() or edu_is_staff());
drop policy if exists sat_a_owner_write on sat_attempts;
drop policy if exists sat_a_owner_update on sat_attempts;

-- module results: reachable only through an attempt the user owns.
drop policy if exists sat_mr_owner_read on sat_module_results;
create policy sat_mr_owner_read on sat_module_results for select to authenticated
  using (exists (
    select 1 from sat_attempts a
    where a.id = attempt_id and (a.user_id = auth.uid() or edu_is_staff())
  ));
drop policy if exists sat_mr_owner_write on sat_module_results;

-- grants: read only (RLS still governs which rows); writes stay with the
-- service role. The revoke also undoes Supabase's default table grants.
revoke all on sat_forms, sat_attempts, sat_module_results from anon, authenticated;
grant select on sat_forms, sat_attempts, sat_module_results to authenticated;
