create extension if not exists pgcrypto;

create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.clinic_staff (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('staff', 'admin')),
  created_at timestamptz not null default now(),
  unique (clinic_id, user_id)
);

create table if not exists public.recovery_profiles (
  id uuid primary key,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.recovery_sessions (
  id uuid primary key,
  recovery_profile_id uuid not null references public.recovery_profiles(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  captured_at timestamptz not null,
  schema_version text not null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.session_movements (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.recovery_sessions(id) on delete cascade,
  movement_type text not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_ms integer not null check (duration_ms >= 0),
  rep_count integer not null check (rep_count >= 1),
  alignment_validated boolean not null,
  created_at timestamptz not null default now()
);

create table if not exists public.joint_telemetry (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references public.session_movements(id) on delete cascade,
  joint_name text not null,
  angle_series jsonb not null,
  max_flexion double precision not null,
  created_at timestamptz not null default now()
);

create table if not exists public.asymmetry_indicators (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references public.session_movements(id) on delete cascade,
  joint_type text not null,
  left_peak double precision not null,
  right_peak double precision not null,
  delta double precision not null,
  threshold_exceeded boolean not null,
  created_at timestamptz not null default now()
);

create table if not exists public.pad_recommendations (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references public.session_movements(id) on delete cascade,
  pad_type text not null check (pad_type in ('Sun', 'Moon')),
  target_muscle text not null,
  position_x double precision not null check (position_x >= 0 and position_x <= 1),
  position_y double precision not null check (position_y >= 0 and position_y <= 1),
  created_at timestamptz not null default now()
);

create table if not exists public.protocol_recommendations (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references public.session_movements(id) on delete cascade,
  thermal_cycle_seconds integer not null check (thermal_cycle_seconds between 60 and 120),
  photobiomodulation_red_nm integer not null check (photobiomodulation_red_nm between 630 and 660),
  photobiomodulation_blue_nm integer not null check (photobiomodulation_blue_nm between 450 and 470),
  mechanical_frequency_hz integer not null check (mechanical_frequency_hz between 20 and 40),
  source text not null check (source in ('ai', 'history_fallback', 'default_fallback')),
  model_name text,
  history_session_count integer not null default 0,
  clamped_fields jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists recovery_sessions_profile_captured_idx
  on public.recovery_sessions (recovery_profile_id, captured_at desc);

create index if not exists session_movements_session_idx
  on public.session_movements (session_id);

create index if not exists joint_telemetry_movement_joint_idx
  on public.joint_telemetry (movement_id, joint_name);

create index if not exists protocol_recommendations_movement_idx
  on public.protocol_recommendations (movement_id);

create or replace function public.is_project_admin()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('request.jwt.claim.role', true), '') = 'project_admin';
$$;

create or replace function public.is_clinic_member(target_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clinic_staff
    where clinic_id = target_clinic_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.session_in_member_clinic(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.recovery_sessions
    where id = target_session_id
      and public.is_clinic_member(clinic_id)
  );
$$;

create or replace function public.movement_in_member_clinic(target_movement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.session_movements sm
    join public.recovery_sessions rs on rs.id = sm.session_id
    where sm.id = target_movement_id
      and public.is_clinic_member(rs.clinic_id)
  );
$$;

grant execute on function public.is_project_admin() to authenticated, project_admin;
grant execute on function public.is_clinic_member(uuid) to authenticated, project_admin;
grant execute on function public.session_in_member_clinic(uuid) to authenticated, project_admin;
grant execute on function public.movement_in_member_clinic(uuid) to authenticated, project_admin;

alter table public.clinics enable row level security;
alter table public.clinic_staff enable row level security;
alter table public.recovery_profiles enable row level security;
alter table public.recovery_sessions enable row level security;
alter table public.session_movements enable row level security;
alter table public.joint_telemetry enable row level security;
alter table public.asymmetry_indicators enable row level security;
alter table public.pad_recommendations enable row level security;
alter table public.protocol_recommendations enable row level security;

drop policy if exists clinics_admin_all on public.clinics;
create policy clinics_admin_all on public.clinics
for all
to project_admin
using (true)
with check (true);

drop policy if exists clinics_member_select on public.clinics;
create policy clinics_member_select on public.clinics
for select
to authenticated
using (public.is_clinic_member(id));

drop policy if exists clinic_staff_admin_all on public.clinic_staff;
create policy clinic_staff_admin_all on public.clinic_staff
for all
to project_admin
using (true)
with check (true);

drop policy if exists clinic_staff_member_select on public.clinic_staff;
create policy clinic_staff_member_select on public.clinic_staff
for select
to authenticated
using (public.is_clinic_member(clinic_id));

drop policy if exists recovery_profiles_admin_all on public.recovery_profiles;
create policy recovery_profiles_admin_all on public.recovery_profiles
for all
to project_admin
using (true)
with check (true);

drop policy if exists recovery_profiles_member_all on public.recovery_profiles;
create policy recovery_profiles_member_all on public.recovery_profiles
for all
to authenticated
using (public.is_clinic_member(clinic_id))
with check (public.is_clinic_member(clinic_id));

drop policy if exists recovery_sessions_admin_all on public.recovery_sessions;
create policy recovery_sessions_admin_all on public.recovery_sessions
for all
to project_admin
using (true)
with check (true);

drop policy if exists recovery_sessions_member_all on public.recovery_sessions;
create policy recovery_sessions_member_all on public.recovery_sessions
for all
to authenticated
using (public.is_clinic_member(clinic_id))
with check (public.is_clinic_member(clinic_id));

drop policy if exists session_movements_admin_all on public.session_movements;
create policy session_movements_admin_all on public.session_movements
for all
to project_admin
using (true)
with check (true);

drop policy if exists session_movements_member_all on public.session_movements;
create policy session_movements_member_all on public.session_movements
for all
to authenticated
using (public.session_in_member_clinic(session_id))
with check (public.session_in_member_clinic(session_id));

drop policy if exists joint_telemetry_admin_all on public.joint_telemetry;
create policy joint_telemetry_admin_all on public.joint_telemetry
for all
to project_admin
using (true)
with check (true);

drop policy if exists joint_telemetry_member_all on public.joint_telemetry;
create policy joint_telemetry_member_all on public.joint_telemetry
for all
to authenticated
using (public.movement_in_member_clinic(movement_id))
with check (public.movement_in_member_clinic(movement_id));

drop policy if exists asymmetry_indicators_admin_all on public.asymmetry_indicators;
create policy asymmetry_indicators_admin_all on public.asymmetry_indicators
for all
to project_admin
using (true)
with check (true);

drop policy if exists asymmetry_indicators_member_all on public.asymmetry_indicators;
create policy asymmetry_indicators_member_all on public.asymmetry_indicators
for all
to authenticated
using (public.movement_in_member_clinic(movement_id))
with check (public.movement_in_member_clinic(movement_id));

drop policy if exists pad_recommendations_admin_all on public.pad_recommendations;
create policy pad_recommendations_admin_all on public.pad_recommendations
for all
to project_admin
using (true)
with check (true);

drop policy if exists pad_recommendations_member_all on public.pad_recommendations;
create policy pad_recommendations_member_all on public.pad_recommendations
for all
to authenticated
using (public.movement_in_member_clinic(movement_id))
with check (public.movement_in_member_clinic(movement_id));

drop policy if exists protocol_recommendations_admin_all on public.protocol_recommendations;
create policy protocol_recommendations_admin_all on public.protocol_recommendations
for all
to project_admin
using (true)
with check (true);

drop policy if exists protocol_recommendations_member_all on public.protocol_recommendations;
create policy protocol_recommendations_member_all on public.protocol_recommendations
for all
to authenticated
using (public.movement_in_member_clinic(movement_id))
with check (public.movement_in_member_clinic(movement_id));