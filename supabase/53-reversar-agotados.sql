-- ============================================================
-- 53 · Reversar ventas · agotados con autorización del dueño · stock exacto en la tienda
--   · reversar_venta: la venta se deshace (devuelve inventario y deuda) y sus productos vuelven a la caja.
--       - El DUEÑO puede reversar cualquier venta. El cajero, solo sus últimas 5 ventas.
--   · Agotados: si un producto no alcanza, la venta se bloquea («AGOTADO|producto|quedan|pides»)
--       salvo que el dueño autorice: con su sesión, o con su clave de autorización (4 a 8 números).
--   · catalogo_tienda ahora dice cuántos quedan de cada producto (stock exacto, no «50+»).
-- Se puede ejecutar más de una vez. No borra datos.
-- ============================================================

alter table ventas add column if not exists creada_por uuid;
alter table ventas alter column creada_por set default auth.uid();
alter table ventas add column if not exists agotado_autorizado boolean not null default false;
alter table ventas add column if not exists reversada boolean not null default false;
alter table negocio_reglas add column if not exists bloquear_agotados boolean not null default true;

-- ---------- Clave de autorización del dueño y permisos de un solo uso ----------
create table if not exists negocio_pin (
  negocio_id     uuid primary key references negocios(id),
  pin_hash       text not null,
  intentos       int not null default 0,
  bloqueado_hasta timestamptz,
  actualizado_en timestamptz not null default now()
);
create table if not exists autorizaciones_stock (
  negocio_id uuid not null references negocios(id),
  id         uuid not null default gen_random_uuid(),
  por        uuid default auth.uid(),
  creada_en  timestamptz not null default now(),
  usada      boolean not null default false,
  primary key (negocio_id, id)
);
select _aplicar_politicas('negocio_pin', null, null, null, null);              -- nadie lo lee ni lo cambia directo: solo las funciones
select _aplicar_politicas('autorizaciones_stock', null, null, null, null);
select _triggers_tabla('negocio_pin');
select _triggers_tabla('autorizaciones_stock');
revoke all on negocio_pin, autorizaciones_stock from public, anon, authenticated;
grant all on negocio_pin, autorizaciones_stock to service_role;

create or replace function _hash_pin(p_negocio_id uuid, p_pin text) returns text
language sql immutable set search_path = public
as $$ select encode(sha256(convert_to(p_negocio_id::text || ':matriz-pin:' || p_pin, 'utf8')), 'hex') $$;

create or replace function definir_pin_autorizacion(p_negocio_id uuid, p_pin text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not es_dueno(p_negocio_id) then raise exception 'Solo el dueño puede cambiar la clave de autorización'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then raise exception 'La clave debe tener entre 4 y 8 números'; end if;
  insert into negocio_pin (negocio_id, pin_hash) values (p_negocio_id, _hash_pin(p_negocio_id, p_pin))
  on conflict (negocio_id) do update set pin_hash = excluded.pin_hash, intentos = 0, bloqueado_hasta = null, actualizado_en = now();
end;
$$;

create or replace function quitar_pin_autorizacion(p_negocio_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not es_dueno(p_negocio_id) then raise exception 'Solo el dueño puede quitar la clave de autorización'; end if;
  delete from negocio_pin where negocio_id = p_negocio_id;
end;
$$;

create or replace function tiene_pin_autorizacion(p_negocio_id uuid)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
begin
  if not es_personal(p_negocio_id) then raise exception 'No autorizado'; end if;
  return exists (select 1 from negocio_pin where negocio_id = p_negocio_id);
end;
$$;

-- Da un permiso de un solo uso (10 minutos) para vender lo agotado. El dueño con sesión no necesita clave; el cajero sí.
-- Devuelve {ok, autorizacion} o {ok:false, error}. No lanza error en una clave mala para que se cuenten los intentos.
create or replace function autorizar_stock(p_negocio_id uuid, p_pin text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare r negocio_pin%rowtype; v_id uuid;
begin
  if not es_personal(p_negocio_id) then raise exception 'No autorizado'; end if;
  if not es_dueno(p_negocio_id) then
    select * into r from negocio_pin where negocio_id = p_negocio_id for update;
    if not found then return jsonb_build_object('ok', false, 'error', 'El dueño todavía no creó su clave de autorización. Pídele que la cree en Ajustes, o que autorice desde su sesión.'); end if;
    if r.bloqueado_hasta is not null and r.bloqueado_hasta > now() then
      return jsonb_build_object('ok', false, 'error', format('Demasiados intentos. Espera %s minutos.', greatest(1, ceil(extract(epoch from (r.bloqueado_hasta - now())) / 60)::int)));
    end if;
    if p_pin is null or r.pin_hash <> _hash_pin(p_negocio_id, p_pin) then
      if r.intentos + 1 >= 5 then
        update negocio_pin set intentos = 0, bloqueado_hasta = now() + interval '15 minutes' where negocio_id = p_negocio_id;
        return jsonb_build_object('ok', false, 'error', 'Clave incorrecta. Se bloqueó por 15 minutos.');
      end if;
      update negocio_pin set intentos = intentos + 1 where negocio_id = p_negocio_id;
      return jsonb_build_object('ok', false, 'error', format('Clave incorrecta (te quedan %s intentos).', 5 - (r.intentos + 1)));
    end if;
    update negocio_pin set intentos = 0, bloqueado_hasta = null where negocio_id = p_negocio_id;
  end if;
  insert into autorizaciones_stock (negocio_id) values (p_negocio_id) returning id into v_id;
  return jsonb_build_object('ok', true, 'autorizacion', v_id);
end;
$$;

-- Gasta un permiso de un solo uso (vale 10 minutos). Devuelve true si estaba vigente.
create or replace function _consumir_autorizacion(p_negocio_id uuid, p_id uuid) returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_n int;
begin
  if not es_personal(p_negocio_id) then return false; end if;
  update autorizaciones_stock set usada = true
   where negocio_id = p_negocio_id and id = p_id and not usada and creada_en > now() - interval '10 minutes';
  get diagnostics v_n = row_count;
  return v_n = 1;
end;
$$;

-- ---------- Registrar venta: ahora bloquea lo agotado ----------
drop function if exists registrar_venta(uuid, jsonb, jsonb, uuid, text, date, numeric, jsonb);
create or replace function registrar_venta(
  p_negocio_id uuid, p_items jsonb, p_pagos jsonb, p_cliente_id uuid default null, p_nota text default null,
  p_fecha_limite date default null, p_descuento numeric default 0, p_domicilio jsonb default null,
  p_autorizacion uuid default null)
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
  v_auth    boolean := false;      -- el dueño autorizó vender lo agotado
  v_agot    boolean := false;      -- esta venta dejó algún producto en negativo
  v_falta   boolean;
  v_pn      text;
  v_quedan  numeric;
  v_offline boolean := coalesce(current_setting('app.venta_offline', true), '') = '1';   -- venta hecha sin internet que ya ocurrió
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

    -- Agotado: no se vende más de lo que hay, salvo que el dueño lo autorice (entonces el stock queda en negativo)
    v_falta := false; v_quedan := null; v_pn := null;
    if prod.es_kit then
      select c.nombre || ' (del combo ' || prod.nombre || ')', c.stock into v_pn, v_quedan
        from producto_componentes k join productos c on c.negocio_id = k.negocio_id and c.id = k.componente_id
       where k.negocio_id = p_negocio_id and k.kit_id = prod.id and c.controla_stock and c.stock < k.cantidad * v_cant
       order by c.nombre limit 1;
      v_falta := found;
    elsif prod.controla_stock and prod.stock < v_cant then
      v_falta := true; v_pn := prod.nombre; v_quedan := prod.stock;
    end if;
    if v_falta then
      v_agot := true;
      if coalesce(v_neg.bloquear_agotados, true) and not v_auth and not v_offline then
        if p_autorizacion is not null and _consumir_autorizacion(p_negocio_id, p_autorizacion) then
          v_auth := true;
        else
          raise exception 'AGOTADO|%|%|%', v_pn, v_quedan, v_cant;
        end if;
      end if;
    end if;

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

    -- Si el dueño autorizó, el stock puede quedar negativo.
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
         dom_estado = case when v_dom then 'pendiente' end, agotado_autorizado = v_agot
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

-- Venta guardada sin internet: se acepta aunque el stock haya cambiado, porque la venta ya ocurrió
drop function if exists registrar_venta_offline(uuid, uuid, timestamptz, jsonb, jsonb, uuid, text, date, numeric, jsonb);
create or replace function registrar_venta_offline(
  p_negocio_id uuid, p_clave uuid, p_fecha timestamptz, p_items jsonb, p_pagos jsonb,
  p_cliente_id uuid default null, p_nota text default null, p_fecha_limite date default null,
  p_descuento numeric default 0, p_domicilio jsonb default null, p_autorizacion uuid default null
) returns uuid
language plpgsql
as $$
declare v_id uuid;
begin
  if not es_personal(p_negocio_id) then raise exception 'Sin acceso'; end if;
  perform exigir_modulo(p_negocio_id, 'caja');
  if p_clave is null then raise exception 'Falta la clave de la venta'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_negocio_id::text || p_clave::text, 0));
  select venta_id into v_id from ventas_claves where negocio_id = p_negocio_id and clave = p_clave;
  if found then return v_id; end if;

  if p_fecha is not null and p_fecha < now() - interval '2 minutes' and p_fecha > now() - interval '30 days' then
    perform set_config('app.venta_offline', '1', true);
  end if;
  v_id := registrar_venta(p_negocio_id, p_items, p_pagos, p_cliente_id, p_nota, p_fecha_limite, p_descuento, p_domicilio, p_autorizacion);
  insert into ventas_claves (negocio_id, clave, venta_id) values (p_negocio_id, p_clave, v_id);

  if p_fecha is not null and p_fecha < now() - interval '2 minutes' and p_fecha > now() - interval '30 days' then
    update ventas set fecha = p_fecha where negocio_id = p_negocio_id and id = v_id;
    update fiado_movimientos set fecha = p_fecha where negocio_id = p_negocio_id and venta_id = v_id and tipo = 'cargo';
  end if;
  return v_id;
end;
$$;

-- ---------- Reversar una venta: se deshace y sus productos vuelven a la caja ----------
create or replace function reversar_venta(p_negocio_id uuid, p_venta_id uuid, p_motivo text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v ventas%rowtype;
  v_dueno boolean := es_dueno(p_negocio_id);
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_items jsonb; v_ropa boolean;
begin
  if not es_personal(p_negocio_id) then raise exception 'No autorizado'; end if;
  perform exigir_modulo(p_negocio_id, 'caja');

  select * into v from ventas where negocio_id = p_negocio_id and id = p_venta_id for update;
  if not found then raise exception 'Venta no encontrada'; end if;
  if v.anulada then raise exception 'Esa venta ya estaba anulada o reversada'; end if;

  if not v_dueno then
    if v.creada_por is distinct from auth.uid() then raise exception 'Solo puedes reversar tus propias ventas. Si es de otra persona, pídele al dueño.'; end if;
    if not exists (select 1 from (select id from ventas where negocio_id = p_negocio_id and creada_por = auth.uid() and not anulada
                                   order by fecha desc, numero desc limit 5) u where u.id = v.id) then
      raise exception 'Solo puedes reversar tus últimas 5 ventas. Para esta, pídele al dueño.';
    end if;
    if v.domicilio and v.dom_estado in ('en_camino', 'entregado') then raise exception 'Ese domicilio ya salió: pídele al dueño que lo reverse.'; end if;
  end if;

  select exists (select 1 from venta_items where negocio_id = p_negocio_id and venta_id = p_venta_id and prenda_variante_id is not null) into v_ropa;
  select coalesce(jsonb_agg(jsonb_build_object('producto_id', producto_id, 'nombre', nombre, 'cantidad', cantidad,
                                               'descuento', coalesce(descuento_linea, 0), 'promo', promo) order by id), '[]'::jsonb)
    into v_items from venta_items where negocio_id = p_negocio_id and venta_id = p_venta_id;

  -- inventario, pedidos y deuda: igual que al anular
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
         where negocio_id = p_negocio_id and venta_id = p_venta_id and prenda_variante_id is not null group by prenda_variante_id) x
  where pv.negocio_id = p_negocio_id and pv.id = x.prenda_variante_id;

  update pedidos_ropa set estado = 'cancelado' where negocio_id = p_negocio_id and venta_id = p_venta_id;
  delete from fiado_movimientos where negocio_id = p_negocio_id and venta_id = p_venta_id and tipo = 'cargo';

  update ventas
     set anulada = true, anulada_en = now(), reversada = true,
         motivo_anulacion = 'Reversada a la caja' || coalesce(': ' || nullif(btrim(p_motivo), ''), ''),
         anulada_por = coalesce(v_claims->>'email', 'personal'),
         dom_estado = case when domicilio then 'cancelado' end
   where negocio_id = p_negocio_id and id = p_venta_id;

  return jsonb_build_object('numero', v.numero, 'total', v.total, 'items', v_items, 'cliente_id', v.cliente_id, 'nota', v.nota,
                            'descuento', v.descuento, 'ropa', v_ropa, 'domicilio', v.domicilio, 'dom_direccion', v.dom_direccion, 'dom_telefono', v.dom_telefono);
end;
$$;

-- Últimas ventas que se pueden reversar (el cajero ve las suyas; el dueño, las de todos)
create or replace function ventas_recientes(p_negocio_id uuid, p_limite int default 5)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_dueno boolean := es_dueno(p_negocio_id);
begin
  if not es_personal(p_negocio_id) then raise exception 'No autorizado'; end if;
  return coalesce((select jsonb_agg(to_jsonb(t) order by t.fecha desc, t.numero desc) from (
    select v.id, v.numero, v.fecha, v.total, v.metodo, v.domicilio,
           coalesce((select string_agg(left(trim(to_char(vi.cantidad, 'FM999999990.###'), '.') || ' × ' || vi.nombre, 40), ', ' order by vi.id)
                       from venta_items vi where vi.negocio_id = v.negocio_id and vi.venta_id = v.id), '') as resumen
      from ventas v
     where v.negocio_id = p_negocio_id and not v.anulada and (v_dueno or v.creada_por = auth.uid())
     order by v.fecha desc, v.numero desc
     limit least(greatest(coalesce(p_limite, 5), 1), 20)) t), '[]'::jsonb);
end;
$$;

-- ---------- La tienda online dice cuántos quedan (stock exacto) ----------
create or replace function catalogo_tienda(p_slug text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_id uuid := _negocio_vista_id(p_slug, 'catalogo_publico');
begin
  perform exigir_modulo(v_id, 'productos');
  return jsonb_build_object(
    'productos', coalesce((select jsonb_agg(to_jsonb(x) order by x.nombre) from (
        select id, nombre, descripcion, categoria, precio_venta, unidad, imagenes,
               (case when controla_stock then stock > 0 else disponible end) as disponible, creado_en,
               (case when controla_stock then greatest(stock, 0) end) as quedan
          from productos where negocio_id = v_id and activo and publicado and precio_venta > 0) x), '[]'::jsonb),
    'categorias', coalesce((select jsonb_agg(jsonb_build_object('nombre', nombre, 'imagen', imagen) order by orden, nombre)
                              from categorias where negocio_id = v_id and activa), '[]'::jsonb),
    'mas_vendidos', coalesce((select jsonb_agg(t.producto_id order by t.total desc) from (
        select vi.producto_id, sum(vi.cantidad) as total
          from venta_items vi
          join ventas v on v.negocio_id = vi.negocio_id and v.id = vi.venta_id
          join productos p on p.negocio_id = vi.negocio_id and p.id = vi.producto_id
         where vi.negocio_id = v_id and not v.anulada and v.fecha >= now() - interval '30 days'
           and p.activo and p.publicado and p.precio_venta > 0
           and (case when p.controla_stock then p.stock > 0 else p.disponible end)
         group by vi.producto_id order by total desc limit 8) t), '[]'::jsonb)
  ) || _publicidad_vigente(v_id, false);
end;
$$;

-- ---------- Permisos ----------
revoke all on function registrar_venta(uuid, jsonb, jsonb, uuid, text, date, numeric, jsonb, uuid),
  registrar_venta_offline(uuid, uuid, timestamptz, jsonb, jsonb, uuid, text, date, numeric, jsonb, uuid),
  definir_pin_autorizacion(uuid, text), quitar_pin_autorizacion(uuid), tiene_pin_autorizacion(uuid), autorizar_stock(uuid, text),
  reversar_venta(uuid, uuid, text), ventas_recientes(uuid, int), _hash_pin(uuid, text), _consumir_autorizacion(uuid, uuid) from public, anon;
-- _consumir_autorizacion la usa registrar_venta (que corre con el usuario)
grant execute on function _consumir_autorizacion(uuid, uuid) to authenticated;
grant execute on function registrar_venta(uuid, jsonb, jsonb, uuid, text, date, numeric, jsonb, uuid),
  registrar_venta_offline(uuid, uuid, timestamptz, jsonb, jsonb, uuid, text, date, numeric, jsonb, uuid),
  definir_pin_autorizacion(uuid, text), quitar_pin_autorizacion(uuid), tiene_pin_autorizacion(uuid), autorizar_stock(uuid, text),
  reversar_venta(uuid, uuid, text), ventas_recientes(uuid, int) to authenticated;
revoke all on function catalogo_tienda(text) from public;
grant execute on function catalogo_tienda(text) to anon, authenticated;

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 6 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'verificar_aislamiento: todo en orden' as chequeo, (select bool_and(ok) from verificar_aislamiento()) as ok
  union all select 2, 'existe reversar_venta y solo la usa quien inició sesión', has_function_privilege('authenticated', 'reversar_venta(uuid, uuid, text)', 'execute') and not has_function_privilege('anon', 'reversar_venta(uuid, uuid, text)', 'execute')
  union all select 3, 'registrar_venta tiene la autorización de agotados', has_function_privilege('authenticated', 'registrar_venta(uuid, jsonb, jsonb, uuid, text, date, numeric, jsonb, uuid)', 'execute')
  union all select 4, 'quedó una sola versión de registrar_venta', (select count(*) from pg_proc where proname = 'registrar_venta' and pronamespace = 'public'::regnamespace) = 1
  union all select 5, 'las tablas de la clave y las autorizaciones no se leen directo', not has_table_privilege('authenticated', 'negocio_pin', 'select') and not has_table_privilege('authenticated', 'autorizaciones_stock', 'select')
  union all select 6, 'la tienda online ya dice cuántos quedan', position('quedan' in pg_get_functiondef('catalogo_tienda(text)'::regprocedure)) > 0
) t order by n;
