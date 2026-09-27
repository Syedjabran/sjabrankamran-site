-- ============================================================================
-- portal-v2-001 — answer security (Task 2b-A; answer-leak audit H5, H6, M5,
-- M6, L4, L6). Idempotent: safe to run more than once.
--
-- NOT applied by the app or by the task that wrote it. The controller applies
-- it to the scholexai copy after review; the sjabrankamran production
-- database is never touched. The UNDO section at the end reverses it.
--
-- Every app path that reads or writes these objects was checked against
-- these revokes (see .superpowers/sdd/2026-09-27-portal-v2/task-2bA-report.md):
-- the Exam Lab tables are read and written only with the service role; the
-- one student write to edu_submissions (the assignment page's server action)
-- now writes with the service role after its ownership checks; no code reads
-- edu_assignments.rubric, el_attempt_review, or the edu-resources bucket
-- with a user token.
-- Depends on edu-001 (edu_is_staff, edu_is_admin, edu_teaches_class) and
-- el-001.
-- ============================================================================

begin;

-- ---------- H5: el_questions answers readable through PostgREST ------------
-- el_q_public_read (no role: anon too) and el_q_portal_read exposed every
-- column, answer_index and scheme included. Server routes read the table with
-- the service role (/api/exam-lab/generate, /submit), like sat_questions.
drop policy if exists el_q_public_read on el_questions;
drop policy if exists el_q_portal_read on el_questions;
revoke all on el_questions from anon, authenticated;
-- el_q_staff_manage stays: without a table grant it gives nothing.

-- ---------- H6: el_attempt_review ran as its owner, readable with anon -------
-- security_invoker applies the caller's RLS on el_attempts / el_tests /
-- edu_profiles, and the view itself returns rows to staff only. Same columns
-- as el-001, so `create or replace` keeps its privileges; they are then reset.
create or replace view el_attempt_review with (security_invoker = on) as
  select a.id, a.submitted_at, a.mcq_score, a.mcq_total,
         a.user_id, p.full_name, t.config, t.question_ids
  from el_attempts a
  join el_tests t on t.id = a.test_id
  left join edu_profiles p on p.id = a.user_id
  where edu_is_staff();
revoke all on el_attempt_review from anon, authenticated;
grant select on el_attempt_review to authenticated;

-- ---------- L4: students could insert el_tests / el_attempts with any score -
-- /api/exam-lab/submit writes both with the service role.
drop policy if exists el_t_owner_insert on el_tests;
drop policy if exists el_a_owner_insert on el_attempts;
revoke all on el_tests from anon;
revoke all on el_attempts from anon;
revoke insert, update, delete, truncate on el_tests from authenticated;
revoke insert, update, delete, truncate on el_attempts from authenticated;

-- ---------- M6: edu_submissions update was `with check (true)` ---------------
-- A student could rewrite marks, feedback, marked_by, status, even
-- student_id on their own submission. Now: a student may change only the
-- answer fields (answer_text, files) of their own submission while it is not
-- marked or returned; everything else is written with the service role
-- (the assignment page's server action decides status / submitted_at).
-- Column grants apply to every authenticated user, staff included: no app
-- path marks with a user token (the admin marking paths use the service role).
revoke insert, update on edu_submissions from anon, authenticated;
grant insert (assignment_id, student_id, answer_text, files) on edu_submissions to authenticated;
grant update (answer_text, files) on edu_submissions to authenticated;

drop policy if exists p_edu_sub_upd on edu_submissions;
create policy p_edu_sub_upd on edu_submissions for update
  using (edu_is_admin()
         or exists (select 1 from edu_assignments a where a.id = assignment_id
                    and edu_teaches_class(a.class_id))
         or (status not in ('marked', 'returned')
             and exists (select 1 from edu_students s where s.id = student_id and s.profile_id = auth.uid())))
  with check (edu_is_admin()
         or exists (select 1 from edu_assignments a where a.id = assignment_id
                    and edu_teaches_class(a.class_id))
         or (status not in ('marked', 'returned')
             and exists (select 1 from edu_students s where s.id = student_id and s.profile_id = auth.uid())));

-- ---------- L6: edu_assignments.rubric readable by enrolled students --------
-- Unused today; a marking rubric stored there would reach every student of
-- the class. Select is re-granted column by column, every column but rubric
-- (read from the live table, so a column added later by another migration is
-- kept -- re-run this block after adding one). No user-token query reads
-- rubric or uses select=* on this table; inserts (the teacher's class page)
-- return no rows.
revoke select on edu_assignments from anon, authenticated;
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'edu_assignments' and column_name <> 'rubric';
  execute format('grant select (%s) on edu_assignments to authenticated', cols);
end $$;

commit;

-- ---------- M5: edu-resources readable by every signed-in user --------------
-- (storage schema; its own transaction so a storage-less copy can skip it.)
-- p_edu_store_res_read let any signed-in user list and download every object:
-- test attachments under assessment/<id>/…, every class's assignment files.
-- Now: staff (p_edu_store_res_staff, unchanged) or a student enrolled in the
-- class of that assignment / assessment -- an assessment only once it is
-- published and its start time has passed. The app itself signs attachments
-- with the service role (src/lib/portal/attachments.ts).
begin;
drop policy if exists p_edu_store_res_read on storage.objects;
drop policy if exists p_edu_store_res_enrolled_read on storage.objects;
create policy p_edu_store_res_enrolled_read on storage.objects for select to authenticated
  using (
    bucket_id = 'edu-resources'
    and (
      ((storage.foldername(name))[1] = 'assignment' and exists (
        select 1
          from edu_assignments a
          join edu_enrolments e on e.class_id = a.class_id
          join edu_students s on s.id = e.student_id
         where a.id::text = (storage.foldername(name))[2]
           and s.profile_id = auth.uid()))
      or ((storage.foldername(name))[1] = 'assessment' and exists (
        select 1
          from edu_assessments x
          join edu_enrolments e on e.class_id = x.class_id
          join edu_students s on s.id = e.student_id
         where x.id::text = (storage.foldername(name))[2]
           and s.profile_id = auth.uid()
           and x.status <> 'draft'
           and (x.starts_at is null or x.starts_at <= now())))
    )
  );
commit;

-- ============================================================================
-- UNDO (restores el-001 / edu-001 as written). Run by hand only.
-- ============================================================================
-- begin;
-- -- H5
-- create policy el_q_public_read on el_questions for select
--   using (is_active and visibility in ('public','both'));
-- create policy el_q_portal_read on el_questions for select to authenticated
--   using (is_active and visibility in ('public','portal','both'));
-- grant select on el_questions to anon, authenticated;
-- -- H6
-- create or replace view el_attempt_review with (security_invoker = off) as
--   select a.id, a.submitted_at, a.mcq_score, a.mcq_total,
--          a.user_id, p.full_name, t.config, t.question_ids
--   from el_attempts a
--   join el_tests t on t.id = a.test_id
--   left join edu_profiles p on p.id = a.user_id;
-- grant select on el_attempt_review to anon, authenticated;
-- -- L4
-- create policy el_t_owner_insert on el_tests for insert to authenticated
--   with check (created_by = auth.uid());
-- create policy el_a_owner_insert on el_attempts for insert to authenticated
--   with check (user_id = auth.uid());
-- grant select, insert on el_tests to authenticated;
-- grant select, insert on el_attempts to authenticated;
-- -- M6
-- revoke insert (assignment_id, student_id, answer_text, files) on edu_submissions from authenticated;
-- revoke update (answer_text, files) on edu_submissions from authenticated;
-- grant insert, update on edu_submissions to authenticated;
-- drop policy if exists p_edu_sub_upd on edu_submissions;
-- create policy p_edu_sub_upd on edu_submissions for update
--   using (edu_is_admin()
--          or exists (select 1 from edu_students s where s.id = student_id and s.profile_id = auth.uid())
--          or exists (select 1 from edu_assignments a where a.id = assignment_id
--                     and edu_teaches_class(a.class_id)))
--   with check (true);
-- -- L6 (drops the column grants, restores the table grant)
-- do $$
-- declare cols text;
-- begin
--   select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'edu_assignments' and column_name <> 'rubric';
--   execute format('revoke select (%s) on edu_assignments from authenticated', cols);
-- end $$;
-- grant select on edu_assignments to anon, authenticated;
-- commit;
-- begin;
-- -- M5
-- drop policy if exists p_edu_store_res_enrolled_read on storage.objects;
-- create policy p_edu_store_res_read on storage.objects for select
--   using (bucket_id = 'edu-resources' and auth.uid() is not null);
-- commit;
