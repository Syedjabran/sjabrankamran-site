-- ============================================================
-- EDU-001 — EDUCATION PORTAL CRM: FOUNDATION
-- Project: sjabrankamran.com (Supabase uiqugjlpkbzpujrisfgg)
-- Additive only. All objects use the edu_ prefix.
-- Safe to run once via the Supabase SQL Editor.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- 1. ENUMS ----------
do $$ begin
  create type edu_role as enum
    ('super_admin','admin','teacher','teaching_assistant','student',
     'parent','counsellor','content_manager','finance_manager');
exception when duplicate_object then null; end $$;

do $$ begin
  create type edu_attendance_status as enum
    ('present','absent','late','excused');
exception when duplicate_object then null; end $$;

do $$ begin
  create type edu_submission_status as enum
    ('assigned','submitted','late','marked','returned','resubmit');
exception when duplicate_object then null; end $$;

do $$ begin
  create type edu_invoice_status as enum
    ('draft','sent','partially_paid','paid','overdue','cancelled','refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type edu_enrolment_status as enum
    ('enquiry','trial','active','paused','completed','withdrawn');
exception when duplicate_object then null; end $$;

-- ---------- 2. PROFILES & ROLES ----------
create table if not exists edu_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  phone text,
  avatar_url text,
  status text not null default 'active' check (status in ('active','archived','invited')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists edu_user_roles (
  user_id uuid not null references edu_profiles(id) on delete cascade,
  role edu_role not null,
  granted_by uuid references edu_profiles(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- Auto-create a profile when a user signs up (default: no roles; admin assigns).
create or replace function edu_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into edu_profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists edu_on_auth_user_created on auth.users;
create trigger edu_on_auth_user_created
  after insert on auth.users
  for each row execute function edu_handle_new_user();

-- ---------- 3. ROLE HELPER FUNCTIONS (RLS backbone) ----------
create or replace function edu_has_role(r edu_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from edu_user_roles where user_id = auth.uid() and role = r);
$$;

create or replace function edu_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from edu_user_roles
                 where user_id = auth.uid() and role in ('super_admin','admin'));
$$;

create or replace function edu_is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from edu_user_roles
                 where user_id = auth.uid()
                   and role in ('super_admin','admin','teacher','teaching_assistant',
                                'counsellor','content_manager','finance_manager'));
$$;

create or replace function edu_is_finance()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from edu_user_roles
                 where user_id = auth.uid()
                   and role in ('super_admin','admin','finance_manager'));
$$;

-- ---------- 4. PEOPLE ----------
create table if not exists edu_students (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references edu_profiles(id) on delete set null,
  student_no text unique,
  date_of_birth date,
  school text,
  target_qualification text,
  previous_school text,
  counselling_notes text,
  admission_status edu_enrolment_status not null default 'enquiry',
  created_by uuid references edu_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists edu_guardians (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references edu_profiles(id) on delete set null,
  occupation text,
  preferred_contact text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists edu_student_guardians (
  student_id uuid not null references edu_students(id) on delete cascade,
  guardian_id uuid not null references edu_guardians(id) on delete cascade,
  relationship text not null default 'parent',
  is_primary boolean not null default false,
  primary key (student_id, guardian_id)
);

create table if not exists edu_teachers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references edu_profiles(id) on delete set null,
  bio text,
  qualifications text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Helper: current user's student row (if any)
create or replace function edu_my_student_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from edu_students where profile_id = auth.uid();
$$;

-- Helper: is the current user a guardian linked to this student?
create or replace function edu_is_my_ward(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from edu_student_guardians sg
    join edu_guardians g on g.id = sg.guardian_id
    where sg.student_id = sid and g.profile_id = auth.uid());
$$;

-- ---------- 5. ACADEMIC STRUCTURE ----------
create table if not exists edu_programmes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,          -- e.g. CAIE-9702
  name text not null,                 -- e.g. CAIE A-Level Physics 9702
  board text,                         -- CAIE / IB / Custom
  level text,                         -- A-Level / O-Level / IGCSE / IB SL / IB HL
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists edu_courses (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid references edu_programmes(id) on delete set null,
  name text not null,
  description text,
  default_fee numeric(12,2),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists edu_topics (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid references edu_programmes(id) on delete cascade,
  code text,                          -- syllabus reference e.g. 9702/17
  title text not null,
  parent_id uuid references edu_topics(id) on delete cascade,
  sort_order int not null default 0
);

create table if not exists edu_terms (
  id uuid primary key default gen_random_uuid(),
  name text not null,                 -- e.g. Aug 2026 – Jan 2027
  starts_on date not null,
  ends_on date not null
);

create table if not exists edu_classes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references edu_courses(id) on delete set null,
  term_id uuid references edu_terms(id) on delete set null,
  name text not null,                 -- e.g. A2 Physics Evening Batch
  teacher_id uuid references edu_teachers(id) on delete set null,
  room text,
  meeting_url text,
  capacity int,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Helper: does the current user teach this class?
create or replace function edu_teaches_class(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from edu_classes c
    join edu_teachers t on t.id = c.teacher_id
    where c.id = cid and t.profile_id = auth.uid());
$$;

create table if not exists edu_enrolments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references edu_classes(id) on delete cascade,
  student_id uuid not null references edu_students(id) on delete cascade,
  status edu_enrolment_status not null default 'active',
  enrolled_on date not null default current_date,
  left_on date,
  unique (class_id, student_id)
);

-- Helper: is this student enrolled in a class the current user teaches?
create or replace function edu_teaches_student(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from edu_enrolments e
    where e.student_id = sid and edu_teaches_class(e.class_id));
$$;

create table if not exists edu_schedules (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references edu_classes(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null
);

create table if not exists edu_lessons (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references edu_classes(id) on delete cascade,
  lesson_date date not null,
  starts_at time,
  ends_at time,
  topic_id uuid references edu_topics(id) on delete set null,
  title text,
  objectives text,
  notes text,
  status text not null default 'planned' check (status in ('planned','done','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- 6. RESOURCES ----------
create table if not exists edu_resources (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references edu_classes(id) on delete cascade,
  course_id uuid references edu_courses(id) on delete cascade,
  topic_id uuid references edu_topics(id) on delete set null,
  title text not null,
  kind text not null default 'file'
    check (kind in ('file','video','link','worksheet','past_paper','mark_scheme',
                    'notes','slides','formula_sheet','practical','quiz','other')),
  storage_path text,                  -- private bucket path (signed URLs)
  external_url text,
  visible_to text not null default 'class' check (visible_to in ('class','course','public_students')),
  uploaded_by uuid references edu_profiles(id),
  created_at timestamptz not null default now()
);

-- ---------- 7. ASSIGNMENTS & SUBMISSIONS ----------
create table if not exists edu_assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references edu_classes(id) on delete cascade,
  topic_id uuid references edu_topics(id) on delete set null,
  title text not null,
  instructions text,
  due_at timestamptz,
  max_marks numeric(6,2),
  rubric jsonb,
  allow_resubmission boolean not null default false,
  created_by uuid references edu_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists edu_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references edu_assignments(id) on delete cascade,
  student_id uuid not null references edu_students(id) on delete cascade,
  status edu_submission_status not null default 'assigned',
  submitted_at timestamptz,
  files jsonb not null default '[]'::jsonb,   -- [{path,name,size}]
  answer_text text,
  marks numeric(6,2),
  feedback text,
  marked_by uuid references edu_profiles(id),
  marked_at timestamptz,
  unique (assignment_id, student_id)
);

-- ---------- 8. ASSESSMENTS ----------
create table if not exists edu_assessments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references edu_classes(id) on delete cascade,
  title text not null,
  kind text not null default 'test' check (kind in ('quiz','test','mock_exam','practical')),
  starts_at timestamptz,
  duration_minutes int,
  total_marks numeric(6,2),
  grade_boundaries jsonb,             -- {"A*":90,"A":80,...}
  status text not null default 'draft' check (status in ('draft','published','closed','marked')),
  created_by uuid references edu_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists edu_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid references edu_assessments(id) on delete cascade,
  topic_id uuid references edu_topics(id) on delete set null,
  kind text not null default 'mcq'
    check (kind in ('mcq','structured','numerical','practical_planning','file_upload')),
  prompt text not null,               -- markdown + LaTeX
  options jsonb,                      -- MCQ options
  correct jsonb,                      -- correct answer(s) — never exposed to students by RLS
  marks numeric(6,2) not null default 1,
  sort_order int not null default 0
);

create table if not exists edu_results (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references edu_assessments(id) on delete cascade,
  student_id uuid not null references edu_students(id) on delete cascade,
  score numeric(6,2),
  breakdown jsonb,                    -- per-question marks
  grade text,
  feedback text,
  marked_by uuid references edu_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_id, student_id)
);

-- ---------- 9. ATTENDANCE ----------
create table if not exists edu_attendance (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references edu_lessons(id) on delete cascade,
  student_id uuid not null references edu_students(id) on delete cascade,
  status edu_attendance_status not null default 'present',
  note text,
  recorded_by uuid references edu_profiles(id),
  recorded_at timestamptz not null default now(),
  unique (lesson_id, student_id)
);

-- ---------- 10. FEES & FINANCE ----------
create table if not exists edu_fee_plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references edu_students(id) on delete cascade,
  course_id uuid references edu_courses(id) on delete set null,
  label text not null,                -- e.g. Monthly tuition
  amount numeric(12,2) not null,
  currency text not null default 'PKR',
  cadence text not null default 'monthly' check (cadence in ('one_off','monthly','termly')),
  discount_pct numeric(5,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists edu_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text unique,
  student_id uuid not null references edu_students(id) on delete cascade,
  fee_plan_id uuid references edu_fee_plans(id) on delete set null,
  amount numeric(12,2) not null,
  currency text not null default 'PKR',
  due_on date,
  status edu_invoice_status not null default 'draft',
  lines jsonb not null default '[]'::jsonb,
  notes text,
  created_by uuid references edu_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists edu_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references edu_invoices(id) on delete cascade,
  amount numeric(12,2) not null,
  method text not null default 'cash' check (method in ('cash','bank_transfer','cheque','online','other')),
  paid_on date not null default current_date,
  evidence_path text,                 -- private bucket
  reference text,
  recorded_by uuid references edu_profiles(id),
  created_at timestamptz not null default now()
);

-- ---------- 11. COMMUNICATION ----------
create table if not exists edu_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  audience text not null default 'all'
    check (audience in ('all','students','parents','teachers','class')),
  class_id uuid references edu_classes(id) on delete cascade,
  publish_at timestamptz not null default now(),
  created_by uuid references edu_profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists edu_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references edu_profiles(id) on delete cascade,
  kind text not null default 'info',
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists edu_conversations (
  id uuid primary key default gen_random_uuid(),
  subject text,
  created_by uuid references edu_profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists edu_conversation_members (
  conversation_id uuid not null references edu_conversations(id) on delete cascade,
  user_id uuid not null references edu_profiles(id) on delete cascade,
  primary key (conversation_id, user_id)
);

create table if not exists edu_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references edu_conversations(id) on delete cascade,
  sender_id uuid not null references edu_profiles(id) on delete cascade,
  body text not null,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function edu_in_conversation(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from edu_conversation_members
                 where conversation_id = cid and user_id = auth.uid());
$$;

-- ---------- 12. AI & PROGRESS ----------
create table if not exists edu_ai_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references edu_students(id) on delete cascade,
  topic_id uuid references edu_topics(id) on delete set null,
  mode text not null default 'explain',
  question_count int not null default 0,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists edu_topic_mastery (
  student_id uuid not null references edu_students(id) on delete cascade,
  topic_id uuid not null references edu_topics(id) on delete cascade,
  mastery numeric(5,2) not null default 0 check (mastery between 0 and 100),
  evidence jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (student_id, topic_id)
);

create table if not exists edu_certificates (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references edu_students(id) on delete cascade,
  title text not null,
  issued_on date not null default current_date,
  storage_path text,
  issued_by uuid references edu_profiles(id)
);

-- ---------- 13. AUDIT ----------
create table if not exists edu_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb,
  created_at timestamptz not null default now()
);

-- ---------- 14. updated_at TRIGGERS ----------
create or replace function edu_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'edu_profiles','edu_students','edu_guardians','edu_teachers','edu_courses',
    'edu_classes','edu_lessons','edu_assignments','edu_assessments','edu_results','edu_invoices'
  ] loop
    execute format('drop trigger if exists %I_touch on %I', t, t);
    execute format('create trigger %I_touch before update on %I
                    for each row execute function edu_touch_updated_at()', t, t);
  end loop;
end $$;

-- ---------- 15. INDEXES ----------
create index if not exists idx_edu_enrol_student on edu_enrolments(student_id);
create index if not exists idx_edu_enrol_class on edu_enrolments(class_id);
create index if not exists idx_edu_lessons_class_date on edu_lessons(class_id, lesson_date);
create index if not exists idx_edu_attendance_student on edu_attendance(student_id);
create index if not exists idx_edu_submissions_student on edu_submissions(student_id);
create index if not exists idx_edu_results_student on edu_results(student_id);
create index if not exists idx_edu_invoices_student on edu_invoices(student_id);
create index if not exists idx_edu_notifications_user on edu_notifications(user_id, read_at);
create index if not exists idx_edu_messages_conv on edu_messages(conversation_id, created_at);
create index if not exists idx_edu_resources_class on edu_resources(class_id);
create index if not exists idx_edu_audit_created on edu_audit_logs(created_at);

-- ---------- 16. ROW-LEVEL SECURITY ----------
do $$
declare t text;
begin
  foreach t in array array[
    'edu_profiles','edu_user_roles','edu_students','edu_guardians','edu_student_guardians',
    'edu_teachers','edu_programmes','edu_courses','edu_topics','edu_terms','edu_classes',
    'edu_enrolments','edu_schedules','edu_lessons','edu_resources','edu_assignments',
    'edu_submissions','edu_assessments','edu_questions','edu_results','edu_attendance',
    'edu_fee_plans','edu_invoices','edu_payments','edu_announcements','edu_notifications',
    'edu_conversations','edu_conversation_members','edu_messages','edu_ai_sessions',
    'edu_topic_mastery','edu_certificates','edu_audit_logs'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- --- profiles ---
drop policy if exists p_edu_profiles_self on edu_profiles;
create policy p_edu_profiles_self on edu_profiles for select
  using (id = auth.uid() or edu_is_staff());
drop policy if exists p_edu_profiles_self_update on edu_profiles;
create policy p_edu_profiles_self_update on edu_profiles for update
  using (id = auth.uid() or edu_is_admin()) with check (id = auth.uid() or edu_is_admin());
drop policy if exists p_edu_profiles_admin_ins on edu_profiles;
create policy p_edu_profiles_admin_ins on edu_profiles for insert with check (edu_is_admin());
drop policy if exists p_edu_profiles_admin_del on edu_profiles;
create policy p_edu_profiles_admin_del on edu_profiles for delete using (edu_has_role('super_admin'));

-- --- user_roles: admin manages; users see their own ---
drop policy if exists p_edu_roles_sel on edu_user_roles;
create policy p_edu_roles_sel on edu_user_roles for select
  using (user_id = auth.uid() or edu_is_admin());
drop policy if exists p_edu_roles_all on edu_user_roles;
create policy p_edu_roles_all on edu_user_roles for all
  using (edu_is_admin()) with check (edu_is_admin());

-- --- students ---
drop policy if exists p_edu_students_sel on edu_students;
create policy p_edu_students_sel on edu_students for select
  using (profile_id = auth.uid() or edu_is_my_ward(id) or edu_is_admin() or edu_teaches_student(id));
drop policy if exists p_edu_students_all on edu_students;
create policy p_edu_students_all on edu_students for all
  using (edu_is_admin()) with check (edu_is_admin());

-- --- guardians ---
drop policy if exists p_edu_guardians_sel on edu_guardians;
create policy p_edu_guardians_sel on edu_guardians for select
  using (profile_id = auth.uid() or edu_is_admin());
drop policy if exists p_edu_guardians_all on edu_guardians;
create policy p_edu_guardians_all on edu_guardians for all
  using (edu_is_admin()) with check (edu_is_admin());

-- --- student_guardians ---
drop policy if exists p_edu_sg_sel on edu_student_guardians;
create policy p_edu_sg_sel on edu_student_guardians for select
  using (edu_is_admin()
         or exists (select 1 from edu_guardians g where g.id = guardian_id and g.profile_id = auth.uid())
         or exists (select 1 from edu_students s where s.id = student_id and s.profile_id = auth.uid()));
drop policy if exists p_edu_sg_all on edu_student_guardians;
create policy p_edu_sg_all on edu_student_guardians for all
  using (edu_is_admin()) with check (edu_is_admin());

-- --- teachers ---
drop policy if exists p_edu_teachers_sel on edu_teachers;
create policy p_edu_teachers_sel on edu_teachers for select
  using (auth.uid() is not null);
drop policy if exists p_edu_teachers_all on edu_teachers;
create policy p_edu_teachers_all on edu_teachers for all
  using (edu_is_admin()) with check (edu_is_admin());

-- --- reference/catalogue tables: any signed-in user reads; admin writes ---
do $$
declare t text;
begin
  foreach t in array array['edu_programmes','edu_courses','edu_topics','edu_terms'] loop
    execute format('drop policy if exists p_%s_sel on %I', t, t);
    execute format('create policy p_%s_sel on %I for select using (auth.uid() is not null)', t, t);
    execute format('drop policy if exists p_%s_all on %I', t, t);
    execute format('create policy p_%s_all on %I for all using (edu_is_admin()) with check (edu_is_admin())', t, t);
  end loop;
end $$;

-- --- classes ---
drop policy if exists p_edu_classes_sel on edu_classes;
create policy p_edu_classes_sel on edu_classes for select
  using (edu_is_staff()
         or exists (select 1 from edu_enrolments e join edu_students s on s.id = e.student_id
                    where e.class_id = edu_classes.id and (s.profile_id = auth.uid() or edu_is_my_ward(s.id))));
drop policy if exists p_edu_classes_all on edu_classes;
create policy p_edu_classes_all on edu_classes for all
  using (edu_is_admin()) with check (edu_is_admin());

-- --- enrolments ---
drop policy if exists p_edu_enrol_sel on edu_enrolments;
create policy p_edu_enrol_sel on edu_enrolments for select
  using (edu_is_admin() or edu_teaches_class(class_id)
         or exists (select 1 from edu_students s where s.id = student_id
                    and (s.profile_id = auth.uid() or edu_is_my_ward(s.id))));
drop policy if exists p_edu_enrol_all on edu_enrolments;
create policy p_edu_enrol_all on edu_enrolments for all
  using (edu_is_admin()) with check (edu_is_admin());

-- --- schedules & lessons: visible to class members/teachers; teachers manage own; admin all ---
drop policy if exists p_edu_sched_sel on edu_schedules;
create policy p_edu_sched_sel on edu_schedules for select
  using (edu_is_staff()
         or exists (select 1 from edu_enrolments e join edu_students s on s.id = e.student_id
                    where e.class_id = edu_schedules.class_id
                      and (s.profile_id = auth.uid() or edu_is_my_ward(s.id))));
drop policy if exists p_edu_sched_all on edu_schedules;
create policy p_edu_sched_all on edu_schedules for all
  using (edu_is_admin() or edu_teaches_class(class_id))
  with check (edu_is_admin() or edu_teaches_class(class_id));

drop policy if exists p_edu_lessons_sel on edu_lessons;
create policy p_edu_lessons_sel on edu_lessons for select
  using (edu_is_staff()
         or exists (select 1 from edu_enrolments e join edu_students s on s.id = e.student_id
                    where e.class_id = edu_lessons.class_id
                      and (s.profile_id = auth.uid() or edu_is_my_ward(s.id))));
drop policy if exists p_edu_lessons_all on edu_lessons;
create policy p_edu_lessons_all on edu_lessons for all
  using (edu_is_admin() or edu_teaches_class(class_id))
  with check (edu_is_admin() or edu_teaches_class(class_id));

-- --- resources ---
drop policy if exists p_edu_res_sel on edu_resources;
create policy p_edu_res_sel on edu_resources for select
  using (edu_is_staff()
         or (class_id is not null and exists
              (select 1 from edu_enrolments e join edu_students s on s.id = e.student_id
               where e.class_id = edu_resources.class_id
                 and (s.profile_id = auth.uid() or edu_is_my_ward(s.id))))
         or (visible_to = 'public_students' and auth.uid() is not null));
drop policy if exists p_edu_res_all on edu_resources;
create policy p_edu_res_all on edu_resources for all
  using (edu_is_admin() or edu_has_role('content_manager')
         or (class_id is not null and edu_teaches_class(class_id)))
  with check (edu_is_admin() or edu_has_role('content_manager')
         or (class_id is not null and edu_teaches_class(class_id)));

-- --- assignments ---
drop policy if exists p_edu_asg_sel on edu_assignments;
create policy p_edu_asg_sel on edu_assignments for select
  using (edu_is_staff()
         or exists (select 1 from edu_enrolments e join edu_students s on s.id = e.student_id
                    where e.class_id = edu_assignments.class_id
                      and (s.profile_id = auth.uid() or edu_is_my_ward(s.id))));
drop policy if exists p_edu_asg_all on edu_assignments;
create policy p_edu_asg_all on edu_assignments for all
  using (edu_is_admin() or edu_teaches_class(class_id))
  with check (edu_is_admin() or edu_teaches_class(class_id));

-- --- submissions: student owns; parent reads; teacher of class marks ---
drop policy if exists p_edu_sub_sel on edu_submissions;
create policy p_edu_sub_sel on edu_submissions for select
  using (edu_is_admin()
         or exists (select 1 from edu_students s where s.id = student_id
                    and (s.profile_id = auth.uid() or edu_is_my_ward(s.id)))
         or exists (select 1 from edu_assignments a where a.id = assignment_id
                    and edu_teaches_class(a.class_id)));
drop policy if exists p_edu_sub_ins on edu_submissions;
create policy p_edu_sub_ins on edu_submissions for insert
  with check (exists (select 1 from edu_students s where s.id = student_id and s.profile_id = auth.uid())
              or edu_is_admin()
              or exists (select 1 from edu_assignments a where a.id = assignment_id
                         and edu_teaches_class(a.class_id)));
drop policy if exists p_edu_sub_upd on edu_submissions;
create policy p_edu_sub_upd on edu_submissions for update
  using (edu_is_admin()
         or exists (select 1 from edu_students s where s.id = student_id and s.profile_id = auth.uid())
         or exists (select 1 from edu_assignments a where a.id = assignment_id
                    and edu_teaches_class(a.class_id)))
  with check (true);

-- --- assessments ---
drop policy if exists p_edu_assess_sel on edu_assessments;
create policy p_edu_assess_sel on edu_assessments for select
  using (edu_is_staff()
         or (status <> 'draft' and exists
              (select 1 from edu_enrolments e join edu_students s on s.id = e.student_id
               where e.class_id = edu_assessments.class_id
                 and (s.profile_id = auth.uid() or edu_is_my_ward(s.id)))));
drop policy if exists p_edu_assess_all on edu_assessments;
create policy p_edu_assess_all on edu_assessments for all
  using (edu_is_admin() or edu_teaches_class(class_id))
  with check (edu_is_admin() or edu_teaches_class(class_id));

-- --- questions: staff only (contains correct answers). Students receive
--     questions through a server-side API that strips the `correct` column. ---
drop policy if exists p_edu_q_staff on edu_questions;
create policy p_edu_q_staff on edu_questions for all
  using (edu_is_admin()
         or (assessment_id is not null and exists
              (select 1 from edu_assessments a where a.id = assessment_id
               and edu_teaches_class(a.class_id))))
  with check (edu_is_admin()
         or (assessment_id is not null and exists
              (select 1 from edu_assessments a where a.id = assessment_id
               and edu_teaches_class(a.class_id))));

-- --- results ---
drop policy if exists p_edu_results_sel on edu_results;
create policy p_edu_results_sel on edu_results for select
  using (edu_is_admin()
         or exists (select 1 from edu_students s where s.id = student_id
                    and (s.profile_id = auth.uid() or edu_is_my_ward(s.id)))
         or exists (select 1 from edu_assessments a where a.id = assessment_id
                    and edu_teaches_class(a.class_id)));
drop policy if exists p_edu_results_all on edu_results;
create policy p_edu_results_all on edu_results for all
  using (edu_is_admin()
         or exists (select 1 from edu_assessments a where a.id = assessment_id
                    and edu_teaches_class(a.class_id)))
  with check (edu_is_admin()
         or exists (select 1 from edu_assessments a where a.id = assessment_id
                    and edu_teaches_class(a.class_id)));

-- --- attendance ---
drop policy if exists p_edu_att_sel on edu_attendance;
create policy p_edu_att_sel on edu_attendance for select
  using (edu_is_admin()
         or exists (select 1 from edu_students s where s.id = student_id
                    and (s.profile_id = auth.uid() or edu_is_my_ward(s.id)))
         or exists (select 1 from edu_lessons l where l.id = lesson_id
                    and edu_teaches_class(l.class_id)));
drop policy if exists p_edu_att_all on edu_attendance;
create policy p_edu_att_all on edu_attendance for all
  using (edu_is_admin()
         or exists (select 1 from edu_lessons l where l.id = lesson_id
                    and edu_teaches_class(l.class_id)))
  with check (edu_is_admin()
         or exists (select 1 from edu_lessons l where l.id = lesson_id
                    and edu_teaches_class(l.class_id)));

-- --- finance: finance roles manage; student/parent read their own ---
drop policy if exists p_edu_fee_sel on edu_fee_plans;
create policy p_edu_fee_sel on edu_fee_plans for select
  using (edu_is_finance()
         or exists (select 1 from edu_students s where s.id = student_id
                    and (s.profile_id = auth.uid() or edu_is_my_ward(s.id))));
drop policy if exists p_edu_fee_all on edu_fee_plans;
create policy p_edu_fee_all on edu_fee_plans for all
  using (edu_is_finance()) with check (edu_is_finance());

drop policy if exists p_edu_inv_sel on edu_invoices;
create policy p_edu_inv_sel on edu_invoices for select
  using (edu_is_finance()
         or (status <> 'draft' and exists
              (select 1 from edu_students s where s.id = student_id
               and (s.profile_id = auth.uid() or edu_is_my_ward(s.id)))));
drop policy if exists p_edu_inv_all on edu_invoices;
create policy p_edu_inv_all on edu_invoices for all
  using (edu_is_finance()) with check (edu_is_finance());

drop policy if exists p_edu_pay_sel on edu_payments;
create policy p_edu_pay_sel on edu_payments for select
  using (edu_is_finance()
         or exists (select 1 from edu_invoices i join edu_students s on s.id = i.student_id
                    where i.id = invoice_id
                      and (s.profile_id = auth.uid() or edu_is_my_ward(s.id))));
drop policy if exists p_edu_pay_all on edu_payments;
create policy p_edu_pay_all on edu_payments for all
  using (edu_is_finance()) with check (edu_is_finance());

-- --- announcements ---
drop policy if exists p_edu_ann_sel on edu_announcements;
create policy p_edu_ann_sel on edu_announcements for select
  using (publish_at <= now() and auth.uid() is not null
         and (audience in ('all','students','parents','teachers')
              or (audience = 'class' and (edu_is_staff() or exists
                   (select 1 from edu_enrolments e join edu_students s on s.id = e.student_id
                    where e.class_id = edu_announcements.class_id
                      and (s.profile_id = auth.uid() or edu_is_my_ward(s.id)))))));
drop policy if exists p_edu_ann_all on edu_announcements;
create policy p_edu_ann_all on edu_announcements for all
  using (edu_is_admin() or (class_id is not null and edu_teaches_class(class_id)))
  with check (edu_is_admin() or (class_id is not null and edu_teaches_class(class_id)));

-- --- notifications: own only ---
drop policy if exists p_edu_notif_sel on edu_notifications;
create policy p_edu_notif_sel on edu_notifications for select using (user_id = auth.uid());
drop policy if exists p_edu_notif_upd on edu_notifications;
create policy p_edu_notif_upd on edu_notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists p_edu_notif_admin on edu_notifications;
create policy p_edu_notif_admin on edu_notifications for insert with check (edu_is_staff());

-- --- conversations & messages: members only ---
drop policy if exists p_edu_conv_sel on edu_conversations;
create policy p_edu_conv_sel on edu_conversations for select
  using (edu_in_conversation(id) or edu_is_admin());
drop policy if exists p_edu_conv_ins on edu_conversations;
create policy p_edu_conv_ins on edu_conversations for insert
  with check (auth.uid() is not null);
drop policy if exists p_edu_cm_sel on edu_conversation_members;
create policy p_edu_cm_sel on edu_conversation_members for select
  using (edu_in_conversation(conversation_id) or edu_is_admin());
drop policy if exists p_edu_cm_ins on edu_conversation_members;
create policy p_edu_cm_ins on edu_conversation_members for insert
  with check (edu_is_staff() or exists
    (select 1 from edu_conversations c where c.id = conversation_id and c.created_by = auth.uid()));
drop policy if exists p_edu_msg_sel on edu_messages;
create policy p_edu_msg_sel on edu_messages for select
  using (edu_in_conversation(conversation_id) or edu_is_admin());
drop policy if exists p_edu_msg_ins on edu_messages;
create policy p_edu_msg_ins on edu_messages for insert
  with check (sender_id = auth.uid() and edu_in_conversation(conversation_id));

-- --- AI sessions & mastery ---
drop policy if exists p_edu_ai_sel on edu_ai_sessions;
create policy p_edu_ai_sel on edu_ai_sessions for select
  using (edu_is_admin()
         or exists (select 1 from edu_students s where s.id = student_id
                    and (s.profile_id = auth.uid() or edu_is_my_ward(s.id) or edu_teaches_student(s.id))));
drop policy if exists p_edu_ai_ins on edu_ai_sessions;
create policy p_edu_ai_ins on edu_ai_sessions for insert
  with check (exists (select 1 from edu_students s where s.id = student_id and s.profile_id = auth.uid())
              or edu_is_staff());

drop policy if exists p_edu_tm_sel on edu_topic_mastery;
create policy p_edu_tm_sel on edu_topic_mastery for select
  using (edu_is_admin()
         or exists (select 1 from edu_students s where s.id = student_id
                    and (s.profile_id = auth.uid() or edu_is_my_ward(s.id) or edu_teaches_student(s.id))));
drop policy if exists p_edu_tm_all on edu_topic_mastery;
create policy p_edu_tm_all on edu_topic_mastery for all
  using (edu_is_staff()) with check (edu_is_staff());

-- --- certificates ---
drop policy if exists p_edu_cert_sel on edu_certificates;
create policy p_edu_cert_sel on edu_certificates for select
  using (edu_is_admin()
         or exists (select 1 from edu_students s where s.id = student_id
                    and (s.profile_id = auth.uid() or edu_is_my_ward(s.id))));
drop policy if exists p_edu_cert_all on edu_certificates;
create policy p_edu_cert_all on edu_certificates for all
  using (edu_is_admin()) with check (edu_is_admin());

-- --- audit: admins read; inserts server-side/staff ---
drop policy if exists p_edu_audit_sel on edu_audit_logs;
create policy p_edu_audit_sel on edu_audit_logs for select using (edu_is_admin());
drop policy if exists p_edu_audit_ins on edu_audit_logs;
create policy p_edu_audit_ins on edu_audit_logs for insert with check (edu_is_staff());

-- ---------- 17. STORAGE BUCKETS (private; signed URLs) ----------
insert into storage.buckets (id, name, public)
values ('edu-resources','edu-resources', false)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
values ('edu-submissions','edu-submissions', false)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
values ('edu-evidence','edu-evidence', false)
on conflict (id) do nothing;

drop policy if exists p_edu_store_res_staff on storage.objects;
create policy p_edu_store_res_staff on storage.objects for all
  using (bucket_id = 'edu-resources' and edu_is_staff())
  with check (bucket_id = 'edu-resources' and edu_is_staff());

drop policy if exists p_edu_store_res_read on storage.objects;
create policy p_edu_store_res_read on storage.objects for select
  using (bucket_id = 'edu-resources' and auth.uid() is not null);

drop policy if exists p_edu_store_sub_own on storage.objects;
create policy p_edu_store_sub_own on storage.objects for all
  using (bucket_id = 'edu-submissions'
         and (edu_is_staff() or (storage.foldername(name))[1] = auth.uid()::text))
  with check (bucket_id = 'edu-submissions'
         and (edu_is_staff() or (storage.foldername(name))[1] = auth.uid()::text));

drop policy if exists p_edu_store_evidence on storage.objects;
create policy p_edu_store_evidence on storage.objects for all
  using (bucket_id = 'edu-evidence' and edu_is_finance())
  with check (bucket_id = 'edu-evidence' and edu_is_finance());

-- ---------- 18. SEED: PROGRAMMES ----------
insert into edu_programmes (code, name, board, level) values
  ('CAIE-9702','CAIE A-Level Physics 9702','CAIE','A-Level'),
  ('CAIE-5054','CAIE O-Level Physics 5054','CAIE','O-Level'),
  ('CAIE-0625','CAIE IGCSE Physics 0625','CAIE','IGCSE'),
  ('IB-PHY-SL','IB Physics SL','IB','IB SL'),
  ('IB-PHY-HL','IB Physics HL','IB','IB HL')
on conflict (code) do nothing;

-- ---------- 19. BOOTSTRAP NOTE ----------
-- After JB creates his own portal account (sign-up), run:
--   insert into edu_user_roles (user_id, role)
--   select id, 'super_admin' from auth.users where email = 'syedjabran.rjgroup@gmail.com'
--   on conflict do nothing;
-- (Included here so it self-applies if the account already exists.)
insert into edu_user_roles (user_id, role)
select u.id, 'super_admin'::edu_role
from auth.users as u
where u.email = 'syedjabran.rjgroup@gmail.com'
on conflict do nothing;

-- ============================================================
-- END EDU-001
-- ============================================================
