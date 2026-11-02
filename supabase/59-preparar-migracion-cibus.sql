-- ============================================================
-- Plataforma multi-negocio — 59: lo que falta para recibir la tienda de Nelson (Cibus) sin perder nada
--   · anuncios.video; pedidos_tienda.dom_tarifa y dom_por_confirmar (detalle del domicilio de pedidos viejos).
--   · Tablas por negocio: avisos_auto, avisos_log, instalaciones_app (guardan los datos de Cibus; sus funciones se portan después).
-- No toca ningún dato existente. Se corre DESPUÉS del 58. Idempotente.
-- ============================================================
alter table anuncios       add column if not exists video             text;
alter table pedidos_tienda add column if not exists dom_tarifa        jsonb;
alter table pedidos_tienda add column if not exists dom_por_confirmar boolean not null default false;

create table if not exists avisos_auto (
  negocio_id     uuid primary key references negocios(id) on delete cascade,
  activo         boolean not null default false,
  menu_auto      boolean not null default true,
  menus_ids      text[] not null default '{}',
  novedad        text check (novedad is null or char_length(novedad) <= 120),
  novedad_dia    date,
  max_semana     smallint not null default 4 check (max_semana between 1 and 7),
  actualizado_en timestamptz not null default now()
);
create table if not exists avisos_log (
  negocio_id uuid not null references negocios(id) on delete cascade,
  user_id    uuid not null,
  dia        date not null,
  tipo       text not null,
  clave      text,
  creado_en  timestamptz not null default now(),
  primary key (negocio_id, user_id, dia)
);
create table if not exists instalaciones_app (
  negocio_id      uuid not null references negocios(id) on delete cascade,
  dispositivo     text not null check (char_length(dispositivo) between 16 and 64),
  plataforma      text not null default 'otro' check (plataforma in ('android', 'ios', 'escritorio', 'otro')),
  primera_vez     timestamptz not null default now(),
  instalada_en    timestamptz,
  ultima_apertura timestamptz,
  aperturas       int not null default 0,
  primary key (negocio_id, dispositivo)
);

select _aplicar_politicas('avisos_auto',       'd', null, null, null);
select _aplicar_politicas('avisos_log',        'd', null, null, null);
select _aplicar_politicas('instalaciones_app', 'd', null, null, null);
grant select on avisos_auto, avisos_log, instalaciones_app to authenticated;     -- solo lectura: se escriben con funciones
select _triggers_tabla('avisos_auto',       true);
select _triggers_tabla('avisos_log',        true);
select _triggers_tabla('instalaciones_app', true);

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 4 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'verificar_aislamiento: todo en orden' as chequeo, (select bool_and(ok) from verificar_aislamiento()) as ok
  union all select 2, 'existen avisos_auto, avisos_log e instalaciones_app',
         (select count(*) = 3 from information_schema.tables where table_schema = 'public' and table_name in ('avisos_auto', 'avisos_log', 'instalaciones_app'))
  union all select 3, 'anuncios.video y pedidos_tienda.dom_tarifa existen',
         exists (select 1 from information_schema.columns where table_name = 'anuncios' and column_name = 'video')
         and exists (select 1 from information_schema.columns where table_name = 'pedidos_tienda' and column_name = 'dom_tarifa')
  union all select 4, 'las tres tablas nuevas tienen RLS y anónimo no entra',
         (select count(*) = 3 from pg_class where relname in ('avisos_auto', 'avisos_log', 'instalaciones_app') and relrowsecurity)
         and not exists (select 1 from information_schema.role_table_grants where table_name in ('avisos_auto', 'avisos_log', 'instalaciones_app') and grantee in ('anon', 'PUBLIC'))
) t order by n;
