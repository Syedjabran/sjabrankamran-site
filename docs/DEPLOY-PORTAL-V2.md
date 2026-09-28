# Deploying portal-v2: the owner's checklist

`portal-v2` is the learning portal's big update: subject spaces (Physics, Digital SAT), the Practical
Lab inside Physics, Exam Lab answers kept on the server, and the navigation the mobile app reads.
Merging it into `main` ships the code. **The database half does not ship with it.** One migration,
`supabase/migrations/portal-v2-001-answer-security.sql`, must be applied to the production
database by you, by hand, right after the deploy. Until it is applied, these stay open on production:

- anyone with the public anon key can read every Exam Lab attempt, with the student's full name
  and score, through `el_attempt_review`;
- `el_questions` answers and mark schemes can be read the same way (if the table has rows);
- every signed-in user can read every file in the `edu-resources` bucket;
- a student can rewrite the marks on their own assignment submission;
- students can insert Exam Lab tests and attempts with any score, and read assignment rubrics.

Agents (Claude or any other tool) never apply this migration to production. You do, with the steps
below.

**What you need:** the Vercel project that serves sjabrankamran.com, the Supabase dashboard of the
production project (the one `NEXT_PUBLIC_SUPABASE_URL` points at in Vercel's Production
environment), and a terminal: Terminal on a Mac, or **Git Bash** on Windows (it has `curl` and
`openssl`). Allow about an hour, most of it waiting.

---

## Part A: before the merge

**1. Check that `main` hasn't moved** (your developer, or ask Claude). portal-v2 was checked
against `main` at `5ab743c`.

```bash
git fetch origin
git merge-base --is-ancestor origin/main portal-v2 && echo "main is included: OK"
```

If it doesn't print OK, merge `main` into `portal-v2` first and re-run the checks:

```bash
npx tsc --noEmit -p tsconfig.json
npm run test:portal
npm run test:sat
npm run test:access
```

**2. Production build and answer-key check** (your developer). With no dev server running:

```bash
npm run build
grep -rlE '"answer":"|_ms\.|ms_img|secure-bank' .next/static
```

The `grep` must print nothing. Any file it prints would send answers to the browser: don't deploy.

**3. Set the environment variables in Vercel.** Vercel → the project → **Settings → Environment
Variables**. Add each one for **Production** and **Preview**. They take effect on the next
deployment, so do this before the deploy.

| Variable | What to do |
|---|---|
| `LAB_SECRET` | **Required.** Run `openssl rand -hex 32` and paste the output. Without it, every practical says "isn't set up on the server yet" (the lab refuses; nothing leaks). Don't change it later: a new value gives every student new apparatus values and ends any lab session that is open. |
| `EXAM_LAB_SECRET` | **Optional. Decide once, now.** Either set it now (`openssl rand -hex 32`) or never set it. Unset, the Exam Lab derives its keys from `SUPABASE_SERVICE_ROLE_KEY`. Setting or changing it later, or rotating the service-role key, ends every open Exam Lab sitting, so never do it during term. |
| `CRON_SECRET` | Check it is there (it should be). If not, add one with `openssl rand -hex 32`. Without it the scheduled jobs fall back to a weaker check. |
| `SUPABASE_SERVICE_ROLE_KEY` | Unchanged, but it must be present: the `/lab` gate answers "couldn't check your access" without it, and the Exam Lab signs with it. |

## Part B: the deploy

**4. Pick a quiet window:** no scheduled test running, and before students start the day's daily
challenges.

**5. Merge and deploy.**

```bash
git checkout main
git pull origin main
git merge --no-ff portal-v2
git push origin main
```

Vercel builds `main`. Wait until the deployment shows **Ready** (Vercel → Deployments).

Tabs opened before the deploy behave like this until they are reloaded, so ask anyone with the
portal open to reload:

- practice submissions are refused ("Refresh the page and open it again");
- an assigned daily challenge or drill that was never opened on the new server answers "reload";
- Maxwell, mark-scheme reveals and question images fail;
- paper, custom and drill-reference assignments still save their multiple-choice answers, but lose
  any Maxwell marks.

**6. Tell your teachers:**

> From today, an assignment that already has a stored attempt from before the update counts as
> used, including one the browser reported as "cancelled". A re-sit needs a super-admin unlock or a
> re-assign. Unlocks used before the update don't carry over.

## Part C: the database (right after the deploy is Ready)

Apply the migration **after** the new code is live, not before. The code before portal-v2 hands in
assignments with the student's own sign-in, which this migration no longer allows, so applying it
early stops students handing in assignments until the deploy goes live. The new code works
whether or not the migration is applied.

All of this is in Supabase → the production project → **SQL Editor → New query**. Paste, then
**Run**.

**7. Back up the current rules.** Run this read-only query, then use the results panel's export to
**download the result as CSV**. Keep the file somewhere safe; it is what you would compare against
if anything needed restoring.

```sql
select 'policy' as kind, schemaname || '.' || tablename as object, policyname::text as name,
       cmd::text as detail, roles::text as roles, qual::text as rule, with_check::text as check_rule
  from pg_policies
 where (schemaname = 'public' and tablename in ('el_questions','el_tests','el_attempts','edu_submissions','edu_assignments'))
    or (schemaname = 'storage' and tablename = 'objects')
union all
select 'table grant', table_schema || '.' || table_name, grantee::text, privilege_type::text, null, null, null
  from information_schema.role_table_grants
 where table_schema = 'public' and grantee in ('anon','authenticated')
   and table_name in ('el_questions','el_tests','el_attempts','el_attempt_review','edu_submissions','edu_assignments')
union all
select 'column grant', table_schema || '.' || table_name || '.' || column_name, grantee::text, privilege_type::text, null, null, null
  from information_schema.column_privileges
 where table_schema = 'public' and grantee in ('anon','authenticated')
   and table_name in ('edu_submissions','edu_assignments')
union all
select 'view', 'public.el_attempt_review', array_to_string(c.reloptions, ','), null, null, pg_get_viewdef(c.oid), null
  from pg_class c
 where c.relname = 'el_attempt_review';
```

**8. Apply the migration.** Open `supabase/migrations/portal-v2-001-answer-security.sql` (on GitHub
or in your copy of the repo), copy the **whole file**, paste it into a new query and **Run**. It
should finish with "Success. No rows returned". A notice that something "does not exist,
skipping" is harmless. The file is safe to run twice.

**9. Check it worked.** Run these one at a time (all read-only):

```sql
-- a) The attempts view now runs with the caller's rights.
select relname, reloptions from pg_class where relname = 'el_attempt_review';
-- Expect: reloptions shows {security_invoker=on}

-- b) What signed-out and signed-in users may do on the Exam Lab tables.
select table_name, grantee, string_agg(privilege_type::text, ', ' order by privilege_type::text) as privileges
  from information_schema.role_table_grants
 where table_schema = 'public' and grantee in ('anon','authenticated')
   and table_name in ('el_questions','el_attempt_review','el_attempts','el_tests')
 group by table_name, grantee
 order by table_name, grantee;
-- Expect: no "anon" row at all; no el_questions row; el_attempt_review: authenticated SELECT only;
-- el_attempts and el_tests: authenticated without INSERT, UPDATE, DELETE or TRUNCATE.

-- c) The old open policies are gone.
select tablename, policyname from pg_policies
 where policyname in ('el_q_public_read','el_q_portal_read','el_t_owner_insert','el_a_owner_insert','p_edu_store_res_read');
-- Expect: no rows.

-- d) A student's submission update is the constrained rule.
select policyname, with_check from pg_policies where tablename = 'edu_submissions' and policyname = 'p_edu_sub_upd';
-- Expect: with_check is a long rule mentioning auth.uid() and allow_resubmission, not "true".

-- e) Storage: the class-scoped read rule, and private buckets.
select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'p_edu_store_res%';
-- Expect: p_edu_store_res_enrolled_read (and p_edu_store_res_staff), not p_edu_store_res_read.
select id, public from storage.buckets order by id;
-- Expect: public = false for exam-assets, exam-data, portal-data, answer-scripts, portal-mail,
-- portal-library, physics-resources and every edu-* bucket. If any of these says true, stop and
-- tell your developer: answers or mark schemes would be readable by URL.

-- f) For your information: how many Exam Lab questions carry answers.
select count(*) as rows, count(answer_index) as with_answers from el_questions;
```

**10. Check from outside, signed out.** In your terminal, set the project's address and public anon
key (Supabase → **Project Settings → API**, or Vercel's `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY`), then:

```bash
PROJECT_URL="https://YOUR-PROJECT-REF.supabase.co"
ANON_KEY="paste-the-anon-public-key"
for t in el_attempt_review el_questions el_attempts; do
  printf "%s: " "$t"
  curl -s -o /dev/null -w "%{http_code}\n" "$PROJECT_URL/rest/v1/$t?select=*&limit=1" -H "apikey: $ANON_KEY"
done
```

Expect `401` for all three. `200` means the table is still readable without signing in: re-run
step 8 and check again.

**If something breaks and you must go back:** the **UNDO** section is at the end of the migration
file. It is commented out on purpose. Copy everything below the "UNDO" heading, remove the `-- `
at the start of each line (in VS Code: select it and press Ctrl+/), and run it. It reopens the
leaks listed at the top of this page, so treat it as a stop-gap and tell your developer.

## Part D: after the deploy

**11. Signed-out checks of the live site.**

```bash
SITE="https://sjabrankamran.com"
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "$SITE/portal"
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "$SITE/lab/"
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "$SITE/Lab/index.html"
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$SITE/api/lab/attempt"
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer not.a.token" "$SITE/api/portal/navigation"
```

Expect, line by line:

1. `307 https://sjabrankamran.com/portal/login?next=%2Fportal`
2. `307 https://sjabrankamran.com/portal/login?next=%2Flab%2Findex.html`
3. `307 https://sjabrankamran.com/portal/login?next=%2FLab%2Findex.html`
4. `401`
5. `401`

A `200` on any of them means a page or API opened without signing in: tell your developer.

**12. Switch the Practical Lab on.** Before this update `/lab` was public (just not linked); now
only staff and students switched on can open it. For each student who should have it: **Admin →
Users & activity**, open the student, **Subjects** card, switch **Practical Lab (Physics)** on. New
students: tick it on the **Create account** form. (`docs/PRACTICAL-LAB.md` has the details.)

**13. Check no account mixes a desk role with another role.** A coordinator, facilitator or
attendance registrar who is also a teacher, student or parent is kept to their desk and can't use
the other pages. Run in the SQL Editor (read-only):

```sql
select p.email, p.full_name, string_agg(r.role::text, ', ' order by r.role::text) as roles
  from edu_user_roles r
  join edu_profiles p on p.id = r.user_id
 group by p.id, p.email, p.full_name
having bool_or(r.role::text in ('coordinator','facilitator','attendance_registrar'))
   and bool_or(r.role::text in ('teacher','student','parent'))
   and not bool_or(r.role::text in ('admin','super_admin'));
```

Expect no rows. For any row, either remove the desk role or give that person a second account.

**14. Rotate the demo student's password.** This is older than portal-v2: the file
`tmp-tour/.capture-login.json` in the repository's history (on `main` since commit `decbc59`)
holds a demo student's email and password. To see which account it is:
`git show decbc59:tmp-tour/.capture-login.json`. Give that account a new password: for the
private Portal QA Student, open `https://sjabrankamran.com/portal/admin/demo-student-access`
(super admins only; it isn't in the menu) and generate a fresh password; for any other account,
**Admin → Users & activity**, open it, and set a new password.

**15. Watch the Practical Lab's load in the first lab lesson.** Each lab action makes about six
Supabase calls; a class of 30 using the lab together is roughly 15 to 60 calls a second. That
should be fine. In Supabase → **Reports**, watch the Auth and Storage request rates during that
lesson. If they approach your plan's limits or the lab feels slow, tell your developer (the fix is
to cache the access-lock check for the lab's API calls for a short time).

## Part E: the mobile app

**16. Deploy the website first** (Parts A to D). A new app build shows **Open the portal** instead
of the student's subjects until `/api/portal/navigation` is live.

**17. Build the app with** `EXPO_PUBLIC_SITE_URL=https://sjabrankamran.com`: the address without
`www` (the site redirects www to it, and the app sends the session to that one exact address
only). `mobile/README.md` has the build steps.

**18. Test on real phones (Android and iPhone) before giving the app out:**

- tap a link to another website from inside a portal page, a few times: it should open in the
  phone's browser, not inside the app (on a slow Android phone the other site can occasionally
  show inside the app for a moment, without your sign-in; note how often you see it);
- pages that show a file, video or preview inside the page still show it (a blank embedded viewer
  means the app refused one of its frames: tell your developer);
- sit a long paper in the app (about 2.5 hours), then go back to **Home**: the app must still be
  signed in (if it signs you out, tell your developer: it's the session refresh);
- a proctored test: the camera works inside the app;
- sign in as a teacher: the first tab after Home must be one a teacher can use.

## Part F: the Scholex copy

The portal's brand now lives in one file: `src/lib/portal/brand.ts` (the portal's name, site,
sign-in link, mailbox, the sender and From name on emails, and the generated-password prefix). The
account, password and progress emails, the mail console and the suspended and locked screens all
read it, and word themselves for each student's courses. For the Scholex copy, change that file
before cloning; `npm run test:portal` fails if the mailbox or sign-in link is written anywhere
else.
