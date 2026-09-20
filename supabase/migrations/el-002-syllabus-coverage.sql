-- ============================================================================
-- Exam Lab (el_) — syllabus coverage: which syllabus topics a class / school
-- has completed, per course. Assignment gating (exam-allocate + automated
-- study plans) draws questions ONLY from topics confirmed covered here.
-- Additive & idempotent. Safe to run multiple times.
-- Depends on edu-001 helper edu_is_staff() (present in this project).
-- Reads/writes happen through server route handlers using the service-role
-- client; RLS below is defense-in-depth for any direct anon/authenticated use.
-- ============================================================================

create table if not exists el_syllabus_coverage (
  id             uuid primary key default gen_random_uuid(),
  course         text not null default '9702',          -- e.g. 9702, 5054, IB
  topic          text not null,                          -- canonical topic label (exam-lab taxonomy)
  scope_type     text not null check (scope_type in ('class','school','network')),
  scope_id       text not null,                          -- class id (registry/edu_classes) | school name | '*'
  scope_label    text not null,                          -- human label, e.g. "LGS 55 Main · Year 1 A"
  covered_at     timestamptz not null default now(),
  covered_by     uuid references auth.users(id) on delete set null,
  covered_by_name text,
  note           text,
  created_at     timestamptz not null default now(),
  unique (course, scope_type, scope_id, topic)
);
create index if not exists el_syllabus_coverage_lookup_idx
  on el_syllabus_coverage (course, scope_type, scope_id);

-- ---------- RLS ---------------------------------------------------------------
alter table el_syllabus_coverage enable row level security;

-- staff may read coverage (the app narrows further to the caller's classes).
drop policy if exists el_cov_staff_read on el_syllabus_coverage;
create policy el_cov_staff_read on el_syllabus_coverage for select to authenticated
  using (edu_is_staff());

-- only staff record coverage.
drop policy if exists el_cov_staff_write on el_syllabus_coverage;
create policy el_cov_staff_write on el_syllabus_coverage for all to authenticated
  using (edu_is_staff()) with check (edu_is_staff());

-- minimal grants (RLS still governs row visibility)
grant select on el_syllabus_coverage to authenticated;
grant insert, update, delete on el_syllabus_coverage to authenticated;
