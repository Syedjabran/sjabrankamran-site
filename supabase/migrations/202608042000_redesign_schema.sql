-- Redesign schema additions (education-first + Physics Studio).
-- Idempotent & additive. Safe to run in Supabase SQL Editor.

create extension if not exists pgcrypto;

-- Physics questions submitted via Physics Studio -------------------------------
create table if not exists public.physics_questions (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  curriculum text not null default 'A-Level',
  topic text,
  difficulty text,
  response_mode text,
  student_email text,
  consent boolean not null default false,
  ai_answer text,
  ai_provider text,
  teacher_answer text,
  review_status text not null default 'ai_answered', -- ai_answered | review_requested | teacher_answered | approved
  is_public boolean not null default false,
  moderation_status text not null default 'ok',      -- ok | flagged | rejected
  reported boolean not null default false,
  slug text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists physics_q_status_idx on public.physics_questions(review_status, created_at desc);
create index if not exists physics_q_public_idx on public.physics_questions(is_public, created_at desc);

alter table public.physics_questions enable row level security;
-- Public may read only approved, public, ok-moderated answers.
drop policy if exists "public reads approved questions" on public.physics_questions;
create policy "public reads approved questions" on public.physics_questions
  for select using (is_public = true and review_status = 'approved' and moderation_status = 'ok');
-- Inserts/updates happen server-side via service role only (no public write policy).

-- Physics topics catalogue -----------------------------------------------------
create table if not exists public.physics_topics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  curriculum text not null default 'A-Level',
  display_order integer not null default 0
);
alter table public.physics_topics enable row level security;
drop policy if exists "public reads topics" on public.physics_topics;
create policy "public reads topics" on public.physics_topics for select using (true);

-- Extend articles for the Insights platform ------------------------------------
alter table public.articles add column if not exists category text;
alter table public.articles add column if not exists author text default 'Syed Jabran Ali Kamran';
alter table public.articles add column if not exists read_minutes integer;
alter table public.articles add column if not exists authorship text default 'written'; -- written | ai_assisted

-- Seed a starter set of physics topics (safe, generic) -------------------------
insert into public.physics_topics (name, curriculum, display_order) values
  ('Mechanics','A-Level',1),
  ('Waves','A-Level',2),
  ('Electricity','A-Level',3),
  ('Fields','A-Level',4),
  ('Thermal Physics','A-Level',5),
  ('Circular Motion','A-Level',6),
  ('Quantum Physics','A-Level',7),
  ('Nuclear Physics','A-Level',8),
  ('Practical Skills','A-Level',9),
  ('Data Analysis & Uncertainty','A-Level',10)
on conflict do nothing;
