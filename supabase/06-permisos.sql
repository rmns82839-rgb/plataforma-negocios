-- ============================================================
-- Plataforma multi-negocio — 06: permisos explícitos y verificación
-- No se confía en los permisos por defecto: se quita todo y se otorga lo mínimo.
-- (En Matriz, tres funciones quedaron con EXECUTE para PUBLIC por no hacer esto.)
-- ============================================================

-- Que lo que se cree después NO nazca con permisos para anon/authenticated
alter default privileges in schema public revoke all on tables    from public, anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from public, anon, authenticated;

-- ---------- Tablas y vistas ----------
revoke all on all tables    in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated;

-- Con lectura, inserción, cambio y borrado (el RLS decide quién, en qué negocio)
grant select, insert, update, delete on
  productos, ajustes_inventario, clientes, ventas, venta_items, fiado_movimientos, compras, compra_items,
  lotes, gastos, prendas, prenda_variantes, promociones, ofertas, anuncios, prestamos, prestamo_cuotas,
  prestamo_pagos, producto_componentes
  to authenticated;
grant select, insert on venta_pagos, venta_consumos to authenticated;
grant select, insert, update on formas_pago to authenticated;
grant select, update, delete on pedidos_ropa, pedidos_tienda to authenticated;
grant select on pedido_ropa_items, pedido_tienda_items to authenticated;
grant select, update on negocio_config, negocio_reglas to authenticated;
-- Solo lectura desde el cliente (se cambian con funciones o desde la consola)
grant select on negocios, negocio_modulos, negocio_miembros, modulos, auditoria, accesos, visitas to authenticated;
-- Vistas internas
grant select on clientes_saldo, clientes_mora, lotes_saldo, prestamos_resumen to authenticated;
-- negocio_contadores y plataforma_admins: nadie desde el cliente

-- El servicio (llaves de servicio del servidor) puede todo
grant all on all tables in schema public to service_role;
grant usage on schema public to service_role;

-- ---------- Funciones ----------
-- Anónimo: solo lo público, siempre por slug
grant execute on function negocio_publico(text), registrar_visita(text, text, text),
                          catalogo_tienda(text), catalogo_ropa(text) to anon, authenticated;

-- Usuarios con sesión
grant execute on function
  hoy_colombia(), lin_srgb(numeric), luminancia_hex(text), contraste_ok_con_blanco(text),
  mfa_ok(), mis_negocios_personal(), mis_negocios_dueno(), negocios_soporte(),
  es_personal(uuid), es_dueno(uuid), es_soporte(uuid), mi_rol(uuid),
  modulo_activo(uuid, text), exigir_modulo(uuid, text),
  mis_negocios(), listar_miembros(uuid), agregar_miembro(uuid, text, text, text), quitar_miembro(uuid, uuid),
  registrar_acceso(uuid, text), accesos_pendientes(uuid), marcar_accesos_vistos(uuid),
  ajustar_stock(uuid, uuid, numeric, text),
  negocio_de_ruta(text), negocio_de_tema(text)
  to authenticated;
-- hoy_colombia la usan las vistas y los chequeos del lado del usuario
grant execute on function hoy_colombia() to anon;

-- Solo consola / servicio (nadie más): crear_negocio, activar_modulo, _plantilla_modulos, _aplicar_politicas
grant execute on function crear_negocio(text, text, text, text), activar_modulo(uuid, text, boolean) to service_role;

-- ---------- Verificación de aislamiento (se corre desde el SQL Editor) ----------
-- select * from verificar_aislamiento();   → todas las filas deben decir ok = true
create or replace function verificar_aislamiento()
returns table (chequeo text, ok boolean, detalle text)
language plpgsql stable set search_path = public
as $$
declare v text;
begin
  chequeo := 'Todas las tablas tienen RLS activado';
  select string_agg(relname, ', ') into v from pg_class
   where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity;
  ok := v is null; detalle := coalesce(v, ''); return next;

  chequeo := 'Toda tabla con negocio_id tiene el candado de cambio de negocio';
  select string_agg(c.relname, ', ') into v from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'negocio_id' and not a.attisdropped)
     and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'bbb_negocio_inmutable' and not t.tgisinternal);
  ok := v is null; detalle := coalesce(v, ''); return next;

  chequeo := 'Toda llave foránea entre tablas del negocio incluye negocio_id (compuesta)';
  select string_agg(c.conrelid::regclass::text || '.' || c.conname, ', ') into v from pg_constraint c
   where c.contype = 'f' and c.connamespace = 'public'::regnamespace
     and c.confrelid::regclass::text <> 'negocios' and c.confrelid::regclass::text <> 'modulos'
     and array_length(c.conkey, 1) = 1;
  ok := v is null; detalle := coalesce(v, ''); return next;

  chequeo := 'Anónimo no tiene permisos sobre ninguna tabla';
  select string_agg(table_name, ', ') into v from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'anon';
  ok := v is null; detalle := coalesce(v, ''); return next;

  chequeo := 'Ninguna función de public es ejecutable por PUBLIC';
  select string_agg(p.proname, ', ') into v from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
     and has_function_privilege('public', p.oid, 'execute') is true
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');
  ok := v is null; detalle := coalesce(v, ''); return next;

  chequeo := 'Anónimo solo ejecuta las 5 funciones públicas';
  select string_agg(p.proname, ', ') into v from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
     and has_function_privilege('anon', p.oid, 'execute')
     and p.proname not in ('negocio_publico','registrar_visita','catalogo_tienda','catalogo_ropa','hoy_colombia');
  ok := v is null; detalle := coalesce(v, ''); return next;

  chequeo := 'Toda función security definer fija search_path';
  select string_agg(p.proname, ', ') into v from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%');
  ok := v is null; detalle := coalesce(v, ''); return next;

  chequeo := 'Las vistas internas corren con los permisos de quien consulta';
  select string_agg(c.relname, ', ') into v from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
     and not coalesce('security_invoker=true' = any (c.reloptions), false);
  ok := v is null; detalle := coalesce(v, ''); return next;

  chequeo := 'Ninguna política de public se aplica a anónimo';
  select string_agg(tablename || '.' || policyname, ', ') into v from pg_policies
   where schemaname = 'public' and (roles::text like '%anon%' or roles::text like '%public%');
  ok := v is null; detalle := coalesce(v, ''); return next;
end;
$$;
-- las funciones nuevas nacen con EXECUTE para PUBLIC aunque se cambien los privilegios por defecto: se quita a mano
revoke all on function verificar_aislamiento() from public, anon, authenticated;
grant execute on function verificar_aislamiento() to service_role;
