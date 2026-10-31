-- ============================================================
-- Plataforma multi-negocio — 43: domiciliarios, etapas 2 a 4
--   · Etapa 2: la tienda OFRECE el domicilio a la red; el primer domiciliario aprobado de la ciudad que lo acepta se lo queda,
--              lo recoge, lo entrega y el cliente ve "en camino / entregado". También se puede asignar a mano (como en la etapa 1).
--   · Etapa 3: cada entrega lleva su tarifa; la tienda ve lo que debe a cada domiciliario y lo marca como pagado; el domiciliario ve sus ganancias.
--   · Etapa 4: el cliente y la tienda califican la entrega; el promedio sale en el perfil del domiciliario.
-- Se corre DESPUÉS del 42. Aditivo e idempotente. El dinero se paga FUERA de la plataforma (efectivo, Nequi…): aquí solo se lleva la cuenta.
-- ============================================================

-- ---------- 1. Tabla de entregas (de cada tienda; nadie escribe directo: solo funciones) ----------
create table if not exists entregas (
  id              uuid not null default gen_random_uuid(),
  negocio_id      uuid not null references negocios(id) on delete cascade,
  pedido_id       uuid not null,
  domiciliario_id uuid,                        -- sin llave: domiciliarios es global (la plataforma exige llaves con negocio_id)
  estado          text not null default 'ofrecida' check (estado in ('ofrecida','aceptada','recogida','entregada','cancelada')),
  tarifa          numeric not null default 0 check (tarifa >= 0 and tarifa <= 100000),
  ciudad          text not null,
  creada_en       timestamptz not null default now(),
  aceptada_en     timestamptz,
  recogida_en     timestamptz,
  entregada_en    timestamptz,
  pago_estado     text not null default 'pendiente' check (pago_estado in ('pendiente','pagado')),
  pagado_en       timestamptz,
  pagado_nota     text check (pagado_nota is null or char_length(pagado_nota) <= 200),
  calif_cliente   smallint check (calif_cliente between 1 and 5),
  comentario_cliente text check (comentario_cliente is null or char_length(comentario_cliente) <= 300),
  calif_tienda    smallint check (calif_tienda between 1 and 5),
  comentario_tienda text check (comentario_tienda is null or char_length(comentario_tienda) <= 300),
  primary key (negocio_id, id),
  foreign key (negocio_id, pedido_id) references pedidos_tienda (negocio_id, id) on delete cascade
);
create unique index if not exists entregas_una_activa_idx on entregas (negocio_id, pedido_id) where estado in ('ofrecida','aceptada','recogida');
create index if not exists entregas_ofertas_idx on entregas (ciudad, creada_en) where estado = 'ofrecida';
create index if not exists entregas_dom_idx on entregas (domiciliario_id, estado);
select _aplicar_politicas('entregas', 'p', null, null, null);
select _triggers_tabla('entregas', true);
grant select on entregas to authenticated;

alter table domiciliarios add column if not exists calificacion_prom numeric(3,2);
alter table domiciliarios add column if not exists calificaciones_n integer not null default 0;

-- ---------- 2. Ayudas internas ----------
create or replace function _domiciliario_activo() returns domiciliarios
language plpgsql stable security definer set search_path = public
as $$
declare d domiciliarios;
begin
  select * into d from domiciliarios where user_id = auth.uid() and estado = 'aprobado';
  if d.id is null then raise exception 'No eres un domiciliario aprobado'; end if;
  return d;
end;
$$;

create or replace function _crear_aviso_estado(p_negocio_id uuid, p_pedido_id uuid) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_ped record; v_ultimo text; v_id uuid;
begin
  select cliente_user_id, seguimiento, es_practica into v_ped from pedidos_tienda where negocio_id = p_negocio_id and id = p_pedido_id;
  if not found or v_ped.cliente_user_id is null or v_ped.es_practica then return null; end if;
  if not exists (select 1 from suscripciones_cliente where user_id = v_ped.cliente_user_id) then return null; end if;
  select seguimiento into v_ultimo from avisos_estado where negocio_id = p_negocio_id and pedido_id = p_pedido_id order by creado_en desc limit 1;
  if v_ultimo is not distinct from v_ped.seguimiento then return null; end if;
  insert into avisos_estado (negocio_id, pedido_id, user_id, seguimiento) values (p_negocio_id, p_pedido_id, v_ped.cliente_user_id, v_ped.seguimiento)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function _recalcular_calificacion(p_domiciliario_id uuid) returns void
language sql security definer set search_path = public
as $$
  update domiciliarios d set calificacion_prom = x.prom, calificaciones_n = x.n
    from (select round(avg(c)::numeric, 2) prom, count(c)::int n
            from (select calif_cliente c from entregas where domiciliario_id = p_domiciliario_id
                  union all select calif_tienda from entregas where domiciliario_id = p_domiciliario_id) t where c is not null) x
   where d.id = p_domiciliario_id
$$;

-- Comprobaciones comunes de la tienda antes de ofrecer o asignar un pedido
create or replace function _pedido_para_entrega(p_negocio_id uuid, p_pedido_id uuid) returns pedidos_tienda
language plpgsql security definer set search_path = public
as $$
declare v pedidos_tienda;
begin
  if not es_personal(p_negocio_id) or es_soporte(p_negocio_id) then raise exception 'No autorizado'; end if;
  perform exigir_modulo(p_negocio_id, 'domiciliarios');
  select * into v from pedidos_tienda where id = p_pedido_id and negocio_id = p_negocio_id;
  if v.id is null then raise exception 'Pedido no encontrado'; end if;
  if v.estado = 'cancelado' or v.seguimiento = 'entregado' then raise exception 'Este pedido ya terminó'; end if;
  if v.entrega = 'recoger' then raise exception 'Este pedido es para recoger en la tienda'; end if;
  if coalesce(_ciudad_negocio(p_negocio_id), '') = '' then raise exception 'Primero escribe la ciudad de tu negocio en «Datos del negocio»'; end if;
  return v;
end;
$$;

-- ---------- 3. La tienda: asignar a mano (etapa 1, ahora con entrega), ofrecer a la red, cancelar ----------
drop function if exists asignar_domiciliario(uuid, uuid, uuid);
create or replace function asignar_domiciliario(p_negocio_id uuid, p_pedido_id uuid, p_domiciliario_id uuid, p_tarifa numeric default null) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_ped pedidos_tienda; d domiciliarios; v_e entregas; v_tarifa numeric;
begin
  v_ped := _pedido_para_entrega(p_negocio_id, p_pedido_id);
  select * into v_e from entregas where negocio_id = p_negocio_id and pedido_id = p_pedido_id and estado in ('ofrecida','aceptada','recogida');
  perform set_config('app.asigna', 'si', true);
  if p_domiciliario_id is null then
    if v_e.estado = 'recogida' then raise exception 'El domiciliario ya recogió el pedido'; end if;
    if v_e.id is not null then update entregas set estado = 'cancelada' where negocio_id = p_negocio_id and id = v_e.id; end if;
    update pedidos_tienda set domiciliario_id = null where negocio_id = p_negocio_id and id = p_pedido_id;
    return null;
  end if;
  select * into d from domiciliarios where id = p_domiciliario_id;
  if d.id is null or d.estado <> 'aprobado' then raise exception 'Ese domiciliario no está disponible en la red'; end if;
  if lower(btrim(d.ciudad)) is distinct from _ciudad_negocio(p_negocio_id) then raise exception 'Ese domiciliario es de otra ciudad'; end if;
  if v_e.estado = 'recogida' then raise exception 'El domiciliario ya recogió el pedido'; end if;
  v_tarifa := coalesce(p_tarifa, v_e.tarifa, v_ped.domicilio, 0);
  if v_tarifa < 0 or v_tarifa > 100000 then raise exception 'La tarifa debe estar entre 0 y 100.000'; end if;
  if v_e.id is null then
    insert into entregas (negocio_id, pedido_id, domiciliario_id, estado, tarifa, ciudad, aceptada_en)
    values (p_negocio_id, p_pedido_id, d.id, 'aceptada', v_tarifa, _ciudad_negocio(p_negocio_id), now());
  else
    update entregas set domiciliario_id = d.id, estado = 'aceptada', tarifa = v_tarifa, aceptada_en = now() where negocio_id = p_negocio_id and id = v_e.id;
  end if;
  update pedidos_tienda set domiciliario_id = d.id where negocio_id = p_negocio_id and id = p_pedido_id;
  return jsonb_build_object('id', d.id, 'nombre', d.nombre, 'telefono', d.telefono, 'vehiculo', d.vehiculo, 'tarifa', v_tarifa);
end;
$$;

create or replace function ofrecer_entrega(p_negocio_id uuid, p_pedido_id uuid, p_tarifa numeric default null) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_ped pedidos_tienda; v_tarifa numeric; v_id uuid;
begin
  v_ped := _pedido_para_entrega(p_negocio_id, p_pedido_id);
  v_tarifa := coalesce(p_tarifa, v_ped.domicilio, 0);
  if v_tarifa < 0 or v_tarifa > 100000 then raise exception 'La tarifa debe estar entre 0 y 100.000'; end if;
  if exists (select 1 from entregas where negocio_id = p_negocio_id and pedido_id = p_pedido_id and estado in ('ofrecida','aceptada','recogida')) then
    raise exception 'Este pedido ya está ofrecido o tiene domiciliario';
  end if;
  insert into entregas (negocio_id, pedido_id, estado, tarifa, ciudad) values (p_negocio_id, p_pedido_id, 'ofrecida', v_tarifa, _ciudad_negocio(p_negocio_id))
  returning id into v_id;
  return v_id;
end;
$$;

-- La tienda ve el estado de la entrega de un pedido (quién, cuánto, en qué paso)
create or replace function entrega_del_pedido(p_negocio_id uuid, p_pedido_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare r jsonb;
begin
  if not es_personal(p_negocio_id) then raise exception 'No autorizado'; end if;
  perform exigir_modulo(p_negocio_id, 'domiciliarios');
  select jsonb_build_object('id', e.id, 'estado', e.estado, 'tarifa', e.tarifa, 'pago_estado', e.pago_estado,
           'calif_tienda', e.calif_tienda, 'calif_cliente', e.calif_cliente,
           'domiciliario', case when d.id is not null and d.estado = 'aprobado'
                                then jsonb_build_object('id', d.id, 'nombre', d.nombre, 'telefono', d.telefono, 'vehiculo', d.vehiculo,
                                                        'calificacion', d.calificacion_prom, 'calificaciones', d.calificaciones_n) end)
    into r
    from entregas e left join domiciliarios d on d.id = e.domiciliario_id
   where e.negocio_id = p_negocio_id and e.pedido_id = p_pedido_id and e.estado <> 'cancelada'
   order by e.creada_en desc limit 1;
  return r;
end;
$$;

-- ---------- 4. El domiciliario ----------
create or replace function ofertas_disponibles() returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare d domiciliarios;
begin
  d := _domiciliario_activo();
  return coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'tienda', c.nombre_comercial, 'direccion_tienda', c.direccion,
                                                      'tarifa', e.tarifa, 'km', p.km_informado, 'productos', (select count(*) from pedido_tienda_items i where i.negocio_id = e.negocio_id and i.pedido_id = e.pedido_id),
                                                      'hace_min', greatest(0, round(extract(epoch from (now() - e.creada_en)) / 60)::int))
                                    order by e.creada_en)
                     from entregas e join negocio_config c on c.negocio_id = e.negocio_id join pedidos_tienda p on p.negocio_id = e.negocio_id and p.id = e.pedido_id
                    where e.estado = 'ofrecida' and e.ciudad = lower(btrim(d.ciudad))), '[]'::jsonb);
end;
$$;

create or replace function aceptar_entrega(p_entrega_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare d domiciliarios; v_neg uuid; v_ped uuid;
begin
  d := _domiciliario_activo();
  if (select count(*) from entregas where domiciliario_id = d.id and estado in ('aceptada','recogida')) >= 3 then
    raise exception 'Ya llevas 3 entregas activas: termina alguna primero';
  end if;
  update entregas set estado = 'aceptada', domiciliario_id = d.id, aceptada_en = now()
   where id = p_entrega_id and estado = 'ofrecida' and ciudad = lower(btrim(d.ciudad))
  returning negocio_id, pedido_id into v_neg, v_ped;
  if v_neg is null then raise exception 'Esta entrega ya la tomó otro domiciliario o ya no está disponible'; end if;
  perform set_config('app.asigna', 'si', true);
  update pedidos_tienda set domiciliario_id = d.id where negocio_id = v_neg and id = v_ped;
end;
$$;

create or replace function mis_entregas() returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare d domiciliarios;
begin
  d := _domiciliario_activo();
  return jsonb_build_object(
    'activas', coalesce((select jsonb_agg(x order by x->>'aceptada_en') from (
        select jsonb_build_object('id', e.id, 'estado', e.estado, 'tarifa', e.tarifa, 'aceptada_en', e.aceptada_en,
               'numero', p.numero, 'tienda', c.nombre_comercial, 'direccion_tienda', c.direccion, 'telefono_tienda', coalesce(c.whatsapp, c.telefono),
               'cliente', p.nombre, 'telefono_cliente', p.telefono, 'direccion', p.direccion, 'nota', p.nota, 'total', p.total, 'domicilio', p.domicilio,
               'pago_estado', p.pago_estado,
               'productos', coalesce((select jsonb_agg(jsonb_build_object('nombre', i.nombre, 'cantidad', i.cantidad)) from pedido_tienda_items i where i.negocio_id = e.negocio_id and i.pedido_id = e.pedido_id), '[]'::jsonb)) x
          from entregas e join pedidos_tienda p on p.negocio_id = e.negocio_id and p.id = e.pedido_id join negocio_config c on c.negocio_id = e.negocio_id
         where e.domiciliario_id = d.id and e.estado in ('aceptada','recogida')) t), '[]'::jsonb),
    'recientes', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'estado', e.estado, 'tarifa', e.tarifa, 'fecha', coalesce(e.entregada_en, e.aceptada_en, e.creada_en),
               'tienda', c.nombre_comercial, 'pago_estado', e.pago_estado, 'calificacion', coalesce(e.calif_cliente, e.calif_tienda)) order by coalesce(e.entregada_en, e.aceptada_en, e.creada_en) desc)
          from (select * from entregas where domiciliario_id = d.id and estado in ('entregada') order by entregada_en desc limit 20) e
          join negocio_config c on c.negocio_id = e.negocio_id), '[]'::jsonb));
end;
$$;

create or replace function avanzar_entrega(p_entrega_id uuid) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare d domiciliarios; e entregas; v_nuevo text; v_seg text; v_aviso uuid;
begin
  d := _domiciliario_activo();
  select * into e from entregas where id = p_entrega_id and domiciliario_id = d.id for update;
  if e.id is null then raise exception 'Entrega no encontrada'; end if;
  if e.estado = 'aceptada' then v_nuevo := 'recogida'; v_seg := 'en_camino';
  elsif e.estado = 'recogida' then v_nuevo := 'entregada'; v_seg := 'entregado';
  else raise exception 'Esta entrega ya no se puede avanzar'; end if;
  update entregas set estado = v_nuevo, recogida_en = case when v_nuevo = 'recogida' then now() else recogida_en end,
         entregada_en = case when v_nuevo = 'entregada' then now() else entregada_en end where negocio_id = e.negocio_id and id = e.id;
  update pedidos_tienda set seguimiento = v_seg, seguimiento_en = now() where negocio_id = e.negocio_id and id = e.pedido_id;
  v_aviso := _crear_aviso_estado(e.negocio_id, e.pedido_id);
  return jsonb_build_object('estado', v_nuevo, 'aviso', v_aviso);
end;
$$;

create or replace function soltar_entrega(p_entrega_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare d domiciliarios; e entregas;
begin
  d := _domiciliario_activo();
  select * into e from entregas where id = p_entrega_id and domiciliario_id = d.id for update;
  if e.id is null then raise exception 'Entrega no encontrada'; end if;
  if e.estado <> 'aceptada' then raise exception 'Solo puedes soltar una entrega que aún no recogiste'; end if;
  update entregas set estado = 'ofrecida', domiciliario_id = null, aceptada_en = null where negocio_id = e.negocio_id and id = e.id;
  perform set_config('app.asigna', 'si', true);
  update pedidos_tienda set domiciliario_id = null where negocio_id = e.negocio_id and id = e.pedido_id;
end;
$$;

create or replace function mis_ganancias() returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare d domiciliarios;
begin
  d := _domiciliario_activo();
  return jsonb_build_object(
    'pendiente_n', (select count(*) from entregas where domiciliario_id = d.id and estado = 'entregada' and pago_estado = 'pendiente'),
    'pendiente_total', coalesce((select sum(tarifa) from entregas where domiciliario_id = d.id and estado = 'entregada' and pago_estado = 'pendiente'), 0),
    'pagado_n', (select count(*) from entregas where domiciliario_id = d.id and pago_estado = 'pagado' and pagado_en > now() - interval '30 days'),
    'pagado_total', coalesce((select sum(tarifa) from entregas where domiciliario_id = d.id and pago_estado = 'pagado' and pagado_en > now() - interval '30 days'), 0),
    'calificacion', d.calificacion_prom, 'calificaciones', d.calificaciones_n);
end;
$$;

-- ---------- 5. Pagos a domiciliarios (la tienda; solo el dueño maneja plata) ----------
create or replace function pagos_domiciliarios(p_negocio_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not es_dueno(p_negocio_id) then raise exception 'No autorizado'; end if;
  perform exigir_modulo(p_negocio_id, 'domiciliarios');
  return coalesce((select jsonb_agg(jsonb_build_object('domiciliario_id', d.id, 'nombre', d.nombre, 'entregas', x.n, 'total', x.total) order by d.nombre)
                     from (select domiciliario_id, count(*) n, sum(tarifa) total from entregas
                            where negocio_id = p_negocio_id and estado = 'entregada' and pago_estado = 'pendiente' and domiciliario_id is not null group by 1) x
                     join domiciliarios d on d.id = x.domiciliario_id), '[]'::jsonb);
end;
$$;

create or replace function pagar_domiciliario(p_negocio_id uuid, p_domiciliario_id uuid, p_nota text default null) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_n int; v_total numeric;
begin
  if not es_dueno(p_negocio_id) or es_soporte(p_negocio_id) then raise exception 'No autorizado'; end if;
  perform exigir_modulo(p_negocio_id, 'domiciliarios');
  with u as (update entregas set pago_estado = 'pagado', pagado_en = now(), pagado_nota = left(nullif(btrim(coalesce(p_nota, '')), ''), 200)
              where negocio_id = p_negocio_id and domiciliario_id = p_domiciliario_id and estado = 'entregada' and pago_estado = 'pendiente' returning tarifa)
  select count(*), coalesce(sum(tarifa), 0) into v_n, v_total from u;
  if v_n = 0 then raise exception 'No hay entregas pendientes de pago para ese domiciliario'; end if;
  return jsonb_build_object('entregas', v_n, 'total', v_total);
end;
$$;

-- ---------- 6. Calificaciones ----------
create or replace function calificar_entrega_tienda(p_negocio_id uuid, p_entrega_id uuid, p_estrellas int, p_comentario text default null) returns void
language plpgsql security definer set search_path = public
as $$
declare e entregas;
begin
  if not es_personal(p_negocio_id) or es_soporte(p_negocio_id) then raise exception 'No autorizado'; end if;
  perform exigir_modulo(p_negocio_id, 'domiciliarios');
  if p_estrellas is null or p_estrellas not between 1 and 5 then raise exception 'Elige de 1 a 5 estrellas'; end if;
  select * into e from entregas where negocio_id = p_negocio_id and id = p_entrega_id;
  if e.id is null then raise exception 'Entrega no encontrada'; end if;
  if e.estado <> 'entregada' then raise exception 'Solo se califica una entrega terminada'; end if;
  if e.calif_tienda is not null then raise exception 'Ya calificaste esta entrega'; end if;
  update entregas set calif_tienda = p_estrellas, comentario_tienda = left(nullif(btrim(coalesce(p_comentario, '')), ''), 300) where negocio_id = p_negocio_id and id = e.id;
  perform _recalcular_calificacion(e.domiciliario_id);
end;
$$;

-- El cliente ve quién le lleva el pedido (sin celular) y puede calificar cuando lo recibe
create or replace function mi_entrega_pedido(p_pedido_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare r jsonb;
begin
  select jsonb_build_object('estado', e.estado, 'nombre', d.nombre, 'vehiculo', d.vehiculo, 'calificacion', d.calificacion_prom,
                            'calificado', e.calif_cliente is not null, 'mi_calificacion', e.calif_cliente) into r
    from entregas e join pedidos_tienda p on p.negocio_id = e.negocio_id and p.id = e.pedido_id left join domiciliarios d on d.id = e.domiciliario_id
   where e.pedido_id = p_pedido_id and p.cliente_user_id = auth.uid() and e.estado in ('aceptada','recogida','entregada')
   order by e.creada_en desc limit 1;
  return r;
end;
$$;

create or replace function calificar_entrega_cliente(p_pedido_id uuid, p_estrellas int, p_comentario text default null) returns void
language plpgsql security definer set search_path = public
as $$
declare e entregas;
begin
  if auth.uid() is null then raise exception 'Entra con tu cuenta para calificar'; end if;
  if p_estrellas is null or p_estrellas not between 1 and 5 then raise exception 'Elige de 1 a 5 estrellas'; end if;
  select e2.* into e from entregas e2 join pedidos_tienda p on p.negocio_id = e2.negocio_id and p.id = e2.pedido_id
   where e2.pedido_id = p_pedido_id and p.cliente_user_id = auth.uid() and e2.estado = 'entregada'
   order by e2.creada_en desc limit 1;
  if e.id is null then raise exception 'No encontramos una entrega terminada tuya'; end if;
  if e.calif_cliente is not null then raise exception 'Ya calificaste esta entrega'; end if;
  update entregas set calif_cliente = p_estrellas, comentario_cliente = left(nullif(btrim(coalesce(p_comentario, '')), ''), 300) where negocio_id = e.negocio_id and id = e.id;
  perform _recalcular_calificacion(e.domiciliario_id);
end;
$$;

-- La lista de la ciudad (etapa 1) ahora muestra también la calificación
create or replace function domiciliarios_de_mi_ciudad(p_negocio_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_ciudad text;
begin
  if not es_personal(p_negocio_id) then raise exception 'No autorizado'; end if;
  perform exigir_modulo(p_negocio_id, 'domiciliarios');
  v_ciudad := _ciudad_negocio(p_negocio_id);
  if v_ciudad is null or v_ciudad = '' then raise exception 'Primero escribe la ciudad de tu negocio en «Datos del negocio»'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'nombre', d.nombre, 'vehiculo', d.vehiculo, 'ciudad', d.ciudad,
                                                      'disponible', d.disponible, 'presentacion', d.presentacion,
                                                      'calificacion', d.calificacion_prom, 'calificaciones', d.calificaciones_n)
                                    order by d.disponible desc, d.calificacion_prom desc nulls last, d.nombre)
                     from domiciliarios d where d.estado = 'aprobado' and lower(btrim(d.ciudad)) = v_ciudad), '[]'::jsonb);
end;
$$;

-- ---------- 7. Permisos ----------
revoke all on function _domiciliario_activo(), _crear_aviso_estado(uuid, uuid), _recalcular_calificacion(uuid), _pedido_para_entrega(uuid, uuid),
  asignar_domiciliario(uuid, uuid, uuid, numeric), ofrecer_entrega(uuid, uuid, numeric), entrega_del_pedido(uuid, uuid),
  ofertas_disponibles(), aceptar_entrega(uuid), mis_entregas(), avanzar_entrega(uuid), soltar_entrega(uuid), mis_ganancias(),
  pagos_domiciliarios(uuid), pagar_domiciliario(uuid, uuid, text), calificar_entrega_tienda(uuid, uuid, int, text),
  mi_entrega_pedido(uuid), calificar_entrega_cliente(uuid, int, text), domiciliarios_de_mi_ciudad(uuid) from public, anon, authenticated;
grant execute on function asignar_domiciliario(uuid, uuid, uuid, numeric), ofrecer_entrega(uuid, uuid, numeric), entrega_del_pedido(uuid, uuid),
  ofertas_disponibles(), aceptar_entrega(uuid), mis_entregas(), avanzar_entrega(uuid), soltar_entrega(uuid), mis_ganancias(),
  pagos_domiciliarios(uuid), pagar_domiciliario(uuid, uuid, text), calificar_entrega_tienda(uuid, uuid, int, text),
  mi_entrega_pedido(uuid), calificar_entrega_cliente(uuid, int, text), domiciliarios_de_mi_ciudad(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 5 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'verificar_aislamiento: todo en orden' as chequeo, (select bool_and(ok) from verificar_aislamiento()) as ok
  union all select 2, 'la tabla entregas tiene RLS y nadie escribe directo',
         (select relrowsecurity from pg_class where relname = 'entregas')
         and not has_table_privilege('authenticated', 'entregas', 'insert') and not has_table_privilege('authenticated', 'entregas', 'update')
         and not exists (select 1 from information_schema.role_table_grants where table_name = 'entregas' and grantee in ('anon','PUBLIC'))
  union all select 3, 'anónimo no ejecuta ninguna función de entregas',
         not has_function_privilege('anon', 'aceptar_entrega(uuid)', 'execute') and not has_function_privilege('anon', 'ofertas_disponibles()', 'execute')
         and not has_function_privilege('anon', 'calificar_entrega_cliente(uuid, int, text)', 'execute')
  union all select 4, 'solo hay una entrega activa por pedido', exists (select 1 from pg_indexes where indexname = 'entregas_una_activa_idx')
  union all select 5, 'los domiciliarios tienen calificación', (select count(*) = 2 from information_schema.columns where table_name = 'domiciliarios' and column_name in ('calificacion_prom','calificaciones_n'))
) t order by n;
