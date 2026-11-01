-- ============================================================
-- Plataforma multi-negocio — 55: comisión a domiciliarios por usar la app
--   · Se cobra al DOMICILIARIO, un valor fijo por pedido ENTREGADO (hoy 700). El negocio no paga nada.
--   · Los primeros 30 días desde su primera aprobación no pagan (la comisión de esas entregas queda en 0).
--   · La comisión se acumula como saldo por pagar; el administrador registra los pagos (efectivo, Nequi…) cada semana.
--   · El valor y los días gratis los cambia el administrador (cambiar_comision). No cambia entregas ya hechas.
-- Se corre DESPUÉS del 54. Aditivo e idempotente.
-- ============================================================

-- ---------- 1. Configuración (una sola fila) y pagos ----------
create table if not exists comision_config (
  id         boolean primary key default true check (id),
  valor      numeric not null default 700 check (valor >= 0 and valor <= 10000),
  dias_gratis integer not null default 30 check (dias_gratis between 0 and 365)
);
insert into comision_config (id) values (true) on conflict do nothing;
alter table comision_config enable row level security;
revoke all on table comision_config from public, anon, authenticated;
grant all on table comision_config to service_role;

create table if not exists comision_pagos (
  id              uuid primary key default gen_random_uuid(),
  domiciliario_id uuid not null references domiciliarios(id) on delete cascade,
  monto           numeric not null check (monto > 0 and monto <= 10000000),
  nota            text check (nota is null or char_length(nota) <= 200),
  registrado_por  uuid,
  creado_en       timestamptz not null default now()
);
create index if not exists comision_pagos_dom_idx on comision_pagos (domiciliario_id, creado_en desc);
alter table comision_pagos enable row level security;
revoke all on table comision_pagos from public, anon, authenticated;
grant all on table comision_pagos to service_role;

-- Ambas son globales (no pertenecen a una tienda): entran en la lista de verificar_aislamiento
do $$
declare v text := pg_get_functiondef('verificar_aislamiento()'::regprocedure);
begin
  if position('comision_pagos' in v) = 0 then
    v := replace(v, '''domiciliarios'']);', '''domiciliarios'', ''comision_config'', ''comision_pagos'']);');
    if position('comision_pagos' in v) = 0 then raise exception 'No se pudo actualizar verificar_aislamiento'; end if;
    execute v;
  end if;
end $$;

-- ---------- 2. La comisión de cada entrega y el inicio de los días gratis ----------
alter table entregas add column if not exists comision numeric not null default 0 check (comision >= 0);
alter table domiciliarios add column if not exists comision_desde timestamptz;
update domiciliarios set comision_desde = coalesce(resuelto_en, now()) where estado = 'aprobado' and comision_desde is null;

create or replace function _marcar_comision_desde() returns trigger
language plpgsql as $$
begin
  if new.estado = 'aprobado' and new.comision_desde is null then new.comision_desde := now(); end if;
  return new;
end;
$$;
drop trigger if exists domiciliarios_comision_desde on domiciliarios;
create trigger domiciliarios_comision_desde before insert or update on domiciliarios for each row execute function _marcar_comision_desde();

-- avanzar_entrega: igual que en el 43, y al entregar fija la comisión de esa entrega (0 si aún está en sus días gratis)
create or replace function avanzar_entrega(p_entrega_id uuid) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare d domiciliarios; e entregas; v_nuevo text; v_seg text; v_aviso uuid; c comision_config; v_com numeric := 0;
begin
  d := _domiciliario_activo();
  select * into e from entregas where id = p_entrega_id and domiciliario_id = d.id for update;
  if e.id is null then raise exception 'Entrega no encontrada'; end if;
  if e.estado = 'aceptada' then v_nuevo := 'recogida'; v_seg := 'en_camino';
  elsif e.estado = 'recogida' then v_nuevo := 'entregada'; v_seg := 'entregado';
  else raise exception 'Esta entrega ya no se puede avanzar'; end if;
  if v_nuevo = 'entregada' then
    select * into c from comision_config where id;
    if now() >= coalesce(d.comision_desde, now()) + make_interval(days => c.dias_gratis) then v_com := c.valor; end if;
  end if;
  update entregas set estado = v_nuevo, recogida_en = case when v_nuevo = 'recogida' then now() else recogida_en end,
         entregada_en = case when v_nuevo = 'entregada' then now() else entregada_en end,
         comision = case when v_nuevo = 'entregada' then v_com else comision end
   where negocio_id = e.negocio_id and id = e.id;
  update pedidos_tienda set seguimiento = v_seg, seguimiento_en = now() where negocio_id = e.negocio_id and id = e.pedido_id;
  v_aviso := _crear_aviso_estado(e.negocio_id, e.pedido_id);
  return jsonb_build_object('estado', v_nuevo, 'aviso', v_aviso);
end;
$$;

-- ---------- 3. Lo que ve el domiciliario ----------
create or replace function mi_comision() returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare d domiciliarios; c comision_config; v_gen numeric; v_pag numeric; v_hasta timestamptz;
begin
  d := _domiciliario_activo();
  select * into c from comision_config where id;
  v_hasta := coalesce(d.comision_desde, now()) + make_interval(days => c.dias_gratis);
  select coalesce(sum(comision), 0) into v_gen from entregas where domiciliario_id = d.id and estado = 'entregada';
  select coalesce(sum(monto), 0) into v_pag from comision_pagos where domiciliario_id = d.id;
  return jsonb_build_object('valor', c.valor, 'dias_gratis', c.dias_gratis, 'gratis_hasta', v_hasta, 'en_gratis', now() < v_hasta,
    'generada', v_gen, 'pagada', v_pag, 'debe', greatest(0, v_gen - v_pag));
end;
$$;

-- ---------- 4. Lo que hace el administrador de la plataforma ----------
create or replace function comisiones_domiciliarios() returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare c comision_config;
begin
  if not soy_administrador_plataforma() then raise exception 'Solo un administrador de la plataforma'; end if;
  select * into c from comision_config where id;
  return jsonb_build_object('valor', c.valor, 'dias_gratis', c.dias_gratis, 'filas', coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'nombre', x.nombre, 'telefono', x.telefono, 'ciudad', x.ciudad,
             'generada', x.gen, 'pagada', x.pag, 'debe', greatest(0, x.gen - x.pag),
             'gratis_hasta', coalesce(x.comision_desde, now()) + make_interval(days => c.dias_gratis)) order by greatest(0, x.gen - x.pag) desc, x.nombre)
      from (select d.id, d.nombre, d.telefono, d.ciudad, d.comision_desde,
                   coalesce((select sum(comision) from entregas e where e.domiciliario_id = d.id and e.estado = 'entregada'), 0) gen,
                   coalesce((select sum(monto) from comision_pagos p where p.domiciliario_id = d.id), 0) pag
              from domiciliarios d where d.estado in ('aprobado', 'suspendido')) x), '[]'::jsonb));
end;
$$;

create or replace function registrar_pago_comision(p_domiciliario_id uuid, p_monto numeric, p_nota text default null) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_gen numeric; v_pag numeric; v_debe numeric;
begin
  if not soy_administrador_plataforma() then raise exception 'Solo un administrador de la plataforma'; end if;
  if not exists (select 1 from domiciliarios where id = p_domiciliario_id) then raise exception 'Domiciliario no encontrado'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El pago debe ser mayor que cero'; end if;
  select coalesce(sum(comision), 0) into v_gen from entregas where domiciliario_id = p_domiciliario_id and estado = 'entregada';
  select coalesce(sum(monto), 0) into v_pag from comision_pagos where domiciliario_id = p_domiciliario_id;
  v_debe := greatest(0, v_gen - v_pag);
  if p_monto > v_debe then raise exception 'Ese pago es mayor que lo que debe (%)', v_debe; end if;
  insert into comision_pagos (domiciliario_id, monto, nota, registrado_por) values (p_domiciliario_id, p_monto, left(nullif(btrim(coalesce(p_nota, '')), ''), 200), auth.uid());
  return jsonb_build_object('debe', v_debe - p_monto);
end;
$$;

create or replace function cambiar_comision(p_valor numeric, p_dias integer) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not soy_administrador_plataforma() then raise exception 'Solo un administrador de la plataforma'; end if;
  if p_valor is null or p_valor < 0 or p_valor > 10000 then raise exception 'El valor debe estar entre 0 y 10.000'; end if;
  if p_dias is null or p_dias < 0 or p_dias > 365 then raise exception 'Los días gratis deben estar entre 0 y 365'; end if;
  update comision_config set valor = p_valor, dias_gratis = p_dias where id;
end;
$$;

revoke all on function _marcar_comision_desde(), mi_comision(), comisiones_domiciliarios(), registrar_pago_comision(uuid, numeric, text), cambiar_comision(numeric, integer) from public, anon, authenticated;
grant execute on function mi_comision(), comisiones_domiciliarios(), registrar_pago_comision(uuid, numeric, text), cambiar_comision(numeric, integer) to authenticated;
grant execute on function avanzar_entrega(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 6 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'verificar_aislamiento: todo en orden' as chequeo, (select bool_and(ok) from verificar_aislamiento()) as ok
  union all select 2, 'la comisión es 700 y 30 días gratis (o el valor que fijaste)', (select valor >= 0 and dias_gratis >= 0 from comision_config where id)
  union all select 3, 'las 2 tablas nuevas tienen RLS', (select count(*) = 2 and bool_and(relrowsecurity) from pg_class where relname in ('comision_config','comision_pagos'))
  union all select 4, 'anónimo no toca las tablas nuevas',
         not exists (select 1 from information_schema.role_table_grants where table_name in ('comision_config','comision_pagos') and grantee in ('anon','PUBLIC','authenticated'))
  union all select 5, 'entregas guarda la comisión', exists (select 1 from information_schema.columns where table_name = 'entregas' and column_name = 'comision')
  union all select 6, 'avanzar_entrega ya calcula la comisión', pg_get_functiondef('avanzar_entrega(uuid)'::regprocedure) like '%comision_config%'
) t order by n;
