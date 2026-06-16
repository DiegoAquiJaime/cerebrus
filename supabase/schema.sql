-- Cerebrus — Paso 1 Supabase (prueba en paralelo a Google Sheets)
-- Ejecutar en: Supabase → SQL Editor → New query → Run
--
-- NO reemplaza Sheets todavía. Solo prepara almacenamiento serio para migración gradual.

-- Meta global (versión, último guardado)
create table if not exists public.cerebrus_meta (
  workspace_id text primary key default 'cerebrus',
  cloud_version bigint not null default 0,
  last_save_at timestamptz,
  last_save_by text,
  source text not null default 'supabase',
  notes text
);

insert into public.cerebrus_meta (workspace_id, cloud_version, notes)
values ('cerebrus', 0, 'Inicializado — Paso 1 Cerebrus')
on conflict (workspace_id) do nothing;

-- Particiones (mismas que saveParted: main, pInv, pFac, pSem, pMisc)
create table if not exists public.cerebrus_parts (
  workspace_id text not null default 'cerebrus',
  part_id text not null,
  payload text not null default '',
  payload_bytes integer generated always as (char_length(payload)) stored,
  version bigint not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  description text,
  primary key (workspace_id, part_id),
  constraint cerebrus_parts_part_id_check check (
    part_id in ('main', 'pInv', 'pFac', 'pSem', 'pMisc')
  )
);

create index if not exists cerebrus_parts_updated_at_idx
  on public.cerebrus_parts (workspace_id, updated_at desc);

-- Snapshots opcionales (respaldos puntuales; Paso 1+)
create table if not exists public.cerebrus_snapshots (
  id bigserial primary key,
  workspace_id text not null default 'cerebrus',
  label text not null,
  parts jsonb not null,
  total_bytes integer not null default 0,
  created_at timestamptz not null default now(),
  created_by text
);

create index if not exists cerebrus_snapshots_created_idx
  on public.cerebrus_snapshots (workspace_id, created_at desc);

-- RLS (obligatorio en Supabase)
alter table public.cerebrus_meta enable row level security;
alter table public.cerebrus_parts enable row level security;
alter table public.cerebrus_snapshots enable row level security;

-- Paso 1: políticas abiertas para anon key (equipo interno).
-- ANTES de producción real: reemplazar por Supabase Auth + políticas por usuario.
drop policy if exists "cerebrus_meta_anon_all" on public.cerebrus_meta;
create policy "cerebrus_meta_anon_all" on public.cerebrus_meta
  for all to anon using (workspace_id = 'cerebrus')
  with check (workspace_id = 'cerebrus');

drop policy if exists "cerebrus_parts_anon_all" on public.cerebrus_parts;
create policy "cerebrus_parts_anon_all" on public.cerebrus_parts
  for all to anon using (workspace_id = 'cerebrus')
  with check (workspace_id = 'cerebrus');

drop policy if exists "cerebrus_snapshots_anon_all" on public.cerebrus_snapshots;
create policy "cerebrus_snapshots_anon_all" on public.cerebrus_snapshots
  for all to anon using (workspace_id = 'cerebrus')
  with check (workspace_id = 'cerebrus');

-- Igual para authenticated (por si activan login en Supabase después)
drop policy if exists "cerebrus_meta_auth_all" on public.cerebrus_meta;
create policy "cerebrus_meta_auth_all" on public.cerebrus_meta
  for all to authenticated using (workspace_id = 'cerebrus')
  with check (workspace_id = 'cerebrus');

drop policy if exists "cerebrus_parts_auth_all" on public.cerebrus_parts;
create policy "cerebrus_parts_auth_all" on public.cerebrus_parts
  for all to authenticated using (workspace_id = 'cerebrus')
  with check (workspace_id = 'cerebrus');

drop policy if exists "cerebrus_snapshots_auth_all" on public.cerebrus_snapshots;
create policy "cerebrus_snapshots_auth_all" on public.cerebrus_snapshots
  for all to authenticated using (workspace_id = 'cerebrus')
  with check (workspace_id = 'cerebrus');
