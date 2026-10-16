-- ============================================================
-- Plataforma multi-negocio — 03: RLS, políticas y triggers
-- Patrón: negocio_id in (select mis_negocios_...())  → se evalúa una vez por consulta.
-- Lectura: personal (dueño/cajero) del negocio o soporte de plataforma (si el dueño no lo apagó).
-- Escritura: nunca soporte (además lo frena el trigger aaa_solo_lectura).
-- ============================================================

-- Aplica las políticas de una tabla.
--   'p' = personal del negocio (dueño o cajero) · 'd' = solo dueño · null = nadie (solo funciones del sistema)
create or replace function _aplicar_politicas(t text, sel text, ins text, upd text, del text)
returns void language plpgsql as $$
declare
  fn_sel text; fn_w text; col text := case when t = 'negocios' then 'id' else 'negocio_id' end;
  e text;
begin
  execute format('alter table %I enable row level security', t);
  -- limpiar por si se vuelve a correr
  for e in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
    execute format('drop policy %I on %I', e, t);
  end loop;

  if sel is not null then
    execute format('create policy %I on %I for select to authenticated using (%s)', t || '_sel', t,
      case sel when 'p' then format('%I in (select mis_negocios_personal()) or %I in (select negocios_soporte())', col, col)
               when 'd' then format('%I in (select mis_negocios_dueno()) or %I in (select negocios_soporte())', col, col) end);
  end if;
  if ins is not null then
    execute format('create policy %I on %I for insert to authenticated with check (%s)', t || '_ins', t,
      case ins when 'p' then format('%I in (select mis_negocios_personal())', col)
               when 'd' then format('%I in (select mis_negocios_dueno())', col) end);
  end if;
  if upd is not null then
    e := case upd when 'p' then format('%I in (select mis_negocios_personal())', col)
                  when 'd' then format('%I in (select mis_negocios_dueno())', col) end;
    execute format('create policy %I on %I for update to authenticated using (%s) with check (%s)', t || '_upd', t, e, e);
  end if;
  if del is not null then
    execute format('create policy %I on %I for delete to authenticated using (%s)', t || '_del', t,
      case del when 'p' then format('%I in (select mis_negocios_personal())', col)
               when 'd' then format('%I in (select mis_negocios_dueno())', col) end);
  end if;
end;
$$;

--                              tabla                   select insert update delete
select _aplicar_politicas('negocios',             'p', null, null, null);
select _aplicar_politicas('negocio_config',       'p', null, 'd',  null);
select _aplicar_politicas('negocio_reglas',       'p', null, 'd',  null);
select _aplicar_politicas('negocio_modulos',      'p', null, null, null);   -- se cambian con activar_modulo()
select _aplicar_politicas('negocio_contadores',   null, null, null, null);  -- solo funciones del sistema
select _aplicar_politicas('auditoria',            'd', null, null, null);
select _aplicar_politicas('accesos',              'd', null, null, null);
select _aplicar_politicas('visitas',              'd', null, null, null);

select _aplicar_politicas('productos',            'p', 'p', 'p', 'd');
select _aplicar_politicas('producto_componentes','p', 'd', 'd', 'd');
select _aplicar_politicas('ajustes_inventario',   'p', 'p', 'p', 'd');
select _aplicar_politicas('clientes',             'p', 'p', 'p', 'd');
select _aplicar_politicas('ventas',               'p', 'p', 'p', 'd');
select _aplicar_politicas('venta_items',          'p', 'p', 'p', 'd');
select _aplicar_politicas('venta_pagos',          'p', 'p', null, null);
select _aplicar_politicas('venta_consumos',       'p', 'p', null, null);
select _aplicar_politicas('fiado_movimientos',    'p', 'p', 'p', 'd');
select _aplicar_politicas('formas_pago',          'p', 'd', 'd', null);
select _aplicar_politicas('compras',              'p', 'p', 'p', 'd');
select _aplicar_politicas('compra_items',         'p', 'p', 'p', 'd');
select _aplicar_politicas('lotes',                'p', 'p', 'p', 'd');
select _aplicar_politicas('gastos',               'p', 'p', 'p', 'd');
select _aplicar_politicas('prendas',              'p', 'p', 'p', 'd');
select _aplicar_politicas('prenda_variantes',     'p', 'p', 'p', 'p');
select _aplicar_politicas('pedidos_ropa',         'p', null, 'p', 'd');      -- se crean con crear_pedido_ropa
select _aplicar_politicas('pedido_ropa_items',    'p', null, null, null);
select _aplicar_politicas('pedidos_tienda',       'p', null, 'p', 'd');      -- se crean con crear_pedido_tienda
select _aplicar_politicas('pedido_tienda_items',  'p', null, null, null);
select _aplicar_politicas('promociones',          'p', 'd', 'd', 'd');
select _aplicar_politicas('ofertas',              'd', 'd', 'd', 'd');
select _aplicar_politicas('anuncios',             'd', 'd', 'd', 'd');
select _aplicar_politicas('prestamos',            'd', 'd', 'd', 'd');
select _aplicar_politicas('prestamo_cuotas',      'd', 'd', 'd', 'd');
select _aplicar_politicas('prestamo_pagos',       'd', 'd', 'd', 'd');

-- Miembros: cada uno ve su propia fila; el dueño (y el soporte) ven todos los de su negocio. Se cambian con funciones.
alter table negocio_miembros enable row level security;
create policy negocio_miembros_sel on negocio_miembros for select to authenticated
  using (user_id = auth.uid()
         or negocio_id in (select mis_negocios_dueno())
         or negocio_id in (select negocios_soporte()));

-- Estas dos solo las toca el sistema (consola SQL / funciones definer)
alter table plataforma_admins enable row level security;
alter table modulos enable row level security;
create policy modulos_sel on modulos for select to authenticated using (true);

-- ---------- Triggers ----------
create or replace function tocar_actualizado() returns trigger
language plpgsql as $$ begin new.actualizado_en := now(); return new; end; $$;

-- Igual que en Matriz (un combo no lleva otro combo; el principal debe ser combo), y además solo dentro del mismo negocio
create or replace function validar_componente() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from productos where negocio_id = new.negocio_id and id = new.componente_id and es_kit) then
    raise exception 'Un combo no puede llevar otro combo adentro';
  end if;
  if not exists (select 1 from productos where negocio_id = new.negocio_id and id = new.kit_id and es_kit) then
    raise exception 'Primero marca el producto como combo';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
  con_negocio_id text[] := array[
    'negocio_config','negocio_reglas','negocio_modulos','negocio_miembros','negocio_contadores',
    'auditoria','accesos','visitas','productos','producto_componentes','ajustes_inventario','clientes',
    'ventas','venta_items','venta_pagos','venta_consumos','fiado_movimientos','formas_pago','compras',
    'compra_items','lotes','gastos','prendas','prenda_variantes','pedidos_ropa','pedido_ropa_items',
    'pedidos_tienda','pedido_tienda_items','promociones','ofertas','anuncios','prestamos',
    'prestamo_cuotas','prestamo_pagos'];
  sin_candado text[] := array['accesos','negocio_contadores','visitas'];   -- las escribe el sistema, incluso en nombre del soporte
begin
  -- candado de solo lectura para soporte
  foreach t in array array['negocios'] || con_negocio_id loop
    if not (t = any (sin_candado)) then
      execute format('create trigger aaa_solo_lectura before insert or update or delete on %I
                      for each row execute function bloquear_soporte()', t);
    end if;
  end loop;
  -- negocio_id inmutable
  foreach t in array con_negocio_id loop
    execute format('create trigger bbb_negocio_inmutable before update on %I
                    for each row execute function negocio_id_inmutable()', t);
  end loop;
end $$;

-- Consecutivos por negocio y tipo
create trigger aab_numero before insert on ventas
  for each row execute function asignar_numero('venta');
create trigger aab_numero before insert on pedidos_ropa
  for each row execute function asignar_numero('pedido_ropa');
create trigger aab_numero before insert on pedidos_tienda
  for each row execute function asignar_numero('pedido_tienda');

-- Fechas de actualización
create trigger ccc_actualizado before update on negocio_config for each row execute function tocar_actualizado();
create trigger ccc_actualizado before update on negocio_reglas for each row execute function tocar_actualizado();

-- Reglas de negocio
create trigger clientes_proteger_credito before insert or update on clientes
  for each row execute function proteger_credito();
create trigger productos_solo_dueno_quita before update on productos
  for each row execute function solo_dueno_quita_producto();
create trigger validar_componente_trg before insert or update on producto_componentes
  for each row execute function validar_componente();
create trigger miembro_no_es_soporte_trg before insert or update of user_id on negocio_miembros
  for each row execute function miembro_no_es_soporte();
create trigger ultimo_dueno_trg before update or delete on negocio_miembros
  for each row execute function ultimo_dueno();

-- Auditoría (mismas tablas y eventos que en Matriz, más las de plataforma)
do $$
declare r record;
begin
  for r in select * from (values
    ('ajustes_inventario','insert'), ('anuncios','insert'), ('anuncios','update'), ('anuncios','delete'),
    ('clientes','update'), ('clientes','delete'), ('compras','insert'), ('compras','delete'),
    ('fiado_movimientos','insert'), ('fiado_movimientos','update'), ('fiado_movimientos','delete'),
    ('formas_pago','insert'), ('formas_pago','update'), ('formas_pago','delete'),
    ('gastos','update'), ('gastos','delete'),
    ('negocio_config','update'), ('negocio_reglas','update'), ('negocios','update'),
    ('negocio_miembros','insert'), ('negocio_miembros','update'), ('negocio_miembros','delete'),
    ('negocio_modulos','insert'), ('negocio_modulos','update'), ('negocio_modulos','delete'),
    ('ofertas','insert'), ('ofertas','update'), ('ofertas','delete'),
    ('pedidos_ropa','update'), ('pedidos_ropa','delete'), ('pedidos_tienda','update'), ('pedidos_tienda','delete'),
    ('prestamo_pagos','insert'), ('prestamos','insert'), ('prestamos','update'),
    ('productos','update'), ('productos','delete'),
    ('promociones','insert'), ('promociones','update'), ('promociones','delete'),
    ('ventas','update'), ('ventas','delete')
  ) as x(tabla, op) loop
    execute format('create trigger %I after %s on %I for each row execute function auditar()',
                   'aud_' || r.tabla || '_' || r.op, r.op, r.tabla);
  end loop;
end $$;
