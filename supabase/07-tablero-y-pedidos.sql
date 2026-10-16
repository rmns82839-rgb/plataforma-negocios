-- ============================================================
-- Plataforma multi-negocio — 09: tableros y pedidos públicos por slug
-- Los pedidos públicos (anon) conservan lo de Matriz (v21, v25, v26): precios, promociones
-- y domicilio los calcula SIEMPRE el servidor; el navegador solo dice qué y cuánto.
-- ============================================================

-- ---------- Tablero (dueño; el soporte puede leerlo) ----------
create or replace function tablero(p_negocio_id uuid, p_desde timestamptz, p_hasta timestamptz default null)
returns jsonb
language plpgsql stable
as $$
declare
  v_hasta  timestamptz := coalesce(p_hasta, now() + interval '1 second');
  v_ant_d  timestamptz := p_desde - (coalesce(p_hasta, now() + interval '1 second') - p_desde);
  v_res    jsonb;
  v_hoy    date := hoy_colombia();
begin
  if not (es_dueno(p_negocio_id) or es_soporte(p_negocio_id)) then raise exception 'Solo el dueño puede ver el tablero'; end if;
  perform exigir_modulo(p_negocio_id, 'reportes');
  if p_desde is null or v_hasta <= p_desde then raise exception 'Rango de fechas inválido'; end if;

  with
  lin as (   -- una fila por producto vendido (ventas válidas del periodo actual y del anterior)
    select v.id as venta_id, v.fecha, v.cliente_id, v.metodo,
           (v.fecha >= p_desde) as actual,
           vi.nombre, coalesce(p.categoria, pr.categoria, 'Ropa') as categoria,
           vi.cantidad, coalesce(vi.descuento_linea, 0) as dlin,
           round(vi.precio_unitario * vi.cantidad) - coalesce(vi.descuento_linea, 0) as venta,
           round(vi.costo_unitario * vi.cantidad) as costo
    from ventas v
    join venta_items vi on vi.negocio_id = v.negocio_id and vi.venta_id = v.id
    left join productos p on p.negocio_id = vi.negocio_id and p.id = vi.producto_id
    left join prenda_variantes pv on pv.negocio_id = vi.negocio_id and pv.id = vi.prenda_variante_id
    left join prendas pr on pr.negocio_id = pv.negocio_id and pr.id = pv.prenda_id
    where v.negocio_id = p_negocio_id and not v.anulada and v.fecha >= v_ant_d and v.fecha < v_hasta
  ),
  vs as (    -- una fila por venta
    select v.id, v.fecha, v.total, v.descuento, v.dom_costo, v.domicilio, v.metodo, (v.fecha >= p_desde) as actual,
           coalesce((select sum(comision) from venta_pagos x where x.negocio_id = v.negocio_id and x.venta_id = v.id), 0) as comision
    from ventas v
    where v.negocio_id = p_negocio_id and not v.anulada and v.fecha >= v_ant_d and v.fecha < v_hasta
  ),
  act as (
    select count(*)::int as ventas,
           coalesce(sum(total - dom_costo), 0) as vendido,
           coalesce(sum(dom_costo), 0) as envios,
           coalesce(sum(descuento), 0) as desc_general,
           coalesce(sum(comision), 0) as comisiones,
           count(*) filter (where domicilio)::int as domicilios
    from vs where actual
  ),
  ant as (
    select count(*)::int as ventas, coalesce(sum(total - dom_costo), 0) as vendido,
           coalesce(sum(descuento), 0) as desc_general, coalesce(sum(comision), 0) as comisiones
    from vs where not actual
  ),
  gl as (
    select actual, coalesce(sum(venta - costo), 0) as bruta, coalesce(sum(dlin), 0) as desc_lineas,
           coalesce(sum(cantidad), 0) as unidades
    from lin group by actual
  ),
  dias as (
    select to_char((fecha at time zone 'America/Bogota')::date, 'YYYY-MM-DD') as dia,
           count(*)::int as ventas, sum(total - dom_costo) as vendido
    from vs where actual group by 1 order by 1
  ),
  horas as (
    select extract(hour from fecha at time zone 'America/Bogota')::int as hora, count(*)::int as ventas, sum(total - dom_costo) as vendido
    from vs where actual group by 1 order by 1
  ),
  pagos as (
    select vp.metodo, sum(vp.monto) as monto, count(distinct vp.venta_id)::int as ventas
    from venta_pagos vp join vs on vs.id = vp.venta_id and vs.actual
    where vp.negocio_id = p_negocio_id
    group by vp.metodo order by 2 desc
  ),
  top as (
    select nombre, sum(cantidad) as cantidad, sum(venta) as venta, sum(venta - costo) as ganancia
    from lin where actual group by nombre order by sum(venta) desc limit 10
  ),
  cats as (
    select coalesce(categoria, 'Sin categoría') as categoria, sum(venta) as venta, sum(venta - costo) as ganancia
    from lin where actual group by 1 order by 2 desc limit 8
  ),
  clientes_top as (
    select c.nombre, sum(v.total - v.dom_costo) as vendido, count(*)::int as ventas
    from ventas v join clientes c on c.negocio_id = v.negocio_id and c.id = v.cliente_id
    where v.negocio_id = p_negocio_id and not v.anulada and v.fecha >= p_desde and v.fecha < v_hasta
    group by c.nombre order by 2 desc limit 5
  ),
  gas as (select coalesce(sum(monto), 0) as total from gastos
           where negocio_id = p_negocio_id and fecha >= p_desde and fecha < v_hasta),
  abo as (select coalesce(sum(monto), 0) as total from fiado_movimientos
           where negocio_id = p_negocio_id and tipo = 'abono' and fecha >= p_desde and fecha < v_hasta),
  anu as (
    select count(*)::int as n, coalesce(sum(total), 0) as total
    from ventas where negocio_id = p_negocio_id and anulada and anulada_en >= p_desde and anulada_en < v_hasta
  ),
  cartera as (
    select coalesce(sum(saldo) filter (where saldo > 0), 0) as por_cobrar,
           count(*) filter (where saldo > 0)::int as deudores
    from clientes_saldo where negocio_id = p_negocio_id
  ),
  mora as (
    select coalesce(sum(vencido), 0) as vencido, coalesce(sum(recargo), 0) as recargo, count(*)::int as clientes
    from clientes_mora where negocio_id = p_negocio_id
  ),
  inv as (
    select coalesce(sum(greatest(stock, 0) * precio_compra) filter (where not es_kit), 0)
             + (select coalesce(sum(greatest(x.stock, 0) * r.costo), 0)
                  from prenda_variantes x join prendas r on r.negocio_id = x.negocio_id and r.id = x.prenda_id
                 where x.negocio_id = p_negocio_id and r.activo) as capital,
           coalesce(sum(greatest(stock, 0) * precio_venta) filter (where not es_kit), 0)
             + (select coalesce(sum(greatest(x.stock, 0) * r.precio), 0)
                  from prenda_variantes x join prendas r on r.negocio_id = x.negocio_id and r.id = x.prenda_id
                 where x.negocio_id = p_negocio_id and r.activo) as valor_venta,
           count(*) filter (where not es_kit and stock <= stock_minimo)::int as stock_bajo,
           count(*) filter (where not es_kit and stock <= 0)::int as agotados,
           count(*) filter (where activo)::int as productos
    from productos where negocio_id = p_negocio_id and activo
  ),
  venc as (
    select count(*)::int as n from lotes_saldo
    where negocio_id = p_negocio_id and restante > 0 and fecha_vencimiento is not null and fecha_vencimiento <= v_hoy + 30
  ),
  dom as (
    select count(*) filter (where dom_estado = 'pendiente')::int as pendientes,
           count(*) filter (where dom_estado = 'en_camino')::int as en_camino
    from ventas where negocio_id = p_negocio_id and domicilio and not anulada
  )
  select jsonb_build_object(
    'desde', p_desde, 'hasta', v_hasta,
    'ventas',       (select ventas from act),
    'vendido',      (select vendido from act),
    'envios',       (select envios from act),
    'descuentos',   (select desc_general from act) + coalesce((select desc_lineas from gl where actual), 0),
    'comisiones',   (select comisiones from act),
    'unidades',     coalesce((select unidades from gl where actual), 0),
    'ganancia',     coalesce((select bruta from gl where actual), 0) - (select desc_general from act) - (select comisiones from act),
    'gastos',       (select total from gas),
    'abonos',       (select total from abo),
    'anuladas',     (select n from anu),
    'anuladas_valor', (select total from anu),
    'domicilios',   (select domicilios from act),
    'anterior', jsonb_build_object(
      'ventas', (select ventas from ant), 'vendido', (select vendido from ant),
      'ganancia', coalesce((select bruta from gl where not actual), 0) - (select desc_general from ant) - (select comisiones from ant)),
    'por_dia',      coalesce((select jsonb_agg(to_jsonb(d)) from dias d), '[]'::jsonb),
    'por_hora',     coalesce((select jsonb_agg(to_jsonb(h)) from horas h), '[]'::jsonb),
    'por_pago',     coalesce((select jsonb_agg(to_jsonb(x)) from pagos x), '[]'::jsonb),
    'top',          coalesce((select jsonb_agg(to_jsonb(t)) from top t), '[]'::jsonb),
    'categorias',   coalesce((select jsonb_agg(to_jsonb(c)) from cats c), '[]'::jsonb),
    'clientes',     coalesce((select jsonb_agg(to_jsonb(c)) from clientes_top c), '[]'::jsonb),
    'cartera',      (select to_jsonb(cartera) from cartera),
    'mora',         (select to_jsonb(mora) from mora),
    'inventario',   (select to_jsonb(inv) from inv) || jsonb_build_object('por_vencer', (select n from venc)),
    'domicilios_estado', (select to_jsonb(dom) from dom)
  ) into v_res;
  return v_res;
end;
$$;

create or replace function tablero_en_linea(p_negocio_id uuid, p_desde timestamptz, p_hasta timestamptz default null)
returns jsonb
language plpgsql stable
as $$
declare
  v_hasta timestamptz := coalesce(p_hasta, now() + interval '1 second');
  v_d1    date;
  v_d2    date;
  v_res   jsonb;
begin
  if not (es_dueno(p_negocio_id) or es_soporte(p_negocio_id)) then raise exception 'Solo el dueño puede ver las estadísticas en línea'; end if;
  perform exigir_modulo(p_negocio_id, 'reportes');
  if p_desde is null or v_hasta <= p_desde then raise exception 'Rango de fechas inválido'; end if;
  v_d1 := (p_desde at time zone 'America/Bogota')::date;
  v_d2 := ((v_hasta - interval '1 second') at time zone 'America/Bogota')::date;

  with
  ped as (   -- pedidos de los dos catálogos dentro del periodo
    select 'tienda'::text as cat, id, creado_en, total,
           case estado when 'atendido' then 'atendido' when 'cancelado' then 'cancelado' else 'pendiente' end as est,
           coalesce(entrega, 'domicilio') as entrega
    from pedidos_tienda where negocio_id = p_negocio_id and creado_en >= p_desde and creado_en < v_hasta
    union all
    select 'ropa'::text, id, creado_en, total,
           case estado when 'vendido' then 'atendido' when 'cancelado' then 'cancelado' else 'pendiente' end,
           coalesce(entrega, 'domicilio')
    from pedidos_ropa where negocio_id = p_negocio_id and creado_en >= p_desde and creado_en < v_hasta
  ),
  cat as (
    select cat,
           count(*)::int                                             as recibidos,
           (count(*) filter (where est = 'atendido'))::int           as atendidos,
           (count(*) filter (where est = 'cancelado'))::int          as cancelados,
           (count(*) filter (where est = 'pendiente'))::int          as pendientes,
           coalesce(sum(total) filter (where est <> 'cancelado'), 0) as valor_recibido,
           coalesce(sum(total) filter (where est = 'atendido'), 0)   as valor_atendido,
           (count(*) filter (where entrega = 'domicilio' and est <> 'cancelado'))::int as a_domicilio,
           (count(*) filter (where entrega = 'recoger'   and est <> 'cancelado'))::int as a_recoger
    from ped group by cat
  ),
  items as (   -- lo que se pidió (sin contar pedidos cancelados)
    select i.nombre, i.cantidad::numeric as cantidad,
           (round(i.precio_unitario * i.cantidad) - coalesce(i.descuento, 0))::numeric as valor
    from pedido_tienda_items i join ped p on p.id = i.pedido_id and p.cat = 'tienda' and p.est <> 'cancelado'
    where i.negocio_id = p_negocio_id
    union all
    select i.nombre, i.cantidad::numeric,
           (i.precio_unitario * i.cantidad - coalesce(i.descuento, 0))::numeric
    from pedido_ropa_items i join ped p on p.id = i.pedido_id and p.cat = 'ropa' and p.est <> 'cancelado'
    where i.negocio_id = p_negocio_id
  ),
  top as (
    select nombre, sum(cantidad) as cantidad, sum(valor) as valor
    from items group by nombre order by sum(cantidad) desc, sum(valor) desc limit 8
  ),
  horas as (
    select extract(hour from creado_en at time zone 'America/Bogota')::int as hora, count(*)::int as pedidos
    from ped where est <> 'cancelado' group by 1 order by 1
  ),
  vis as (
    select dia, catalogo, count(*)::int as n from visitas
     where negocio_id = p_negocio_id and dia between v_d1 and v_d2 group by 1, 2
  ),
  dias_ped as (
    select (creado_en at time zone 'America/Bogota')::date as dia, cat, count(*)::int as n
    from ped where est <> 'cancelado' group by 1, 2
  ),
  dias as (
    select d.dia::text as dia,
           coalesce(max(dp.n) filter (where dp.cat = 'tienda'), 0) as pedidos_tienda,
           coalesce(max(dp.n) filter (where dp.cat = 'ropa'), 0)   as pedidos_ropa,
           coalesce(max(vi.n) filter (where vi.catalogo = 'tienda'), 0) as visitas_tienda,
           coalesce(max(vi.n) filter (where vi.catalogo = 'ropa'), 0)   as visitas_ropa
    from (select dia from dias_ped union select dia from vis) d
    left join dias_ped dp on dp.dia = d.dia
    left join vis vi on vi.dia = d.dia
    group by d.dia order by d.dia
  ),
  ped_venta as (
    select venta_id from pedidos_tienda where negocio_id = p_negocio_id and venta_id is not null
    union
    select venta_id from pedidos_ropa where negocio_id = p_negocio_id and venta_id is not null
  ),
  vs as (   -- ventas válidas del periodo (sin el cobro de domicilio, igual que el tablero)
    select v.id, (v.fecha at time zone 'America/Bogota')::date as dia,
           (v.total - coalesce(v.dom_costo, 0)) as monto,
           (v.id in (select venta_id from ped_venta)) as en_linea
    from ventas v where v.negocio_id = p_negocio_id and not v.anulada and v.fecha >= p_desde and v.fecha < v_hasta
  ),
  comp_dias as (
    select dia::text as dia,
           coalesce(sum(monto) filter (where not en_linea), 0) as mostrador,
           coalesce(sum(monto) filter (where en_linea), 0)     as en_linea
    from vs group by dia order by dia
  ),
  visitas_cat as (
    select catalogo, count(distinct visitante)::int as visitantes
    from visitas where negocio_id = p_negocio_id and dia between v_d1 and v_d2 group by catalogo
  )
  select jsonb_build_object(
    'desde', p_desde, 'hasta', v_hasta,
    'catalogos', coalesce((select jsonb_agg(to_jsonb(c)) from cat c), '[]'::jsonb),
    'top',       coalesce((select jsonb_agg(to_jsonb(t)) from top t), '[]'::jsonb),
    'por_hora',  coalesce((select jsonb_agg(to_jsonb(h)) from horas h), '[]'::jsonb),
    'por_dia',   coalesce((select jsonb_agg(to_jsonb(d)) from dias d), '[]'::jsonb),
    'comparacion', jsonb_build_object(
      'mostrador',         coalesce((select sum(monto) from vs where not en_linea), 0),
      'en_linea',          coalesce((select sum(monto) from vs where en_linea), 0),
      'ventas_mostrador',  (select count(*) from vs where not en_linea),
      'ventas_en_linea',   (select count(*) from vs where en_linea),
      'por_dia',           coalesce((select jsonb_agg(to_jsonb(x)) from comp_dias x), '[]'::jsonb)),
    'visitas',   coalesce((select jsonb_agg(to_jsonb(v)) from visitas_cat v), '[]'::jsonb),
    'visitas_desde', (select min(dia)::text from visitas where negocio_id = p_negocio_id)
  ) into v_res;
  return v_res;
end;
$$;

-- ---------- Pedidos públicos (por slug) ----------
-- Interno: busca o crea el cliente DENTRO del negocio. No se expone a anon.
create or replace function _cliente_desde_pedido(p_negocio_id uuid, p_datos jsonb, p_origen text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_recoge boolean := coalesce(p_datos->>'entrega', '') = 'recoger';
  v_nombre text := trim(coalesce(p_datos->>'nombre', ''));
  v_tel    text := regexp_replace(coalesce(p_datos->>'telefono', ''), '\D', '', 'g');
  v_dir    text := case when coalesce(p_datos->>'entrega', '') = 'recoger' then '' else trim(coalesce(p_datos->>'direccion', '')) end;
  v_mail   text := lower(trim(coalesce(p_datos->>'email', '')));
  v_promos boolean := coalesce((p_datos->>'acepta_promos')::boolean, false);
  v_id     uuid;
begin
  if coalesce((p_datos->>'acepta_datos')::boolean, false) is not true then
    raise exception 'Debes aceptar la política de tratamiento de datos para hacer el pedido';
  end if;
  if length(v_nombre) < 3 or length(v_nombre) > 80 then raise exception 'Escribe tu nombre completo'; end if;
  if length(v_tel) = 12 and left(v_tel, 2) = '57' then v_tel := substr(v_tel, 3); end if;
  if length(v_tel) <> 10 then raise exception 'Escribe tu número de celular (10 dígitos)'; end if;
  if not v_recoge and (length(v_dir) < 6 or length(v_dir) > 160) then raise exception 'Escribe tu dirección completa'; end if;
  if v_mail <> '' and (length(v_mail) > 120 or v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'El correo no es válido';
  end if;

  select id into v_id from clientes
   where negocio_id = p_negocio_id
     and regexp_replace(coalesce(telefono, ''), '\D', '', 'g') in (v_tel, '57' || v_tel)
   order by creado_en limit 1;

  if v_id is null then
    insert into clientes (negocio_id, nombre, telefono, direccion, email, origen, acepta_datos_en, acepta_promos, acepta_promos_en, politica_version)
    values (p_negocio_id, v_nombre, v_tel, nullif(v_dir, ''), nullif(v_mail, ''), p_origen, now(), v_promos, case when v_promos then now() end, 'v1')
    returning id into v_id;
  else
    -- cliente que ya existía: solo se completan los datos que faltaban (nunca se pisan los del dueño)
    update clientes set
      direccion = case when coalesce(trim(direccion), '') = '' then nullif(v_dir, '') else direccion end,
      email = case when coalesce(trim(email), '') = '' then nullif(v_mail, '') else email end,
      acepta_datos_en = coalesce(acepta_datos_en, now()),
      politica_version = coalesce(politica_version, 'v1'),
      acepta_promos = acepta_promos or v_promos,
      acepta_promos_en = case when v_promos and not acepta_promos then now() else acepta_promos_en end,
      origen = coalesce(origen, p_origen)
    where negocio_id = p_negocio_id and id = v_id;
  end if;
  return v_id;
end;
$$;

create or replace function crear_pedido_tienda(p_slug text, p_datos jsonb, p_items jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_neg    uuid := _negocio_publico_id(p_slug, 'pedidos_en_linea');
  it       jsonb;
  prod     productos%rowtype;
  v_cant   numeric;
  v_bruto  numeric;
  v_desc   numeric;
  v_pnom   text;
  v_total  numeric := 0;
  v_dom    numeric := 0;
  v_costo  numeric;
  v_gratis numeric;
  v_recoge boolean := coalesce(p_datos->>'entrega', '') = 'recoger';
  v_id     uuid;
  v_num    bigint;
  v_cli    uuid;
  v_lineas jsonb := '[]'::jsonb;
  v_hoy    date := hoy_colombia();
  v_vistos uuid[] := '{}';
begin
  perform exigir_modulo(v_neg, 'productos');
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 40 then
    raise exception 'El pedido está vacío o es demasiado grande';
  end if;
  if (select count(*) from pedidos_tienda where negocio_id = v_neg and estado = 'pendiente') >= 300 then
    raise exception 'Hay muchos pedidos pendientes: escríbenos directamente por WhatsApp';
  end if;
  v_cli := _cliente_desde_pedido(v_neg, p_datos, 'tienda');

  insert into pedidos_tienda (negocio_id, cliente_id, nombre, telefono, direccion, email, nota, entrega)
  select v_neg, v_cli, c.nombre, c.telefono,
         case when v_recoge then 'Recoge en tienda' else trim(p_datos->>'direccion') end,
         c.email, nullif(left(trim(coalesce(p_datos->>'nota', '')), 200), ''),
         case when v_recoge then 'recoger' else 'domicilio' end
    from clientes c where c.negocio_id = v_neg and c.id = v_cli
  returning id, numero into v_id, v_num;

  for it in select * from jsonb_array_elements(p_items) loop
    v_cant := (it->>'cantidad')::numeric;
    if v_cant is null or v_cant <= 0 or v_cant > 500 then raise exception 'Cantidad inválida'; end if;
    select * into prod from productos
     where negocio_id = v_neg and id = (it->>'producto_id')::uuid and activo and publicado and precio_venta > 0;
    if not found then raise exception 'Uno de los productos ya no está disponible'; end if;
    if prod.id = any(v_vistos) then raise exception 'Un producto está repetido en el pedido'; end if;
    v_vistos := v_vistos || prod.id;
    if prod.stock <= 0 then raise exception '"%" está agotado por ahora', prod.nombre; end if;

    v_bruto := round(prod.precio_venta * v_cant);
    select x.d, x.nombre into v_desc, v_pnom from (
      select q.nombre, promo_descuento(q, prod.precio_venta, v_cant) as d
        from promociones q
       where q.negocio_id = v_neg
         and q.activa and q.desde <= v_hoy and (q.hasta is null or q.hasta >= v_hoy)
         and (q.producto_id = prod.id or (q.categoria is not null and q.categoria = prod.categoria))
       order by 2 desc limit 1) x;
    if coalesce(v_desc, 0) <= 0 then v_desc := 0; v_pnom := null; end if;

    insert into pedido_tienda_items (negocio_id, pedido_id, producto_id, nombre, unidad, cantidad, precio_unitario, descuento, promo)
    values (v_neg, v_id, prod.id, prod.nombre, prod.unidad, v_cant, prod.precio_venta, v_desc, v_pnom);
    v_total := v_total + v_bruto - v_desc;
    v_lineas := v_lineas || jsonb_build_object('nombre', prod.nombre, 'unidad', prod.unidad,
                  'cantidad', v_cant, 'subtotal', v_bruto - v_desc, 'promo', v_pnom);
  end loop;

  -- Domicilio: lo decide el SERVIDOR con lo que configuró el dueño (nunca lo que diga el navegador)
  if not v_recoge then
    select domicilio_costo, envio_gratis_desde into v_costo, v_gratis from negocio_reglas where negocio_id = v_neg;
    if v_costo is not null then
      v_dom := case when coalesce(v_gratis, 0) > 0 and v_total >= v_gratis then 0 else v_costo end;
    end if;
  end if;

  update pedidos_tienda set total = v_total + v_dom, domicilio = v_dom where negocio_id = v_neg and id = v_id;
  return jsonb_build_object('id', v_id, 'numero', v_num, 'subtotal', v_total, 'domicilio', v_dom,
                            'total', v_total + v_dom, 'entrega', case when v_recoge then 'recoger' else 'domicilio' end, 'lineas', v_lineas);
end;
$$;

create or replace function crear_pedido_ropa(p_slug text, p_datos jsonb, p_items jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_neg    uuid := _negocio_publico_id(p_slug, 'pedidos_en_linea');
  it       jsonb;
  v        prenda_variantes%rowtype;
  pr       prendas%rowtype;
  v_cant   int;
  v_bruto  numeric;
  v_desc   numeric;
  v_pnom   text;
  v_total  numeric := 0;
  v_dom    numeric := 0;
  v_costo  numeric;
  v_gratis numeric;
  v_recoge boolean := coalesce(p_datos->>'entrega', '') = 'recoger';
  v_id     uuid;
  v_num    bigint;
  v_cli    uuid;
  v_lineas jsonb := '[]'::jsonb;
  v_hoy    date := hoy_colombia();
  v_vistas uuid[] := '{}';
begin
  perform exigir_modulo(v_neg, 'ropa');
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'El pedido está vacío o es demasiado grande';
  end if;
  if (select count(*) from pedidos_ropa where negocio_id = v_neg and estado = 'pendiente') >= 300 then
    raise exception 'Hay muchos pedidos pendientes: escríbenos directamente por WhatsApp';
  end if;
  v_cli := _cliente_desde_pedido(v_neg, p_datos, 'ropa');

  insert into pedidos_ropa (negocio_id, cliente_id, nombre, telefono, direccion, email, nota, entrega)
  select v_neg, v_cli, c.nombre, c.telefono,
         case when v_recoge then 'Recoge en tienda' else trim(p_datos->>'direccion') end,
         c.email, nullif(left(trim(coalesce(p_datos->>'nota', '')), 200), ''),
         case when v_recoge then 'recoger' else 'domicilio' end
    from clientes c where c.negocio_id = v_neg and c.id = v_cli
  returning id, numero into v_id, v_num;

  for it in select * from jsonb_array_elements(p_items) loop
    v_cant := (it->>'cantidad')::int;
    if v_cant is null or v_cant < 1 or v_cant > 50 then raise exception 'Cantidad inválida'; end if;
    select * into v from prenda_variantes where negocio_id = v_neg and id = (it->>'variante_id')::uuid;
    if not found then raise exception 'Una de las prendas ya no está disponible'; end if;
    if v.id = any(v_vistas) then raise exception 'Una talla está repetida en el pedido'; end if;
    v_vistas := v_vistas || v.id;
    select * into pr from prendas where negocio_id = v_neg and id = v.prenda_id and activo;
    if not found then raise exception 'Una de las prendas ya no está disponible'; end if;
    if v.stock < v_cant then
      raise exception 'Solo quedan % de "%" (talla %)', greatest(v.stock, 0), pr.nombre, v.talla;
    end if;

    v_bruto := round(pr.precio * v_cant);
    select x.d, x.nombre into v_desc, v_pnom from (
      select q.nombre, promo_descuento(q, pr.precio, v_cant) as d
        from promociones q
       where q.negocio_id = v_neg
         and q.activa and q.desde <= v_hoy and (q.hasta is null or q.hasta >= v_hoy)
         and (q.prenda_id = pr.id
              or (q.categoria_ropa is not null and q.categoria_ropa = pr.categoria)
              or (q.genero is not null and q.genero = pr.genero))
       order by 2 desc limit 1) x;
    if coalesce(v_desc, 0) <= 0 then v_desc := 0; v_pnom := null; end if;

    insert into pedido_ropa_items (negocio_id, pedido_id, prenda_id, variante_id, nombre, talla, color, cantidad, precio_unitario, descuento, promo)
    values (v_neg, v_id, pr.id, v.id, pr.nombre, v.talla, v.color, v_cant, pr.precio, v_desc, v_pnom);
    v_total := v_total + v_bruto - v_desc;
    v_lineas := v_lineas || jsonb_build_object('nombre', pr.nombre, 'talla', v.talla, 'color', v.color,
                  'cantidad', v_cant, 'subtotal', v_bruto - v_desc, 'promo', v_pnom);
  end loop;

  -- Domicilio: lo decide el SERVIDOR con lo que configuró el dueño (nunca lo que diga el navegador)
  if not v_recoge then
    select domicilio_costo_ropa, envio_gratis_desde_ropa into v_costo, v_gratis from negocio_reglas where negocio_id = v_neg;
    if v_costo is not null then
      v_dom := case when coalesce(v_gratis, 0) > 0 and v_total >= v_gratis then 0 else v_costo end;
    end if;
  end if;

  update pedidos_ropa set total = v_total + v_dom, domicilio = v_dom where negocio_id = v_neg and id = v_id;
  return jsonb_build_object('id', v_id, 'numero', v_num, 'subtotal', v_total, 'domicilio', v_dom,
                            'total', v_total + v_dom, 'entrega', case when v_recoge then 'recoger' else 'domicilio' end, 'lineas', v_lineas);
end;
$$;
