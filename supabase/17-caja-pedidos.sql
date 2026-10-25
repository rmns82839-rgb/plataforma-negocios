-- =====================================================================
-- 17. C6: caja, pedido atendido → venta, caja del día
--     Aditivo e idempotente (se puede correr dos veces). No cambia ninguna tabla ni función existente:
--     la venta sigue registrándose con registrar_venta; fiados con registrar_abono; reportes con tablero.
--   · previsualizar_venta   → el total EXACTO que cobrará el servidor (promociones, mayorista…) antes de cobrar
--   · atender_pedido_tienda → marca el pedido como atendido Y registra la venta con su forma de pago (descuenta inventario)
--   · deshacer_atencion_pedido → (solo dueño) anula esa venta y deja el pedido otra vez pendiente
--   · caja_dia              → resumen de caja de un día: por forma de pago, abonos, gastos y efectivo esperado
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Total exacto de una venta, sin guardarla
--    Prueba la venta con un pago de 1 peso dentro de un bloque que SIEMPRE se deshace; el servidor responde
--    "Los pagos suman 1 y la venta es de X" y de ahí sale X. Así la pantalla nunca calcula distinto al servidor.
-- ---------------------------------------------------------------------
create or replace function previsualizar_venta(p_negocio_id uuid, p_items jsonb, p_cliente_id uuid default null, p_descuento numeric default 0)
returns jsonb
language plpgsql
as $$
declare
  v_total numeric;
  v_msg   text;
  v_id    uuid;
begin
  if not es_personal(p_negocio_id) then raise exception 'No autorizado'; end if;
  perform exigir_modulo(p_negocio_id, 'caja');
  begin
    v_id := registrar_venta(p_negocio_id, p_items, '[{"metodo":"efectivo","monto":1}]'::jsonb, p_cliente_id, null, null, p_descuento, null);
    select total into v_total from ventas where negocio_id = p_negocio_id and id = v_id;   -- el total era justo 1
    raise exception 'PREVIEW_OK';
  exception when others then
    v_msg := sqlerrm;
    if v_msg = 'PREVIEW_OK' then
      return jsonb_build_object('total', v_total);
    elsif v_msg ~ '^Los pagos suman .* y la venta es de ' then
      return jsonb_build_object('total', substring(v_msg from 'la venta es de ([0-9.]+)')::numeric);
    end if;
    raise exception '%', v_msg;     -- cualquier otro error (precio mínimo, cupo, producto…) se muestra tal cual
  end;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Pedido de la tienda → atendido + venta registrada
--    p_pagos: [{"metodo":"efectivo","monto":..,"recibido":..}] ; si es un solo pago y no trae monto, se cobra todo el pedido.
-- ---------------------------------------------------------------------
create or replace function atender_pedido_tienda(p_negocio_id uuid, p_pedido_id uuid, p_pagos jsonb)
returns jsonb
language plpgsql
as $$
declare
  ped     pedidos_tienda%rowtype;
  v_items jsonb;
  v_esp   numeric;
  v_dom   jsonb := null;
  v_pagos jsonb := p_pagos;
  v_nota  text;
  v_venta uuid;
  v_num   bigint;
begin
  if not es_personal(p_negocio_id) then raise exception 'No autorizado'; end if;

  select * into ped from pedidos_tienda where negocio_id = p_negocio_id and id = p_pedido_id for update;
  if not found then raise exception 'Pedido no encontrado'; end if;
  if ped.estado <> 'pendiente' then raise exception 'Este pedido ya fue atendido o cancelado'; end if;

  -- Los pedidos de práctica (del dueño probando su tienda) solo se marcan: no son ventas reales
  if ped.es_practica then
    update pedidos_tienda set estado = 'atendido' where negocio_id = p_negocio_id and id = p_pedido_id;
    return jsonb_build_object('venta_id', null, 'practica', true);
  end if;

  perform exigir_modulo(p_negocio_id, 'caja');
  if p_pagos is null or jsonb_typeof(p_pagos) <> 'array' or jsonb_array_length(p_pagos) = 0 then
    raise exception 'Elige cómo pagó el cliente';
  end if;
  if exists (select 1 from pedido_tienda_items where negocio_id = p_negocio_id and pedido_id = p_pedido_id and producto_id is null) then
    raise exception 'Un producto de este pedido ya no existe en tu catálogo. Márcalo como atendido sin registrar la venta';
  end if;

  select jsonb_agg(jsonb_build_object('producto_id', producto_id, 'cantidad', cantidad, 'precio', precio_unitario, 'descuento', coalesce(descuento, 0))),
         coalesce(sum(round(precio_unitario * cantidad) - coalesce(descuento, 0)), 0)
    into v_items, v_esp
    from pedido_tienda_items where negocio_id = p_negocio_id and pedido_id = p_pedido_id;
  if v_items is null then raise exception 'El pedido no tiene productos'; end if;

  v_nota := 'Pedido en línea #' || ped.numero;
  if ped.entrega = 'domicilio' then
    if modulo_activo(p_negocio_id, 'domicilios') then
      v_dom := jsonb_build_object('direccion', ped.direccion, 'telefono', ped.telefono, 'costo', coalesce(ped.domicilio, 0));
      v_esp := v_esp + coalesce(ped.domicilio, 0);
    elsif coalesce(ped.domicilio, 0) > 0 then
      v_nota := v_nota || ' · Domicilio cobrado aparte: ' || ped.domicilio::text;   -- sin el módulo de domicilios no entra en la venta
    end if;
  end if;

  -- Un solo pago sin monto = el total del pedido
  if jsonb_array_length(p_pagos) = 1 and nullif(p_pagos->0->>'monto', '') is null then
    v_pagos := jsonb_build_array(jsonb_set(p_pagos->0, '{monto}', to_jsonb(v_esp)));
  end if;

  v_venta := registrar_venta(p_negocio_id, v_items, v_pagos, ped.cliente_id, v_nota, null, 0, v_dom);

  update pedidos_tienda set estado = 'atendido', venta_id = v_venta where negocio_id = p_negocio_id and id = p_pedido_id;
  select numero into v_num from ventas where negocio_id = p_negocio_id and id = v_venta;
  return jsonb_build_object('venta_id', v_venta, 'numero', v_num, 'total', v_esp);
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Deshacer la atención (solo dueño): anula la venta, devuelve el inventario y deja el pedido pendiente
-- ---------------------------------------------------------------------
create or replace function deshacer_atencion_pedido(p_negocio_id uuid, p_pedido_id uuid, p_motivo text)
returns void
language plpgsql
as $$
declare ped pedidos_tienda%rowtype;
begin
  if not es_dueno(p_negocio_id) then raise exception 'Solo el dueño puede deshacer una venta'; end if;
  select * into ped from pedidos_tienda where negocio_id = p_negocio_id and id = p_pedido_id for update;
  if not found then raise exception 'Pedido no encontrado'; end if;
  if ped.estado <> 'atendido' then raise exception 'Este pedido no está atendido'; end if;
  if ped.venta_id is not null then
    perform anular_venta(p_negocio_id, ped.venta_id, coalesce(nullif(trim(p_motivo), ''), 'Pedido devuelto a pendiente'));
  end if;
  update pedidos_tienda set estado = 'pendiente', venta_id = null where negocio_id = p_negocio_id and id = p_pedido_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Caja del día (el cajero la ve sin costos ni ganancias)
--    efectivo_esperado = efectivo de las ventas + abonos en efectivo − gastos del día
-- ---------------------------------------------------------------------
create or replace function caja_dia(p_negocio_id uuid, p_dia date default null)
returns jsonb
language plpgsql stable
as $$
declare
  v_dia date := coalesce(p_dia, hoy_colombia());
  v_res jsonb;
begin
  if not (es_personal(p_negocio_id) or es_soporte(p_negocio_id)) then raise exception 'No autorizado'; end if;
  perform exigir_modulo(p_negocio_id, 'caja');

  with
  vs as (
    select v.* from ventas v
     where v.negocio_id = p_negocio_id and (v.fecha at time zone 'America/Bogota')::date = v_dia
  ),
  pagos as (
    select vp.metodo, coalesce(fp.nombre, vp.metodo) as nombre, coalesce(fp.tipo, 'digital') as tipo,
           sum(vp.monto) as monto, count(distinct vp.venta_id)::int as ventas
      from venta_pagos vp
      join vs on vs.id = vp.venta_id and not vs.anulada
      left join formas_pago fp on fp.negocio_id = vp.negocio_id and fp.id = vp.metodo
     where vp.negocio_id = p_negocio_id
     group by vp.metodo, fp.nombre, fp.tipo
  ),
  abo as (
    select metodo, sum(monto) as monto, count(*)::int as abonos
      from fiado_movimientos
     where negocio_id = p_negocio_id and tipo = 'abono' and (fecha at time zone 'America/Bogota')::date = v_dia
     group by metodo
  ),
  gas as (
    select id, tipo, descripcion, monto, fecha from gastos
     where negocio_id = p_negocio_id and (fecha at time zone 'America/Bogota')::date = v_dia
  ),
  lista as (
    select vs.id, vs.numero, vs.fecha, vs.total, vs.metodo, vs.anulada, vs.domicilio, c.nombre as cliente
      from vs left join clientes c on c.negocio_id = vs.negocio_id and c.id = vs.cliente_id
     order by vs.fecha desc limit 60
  )
  select jsonb_build_object(
    'dia', v_dia,
    'ventas',       (select count(*) from vs where not anulada),
    'anuladas',     (select count(*) from vs where anulada),
    'vendido',      coalesce((select sum(total) from vs where not anulada), 0),
    'fiado',        coalesce((select sum(monto) from pagos where tipo = 'fiado'), 0),
    'por_pago',     coalesce((select jsonb_agg(to_jsonb(p) order by p.monto desc) from pagos p), '[]'::jsonb),
    'abonos',       coalesce((select jsonb_agg(to_jsonb(a)) from abo a), '[]'::jsonb),
    'abonos_total', coalesce((select sum(monto) from abo), 0),
    'gastos',       coalesce((select jsonb_agg(to_jsonb(g) order by g.fecha) from gas g), '[]'::jsonb),
    'gastos_total', coalesce((select sum(monto) from gas), 0),
    'efectivo_esperado',
        coalesce((select sum(monto) from pagos where tipo = 'efectivo'), 0)
      + coalesce((select sum(monto) from abo where metodo = 'efectivo'), 0)
      - coalesce((select sum(monto) from gas), 0),
    'lista',        coalesce((select jsonb_agg(to_jsonb(l) order by l.fecha desc) from lista l), '[]'::jsonb)
  ) into v_res;
  return v_res;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Permisos: las funciones nacen abiertas a todos; se cierran a mano
-- ---------------------------------------------------------------------
revoke all on function previsualizar_venta(uuid, jsonb, uuid, numeric), atender_pedido_tienda(uuid, uuid, jsonb),
                       deshacer_atencion_pedido(uuid, uuid, text), caja_dia(uuid, date) from public, anon;
grant execute on function previsualizar_venta(uuid, jsonb, uuid, numeric), atender_pedido_tienda(uuid, uuid, jsonb),
                          deshacer_atencion_pedido(uuid, uuid, text), caja_dia(uuid, date) to authenticated;

notify pgrst, 'reload schema';

-- Verificación: debe dar 5 filas en true
select 'Las 4 funciones de caja existen' as chequeo,
       (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
          and proname in ('previsualizar_venta', 'atender_pedido_tienda', 'deshacer_atencion_pedido', 'caja_dia')) = 4 as ok
union all
select 'Solo usuarios con sesión las ejecutan (anon no)',
       has_function_privilege('authenticated', 'atender_pedido_tienda(uuid,uuid,jsonb)', 'execute')
       and has_function_privilege('authenticated', 'caja_dia(uuid,date)', 'execute')
       and not has_function_privilege('anon', 'atender_pedido_tienda(uuid,uuid,jsonb)', 'execute')
       and not has_function_privilege('anon', 'previsualizar_venta(uuid,jsonb,uuid,numeric)', 'execute')
       and not has_function_privilege('anon', 'caja_dia(uuid,date)', 'execute')
union all
select 'La venta se registra con registrar_venta (misma lógica de precios, stock y fiado)',
       position('registrar_venta' in pg_get_functiondef('atender_pedido_tienda(uuid,uuid,jsonb)'::regprocedure)) > 0
union all
select 'Deshacer usa anular_venta (devuelve inventario y borra el cargo de fiado)',
       position('anular_venta' in pg_get_functiondef('deshacer_atencion_pedido(uuid,uuid,text)'::regprocedure)) > 0
union all
select 'Existen las funciones de venta, abono y tablero que usa el panel',
       (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
          and proname in ('registrar_venta', 'registrar_abono', 'anular_venta', 'tablero')) = 4;
