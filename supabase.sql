-- =====================================================
-- El Confesionario del Sprint - esquema para Supabase
-- Pegar completo en: SQL Editor > New query > Run
-- =====================================================

-- ---------- Tablas ----------
create table if not exists public.rooms (
  code       text primary key check (code ~ '^[A-Z]{5}$'),
  sprint     text not null check (char_length(sprint) between 1 and 40),
  host       uuid not null default auth.uid(),
  campana    bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.confesiones (
  id         uuid primary key default gen_random_uuid(),
  room       text not null references public.rooms(code) on delete cascade,
  autor      uuid not null default auth.uid(),
  tipo       text not null check (tipo in ('milagro', 'pecado', 'plegaria')),
  texto      text not null check (char_length(texto) between 1 and 280),
  revelada   boolean not null default false,
  absuelta   boolean not null default false,
  penitencia text not null default '' check (char_length(penitencia) <= 140),
  created_at timestamptz not null default now()
);
create index if not exists confesiones_room_idx on public.confesiones(room);

create table if not exists public.amenes (
  confesion_id uuid not null references public.confesiones(id) on delete cascade,
  room         text not null references public.rooms(code) on delete cascade,
  uid          uuid not null default auth.uid(),
  primary key (confesion_id, uid)
);

grant select, insert, update, delete on public.rooms, public.confesiones, public.amenes to authenticated;

-- ---------- Seguridad (Row Level Security) ----------
alter table public.rooms       enable row level security;
alter table public.confesiones enable row level security;
alter table public.amenes      enable row level security;

-- Salas: cualquiera con sesión las ve; solo el Padre las crea y modifica
drop policy if exists rooms_select on public.rooms;
create policy rooms_select on public.rooms
  for select to authenticated using (true);

drop policy if exists rooms_insert on public.rooms;
create policy rooms_insert on public.rooms
  for insert to authenticated with check (host = auth.uid());

drop policy if exists rooms_update on public.rooms;
create policy rooms_update on public.rooms
  for update to authenticated
  using (host = auth.uid()) with check (host = auth.uid());

-- Confesiones: los sobres sin abrir solo los ven su autor y el Padre
drop policy if exists conf_select on public.confesiones;
create policy conf_select on public.confesiones
  for select to authenticated using (
    revelada
    or autor = auth.uid()
    or exists (select 1 from public.rooms r where r.code = room and r.host = auth.uid())
  );

-- Al confesar, el sobre nace sellado y sin penitencia
drop policy if exists conf_insert on public.confesiones;
create policy conf_insert on public.confesiones
  for insert to authenticated with check (
    autor = auth.uid()
    and revelada = false
    and absuelta = false
    and penitencia = ''
    and exists (select 1 from public.rooms r where r.code = room)
  );

-- Solo el Padre abre sobres, impone penitencias, absuelve y quema
drop policy if exists conf_update on public.confesiones;
create policy conf_update on public.confesiones
  for update to authenticated
  using (exists (select 1 from public.rooms r where r.code = room and r.host = auth.uid()))
  with check (exists (select 1 from public.rooms r where r.code = room and r.host = auth.uid()));

drop policy if exists conf_delete on public.confesiones;
create policy conf_delete on public.confesiones
  for delete to authenticated
  using (exists (select 1 from public.rooms r where r.code = room and r.host = auth.uid()));

-- Amenes: se ven y se votan solo en confesiones reveladas; cada quien retira el suyo
drop policy if exists amen_select on public.amenes;
create policy amen_select on public.amenes
  for select to authenticated using (
    exists (select 1 from public.confesiones c where c.id = confesion_id and c.revelada)
  );

drop policy if exists amen_insert on public.amenes;
create policy amen_insert on public.amenes
  for insert to authenticated with check (
    uid = auth.uid()
    and exists (
      select 1 from public.confesiones c
      where c.id = confesion_id and c.revelada and c.room = amenes.room
    )
  );

drop policy if exists amen_delete on public.amenes;
create policy amen_delete on public.amenes
  for delete to authenticated using (uid = auth.uid());

-- ---------- Tiempo real ----------
do $$
declare t text;
begin
  foreach t in array array['rooms', 'confesiones', 'amenes'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
