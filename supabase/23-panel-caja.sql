-- ============================================================
-- Plataforma multi-negocio — 23: lo que necesita la CAJA del panel de Cibus
--   · Ventas con clave única: si la venta se sube dos veces (corte de internet justo al guardar), NO se duplica,
--     y queda con la hora en que de verdad se hizo.  (registrar_venta_offline)
--   · Abonos con clave única.                         (ejecutar_offline)
--   · Retiros e ingresos de caja: ahora llevan una nota, y el DUEÑO puede borrar uno mal puesto (queda en la auditoría).
-- Solo AGREGA. No cambia ni borra datos. Se puede ejecutar más de una vez.
-- ============================================================

-- =====================================================================
-- 1. Retiros e ingresos de caja
-- =====================================================================
alter table caja_movimientos add column if not exists nota text check (nota is null or char_length(nota) <= 200);

select _aplicar_politicas('caja_movimientos', 'p', 'p', null, 'd');       -- el personal lo ve y lo crea; solo el dueño lo borra
grant delete on caja_movimientos to authenticated;
drop trigger if exists aud_caja_movimientos on caja_movimientos;
create trigger aud_caja_movimientos after insert or delete on caja_movimientos for each row execute function auditar();

-- =====================================================================
-- 2. Claves de las ventas y de las acciones (para no duplicar)
-- =====================================================================
create table if not exists ventas_claves (
  negocio_id uuid not null references negocios(id),
  clave      uuid not null,
  venta_id   uuid not null,
  creado_en  timestamptz not null default now(),
  primary key (negocio_id, clave),
  foreign key (negocio_id, venta_id) references ventas (negocio_id, id) on delete cascade
);
create table if not exists acciones_claves (
  negocio_id uuid not null references negocios(id),
  clave      uuid not null,
  resultado  uuid,
  creado_en  timestamptz not null default now(),
  primary key (negocio_id, clave)
);
select _aplicar_politicas('ventas_claves',    'p', 'p', null, null);
select _aplicar_politicas('acciones_claves',  'p', 'p', null, null);
select _triggers_tabla('ventas_claves');
select _triggers_tabla('acciones_claves');
revoke all on ventas_claves, acciones_claves from public, anon, authenticated;
grant select, insert on ventas_claves, acciones_claves to authenticated;
grant all on ventas_claves, acciones_claves to service_role;

-- =====================================================================
-- 3. Registrar una venta con clave única
-- =====================================================================
create or replace function registrar_venta_offline(
  p_negocio_id uuid, p_clave uuid, p_fecha timestamptz, p_items jsonb, p_pagos jsonb,
  p_cliente_id uuid default null, p_nota text default null, p_fecha_limite date default null,
  p_descuento numeric default 0, p_domicilio jsonb default null
) returns uuid
language plpgsql
as $$
declare v_id uuid;
begin
  if not es_personal(p_negocio_id) then raise exception 'Sin acceso'; end if;
  perform exigir_modulo(p_negocio_id, 'caja');
  if p_clave is null then raise exception 'Falta la clave de la venta'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_negocio_id::text || p_clave::text, 0));      -- dos subidas a la vez de la misma venta: una espera
  select venta_id into v_id from ventas_claves where negocio_id = p_negocio_id and clave = p_clave;
  if found then return v_id; end if;                                                              -- ya se había subido

  v_id := registrar_venta(p_negocio_id, p_items, p_pagos, p_cliente_id, p_nota, p_fecha_limite, p_descuento, p_domicilio);
  insert into ventas_claves (negocio_id, clave, venta_id) values (p_negocio_id, p_clave, v_id);

  -- la venta queda con la hora en que de verdad se hizo (si fue sin internet, hace un rato); nunca en el futuro
  if p_fecha is not null and p_fecha < now() - interval '2 minutes' and p_fecha > now() - interval '30 days' then
    update ventas set fecha = p_fecha where negocio_id = p_negocio_id and id = v_id;
    update fiado_movimientos set fecha = p_fecha where negocio_id = p_negocio_id and venta_id = v_id and tipo = 'cargo';
  end if;
  return v_id;
end;
$$;

-- =====================================================================
-- 4. Acciones con clave única (hoy: abonos de fiado; las demás se suman cuando se pasa su pantalla)
-- =====================================================================
create or replace function ejecutar_offline(p_negocio_id uuid, p_clave uuid, p_fecha timestamptz, p_rpc text, p_args jsonb)
returns uuid
language plpgsql
as $$
declare v_id uuid;
begin
  if not es_personal(p_negocio_id) then raise exception 'Sin acceso'; end if;
  if p_clave is null then raise exception 'Falta la clave'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_negocio_id::text || p_clave::text, 1));
  select resultado into v_id from acciones_claves where negocio_id = p_negocio_id and clave = p_clave;
  if found then return v_id; end if;

  if p_rpc = 'registrar_abono' then
    v_id := registrar_abono(p_negocio_id, (p_args->>'p_cliente_id')::uuid, (p_args->>'p_monto')::numeric,
                            coalesce(p_args->>'p_metodo', 'efectivo'), p_args->>'p_nota');
  else
    raise exception 'Acción no permitida sin conexión: %', p_rpc;
  end if;

  insert into acciones_claves (negocio_id, clave, resultado) values (p_negocio_id, p_clave, v_id);
  if v_id is not null and p_fecha is not null and p_fecha < now() - interval '2 minutes' and p_fecha > now() - interval '30 days' then
    update fiado_movimientos set fecha = p_fecha where negocio_id = p_negocio_id and id = v_id;
  end if;
  return v_id;
end;
$$;

-- =====================================================================
-- 5. Permisos (las funciones nuevas nacen abiertas a PUBLIC: se cierran a mano)
-- =====================================================================
revoke all on function registrar_venta_offline(uuid, uuid, timestamptz, jsonb, jsonb, uuid, text, date, numeric, jsonb),
                       ejecutar_offline(uuid, uuid, timestamptz, text, jsonb) from public, anon;
grant execute on function registrar_venta_offline(uuid, uuid, timestamptz, jsonb, jsonb, uuid, text, date, numeric, jsonb),
                          ejecutar_offline(uuid, uuid, timestamptz, text, jsonb) to authenticated;

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 14 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, chequeo, ok from verificar_aislamiento()
  union all select 2, 'Los retiros de caja llevan nota y los borra solo el dueño',
         exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'caja_movimientos' and column_name = 'nota')
         and has_table_privilege('authenticated', 'caja_movimientos', 'delete')
  union all select 3, 'Claves de ventas y acciones con seguridad por fila (RLS)',
         (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname in ('ventas_claves', 'acciones_claves') and relrowsecurity) = 2
  union all select 4, 'Anónimo no puede registrar ventas con clave',
         not has_function_privilege('anon', 'registrar_venta_offline(uuid,uuid,timestamptz,jsonb,jsonb,uuid,text,date,numeric,jsonb)', 'execute')
         and not has_function_privilege('anon', 'ejecutar_offline(uuid,uuid,timestamptz,text,jsonb)', 'execute')
) t order by n, chequeo;
