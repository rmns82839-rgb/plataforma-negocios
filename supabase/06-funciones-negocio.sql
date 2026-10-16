-- ============================================================
-- Plataforma multi-negocio — 08: RPC operativas portadas de Matriz
-- Cada función recibe p_negocio_id, valida primero quién llama y qué módulo necesita,
-- filtra TODA consulta por ese negocio y verifica que los ids que llegan sean de él.
-- "security invoker": corren con el RLS de quien llama (como en Matriz) y ponen negocio_id en cada insert.
-- Excepciones (security definer, igual que en Matriz): anular_venta y cambiar_estado_domicilio.
-- La lógica, los mensajes y los redondeos son los de Matriz; solo cambia el negocio.
-- ============================================================

-- ---------- Venta de productos ----------
create or replace function registrar_venta(
  p_negocio_id uuid, p_items jsonb, p_pagos jsonb, p_cliente_id uuid default null, p_nota text default null,
  p_fecha_limite date default null, p_descuento numeric default 0, p_domicilio jsonb default null)
returns uuid
language plpgsql
as $$
declare
  v_id      uuid;
  v_total   numeric := 0;
  v_sub     numeric;
  v_desc    numeric := round(coalesce(p_descuento, 0));
  v_neg     negocio_reglas%rowtype;
  it        jsonb;
  pg        jsonb;
  prod      productos%rowtype;
  forma     formas_pago%rowtype;
  cli       clientes%rowtype;
  comp      record;
  v_cant    numeric;
  v_costo   numeric;
  v_base    numeric;
  v_auto    boolean;
  v_precio  numeric;
  v_dlin    numeric;
  v_bruto   numeric;
  v_promo   numeric;
  v_pnom    text;
  v_min     numeric;
  v_min_tot numeric := 0;
  v_dueno   boolean;
  v_npagos  int := coalesce(jsonb_array_length(p_pagos), 0);
  v_metodo  text;
  v_monto   numeric;
  v_rec     numeric;
  v_suma    numeric := 0;
  v_fiado   numeric := 0;
  v_saldo   numeric;
  v_recibido numeric;
  v_hoy     date := hoy_colombia();
  v_dom     boolean := p_domicilio is not null and jsonb_typeof(p_domicilio) = 'object';
  v_dir     text;
  v_tel     text;
  v_envio   numeric := 0;
begin
  if not es_personal(p_negocio_id) then raise exception 'No autorizado'; end if;
  perform exigir_modulo(p_negocio_id, 'caja');
  perform exigir_modulo(p_negocio_id, 'productos');
  v_dueno := es_dueno(p_negocio_id);

  if coalesce(jsonb_array_length(p_items), 0) = 0 then raise exception 'La venta no tiene productos'; end if;
  if v_npagos = 0 then raise exception 'Falta la forma de pago'; end if;
  if v_desc < 0 then raise exception 'El descuento no puede ser negativo'; end if;

  select * into v_neg from negocio_reglas where negocio_id = p_negocio_id;
  if p_cliente_id is not null then
    select * into cli from clientes where negocio_id = p_negocio_id and id = p_cliente_id;
    if not found then raise exception 'Cliente no encontrado'; end if;
  end if;

  if v_dom then
    perform exigir_modulo(p_negocio_id, 'domicilios');
    v_dir := nullif(trim(coalesce(p_domicilio->>'direccion', '')), '');
    v_tel := nullif(trim(coalesce(p_domicilio->>'telefono', '')), '');
    v_envio := round(coalesce(nullif(p_domicilio->>'costo', '')::numeric, 0));
    if v_dir is null or length(v_dir) < 5 then raise exception 'Falta la dirección del domicilio'; end if;
    if v_envio < 0 then raise exception 'El costo del domicilio no puede ser negativo'; end if;
  end if;

  v_metodo := case when v_npagos = 1 then p_pagos->0->>'metodo' else 'mixto' end;

  insert into ventas (negocio_id, metodo, cliente_id, nota, total)
  values (p_negocio_id, v_metodo, p_cliente_id, nullif(trim(coalesce(p_nota, '')), ''), 0)
  returning id into v_id;

  for it in select * from jsonb_array_elements(p_items) loop
    v_cant := (it->>'cantidad')::numeric;
    if v_cant is null or v_cant <= 0 then raise exception 'Cantidad inválida'; end if;

    select * into prod from productos where negocio_id = p_negocio_id and id = (it->>'producto_id')::uuid for update;
    if not found then raise exception 'Producto no encontrado'; end if;

    -- costo: el del producto o, en un combo, la suma de lo que lleva
    if prod.es_kit then
      select coalesce(sum(c.precio_compra * k.cantidad), 0) into v_costo
        from producto_componentes k
        join productos c on c.negocio_id = k.negocio_id and c.id = k.componente_id
       where k.negocio_id = p_negocio_id and k.kit_id = prod.id;
      if not exists (select 1 from producto_componentes where negocio_id = p_negocio_id and kit_id = prod.id) then
        raise exception 'El combo "%" no tiene productos adentro', prod.nombre;
      end if;
    else
      v_costo := prod.precio_compra;
    end if;

    -- precio base: lista, o mayorista (por cantidad o por tipo de cliente)
    v_base := prod.precio_venta; v_auto := false;
    if prod.precio_mayor > 0 and ((prod.cantidad_mayor > 0 and v_cant >= prod.cantidad_mayor) or cli.tipo_cliente = 'mayorista') then
      v_base := prod.precio_mayor; v_auto := true;
    elsif cli.tipo_cliente = 'mayorista' and v_neg.descuento_mayorista > 0 then
      v_base := round(prod.precio_venta * (1 - v_neg.descuento_mayorista / 100)); v_auto := true;
    end if;

    v_precio := coalesce(nullif(it->>'precio', '')::numeric, v_base);
    v_dlin   := round(coalesce(nullif(it->>'descuento', '')::numeric, 0));
    if v_precio <= 0 then raise exception 'El precio de "%" debe ser mayor a cero', prod.nombre; end if;
    if v_dlin < 0 then raise exception 'El descuento de "%" no puede ser negativo', prod.nombre; end if;

    v_bruto := round(v_precio * v_cant);
    if v_dlin >= v_bruto then raise exception 'El descuento de "%" no puede ser igual o mayor que su valor', prod.nombre; end if;

    -- mejor promoción vigente (solo si no se puso un precio a mano)
    v_promo := 0; v_pnom := null;
    if nullif(it->>'precio', '') is null then
      select x.d, x.nombre into v_promo, v_pnom from (
        select pr.nombre, promo_descuento(pr, v_precio, v_cant) as d
          from promociones pr
         where pr.negocio_id = p_negocio_id
           and pr.activa and pr.desde <= v_hoy and (pr.hasta is null or pr.hasta >= v_hoy)
           and (pr.producto_id = prod.id or (pr.categoria is not null and pr.categoria = prod.categoria))
         order by 2 desc limit 1) x;
      if coalesce(v_promo, 0) <= 0 then v_promo := 0; v_pnom := null; end if;
      if v_dlin + v_promo >= v_bruto then v_promo := greatest(0, v_bruto - v_dlin - 1); end if;
    end if;

    -- Precio mínimo: lo fija el producto o, si no, el margen general sobre el costo. El dueño puede saltarlo.
    v_min := coalesce(prod.precio_minimo,
                      case when v_neg.margen_minimo > 0 then round(v_costo * (1 + v_neg.margen_minimo / 100)) end,
                      0);
    if v_auto then v_min := least(v_min, v_base); end if;
    if not v_dueno and v_min > 0 then
      if (v_bruto - v_dlin) < round(v_min * v_cant) then
        raise exception 'El precio de "%" no puede quedar por debajo de % por unidad (mínimo permitido)', prod.nombre, v_min;
      end if;
      v_min_tot := v_min_tot + least(round(v_min * v_cant), v_bruto - v_dlin - v_promo);
    end if;

    insert into venta_items (negocio_id, venta_id, producto_id, nombre, cantidad, precio_unitario, costo_unitario, precio_lista, descuento_linea, promo)
    values (p_negocio_id, v_id, prod.id, prod.nombre, v_cant, v_precio, v_costo, prod.precio_venta, v_dlin + v_promo, v_pnom);

    -- El stock puede quedar negativo: en tiendas de barrio el conteo rara vez está al día.
    if prod.es_kit then
      for comp in select componente_id, cantidad from producto_componentes where negocio_id = p_negocio_id and kit_id = prod.id loop
        update productos set stock = stock - comp.cantidad * v_cant where negocio_id = p_negocio_id and id = comp.componente_id;
        insert into venta_consumos (negocio_id, venta_id, producto_id, cantidad)
        values (p_negocio_id, v_id, comp.componente_id, comp.cantidad * v_cant);
      end loop;
    else
      update productos set stock = stock - v_cant where negocio_id = p_negocio_id and id = prod.id;
    end if;

    v_total := v_total + v_bruto - v_dlin - v_promo;
  end loop;

  v_sub := round(v_total);
  if v_desc > v_sub then raise exception 'El descuento no puede ser mayor que la venta'; end if;
  v_total := v_sub - v_desc;
  if v_total <= 0 then raise exception 'El total de la venta debe ser mayor a cero'; end if;
  if not v_dueno and v_min_tot > 0 and v_total < v_min_tot then
    raise exception 'El descuento deja la venta por debajo del precio mínimo permitido';
  end if;
  v_total := v_total + v_envio;     -- el domicilio se cobra aparte de los productos

  -- Pagos
  for pg in select * from jsonb_array_elements(p_pagos) loop
    select * into forma from formas_pago where negocio_id = p_negocio_id and id = (pg->>'metodo') and activa;
    if not found then raise exception 'La forma de pago "%" no está disponible', pg->>'metodo'; end if;
    v_monto := round((pg->>'monto')::numeric);
    if v_monto is null or v_monto <= 0 then raise exception 'Cada pago debe ser mayor a cero'; end if;
    v_suma := v_suma + v_monto;
    if forma.tipo = 'fiado' then v_fiado := v_fiado + v_monto; end if;

    v_rec := null;
    if forma.tipo = 'efectivo' and nullif(pg->>'recibido', '') is not null
       and (pg->>'recibido')::numeric >= v_monto then
      v_rec := round((pg->>'recibido')::numeric);
    end if;

    insert into venta_pagos (negocio_id, venta_id, metodo, monto, recibido, comision)
    values (p_negocio_id, v_id, forma.id, v_monto, v_rec,
            case when forma.tipo = 'datafono' then round(v_monto * v_neg.comision_datafono / 100) else 0 end);
    if v_npagos = 1 then v_recibido := v_rec; end if;
  end loop;

  if v_suma <> v_total then
    raise exception 'Los pagos suman % y la venta es de %', v_suma, v_total;
  end if;

  update ventas set total = v_total, descuento = v_desc, recibido = v_recibido,
         domicilio = v_dom, dom_direccion = v_dir, dom_telefono = v_tel, dom_costo = v_envio,
         dom_estado = case when v_dom then 'pendiente' end
   where negocio_id = p_negocio_id and id = v_id;

  if v_fiado > 0 then
    perform exigir_modulo(p_negocio_id, 'fiados');
    if p_cliente_id is null then raise exception 'El fiado requiere elegir un cliente'; end if;
    select * into cli from clientes where negocio_id = p_negocio_id and id = p_cliente_id for update;
    if not found then raise exception 'Cliente no encontrado'; end if;

    if not v_dueno and v_neg.bloquear_credito_mora
       and exists (select 1 from clientes_mora where negocio_id = p_negocio_id and cliente_id = p_cliente_id and vencido > 0) then
      raise exception '% tiene deuda vencida: cóbrala antes de fiarle más', cli.nombre;
    end if;

    select coalesce(sum(case tipo when 'cargo' then monto else -monto end), 0)
      into v_saldo from fiado_movimientos where negocio_id = p_negocio_id and cliente_id = p_cliente_id;

    if cli.cupo_credito > 0 and v_saldo + v_fiado > cli.cupo_credito then
      raise exception 'Supera el cupo de crédito de % (cupo %, debe %)', cli.nombre, cli.cupo_credito, v_saldo;
    end if;

    insert into fiado_movimientos (negocio_id, cliente_id, tipo, monto, venta_id, fecha_limite)
    values (p_negocio_id, p_cliente_id, 'cargo', v_fiado, v_id,
            coalesce(p_fecha_limite, case when cli.dias_credito > 0 then v_hoy + cli.dias_credito end));
  end if;

  return v_id;
end;
$$;

-- ---------- Venta de ropa ----------
create or replace function registrar_venta_ropa(
  p_negocio_id uuid, p_items jsonb, p_pagos jsonb, p_cliente_id uuid default null, p_nota text default null,
  p_descuento numeric default 0, p_pedido_id uuid default null, p_fecha_limite date default null, p_domicilio jsonb default null)
returns uuid
language plpgsql
as $$
declare
  v_id     uuid;
  v_total  numeric := 0;
  v_desc   numeric := round(coalesce(p_descuento, 0));
  v_neg    negocio_reglas%rowtype;
  it       jsonb;
  pg       jsonb;
  v        prenda_variantes%rowtype;
  pr       prendas%rowtype;
  forma    formas_pago%rowtype;
  cli      clientes%rowtype;
  ped      pedidos_ropa%rowtype;
  v_cant   int;
  v_precio numeric;
  v_dlin   numeric;
  v_bruto  numeric;
  v_promo  numeric;
  v_pnom   text;
  v_nombre text;
  v_dueno  boolean;
  v_npagos int := coalesce(jsonb_array_length(p_pagos), 0);
  v_monto  numeric;
  v_rec    numeric;
  v_suma   numeric := 0;
  v_fiado  numeric := 0;
  v_saldo  numeric;
  v_recibido numeric;
  v_hoy    date := hoy_colombia();
  v_vistas uuid[] := '{}';
  v_dom    boolean := p_domicilio is not null and jsonb_typeof(p_domicilio) = 'object';
  v_dir    text;
  v_tel    text;
  v_envio  numeric := 0;
begin
  if not es_personal(p_negocio_id) then raise exception 'No autorizado'; end if;
  perform exigir_modulo(p_negocio_id, 'caja');
  perform exigir_modulo(p_negocio_id, 'ropa');
  v_dueno := es_dueno(p_negocio_id);

  if coalesce(jsonb_array_length(p_items), 0) = 0 then raise exception 'La venta no tiene prendas'; end if;
  if v_npagos = 0 then raise exception 'Falta la forma de pago'; end if;
  if v_desc < 0 then raise exception 'El descuento no puede ser negativo'; end if;
  if v_desc > 0 and not v_dueno then raise exception 'Solo el dueño puede dar descuentos a mano'; end if;

  select * into v_neg from negocio_reglas where negocio_id = p_negocio_id;
  if v_dom then
    perform exigir_modulo(p_negocio_id, 'domicilios');
    v_dir := nullif(trim(coalesce(p_domicilio->>'direccion', '')), '');
    v_tel := nullif(trim(coalesce(p_domicilio->>'telefono', '')), '');
    v_envio := round(coalesce(nullif(p_domicilio->>'costo', '')::numeric, 0));
    if v_dir is null or length(v_dir) < 5 then raise exception 'Falta la dirección del domicilio'; end if;
    if v_envio < 0 then raise exception 'El costo del domicilio no puede ser negativo'; end if;
  end if;
  if p_cliente_id is not null then
    select * into cli from clientes where negocio_id = p_negocio_id and id = p_cliente_id;
    if not found then raise exception 'Cliente no encontrado'; end if;
  end if;
  if p_pedido_id is not null then
    select * into ped from pedidos_ropa where negocio_id = p_negocio_id and id = p_pedido_id for update;
    if not found or ped.estado <> 'pendiente' then raise exception 'Ese pedido ya fue atendido o no existe'; end if;
  end if;

  insert into ventas (negocio_id, metodo, cliente_id, nota, total)
  values (p_negocio_id, case when v_npagos = 1 then p_pagos->0->>'metodo' else 'mixto' end, p_cliente_id,
          coalesce(nullif(trim(coalesce(p_nota, '')), ''), case when p_pedido_id is not null then 'Pedido de ropa N.º ' || ped.numero end), 0)
  returning id into v_id;

  for it in select * from jsonb_array_elements(p_items) loop
    v_cant := (it->>'cantidad')::int;
    if v_cant is null or v_cant < 1 then raise exception 'Cantidad inválida'; end if;
    select * into v from prenda_variantes where negocio_id = p_negocio_id and id = (it->>'variante_id')::uuid for update;
    if not found then raise exception 'Prenda no encontrada'; end if;
    if v.id = any(v_vistas) then raise exception 'Una talla está repetida: suma las cantidades en una sola línea'; end if;
    v_vistas := v_vistas || v.id;
    select * into pr from prendas where negocio_id = p_negocio_id and id = v.prenda_id;
    if v.stock < v_cant then
      raise exception 'No hay stock suficiente de "%" talla %: quedan %', pr.nombre, v.talla, greatest(v.stock, 0);
    end if;

    v_precio := coalesce(nullif(it->>'precio', '')::numeric, pr.precio);
    v_dlin := round(coalesce(nullif(it->>'descuento', '')::numeric, 0));
    if (nullif(it->>'precio', '') is not null or v_dlin > 0) and not v_dueno then
      raise exception 'Solo el dueño puede cambiar el precio o dar descuentos a mano';
    end if;
    if v_precio <= 0 then raise exception 'El precio de "%" debe ser mayor a cero', pr.nombre; end if;
    if v_dlin < 0 then raise exception 'El descuento de "%" no puede ser negativo', pr.nombre; end if;
    v_bruto := round(v_precio * v_cant);
    if v_dlin >= v_bruto then raise exception 'El descuento de "%" no puede ser igual o mayor que su valor', pr.nombre; end if;

    v_promo := 0; v_pnom := null;
    if nullif(it->>'precio', '') is null then
      select x.d, x.nombre into v_promo, v_pnom from (
        select q.nombre, promo_descuento(q, v_precio, v_cant) as d
          from promociones q
         where q.negocio_id = p_negocio_id
           and q.activa and q.desde <= v_hoy and (q.hasta is null or q.hasta >= v_hoy)
           and (q.prenda_id = pr.id
                or (q.categoria_ropa is not null and q.categoria_ropa = pr.categoria)
                or (q.genero is not null and q.genero = pr.genero))
         order by 2 desc limit 1) x;
      if coalesce(v_promo, 0) <= 0 then v_promo := 0; v_pnom := null; end if;
      if v_dlin + v_promo >= v_bruto then v_promo := greatest(0, v_bruto - v_dlin - 1); end if;
    end if;

    v_nombre := pr.nombre || ' (' || v.talla || case when coalesce(v.color, '') <> '' then ', ' || v.color else '' end || ')';
    insert into venta_items (negocio_id, venta_id, producto_id, prenda_variante_id, nombre, cantidad, precio_unitario, costo_unitario, precio_lista, descuento_linea, promo)
    values (p_negocio_id, v_id, null, v.id, v_nombre, v_cant, v_precio, pr.costo, pr.precio, v_dlin + v_promo, v_pnom);
    update prenda_variantes set stock = stock - v_cant where negocio_id = p_negocio_id and id = v.id;
    v_total := v_total + v_bruto - v_dlin - v_promo;
  end loop;

  v_total := round(v_total);
  if v_desc > v_total then raise exception 'El descuento no puede ser mayor que la venta'; end if;
  v_total := v_total - v_desc;
  v_total := v_total + v_envio;     -- el domicilio se cobra aparte de las prendas
  if v_total <= 0 then raise exception 'El total de la venta debe ser mayor a cero'; end if;

  for pg in select * from jsonb_array_elements(p_pagos) loop
    select * into forma from formas_pago where negocio_id = p_negocio_id and id = (pg->>'metodo') and activa;
    if not found then raise exception 'La forma de pago "%" no está disponible', pg->>'metodo'; end if;
    v_monto := round((pg->>'monto')::numeric);
    if v_monto is null or v_monto <= 0 then raise exception 'Cada pago debe ser mayor a cero'; end if;
    v_suma := v_suma + v_monto;
    if forma.tipo = 'fiado' then v_fiado := v_fiado + v_monto; end if;
    v_rec := null;
    if forma.tipo = 'efectivo' and nullif(pg->>'recibido', '') is not null and (pg->>'recibido')::numeric >= v_monto then
      v_rec := round((pg->>'recibido')::numeric);
    end if;
    insert into venta_pagos (negocio_id, venta_id, metodo, monto, recibido, comision)
    values (p_negocio_id, v_id, forma.id, v_monto, v_rec,
            case when forma.tipo = 'datafono' then round(v_monto * v_neg.comision_datafono / 100) else 0 end);
    if v_npagos = 1 then v_recibido := v_rec; end if;
  end loop;
  if v_suma <> v_total then raise exception 'Los pagos suman % y la venta es de %', v_suma, v_total; end if;

  update ventas set total = v_total, descuento = v_desc, recibido = v_recibido,
         domicilio = v_dom, dom_direccion = v_dir, dom_telefono = v_tel, dom_costo = v_envio,
         dom_estado = case when v_dom then 'pendiente' end
   where negocio_id = p_negocio_id and id = v_id;

  if v_fiado > 0 then
    perform exigir_modulo(p_negocio_id, 'fiados');
    if p_cliente_id is null then raise exception 'El fiado requiere elegir un cliente'; end if;
    select * into cli from clientes where negocio_id = p_negocio_id and id = p_cliente_id for update;
    if not found then raise exception 'Cliente no encontrado'; end if;
    if not v_dueno and v_neg.bloquear_credito_mora
       and exists (select 1 from clientes_mora where negocio_id = p_negocio_id and cliente_id = p_cliente_id and vencido > 0) then
      raise exception '% tiene deuda vencida: cóbrala antes de fiarle más', cli.nombre;
    end if;
    select coalesce(sum(case tipo when 'cargo' then monto else -monto end), 0)
      into v_saldo from fiado_movimientos where negocio_id = p_negocio_id and cliente_id = p_cliente_id;
    if cli.cupo_credito > 0 and v_saldo + v_fiado > cli.cupo_credito then
      raise exception 'Supera el cupo de crédito de % (cupo %, debe %)', cli.nombre, cli.cupo_credito, v_saldo;
    end if;
    insert into fiado_movimientos (negocio_id, cliente_id, tipo, monto, venta_id, fecha_limite)
    values (p_negocio_id, p_cliente_id, 'cargo', v_fiado, v_id,
            coalesce(p_fecha_limite, case when cli.dias_credito > 0 then v_hoy + cli.dias_credito end));
  end if;

  if p_pedido_id is not null then
    update pedidos_ropa set estado = 'vendido', venta_id = v_id where negocio_id = p_negocio_id and id = p_pedido_id;
  end if;
  return v_id;
end;
$$;

-- ---------- Anular venta (security definer, como en Matriz) ----------
create or replace function anular_venta(p_negocio_id uuid, p_venta_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v ventas%rowtype;
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
begin
  if not es_dueno(p_negocio_id) then
    raise exception 'Solo el dueño puede anular ventas';
  end if;
  perform exigir_modulo(p_negocio_id, 'caja');
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'Escribe el motivo de la anulación';
  end if;

  select * into v from ventas where negocio_id = p_negocio_id and id = p_venta_id for update;
  if not found then raise exception 'Venta no encontrada'; end if;
  if v.anulada then raise exception 'Esa venta ya estaba anulada'; end if;

  update productos p set stock = p.stock + x.cant
  from (
    select producto_id, sum(cant) as cant from (
      select vi.producto_id, vi.cantidad as cant
        from venta_items vi join productos pr on pr.negocio_id = vi.negocio_id and pr.id = vi.producto_id
       where vi.negocio_id = p_negocio_id and vi.venta_id = p_venta_id and not pr.es_kit
      union all
      select producto_id, cantidad from venta_consumos where negocio_id = p_negocio_id and venta_id = p_venta_id
    ) u group by producto_id
  ) x
  where p.negocio_id = p_negocio_id and p.id = x.producto_id;

  update prenda_variantes pv set stock = pv.stock + round(x.cant)::int
  from (select prenda_variante_id, sum(cantidad) as cant from venta_items
         where negocio_id = p_negocio_id and venta_id = p_venta_id and prenda_variante_id is not null
         group by prenda_variante_id) x
  where pv.negocio_id = p_negocio_id and pv.id = x.prenda_variante_id;

  update pedidos_ropa set estado = 'cancelado' where negocio_id = p_negocio_id and venta_id = p_venta_id;

  delete from fiado_movimientos where negocio_id = p_negocio_id and venta_id = p_venta_id and tipo = 'cargo';

  update ventas
     set anulada = true, anulada_en = now(), motivo_anulacion = trim(p_motivo),
         anulada_por = coalesce(v_claims->>'email', 'dueño'),
         dom_estado = case when domicilio then 'cancelado' end
   where negocio_id = p_negocio_id and id = p_venta_id;
end;
$$;

-- ---------- Domicilios (security definer, como en Matriz) ----------
create or replace function cambiar_estado_domicilio(p_negocio_id uuid, p_venta_id uuid, p_estado text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v ventas%rowtype;
begin
  if not es_personal(p_negocio_id) then raise exception 'Sin acceso'; end if;
  perform exigir_modulo(p_negocio_id, 'domicilios');
  if p_estado not in ('pendiente', 'en_camino', 'entregado', 'cancelado') then raise exception 'Estado inválido'; end if;
  select * into v from ventas where negocio_id = p_negocio_id and id = p_venta_id for update;
  if not found or not v.domicilio then raise exception 'Esa venta no es un domicilio'; end if;
  if v.anulada then raise exception 'La venta está anulada'; end if;
  update ventas set dom_estado = p_estado,
         dom_entregado_en = case when p_estado = 'entregado' then now() else null end
   where negocio_id = p_negocio_id and id = p_venta_id;
end;
$$;

-- ---------- Compras ----------
create or replace function registrar_compra(p_negocio_id uuid, p_items jsonb, p_proveedor text default null, p_nota text default null)
returns uuid
language plpgsql
as $$
declare
  v_id    uuid;
  v_total numeric := 0;
  it      jsonb;
  prod    productos%rowtype;
  v_cant  numeric;
  v_costo numeric;
  v_pv    numeric;
begin
  if not es_personal(p_negocio_id) then raise exception 'No autorizado'; end if;
  perform exigir_modulo(p_negocio_id, 'compras');
  if coalesce(jsonb_array_length(p_items), 0) = 0 then raise exception 'La compra no tiene productos'; end if;

  insert into compras (negocio_id, proveedor, nota, total)
  values (p_negocio_id, nullif(trim(coalesce(p_proveedor, '')), ''), p_nota, 0)
  returning id into v_id;

  for it in select * from jsonb_array_elements(p_items) loop
    v_cant  := (it->>'cantidad')::numeric;
    v_costo := coalesce((it->>'costo_unitario')::numeric, 0);
    v_pv    := coalesce((it->>'precio_venta')::numeric, 0);
    if v_cant is null or v_cant <= 0 then raise exception 'Cantidad inválida'; end if;

    select * into prod from productos where negocio_id = p_negocio_id and id = (it->>'producto_id')::uuid for update;
    if not found then raise exception 'Producto no encontrado'; end if;

    insert into compra_items (negocio_id, compra_id, producto_id, nombre, cantidad, costo_unitario)
    values (p_negocio_id, v_id, prod.id, prod.nombre, v_cant, v_costo);

    insert into lotes (negocio_id, producto_id, compra_id, numero, fecha_vencimiento, cantidad, costo_unitario)
    values (p_negocio_id, prod.id, v_id,
            nullif(trim(coalesce(it->>'lote', '')), ''),
            nullif(it->>'vence', '')::date,
            v_cant, v_costo);

    update productos
       set stock = stock + v_cant,
           precio_compra = case when v_costo > 0 then v_costo else precio_compra end,
           precio_venta  = case when v_pv > 0 then v_pv else precio_venta end
     where negocio_id = p_negocio_id and id = prod.id;

    v_total := v_total + v_costo * v_cant;
  end loop;

  update compras set total = round(v_total) where negocio_id = p_negocio_id and id = v_id;
  return v_id;
end;
$$;

-- ---------- Fiados y mora ----------
create or replace function cobrar_recargo_mora(p_negocio_id uuid, p_cliente_id uuid)
returns numeric
language plpgsql
as $$
declare v_rec numeric;
begin
  if not es_dueno(p_negocio_id) then raise exception 'Solo el dueño puede cobrar recargos por mora'; end if;
  perform exigir_modulo(p_negocio_id, 'fiados');
  select recargo into v_rec from clientes_mora where negocio_id = p_negocio_id and cliente_id = p_cliente_id;
  if coalesce(v_rec, 0) <= 0 then raise exception 'Este cliente no tiene recargo por mora pendiente'; end if;
  insert into fiado_movimientos (negocio_id, cliente_id, tipo, monto, nota, fecha_limite)
  values (p_negocio_id, p_cliente_id, 'cargo', v_rec, 'Recargo por mora', hoy_colombia() + 30);
  update clientes set mora_cobrada_hasta = hoy_colombia() where negocio_id = p_negocio_id and id = p_cliente_id;
  return v_rec;
end;
$$;

create or replace function registrar_abono(p_negocio_id uuid, p_cliente_id uuid, p_monto numeric,
                                           p_metodo text default 'efectivo', p_nota text default null)
returns uuid
language plpgsql
as $$
declare
  v_saldo numeric;
  v_id    uuid;
begin
  if not es_personal(p_negocio_id) then raise exception 'No autorizado'; end if;
  perform exigir_modulo(p_negocio_id, 'fiados');
  if p_monto is null or p_monto <= 0 then raise exception 'El abono debe ser mayor que cero'; end if;

  perform 1 from clientes where negocio_id = p_negocio_id and id = p_cliente_id for update;
  if not found then raise exception 'Cliente no encontrado'; end if;

  select coalesce(sum(case tipo when 'cargo' then monto else -monto end), 0)
    into v_saldo from fiado_movimientos where negocio_id = p_negocio_id and cliente_id = p_cliente_id;

  if p_monto > v_saldo then
    raise exception 'El abono (%) es mayor que la deuda (%)', p_monto, v_saldo;
  end if;

  insert into fiado_movimientos (negocio_id, cliente_id, tipo, monto, metodo, nota)
  values (p_negocio_id, p_cliente_id, 'abono', p_monto, p_metodo, p_nota)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function registrar_saldo_anterior(p_negocio_id uuid, p_cliente_id uuid, p_monto numeric,
                                                    p_fecha date default null, p_nota text default null)
returns uuid
language plpgsql
as $$
declare v_id uuid;
begin
  if not es_dueno(p_negocio_id) then raise exception 'Solo el dueño puede registrar un saldo anterior'; end if;
  perform exigir_modulo(p_negocio_id, 'fiados');
  if p_monto is null or p_monto <= 0 then raise exception 'El valor debe ser mayor que cero'; end if;
  perform 1 from clientes where negocio_id = p_negocio_id and id = p_cliente_id;
  if not found then raise exception 'Cliente no encontrado'; end if;

  insert into fiado_movimientos (negocio_id, cliente_id, tipo, monto, nota, fecha)
  values (p_negocio_id, p_cliente_id, 'cargo', p_monto,
          coalesce(nullif(trim(p_nota), ''), 'Saldo inicial (app anterior)'),
          coalesce(p_fecha, current_date)::timestamptz)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------- Préstamos ----------
create or replace function crear_prestamo(p_negocio_id uuid, p_cliente_id uuid, p_monto numeric, p_tasa_mensual numeric,
                                          p_frecuencia text, p_num_cuotas integer,
                                          p_fecha_inicio date default current_date, p_nota text default null)
returns uuid
language plpgsql
as $$
declare
  v_dias    integer;
  v_interes numeric;
  v_total   numeric;
  v_id      uuid;
  cli       clientes%rowtype;
  i         integer;
  v_cap     numeric;
  v_int     numeric;
  v_cap_b   numeric;
  v_int_b   numeric;
  v_fecha   date;
begin
  if not es_dueno(p_negocio_id) then raise exception 'Solo el dueño puede crear préstamos'; end if;
  perform exigir_modulo(p_negocio_id, 'prestamos');

  select * into cli from clientes where negocio_id = p_negocio_id and id = p_cliente_id;
  if not found then raise exception 'Cliente no encontrado'; end if;
  if cli.documento is null or cli.telefono is null or cli.direccion is null then
    raise exception 'Para prestar, el cliente debe tener documento, teléfono y dirección';
  end if;

  v_dias := case p_frecuencia when 'semanal' then 7 when 'quincenal' then 15 when 'mensual' then 30
                 else null end;
  if v_dias is null then raise exception 'Frecuencia inválida'; end if;
  if p_num_cuotas is null or p_num_cuotas < 1 then raise exception 'Número de cuotas inválido'; end if;

  -- Todo en enteros (tasa en centésimas) para que el redondeo sea exacto
  v_interes := round(p_monto * round(p_tasa_mensual * 100) * p_num_cuotas * v_dias / 300000);
  v_total   := p_monto + v_interes;

  insert into prestamos (negocio_id, cliente_id, fecha_inicio, monto, tasa_mensual, frecuencia, num_cuotas,
                         interes_total, total_a_pagar, nota)
  values (p_negocio_id, p_cliente_id, p_fecha_inicio, p_monto, p_tasa_mensual, p_frecuencia, p_num_cuotas,
          v_interes, v_total, p_nota)
  returning id into v_id;

  v_cap_b := round(p_monto / p_num_cuotas);
  v_int_b := round(v_interes / p_num_cuotas);

  for i in 1..p_num_cuotas loop
    if i < p_num_cuotas then
      v_cap := v_cap_b; v_int := v_int_b;
    else
      v_cap := p_monto   - v_cap_b * (p_num_cuotas - 1);
      v_int := v_interes - v_int_b * (p_num_cuotas - 1);
    end if;
    v_fecha := case p_frecuencia
                 when 'mensual' then (p_fecha_inicio + (i * interval '1 month'))::date
                 else p_fecha_inicio + i * v_dias end;
    insert into prestamo_cuotas (negocio_id, prestamo_id, numero, fecha_limite, capital, interes, valor)
    values (p_negocio_id, v_id, i, v_fecha, v_cap, v_int, v_cap + v_int);
  end loop;

  return v_id;
end;
$$;

create or replace function registrar_pago_prestamo(p_negocio_id uuid, p_prestamo_id uuid, p_monto numeric,
                                                   p_metodo text default 'efectivo', p_nota text default null)
returns uuid
language plpgsql
as $$
declare
  pr        prestamos%rowtype;
  v_pend    numeric;
  v_resto   numeric := p_monto;
  q         prestamo_cuotas%rowtype;
  v_aplica  numeric;
  v_id      uuid;
begin
  if not es_dueno(p_negocio_id) then raise exception 'Solo el dueño puede registrar pagos de préstamos'; end if;
  perform exigir_modulo(p_negocio_id, 'prestamos');
  if p_monto is null or p_monto <= 0 then raise exception 'El pago debe ser mayor que cero'; end if;

  select * into pr from prestamos where negocio_id = p_negocio_id and id = p_prestamo_id for update;
  if not found then raise exception 'Préstamo no encontrado'; end if;
  if pr.estado <> 'activo' then raise exception 'Este préstamo ya está %', pr.estado; end if;

  select coalesce(sum(valor - pagado), 0) into v_pend
    from prestamo_cuotas where negocio_id = p_negocio_id and prestamo_id = p_prestamo_id;
  if p_monto > v_pend then
    raise exception 'El pago (%) es mayor que lo que se debe (%)', p_monto, v_pend;
  end if;

  insert into prestamo_pagos (negocio_id, prestamo_id, monto, metodo, nota)
  values (p_negocio_id, p_prestamo_id, p_monto, p_metodo, p_nota)
  returning id into v_id;

  for q in select * from prestamo_cuotas
           where negocio_id = p_negocio_id and prestamo_id = p_prestamo_id and pagado < valor
           order by numero
  loop
    exit when v_resto <= 0;
    v_aplica := least(v_resto, q.valor - q.pagado);
    update prestamo_cuotas set pagado = pagado + v_aplica where negocio_id = p_negocio_id and id = q.id;
    v_resto := v_resto - v_aplica;
  end loop;

  if not exists (select 1 from prestamo_cuotas where negocio_id = p_negocio_id and prestamo_id = p_prestamo_id and pagado < valor) then
    update prestamos set estado = 'pagado' where negocio_id = p_negocio_id and id = p_prestamo_id;
  end if;

  return v_id;
end;
$$;

create or replace function cancelar_prestamo(p_negocio_id uuid, p_prestamo_id uuid, p_motivo text)
returns void
language plpgsql
as $$
begin
  if not es_dueno(p_negocio_id) then raise exception 'Solo el dueño puede cancelar préstamos'; end if;
  perform exigir_modulo(p_negocio_id, 'prestamos');
  if p_motivo is null or length(trim(p_motivo)) < 3 then raise exception 'Escribe el motivo'; end if;
  update prestamos
     set estado = 'cancelado',
         nota = trim(coalesce(nota || ' · ', '') || 'Cancelado: ' || p_motivo)
   where negocio_id = p_negocio_id and id = p_prestamo_id and estado = 'activo';
  if not found then raise exception 'Solo se pueden cancelar préstamos activos'; end if;
end;
$$;
