-- Add the school-scoped coordinator and facilitator roles to existing projects.
-- Safe to run once in Supabase SQL Editor / migration pipeline.
alter type public.edu_role add value if not exists 'coordinator';
alter type public.edu_role add value if not exists 'facilitator';
alter type public.edu_role add value if not exists 'attendance_registrar';

-- Keep the RLS helper aligned with the application role model.
create or replace function public.edu_is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.edu_user_roles where user_id = auth.uid()
    and role in ('super_admin','admin','teacher','teaching_assistant','counsellor',
                 'content_manager','finance_manager','coordinator','facilitator','attendance_registrar'));
$$;
