-- ============================================================
-- 15 · Domicilio por kilómetros calculado en el SERVIDOR (etapa C4)
-- Aditivo e idempotente: se puede correr más de una vez. Requiere los archivos 10, 11, 12 y 14.
--   · El navegador YA NO escribe los km: el servidor (ruta /api/domicilio, con la clave del mapa) calcula la distancia,
--     la guarda en `calculos_domicilio` y el pedido solo trae el `calculo_id` (de un solo uso, vence en 3 horas).
--   · Si se acaba el cupo, el mapa falla o la dirección no se encuentra, el pedido sigue con la TARIFA FIJA DE RESPALDO.
--   · Cupos editables en plataforma_limites: 'ors_calculos_km' (cálculos de ruta) y 'ors_busquedas' (búsqueda de direcciones), 1.500 al día.
--   · simular_domicilio: prueba del cálculo para el panel, NO gasta cupo ni usa el mapa.
-- ============================================================

-- 1. Columnas nuevas
alter table negocio_reglas add column if not exists domicilio_tarifa_respaldo numeric
  check (domicilio_tarifa_respaldo is null or domicilio_tarifa_respaldo >= 0);
alter table pedidos_tienda add column if not exists domicilio_tarifa_fija boolean not null default false;

-- 2. Cupo de búsquedas de direcciones (editable; el de cálculos de ruta ya existe desde el archivo 10)
insert into plataforma_limites (concepto, max_dia) values ('ors_busquedas', 1500) on conflict (concepto) do nothing;

-- 3. Cálculos hechos por el servidor (solo los toca el servidor; nadie del navegador la lee ni la escribe)
create table if not exists calculos_domicilio (
  id         uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id),
  km         numeric check (km is null or (km >= 0 and km <= 200)),      -- null = no se pudo calcular (tarifa fija de respaldo)
  direccion  text check (direccion is null or char_length(direccion) <= 200),
  lat        numeric check (lat is null or lat between -90 and 90),
  lng        numeric check (lng is null or lng between -180 and 180),
  motivo     text not null default 'ok' check (motivo in ('ok', 'sin_cupo', 'mapa_fallo', 'no_encontrada', 'manual')),
  usado      boolean not null default false,
  creado_en  timestamptz not null default now()
);
create index if not exists calculos_domicilio_neg_idx on calculos_domicilio (negocio_id, creado_en desc);
select _aplicar_politicas('calculos_domicilio', 'd', null, null, null);
select _triggers_tabla('calculos_domicilio', false);
revoke all on table calculos_domicilio from public, anon, authenticated;
grant select, insert, update, delete on calculos_domicilio to service_role;

-- 4. Funciones SOLO para el servidor (service_role). Ni anon ni authenticated pueden llamarlas.
-- Datos de la tienda que necesita la ruta del servidor. p_para: 'buscar' (solo exige el módulo) o 'calcular' (exige modo km).
create or replace function domicilio_contexto(p_slug text, p_para text) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare n negocios%rowtype; r negocio_reglas%rowtype; c negocio_config%rowtype;
begin
  select * into n from negocios where slug = lower(coalesce(p_slug, '')) and estado = 'activo';
  if not found then return jsonb_build_object('ok', false, 'motivo', 'no_disponible'); end if;
  if not modulo_activo(n.id, 'domicilio_km') then return jsonb_build_object('ok', false, 'motivo', 'sin_modulo'); end if;
  select * into r from negocio_reglas where negocio_id = n.id;
  select * into c from negocio_config where negocio_id = n.id;
  if p_para = 'calcular' and r.domicilio_modo <> 'km' then return jsonb_build_object('ok', false, 'motivo', 'modo_fijo'); end if;
  return jsonb_build_object('ok', true, 'negocio_id', n.id, 'lat', c.lat, 'lng', c.lng,
    'radio_max_km', r.domicilio_radio_max_km, 'tarifa_respaldo', coalesce(r.domicilio_tarifa_respaldo, r.domicilio_costo, 0),
    'ciudad', c.ciudad);
end;
$$;

-- Gasta 1 del cupo. 'buscar' = búsqueda de direcciones (cupo global); 'calcular' = ruta (cupo del plan + global). false = sin cupo.
create or replace function domicilio_consumir(p_negocio_id uuid, p_tipo text) returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_dia date := hoy_colombia(); v_glob integer; v_uso integer;
begin
  if p_tipo = 'calcular' then return _consumir_cuota_km(p_negocio_id); end if;
  if p_tipo <> 'buscar' then raise exception 'Tipo de consumo no válido'; end if;
  select max_dia into v_glob from plataforma_limites where concepto = 'ors_busquedas';
  v_uso := coalesce((select cantidad from uso_plataforma where dia = v_dia and concepto = 'ors_busquedas'), 0);
  if v_glob is not null and v_uso >= v_glob then return false; end if;
  insert into uso_plataforma as u (dia, concepto, cantidad) values (v_dia, 'ors_busquedas', 1)
  on conflict (dia, concepto) do update set cantidad = u.cantidad + 1;
  return true;
end;
$$;

-- Guarda el resultado (km null = respaldo) y devuelve el calculo_id que el pedido presentará
create or replace function domicilio_guardar(p_negocio_id uuid, p_km numeric, p_direccion text, p_lat numeric, p_lng numeric, p_motivo text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  delete from calculos_domicilio where creado_en < now() - interval '3 days';
  insert into calculos_domicilio (negocio_id, km, direccion, lat, lng, motivo)
  values (p_negocio_id, case when p_km is null then null else round(p_km, 2) end, left(p_direccion, 200), p_lat, p_lng, coalesce(p_motivo, 'ok'))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function domicilio_contexto(text, text), domicilio_consumir(uuid, text),
                       domicilio_guardar(uuid, numeric, text, numeric, numeric, text) from public, anon, authenticated;
grant execute on function domicilio_contexto(text, text), domicilio_consumir(uuid, text),
                          domicilio_guardar(uuid, numeric, text, numeric, numeric, text) to service_role;

-- 5. Prueba del cálculo para el panel (dueño o soporte). NO usa el mapa ni gasta cupo: solo aplica las reglas a unos km escritos.
create or replace function simular_domicilio(p_negocio_id uuid, p_km numeric, p_subtotal numeric default 0) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare r negocio_reglas%rowtype; v_base numeric; v_exceso numeric; v_bruto numeric; v_costo numeric; v_fuera boolean; v_gratis boolean;
begin
  if not (es_dueno(p_negocio_id) or es_soporte(p_negocio_id)) then raise exception 'No autorizado'; end if;
  if p_km is null or p_km < 0 or p_km > 200 then raise exception 'La distancia no es válida'; end if;
  select * into r from negocio_reglas where negocio_id = p_negocio_id;
  v_base   := coalesce(r.domicilio_costo, 0);
  v_exceso := greatest(p_km - r.domicilio_km_incluidos, 0);
  v_bruto  := v_base + v_exceso * r.domicilio_valor_km;
  v_costo  := case when r.domicilio_redondeo > 0 then round(v_bruto / r.domicilio_redondeo) * r.domicilio_redondeo else v_bruto end;
  v_fuera  := r.domicilio_radio_max_km is not null and p_km > r.domicilio_radio_max_km;
  v_gratis := coalesce(r.envio_gratis_desde, 0) > 0 and coalesce(p_subtotal, 0) >= r.envio_gratis_desde;
  return jsonb_build_object('km', p_km, 'base', v_base, 'km_incluidos', r.domicilio_km_incluidos, 'km_exceso', v_exceso,
    'valor_km', r.domicilio_valor_km, 'antes_de_redondear', round(v_bruto), 'redondeo', r.domicilio_redondeo,
    'fuera_de_zona', v_fuera, 'radio_max_km', r.domicilio_radio_max_km, 'envio_gratis', v_gratis,
    'costo', case when v_gratis then 0 else round(v_costo) end,
    'tarifa_respaldo', coalesce(r.domicilio_tarifa_respaldo, r.domicilio_costo, 0));
end;
$$;
revoke all on function simular_domicilio(uuid, numeric, numeric) from public, anon;
grant execute on function simular_domicilio(uuid, numeric, numeric) to authenticated;

-- 6. El pedido recibe calculo_id en lugar de km (y usa la tarifa de respaldo si el mapa no pudo calcular)
create or replace function crear_pedido_tienda(p_slug text, p_datos jsonb, p_items jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_neg    uuid := _negocio_vista_id(p_slug, 'pedidos_en_linea');
  it       jsonb;
  prod     productos%rowtype;
  rg       negocio_reglas%rowtype;
  v_cant   numeric;
  v_bruto  numeric;
  v_desc   numeric;
  v_pnom   text;
  v_total  numeric := 0;
  v_dom    numeric := 0;
  v_recoge boolean := coalesce(p_datos->>'entrega', '') = 'recoger';
  v_id     uuid;
  v_num    bigint;
  v_cli    uuid;
  v_lineas jsonb := '[]'::jsonb;
  v_hoy    date := hoy_colombia();
  v_vistos uuid[] := '{}';
  v_publicada boolean;
  v_practica  boolean;
  v_user   uuid := auth.uid();
  v_nom text; v_tel text; v_mail text; v_dir text; v_km numeric;
  v_calc_txt text; v_calc uuid; cd calculos_domicilio%rowtype; v_fijo boolean := false;
begin
  perform exigir_modulo(v_neg, 'productos');
  select publicada into v_publicada from negocios where id = v_neg;
  -- pedido de práctica: solo el personal, y siempre si la tienda aún no está publicada
  v_practica := es_personal(v_neg) and (not v_publicada or coalesce(p_datos->>'practica', '') = 'true');
  if not v_publicada and not v_practica then raise exception 'Catálogo no disponible'; end if;

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 40 then
    raise exception 'El pedido está vacío o es demasiado grande';
  end if;

  if v_practica then
    v_nom  := left(trim(coalesce(nullif(p_datos->>'nombre', ''), 'Pedido de práctica')), 80);
    v_tel  := left(regexp_replace(coalesce(p_datos->>'telefono', ''), '\D', '', 'g'), 12);
    v_mail := null;
  else
    if (select count(*) from pedidos_tienda where negocio_id = v_neg and estado = 'pendiente' and not es_practica) >= 300 then
      raise exception 'Hay muchos pedidos pendientes: escríbenos directamente por WhatsApp';
    end if;
    v_cli := _cliente_desde_pedido(v_neg, p_datos, 'tienda');
    -- freno contra pedidos repetidos del mismo cliente
    if (select count(*) from pedidos_tienda where negocio_id = v_neg and cliente_id = v_cli and creado_en > now() - interval '1 hour') >= 5 then
      raise exception 'Ya enviaste varios pedidos hace poco: espera un momento o escríbenos por WhatsApp';
    end if;
    select c.nombre, c.telefono, c.email into v_nom, v_tel, v_mail from clientes c where c.negocio_id = v_neg and c.id = v_cli;
  end if;
  v_dir := case when v_recoge then 'Recoge en tienda' else left(trim(coalesce(p_datos->>'direccion', '')), 160) end;

  -- C4: la distancia ya NO la escribe el navegador. Viene de un cálculo hecho por el servidor (calculo_id), de un solo uso.
  v_calc_txt := nullif(trim(coalesce(p_datos->>'calculo_id', '')), '');
  if v_calc_txt is not null and not v_recoge then
    if v_calc_txt !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'El cálculo de tu domicilio no es válido: vuelve a calcularlo';
    end if;
    select * into cd from calculos_domicilio
     where id = v_calc_txt::uuid and negocio_id = v_neg and not usado and creado_en > now() - interval '3 hours' for update;
    if not found then raise exception 'El cálculo de tu domicilio venció: vuelve a calcularlo'; end if;
    v_calc := cd.id; v_km := cd.km;
  end if;

  insert into pedidos_tienda (negocio_id, cliente_id, cliente_user_id, nombre, telefono, direccion, email, nota, entrega, es_practica, km_informado)
  values (v_neg, v_cli, case when v_practica then null else v_user end, v_nom, v_tel, v_dir, v_mail,
          nullif(left(trim(coalesce(p_datos->>'nota', '')), 200), ''),
          case when v_recoge then 'recoger' else 'domicilio' end, v_practica, case when v_recoge then null else v_km end)
  returning id, numero into v_id, v_num;

  for it in select * from jsonb_array_elements(p_items) loop
    v_cant := (it->>'cantidad')::numeric;
    if v_cant is null or v_cant <= 0 or v_cant > 500 then raise exception 'Cantidad inválida'; end if;
    select * into prod from productos
     where negocio_id = v_neg and id = (it->>'producto_id')::uuid and activo and publicado and precio_venta > 0;
    if not found then raise exception 'Uno de los productos ya no está disponible'; end if;
    if prod.id = any(v_vistos) then raise exception 'Un producto está repetido en el pedido'; end if;
    v_vistos := v_vistos || prod.id;
    if not (case when prod.controla_stock then prod.stock > 0 else prod.disponible end) then
      raise exception '"%" está agotado por ahora', prod.nombre;
    end if;

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

  -- Domicilio: por km si la tienda lo activó (y su plan lo incluye); si no, tarifa fija. Siempre lo decide el servidor.
  if not v_recoge then
    select * into rg from negocio_reglas where negocio_id = v_neg;
    if rg.domicilio_modo = 'km' and modulo_activo(v_neg, 'domicilio_km') then
      if v_km is not null then
        v_dom := _costo_domicilio_km(v_neg, v_km, v_total);
      elsif v_calc is not null or coalesce(p_datos->>'sin_calculo', '') = 'true' then
        -- el mapa no pudo calcular (sin cupo, falla, ruta caída, dirección no encontrada o escrita a mano): tarifa fija de respaldo, la venta no se bloquea
        v_fijo := true;
        v_dom := case when coalesce(rg.envio_gratis_desde, 0) > 0 and v_total >= rg.envio_gratis_desde then 0
                      else coalesce(rg.domicilio_tarifa_respaldo, rg.domicilio_costo, 0) end;
      else
        raise exception 'Calcula la distancia de tu dirección antes de hacer el pedido';
      end if;
    elsif rg.domicilio_costo is not null then
      v_dom := case when coalesce(rg.envio_gratis_desde, 0) > 0 and v_total >= rg.envio_gratis_desde then 0 else rg.domicilio_costo end;
    end if;
  end if;

  update pedidos_tienda set total = v_total + v_dom, domicilio = v_dom, domicilio_tarifa_fija = v_fijo where negocio_id = v_neg and id = v_id;
  if v_calc is not null then update calculos_domicilio set usado = true where id = v_calc; end if;
  if not v_practica then
    insert into eventos_dia as e (negocio_id, dia, evento, cantidad) values (v_neg, v_hoy, 'pedido_creado', 1)
    on conflict (negocio_id, dia, evento) do update set cantidad = e.cantidad + 1;
  end if;
  return jsonb_build_object('id', v_id, 'numero', v_num, 'subtotal', v_total, 'domicilio', v_dom,
                            'total', v_total + v_dom, 'entrega', case when v_recoge then 'recoger' else 'domicilio' end,
                            'seguimiento', 'recibido', 'es_practica', v_practica, 'tarifa_fija', v_fijo, 'km', v_km, 'lineas', v_lineas);
end;
$$;

-- 7. La tienda pública también publica la tarifa de respaldo (para mostrarla al cliente cuando el mapa no calcula)
do $$
declare d text;
begin
  select pg_get_functiondef('negocio_publico(text)'::regprocedure) into d;
  if position('domicilio_tarifa_respaldo' in d) = 0 then
    d := replace(d, '''domicilio_radio_max_km'', r.domicilio_radio_max_km,',
                    '''domicilio_radio_max_km'', r.domicilio_radio_max_km, ''domicilio_tarifa_respaldo'', coalesce(r.domicilio_tarifa_respaldo, r.domicilio_costo),');
    if position('domicilio_tarifa_respaldo' in d) = 0 then raise exception 'No se pudo ajustar negocio_publico'; end if;
    execute d;
  end if;
end $$;

notify pgrst, 'reload schema';

-- 8. Verificación: debe dar 7 filas en true
select 'La tabla calculos_domicilio existe, con RLS y sin acceso desde el navegador' as chequeo,
       coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.calculos_domicilio')), false)
       and not has_table_privilege('anon', 'calculos_domicilio', 'select')
       and not has_table_privilege('authenticated', 'calculos_domicilio', 'select') as ok
union all
select 'Existen la tarifa de respaldo (reglas) y la marca de tarifa fija (pedidos)',
       (select count(*) from information_schema.columns where table_schema = 'public'
         and ((table_name = 'negocio_reglas' and column_name = 'domicilio_tarifa_respaldo')
           or (table_name = 'pedidos_tienda' and column_name = 'domicilio_tarifa_fija'))) = 2
union all
select 'Los dos cupos diarios existen y son editables (ors_calculos_km y ors_busquedas)',
       (select count(*) from plataforma_limites where concepto in ('ors_calculos_km', 'ors_busquedas')) = 2
union all
select 'Solo el servidor ejecuta las funciones del mapa (anon y authenticated no)',
       has_function_privilege('service_role', 'domicilio_guardar(uuid,numeric,text,numeric,numeric,text)', 'execute')
       and not has_function_privilege('anon', 'domicilio_guardar(uuid,numeric,text,numeric,numeric,text)', 'execute')
       and not has_function_privilege('authenticated', 'domicilio_contexto(text,text)', 'execute')
       and not has_function_privilege('authenticated', 'domicilio_consumir(uuid,text)', 'execute')
union all
select 'La prueba del cálculo es solo para usuarios con sesión',
       has_function_privilege('authenticated', 'simular_domicilio(uuid,numeric,numeric)', 'execute')
       and not has_function_privilege('anon', 'simular_domicilio(uuid,numeric,numeric)', 'execute')
union all
select 'El pedido usa el cálculo del servidor (calculo_id) y ya no los km del navegador',
       position('calculo_id' in pg_get_functiondef('crear_pedido_tienda(text,jsonb,jsonb)'::regprocedure)) > 0
       and position('v_km_txt' in pg_get_functiondef('crear_pedido_tienda(text,jsonb,jsonb)'::regprocedure)) = 0
union all
select 'La tienda pública publica la tarifa de respaldo',
       position('domicilio_tarifa_respaldo' in pg_get_functiondef('negocio_publico(text)'::regprocedure)) > 0;
