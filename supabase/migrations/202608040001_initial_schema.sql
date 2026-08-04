create extension if not exists pgcrypto;

create type public.publish_status as enum ('draft','published','archived');
create table public.ventures (id uuid primary key default gen_random_uuid(), name text not null, slug text unique not null, role text, sector text, geography text, summary text, website_url text, status public.publish_status not null default 'draft', display_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.articles (id uuid primary key default gen_random_uuid(), title text not null, slug text unique not null, excerpt text, body text, cover_image_url text, status public.publish_status not null default 'draft', published_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.contact_enquiries (id uuid primary key default gen_random_uuid(), name text not null, email text not null, enquiry_type text not null, message text not null, consent boolean not null default false, status text not null default 'new', delivery_status text, created_at timestamptz not null default now());
create table public.audit_logs (id bigint generated always as identity primary key, actor_id uuid references auth.users(id), action text not null, entity_type text not null, entity_id text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create index articles_status_published_idx on public.articles(status,published_at desc);
create index ventures_status_order_idx on public.ventures(status,display_order);
create index enquiries_created_idx on public.contact_enquiries(created_at desc);

alter table public.ventures enable row level security;
alter table public.articles enable row level security;
alter table public.contact_enquiries enable row level security;
alter table public.audit_logs enable row level security;
create policy "Published ventures are public" on public.ventures for select using (status='published');
create policy "Published articles are public" on public.articles for select using (status='published');
-- Enquiries and audit logs have no public policies. Server-side service-role access only.
