-- ============================================================
-- Plataforma multi-negocio — 41: módulos propios por tipo de negocio
--   · agenda       (veterinaria): mascotas + citas
--   · referencias  (ferretería, tecnología, repuestos): marca, referencia, medida y compatibilidad por producto
--   · garantias    (tecnología): garantías con serial/IMEI y fecha de vencimiento
-- Se corre DESPUÉS del 40. Aditivo e idempotente: no cambia ninguna tabla existente ni ningún negocio de otro tipo.
-- ============================================================

-- ---------- 1. Módulos nuevos ----------
insert into modulos (clave, nombre, depende_de) values
  ('agenda',      'Agenda de citas y mascotas',          '{}'),
  ('referencias', 'Referencias, marcas y medidas',       '{productos}'),
  ('garantias',   'Garantías con serial o IMEI',         '{}')
on conflict (clave) do nothing;

-- ---------- 2. Tablas ----------
create table if not exists mascotas (
  id              uuid not null default gen_random_uuid(),
  negocio_id      uuid not null references negocios(id) on delete cascade,
  cliente_id      uuid,
  nombre          text not null check (char_length(btrim(nombre)) between 1 and 60),
  especie         text not null default 'perro' check (especie in ('perro','gato','ave','conejo','reptil','otro')),
  raza            text check (raza is null or char_length(raza) <= 60),
  sexo            text check (sexo is null or sexo in ('macho','hembra')),
  nacimiento      date,
  dueno_nombre    text check (dueno_nombre is null or char_length(dueno_nombre) <= 80),
  dueno_telefono  text check (dueno_telefono is null or char_length(dueno_telefono) <= 20),
  notas           text check (notas is null or char_length(notas) <= 1000),
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  primary key (negocio_id, id),
  foreign key (negocio_id, cliente_id) references clientes (negocio_id, id) on delete set null (cliente_id)
);
create index if not exists mascotas_negocio_idx on mascotas (negocio_id, activo, nombre);

create table if not exists citas (
  id          uuid not null default gen_random_uuid(),
  negocio_id  uuid not null references negocios(id) on delete cascade,
  mascota_id  uuid not null,
  inicio      timestamptz not null,
  motivo      text not null check (char_length(btrim(motivo)) between 1 and 120),
  estado      text not null default 'pendiente' check (estado in ('pendiente','atendida','cancelada','no_vino')),
  notas       text check (notas is null or char_length(notas) <= 1000),
  creado_por  uuid default auth.uid(),
  creado_en   timestamptz not null default now(),
  primary key (negocio_id, id),
  foreign key (negocio_id, mascota_id) references mascotas (negocio_id, id) on delete cascade
);
create index if not exists citas_negocio_idx on citas (negocio_id, inicio);

create table if not exists producto_datos (
  producto_id  uuid not null,
  negocio_id   uuid not null references negocios(id) on delete cascade,
  marca        text check (marca is null or char_length(marca) <= 60),
  referencia   text check (referencia is null or char_length(referencia) <= 80),
  medida       text check (medida is null or char_length(medida) <= 60),
  compatible   text check (compatible is null or char_length(compatible) <= 300),
  ubicacion    text check (ubicacion is null or char_length(ubicacion) <= 60),
  actualizado_en timestamptz not null default now(),
  primary key (negocio_id, producto_id),
  foreign key (negocio_id, producto_id) references productos (negocio_id, id) on delete cascade
);
create index if not exists producto_datos_negocio_idx on producto_datos (negocio_id);

create table if not exists garantias (
  id             uuid not null default gen_random_uuid(),
  negocio_id     uuid not null references negocios(id) on delete cascade,
  producto_id    uuid,
  cliente_id     uuid,
  cliente_nombre text not null check (char_length(btrim(cliente_nombre)) between 1 and 80),
  telefono       text check (telefono is null or char_length(telefono) <= 20),
  articulo       text not null check (char_length(btrim(articulo)) between 1 and 120),
  serial         text check (serial is null or char_length(serial) <= 40),
  fecha_compra   date not null default hoy_colombia(),
  meses          integer not null default 6 check (meses between 0 and 60),
  vence          date,
  estado         text not null default 'vigente' check (estado in ('vigente','reclamada','cerrada')),
  notas          text check (notas is null or char_length(notas) <= 1000),
  creado_en      timestamptz not null default now(),
  primary key (negocio_id, id),
  foreign key (negocio_id, producto_id) references productos (negocio_id, id) on delete set null (producto_id),
  foreign key (negocio_id, cliente_id)  references clientes  (negocio_id, id) on delete set null (cliente_id)
);
create index if not exists garantias_negocio_idx on garantias (negocio_id, vence);
create index if not exists garantias_serial_idx on garantias (negocio_id, serial);

-- ---------- 3. Candados: módulo encendido, vínculos del mismo negocio, vencimiento calculado ----------
create or replace function exigir_modulo_tabla() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform exigir_modulo(new.negocio_id, TG_ARGV[0]);
  return new;
end;
$$;

-- Los vínculos entre tablas ya los fuerzan las llaves foráneas compuestas (negocio_id, id): no se puede enlazar con datos de otro negocio.
create or replace function calcular_campos_tipo() returns trigger
language plpgsql set search_path = public
as $$
begin
  if TG_TABLE_NAME = 'producto_datos' then
    new.actualizado_en := now();
  elsif TG_TABLE_NAME = 'garantias' then
    new.vence := (new.fecha_compra + make_interval(months => new.meses))::date;
  end if;
  return new;
end;
$$;

drop trigger if exists aab_modulo on mascotas;
create trigger aab_modulo before insert or update on mascotas for each row execute function exigir_modulo_tabla('agenda');
drop trigger if exists aab_modulo on citas;
create trigger aab_modulo before insert or update on citas for each row execute function exigir_modulo_tabla('agenda');
drop trigger if exists aab_modulo on producto_datos;
create trigger aab_modulo before insert or update on producto_datos for each row execute function exigir_modulo_tabla('referencias');
drop trigger if exists aac_calculos on producto_datos;
create trigger aac_calculos before insert or update on producto_datos for each row execute function calcular_campos_tipo();
drop trigger if exists aac_calculos on garantias;
create trigger aac_calculos before insert or update on garantias for each row execute function calcular_campos_tipo();
drop trigger if exists aab_modulo on garantias;
create trigger aab_modulo before insert or update on garantias for each row execute function exigir_modulo_tabla('garantias');


-- ---------- 4. Permisos (RLS: el personal ve y escribe; solo el dueño borra) ----------
select _aplicar_politicas('mascotas',       'p', 'p', 'p', 'd');
select _aplicar_politicas('citas',          'p', 'p', 'p', 'd');
select _aplicar_politicas('producto_datos', 'p', 'p', 'p', 'd');
select _aplicar_politicas('garantias',      'p', 'p', 'p', 'd');
select _triggers_tabla('mascotas',       true);
select _triggers_tabla('citas',          true);
select _triggers_tabla('producto_datos', true);
select _triggers_tabla('garantias',      true);
grant select, insert, update, delete on mascotas, citas, producto_datos, garantias to authenticated;
revoke all on function exigir_modulo_tabla(), calcular_campos_tipo() from public, anon, authenticated;

-- ---------- 5. Cada tipo trae su módulo de fábrica ----------
create or replace function _plantilla_modulos(p_tipo text) returns text[]
language sql immutable as $$
  select case p_tipo
    when 'tienda'      then array['productos']
    when 'ropa'        then array['ropa']
    when 'repuestos'   then array['productos','repuestos','referencias']
    when 'mixto'       then array['productos','ropa']
    when 'tecnologia'  then array['productos','repuestos','referencias','garantias']
    when 'ferreteria'  then array['productos','repuestos','referencias']
    when 'miscelanea'  then array['productos']
    when 'papeleria'   then array['productos']
    when 'veterinaria' then array['productos','agenda']
  end
$$;
revoke all on function _plantilla_modulos(text) from public, anon, authenticated;

-- Los negocios que ya existen de esos tipos reciben su módulo (los demás no se tocan)
do $$
declare r record;
begin
  for r in select id from negocios where tipo in ('repuestos','tecnologia','ferreteria','veterinaria') loop
    perform _sincronizar_plan(r.id);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 6 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'verificar_aislamiento: todo en orden' as chequeo, (select bool_and(ok) from verificar_aislamiento()) as ok
  union all select 2, 'los 3 módulos existen', (select count(*) = 3 from modulos where clave in ('agenda','referencias','garantias'))
  union all select 3, 'las 4 tablas tienen RLS', (select count(*) = 4 and bool_and(relrowsecurity) from pg_class where relname in ('mascotas','citas','producto_datos','garantias'))
  union all select 4, 'anónimo no toca las tablas nuevas',
         not exists (select 1 from information_schema.role_table_grants where table_name in ('mascotas','citas','producto_datos','garantias') and grantee in ('anon','PUBLIC'))
  union all select 5, 'veterinaria trae agenda; ferretería, referencias; tecnología, garantías',
         'agenda' = any (_plantilla_modulos('veterinaria')) and 'referencias' = any (_plantilla_modulos('ferreteria')) and 'garantias' = any (_plantilla_modulos('tecnologia'))
  union all select 6, 'tienda, ropa, mixto, papelería y miscelánea quedan igual',
         _plantilla_modulos('tienda') = array['productos'] and _plantilla_modulos('mixto') = array['productos','ropa'] and _plantilla_modulos('papeleria') = array['productos']
) t order by n;
