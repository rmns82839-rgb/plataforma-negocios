-- ============================================================
-- 45 · Códigos internos para productos sin código de barras (frutas, verduras, pan…)
-- Se corre DESPUÉS del 44. Es aditivo e idempotente: se puede volver a correr.
--  · Son códigos EAN-13 que empiezan por 2 (prefijo reservado por el estándar para uso interno:
--    nunca chocan con un producto real) y llevan dígito verificador, así cualquier lector los entiende.
--  · Catálogo universal: «20» + número del producto (10 dígitos) + verificador. Es fijo: el mismo producto
--    siempre tiene el mismo código.
--  · Cada tienda: «21» + consecutivo propio (10 dígitos) + verificador, solo para sus productos sin código.
--  · Nunca cambia un código que ya existe.
-- ============================================================

-- Dígito verificador EAN-13 a partir de los 12 primeros dígitos
create or replace function ean13_digito(p_12 text)
returns int
language sql immutable
as $$
  select (10 - (sum(substr(p_12, i, 1)::int * case when i % 2 = 0 then 3 else 1 end) % 10)) % 10
    from generate_series(1, 12) i
   where p_12 ~ '^[0-9]{12}$'
$$;

-- ---------- Catálogo universal: asigna código interno a todo producto sin código ----------
create or replace function catalogo_admin_asignar_codigos(p_simular boolean default true)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_n int;
begin
  if not soy_administrador_plataforma() then raise exception 'Solo el administrador de la plataforma'; end if;
  select count(*) into v_n from catalogo_base where codigo is null and eliminado_en is null;
  if not coalesce(p_simular, true) then
    update catalogo_base b
       set codigo = '20' || lpad(b.id::text, 10, '0') || ean13_digito('20' || lpad(b.id::text, 10, '0'))::text,
           actualizado_en = now()
     where b.codigo is null and b.eliminado_en is null;
  end if;
  return jsonb_build_object('sin_codigo', v_n, 'aplicado', not coalesce(p_simular, true));
end;
$$;

-- ---------- Una tienda: códigos internos para sus productos sin código ----------
create or replace function generar_codigos_internos(p_negocio_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_base bigint; v_n int;
begin
  if not es_dueno(p_negocio_id) then raise exception 'Solo el dueño puede generar códigos'; end if;
  perform exigir_modulo(p_negocio_id, 'productos');
  select coalesce(max(substr(codigo, 3, 10)::bigint), 0) into v_base from productos where negocio_id = p_negocio_id and codigo ~ '^21[0-9]{11}$';
  with sin as (
    select id, row_number() over (order by nombre, id) as k from productos where negocio_id = p_negocio_id and activo and codigo is null
  ), nuevos as (
    update productos p
       set codigo = '21' || lpad((v_base + s.k)::text, 10, '0') || ean13_digito('21' || lpad((v_base + s.k)::text, 10, '0'))::text
      from sin s where p.negocio_id = p_negocio_id and p.id = s.id
    returning 1
  )
  select count(*) into v_n from nuevos;
  return jsonb_build_object('asignados', v_n);
end;
$$;

revoke all on function ean13_digito(text), catalogo_admin_asignar_codigos(boolean), generar_codigos_internos(uuid) from public, anon;
grant execute on function ean13_digito(text), catalogo_admin_asignar_codigos(boolean), generar_codigos_internos(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 5 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'verificar_aislamiento: todo en orden' as chequeo, (select bool_and(ok) from verificar_aislamiento()) as ok
  union all select 2, 'el dígito verificador funciona (4006381333931 → 1)', ean13_digito('400638133393') = 1
  union all select 3, 'las funciones de códigos son solo para quien inició sesión', not has_function_privilege('anon', 'generar_codigos_internos(uuid)', 'execute') and has_function_privilege('authenticated', 'catalogo_admin_asignar_codigos(boolean)', 'execute')
  union all select 4, 'las funciones de códigos tienen los permisos correctos', has_function_privilege('authenticated', 'generar_codigos_internos(uuid)', 'execute') and not has_function_privilege('anon', 'catalogo_admin_asignar_codigos(boolean)', 'execute')
  union all select 5, 'ningún código repetido en el catálogo', not exists (select codigo from catalogo_base where codigo is not null group by codigo having count(*) > 1)
) t order by n;
