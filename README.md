# Official website — Syed Jabran Ali Kamran

Production website and content platform for `www.sjabrankamran.com`.

## Stack

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS
- Supabase for published content, enquiries, authentication, and storage
- Vercel deployment
- Resend integration planned for transactional enquiry email

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Required environment variables are documented in `.env.example`. Never expose the Supabase service-role key in client-side code or commit `.env.local`.

## Quality checks

```bash
npm run typecheck
npm run build
npm audit --omit=dev
```

## Supabase

Run migration files in `supabase/migrations/` using the Supabase CLI or SQL Editor. The initial migration enables RLS, exposes only published ventures/articles for public reads, and keeps enquiries private to server-side service-role access.

## Deployment

1. Create or connect the GitHub repository.
2. Import it into Vercel.
3. Add the environment variables from `.env.example`.
4. Run the Supabase migrations.
5. Deploy a preview and test the enquiry flow.
6. Point `www.sjabrankamran.com` to Vercel only after approval of biography, portrait, venture titles, and contact details.

## Content safeguards

The current public copy uses verified facts only. Outstanding qualifications, roles, institutional claims, distinction counts, private photographs, and sensitive project details remain withheld until explicitly confirmed.

See `DISCOVERY-REPORT.md` for the research inventory, content gaps, architecture, and launch plan.
