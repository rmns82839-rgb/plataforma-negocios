-- ============================================================
-- Plataforma multi-negocio — 54: papelería con módulos propios + nuevo tipo «panadería»
--   · servicios      (papelería): fotocopias, impresiones, anillado… con precio por unidad y precio por cantidad.
--                    No necesita tablas: son productos sin control de stock (ya existían).
--   · listas_utiles  (papelería): listas de útiles escolares (colegio y grado) que se llevan a la caja de una vez.
--   · encargos       (panadería): tortas y pedidos por fecha de entrega, con anticipo y saldo.
-- Se corre DESPUÉS del 53. Aditivo e idempotente. No cambia ningún negocio de otro tipo.
-- ============================================================

-- ---------- 1. Tipo de negocio «panaderia» (negocios, solicitudes y directorio externo) ----------
do $$
declare r record;
begin
  for r in select c.conrelid::regclass t, c.conname from pg_constraint c
            where c.contype = 'c' and c.conrelid in ('negocios'::regclass, 'solicitudes_negocio'::regclass, 'directorio_externo'::regclass)
              and pg_get_constraintdef(c.oid) like '%''veterinaria''%' and pg_get_constraintdef(c.oid) like '%tipo%' loop
    execute format('alter table %s drop constraint %I', r.t, r.conname);
  end loop;
end $$;
alter table negocios            drop constraint if exists negocios_tipo_check;
alter table solicitudes_negocio drop constraint if exists solicitudes_negocio_tipo_check;
alter table directorio_externo  drop constraint if exists directorio_externo_tipo_check;
alter table negocios            add constraint negocios_tipo_check            check (tipo in ('tienda','ropa','repuestos','mixto','tecnologia','ferreteria','miscelanea','papeleria','veterinaria','panaderia'));
alter table solicitudes_negocio add constraint solicitudes_negocio_tipo_check check (tipo in ('tienda','ropa','repuestos','mixto','tecnologia','ferreteria','miscelanea','papeleria','veterinaria','panaderia'));
alter table directorio_externo  add constraint directorio_externo_tipo_check  check (tipo in ('tienda','ropa','repuestos','mixto','tecnologia','ferreteria','miscelanea','papeleria','veterinaria','panaderia'));

-- La solicitud de negocio acepta el tipo nuevo (se parchea la función vigente)
do $$
declare v text := pg_get_functiondef('enviar_solicitud_negocio(jsonb)'::regprocedure);
begin
  if position('panaderia' in v) = 0 then
    v := replace(v, '''veterinaria''', '''veterinaria'', ''panaderia''');
    if position('panaderia' in v) = 0 then raise exception 'No se pudo actualizar enviar_solicitud_negocio'; end if;
    execute v;
  end if;
end $$;

-- ---------- 2. Módulos nuevos ----------
insert into modulos (clave, nombre, depende_de) values
  ('servicios',     'Servicios con precio por unidad',  '{productos}'),
  ('listas_utiles', 'Listas de útiles escolares',       '{productos}'),
  ('encargos',      'Encargos con fecha y anticipo',    '{}')
on conflict (clave) do nothing;

-- ---------- 3. Tablas ----------
create table if not exists listas_utiles (
  id          uuid not null default gen_random_uuid(),
  negocio_id  uuid not null references negocios(id) on delete cascade,
  nombre      text not null check (char_length(btrim(nombre)) between 1 and 80),
  colegio     text check (colegio is null or char_length(colegio) <= 80),
  grado       text check (grado is null or char_length(grado) <= 40),
  notas       text check (notas is null or char_length(notas) <= 500),
  activo      boolean not null default true,
  creado_en   timestamptz not null default now(),
  primary key (negocio_id, id)
);
create index if not exists listas_utiles_negocio_idx on listas_utiles (negocio_id, activo, nombre);

create table if not exists lista_utiles_items (
  id          uuid not null default gen_random_uuid(),
  negocio_id  uuid not null references negocios(id) on delete cascade,
  lista_id    uuid not null,
  producto_id uuid not null,
  cantidad    numeric(10,3) not null default 1 check (cantidad > 0 and cantidad <= 9999),
  primary key (negocio_id, id),
  unique (negocio_id, lista_id, producto_id),
  foreign key (negocio_id, lista_id)    references listas_utiles (negocio_id, id) on delete cascade,
  foreign key (negocio_id, producto_id) references productos     (negocio_id, id) on delete cascade
);
create index if not exists lista_utiles_items_idx on lista_utiles_items (negocio_id, lista_id);

create table if not exists encargos (
  id             uuid not null default gen_random_uuid(),
  negocio_id     uuid not null references negocios(id) on delete cascade,
  cliente_id     uuid,
  cliente_nombre text not null check (char_length(btrim(cliente_nombre)) between 1 and 80),
  telefono       text check (telefono is null or char_length(telefono) <= 20),
  descripcion    text not null check (char_length(btrim(descripcion)) between 1 and 500),
  entrega        timestamptz not null,
  total          numeric not null default 0 check (total >= 0),
  anticipo       numeric not null default 0 check (anticipo >= 0),
  estado         text not null default 'pendiente' check (estado in ('pendiente','listo','entregado','cancelado')),
  notas          text check (notas is null or char_length(notas) <= 500),
  creado_por     uuid default auth.uid(),
  creado_en      timestamptz not null default now(),
  primary key (negocio_id, id),
  check (anticipo <= total),
  foreign key (negocio_id, cliente_id) references clientes (negocio_id, id) on delete set null (cliente_id)
);
create index if not exists encargos_negocio_idx on encargos (negocio_id, estado, entrega);

-- ---------- 4. Candados (módulo encendido) y permisos (el personal ve y escribe; solo el dueño borra) ----------
drop trigger if exists aab_modulo on listas_utiles;
create trigger aab_modulo before insert or update on listas_utiles for each row execute function exigir_modulo_tabla('listas_utiles');
drop trigger if exists aab_modulo on lista_utiles_items;
create trigger aab_modulo before insert or update on lista_utiles_items for each row execute function exigir_modulo_tabla('listas_utiles');
drop trigger if exists aab_modulo on encargos;
create trigger aab_modulo before insert or update on encargos for each row execute function exigir_modulo_tabla('encargos');

select _aplicar_politicas('listas_utiles',      'p', 'p', 'p', 'd');
select _aplicar_politicas('lista_utiles_items', 'p', 'p', 'p', 'p');
select _aplicar_politicas('encargos',           'p', 'p', 'p', 'd');
select _triggers_tabla('listas_utiles',      true);
select _triggers_tabla('lista_utiles_items', true);
select _triggers_tabla('encargos',           true);
grant select, insert, update, delete on listas_utiles, lista_utiles_items, encargos to authenticated;

-- ---------- 5. Cada tipo trae sus módulos de fábrica ----------
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
    when 'papeleria'   then array['productos','servicios','listas_utiles']
    when 'veterinaria' then array['productos','agenda']
    when 'panaderia'   then array['productos','encargos']
  end
$$;
revoke all on function _plantilla_modulos(text) from public, anon, authenticated;

-- Las papelerías que ya existen reciben sus módulos (los demás negocios no se tocan)
do $$
declare r record;
begin
  for r in select id from negocios where tipo = 'papeleria' loop
    perform _sincronizar_plan(r.id);
  end loop;
end $$;

-- ---------- 6. Catálogo base: lo que una panadería vende ----------
update catalogo_base_categoria
   set tipos = array_append(tipos, 'panaderia')
 where categoria in ('Panadería','Pasteles','Ponqué','Pasteleria y Cereales','Café y chocolates','Lácteos','Bebidas','Gaseosas','Agua','Jugos','Dulces','Galletas','Desechables y Bolsas','Otros')
   and not ('panaderia' = any (tipos));

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 8 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'verificar_aislamiento: todo en orden' as chequeo, (select bool_and(ok) from verificar_aislamiento()) as ok
  union all select 2, 'los 3 módulos existen', (select count(*) = 3 from modulos where clave in ('servicios','listas_utiles','encargos'))
  union all select 3, 'las 3 tablas tienen RLS', (select count(*) = 3 and bool_and(relrowsecurity) from pg_class where relname in ('listas_utiles','lista_utiles_items','encargos'))
  union all select 4, 'anónimo no toca las tablas nuevas',
         not exists (select 1 from information_schema.role_table_grants where table_name in ('listas_utiles','lista_utiles_items','encargos') and grantee in ('anon','PUBLIC'))
  union all select 5, 'papelería trae servicios y listas; panadería, encargos',
         'servicios' = any (_plantilla_modulos('papeleria')) and 'listas_utiles' = any (_plantilla_modulos('papeleria')) and 'encargos' = any (_plantilla_modulos('panaderia'))
  union all select 6, 'tienda, miscelánea, veterinaria y ropa quedan igual',
         _plantilla_modulos('tienda') = array['productos'] and _plantilla_modulos('miscelanea') = array['productos']
         and _plantilla_modulos('veterinaria') = array['productos','agenda'] and _plantilla_modulos('ropa') = array['ropa']
  union all select 7, 'el tipo panaderia se acepta en negocios', pg_get_constraintdef((select oid from pg_constraint where conname = 'negocios_tipo_check')) like '%panaderia%'
  union all select 8, 'la solicitud de negocio acepta panaderia', pg_get_functiondef('enviar_solicitud_negocio(jsonb)'::regprocedure) like '%panaderia%'
) t order by n;
