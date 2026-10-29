-- ============================================================
-- Plataforma multi-negocio — 31: pago por Nequi, Llave y Daviplata dentro de la tienda en línea
-- Se corre DESPUÉS del 30. Es aditivo e idempotente: se puede volver a correr.
--
-- Qué resuelve
--   · Cada tienda configura SU número y qué medios acepta (Nequi, Llave, Daviplata) en Negocio → Pagos digitales.
--   · El cliente, al pedir, elige cómo paga. Ve el número, paga en su app y toca «Ya pagó» (con la referencia si quiere).
--   · El dueño o su equipo ven «Pago por confirmar» en el pedido y marcan «Pago recibido» (o «No me llegó»).
--   · Ningún pedido ni dato existente cambia: sin configuración, la tienda sigue cobrando al recibir.
--   · Solo quien tiene la clave del pedido (su identificador privado) puede avisar el pago; cada tienda solo ve lo suyo.
-- ============================================================

-- ---------- 1. Configuración de cada tienda ----------
alter table negocio_reglas add column if not exists pago_digital_numero  text;
alter table negocio_reglas add column if not exists pago_digital_medios  text[] not null default '{}';
alter table negocio_reglas add column if not exists pago_digital_titular text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'negocio_reglas_pago_digital_ck') then
    alter table negocio_reglas add constraint negocio_reglas_pago_digital_ck check (
      (pago_digital_numero is null or pago_digital_numero ~ '^[0-9]{10}$')
      and pago_digital_medios <@ array['nequi', 'llave', 'daviplata']::text[]
      and (pago_digital_titular is null or char_length(pago_digital_titular) <= 80));
  end if;
end $$;

-- ---------- 2. Lo que ve el cliente de ESA tienda (número y medios) ----------
create or replace function datos_pago_digital(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when r.pago_digital_numero is not null and cardinality(r.pago_digital_medios) > 0
              then jsonb_build_object('numero', r.pago_digital_numero, 'medios', to_jsonb(r.pago_digital_medios), 'titular', r.pago_digital_titular)
         end
    from negocios n join negocio_reglas r on r.negocio_id = n.id
   where n.slug = lower(coalesce(p_slug, '')) and n.estado = 'activo' and n.publicada;
$$;
revoke all on function datos_pago_digital(text) from public;
grant execute on function datos_pago_digital(text) to anon, authenticated;

-- ---------- 3. El dueño guarda la configuración de su tienda ----------
create or replace function guardar_pago_digital(p_negocio_id uuid, p_numero text, p_medios text[], p_titular text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_num text := regexp_replace(coalesce(p_numero, ''), '\D', '', 'g'); v_med text[] := '{}'; m text; v_slug text;
begin
  if not es_dueno(p_negocio_id) then raise exception 'Solo el dueño puede cambiar los pagos digitales'; end if;
  if length(v_num) = 12 and left(v_num, 2) = '57' then v_num := substr(v_num, 3); end if;
  foreach m in array coalesce(p_medios, '{}') loop
    if m not in ('nequi', 'llave', 'daviplata') then raise exception 'Medio de pago no válido'; end if;
    if not (m = any(v_med)) then v_med := v_med || m; end if;
  end loop;
  if cardinality(v_med) > 0 and v_num !~ '^[0-9]{10}$' then raise exception 'Escribe el número de celular (10 dígitos)'; end if;
  if cardinality(v_med) = 0 then v_num := null; end if;
  update negocio_reglas set pago_digital_numero = nullif(v_num, ''), pago_digital_medios = v_med,
         pago_digital_titular = nullif(left(trim(coalesce(p_titular, '')), 80), ''), actualizado_en = now()
   where negocio_id = p_negocio_id;
  return jsonb_build_object('numero', nullif(v_num, ''), 'medios', to_jsonb(v_med), 'titular', nullif(left(trim(coalesce(p_titular, '')), 80), ''));
end $$;
revoke all on function guardar_pago_digital(uuid, text, text[], text) from public, anon;
grant execute on function guardar_pago_digital(uuid, text, text[], text) to authenticated;

-- ---------- 4. El pedido: cómo paga y en qué va el pago ----------
alter table pedidos_tienda add column if not exists pago_medio         text;
alter table pedidos_tienda add column if not exists pago_estado        text;
alter table pedidos_tienda add column if not exists pago_referencia    text;
alter table pedidos_tienda add column if not exists pago_avisado_en    timestamptz;
alter table pedidos_tienda add column if not exists pago_confirmado_en timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pedidos_tienda_pago_ck') then
    alter table pedidos_tienda add constraint pedidos_tienda_pago_ck check (
      (pago_medio is null or pago_medio in ('nequi', 'llave', 'daviplata'))
      and (pago_estado is null or pago_estado in ('por_pagar', 'avisado', 'confirmado', 'no_recibido')));
  end if;
end $$;

-- El cliente elige el medio (p_aviso = false) o avisa que ya pagó (p_aviso = true). La clave del pedido (su id) es el permiso.
create or replace function registrar_pago_digital(p_slug text, p_id uuid, p_medio text, p_aviso boolean default false, p_referencia text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_neg uuid; ped pedidos_tienda%rowtype; cfg jsonb := datos_pago_digital(p_slug); v_ref text;
begin
  if cfg is null then raise exception 'La tienda no recibe pagos digitales'; end if;
  if p_medio is null or not (cfg->'medios') ? p_medio then raise exception 'Ese medio de pago no está disponible'; end if;
  select n.id into v_neg from negocios n where n.slug = lower(coalesce(p_slug, ''));
  select * into ped from pedidos_tienda where negocio_id = v_neg and id = p_id for update;
  if not found or ped.estado <> 'pendiente' then raise exception 'No encontramos ese pedido o ya fue atendido'; end if;
  if ped.pago_estado = 'confirmado' then return jsonb_build_object('ok', true, 'pago_estado', 'confirmado'); end if;
  v_ref := nullif(left(regexp_replace(coalesce(p_referencia, ''), '[^A-Za-z0-9 -]', '', 'g'), 40), '');
  update pedidos_tienda set
         pago_medio = p_medio,
         pago_estado = case when p_aviso or pago_estado = 'avisado' then 'avisado' else 'por_pagar' end,
         pago_referencia = coalesce(v_ref, pago_referencia),
         pago_avisado_en = case when p_aviso then now() else pago_avisado_en end
   where negocio_id = v_neg and id = p_id returning pago_estado into v_ref;
  return jsonb_build_object('ok', true, 'pago_estado', v_ref);
end $$;
revoke all on function registrar_pago_digital(text, uuid, text, boolean, text) from public;
grant execute on function registrar_pago_digital(text, uuid, text, boolean, text) to anon, authenticated;

-- El personal de ESA tienda confirma que el dinero llegó (o que no llegó)
create or replace function confirmar_pago_pedido(p_negocio_id uuid, p_id uuid, p_recibido boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_est text;
begin
  if not es_personal(p_negocio_id) then raise exception 'No tienes permiso'; end if;
  update pedidos_tienda set pago_estado = case when p_recibido then 'confirmado' else 'no_recibido' end,
         pago_confirmado_en = case when p_recibido then now() else null end
   where negocio_id = p_negocio_id and id = p_id and pago_estado is not null returning pago_estado into v_est;
  if v_est is null then raise exception 'Ese pedido no tiene pago digital'; end if;
  return jsonb_build_object('ok', true, 'pago_estado', v_est);
end $$;
revoke all on function confirmar_pago_pedido(uuid, uuid, boolean) from public, anon;
grant execute on function confirmar_pago_pedido(uuid, uuid, boolean) to authenticated;

-- ---------- 5. Las 2 funciones públicas nuevas entran en la lista de verificar_aislamiento (se parchea la vigente) ----------
do $$
declare v text := pg_get_functiondef('verificar_aislamiento()'::regprocedure); n int;
begin
  if position('registrar_pago_digital' in v) = 0 then
    n := (regexp_match(v, 'ejecuta las (\d+) funciones'))[1]::int;
    v := replace(v, '''directorio_tiendas''', '''directorio_tiendas'',''datos_pago_digital'',''registrar_pago_digital''');
    v := replace(v, 'ejecuta las ' || n || ' funciones', 'ejecuta las ' || (n + 2) || ' funciones');
    if position('registrar_pago_digital' in v) = 0 then raise exception 'No se pudo actualizar verificar_aislamiento'; end if;
    execute v;
  end if;
end $$;

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 5 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'verificar_aislamiento: todo en orden' as chequeo, (select bool_and(ok) from verificar_aislamiento()) as ok
  union all select 2, 'la configuración de cada tienda tiene número y medios',
         (select count(*) = 3 from information_schema.columns where table_name = 'negocio_reglas' and column_name like 'pago\_digital\_%')
  union all select 3, 'el pedido guarda medio, estado y referencia del pago',
         (select count(*) = 5 from information_schema.columns where table_name = 'pedidos_tienda' and column_name like 'pago\_%')
  union all select 4, 'el cliente puede ver el número y avisar; solo el personal confirma',
         has_function_privilege('anon', 'datos_pago_digital(text)', 'execute') and has_function_privilege('anon', 'registrar_pago_digital(text,uuid,text,boolean,text)', 'execute')
         and not has_function_privilege('anon', 'confirmar_pago_pedido(uuid,uuid,boolean)', 'execute') and not has_function_privilege('anon', 'guardar_pago_digital(uuid,text,text[],text)', 'execute')
  union all select 5, 'ninguna tienda quedó con pagos digitales sin querer', not exists (select 1 from negocio_reglas where cardinality(pago_digital_medios) > 0)
) t order by n;
