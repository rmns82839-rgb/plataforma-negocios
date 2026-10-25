-- ============================================================
-- 12 · Domicilio por km: redondeo AL MÁS CERCANO (como en Matriz)
-- Cambia lo que dejó el archivo 11 ("hacia arriba"). Aditivo: no toca los archivos 10 y 11.
--   · El paso de redondeo es de cada tienda: 0 (al peso), 500 o 1000. Por defecto 500.
--   · Se cobra la base + solo el exceso sobre los km incluidos, y luego se redondea al múltiplo más cercano.
--   · Idempotente: se puede correr más de una vez.
-- ============================================================

-- 1. Valor por defecto 500 para las tiendas nuevas; las existentes que nunca usaron km (0) pasan a 500 una sola vez
do $$
begin
  if coalesce((select column_default from information_schema.columns
                where table_schema = 'public' and table_name = 'negocio_reglas' and column_name = 'domicilio_redondeo'), '') <> '500' then
    alter table negocio_reglas alter column domicilio_redondeo set default 500;
    update negocio_reglas set domicilio_redondeo = 500 where domicilio_redondeo = 0 and domicilio_modo = 'fijo';
  end if;
end $$;

-- 2. El cálculo: costo = base + exceso × valor_km, redondeado al múltiplo más cercano del paso
create or replace function _costo_domicilio_km(p_negocio_id uuid, p_km numeric, p_subtotal numeric) returns numeric
language plpgsql stable security definer set search_path = public
as $$
declare r negocio_reglas%rowtype; v numeric;
begin
  select * into r from negocio_reglas where negocio_id = p_negocio_id;
  if p_km is null or p_km < 0 or p_km > 200 then raise exception 'La distancia no es válida'; end if;
  if r.domicilio_radio_max_km is not null and p_km > r.domicilio_radio_max_km then
    raise exception 'Tu dirección queda fuera de la zona de entrega (máximo % km)', r.domicilio_radio_max_km;
  end if;
  if coalesce(r.envio_gratis_desde, 0) > 0 and p_subtotal >= r.envio_gratis_desde then return 0; end if;
  v := coalesce(r.domicilio_costo, 0) + greatest(p_km - r.domicilio_km_incluidos, 0) * r.domicilio_valor_km;
  if r.domicilio_redondeo > 0 then v := round(v / r.domicilio_redondeo) * r.domicilio_redondeo; end if;
  return round(v);
end;
$$;
revoke all on function _costo_domicilio_km(uuid, numeric, numeric) from public, anon, authenticated;

-- 3. Verificación (debe dar 3 filas en true)
select 'El redondeo por defecto de las tiendas nuevas es 500' as chequeo,
       (select column_default = '500' from information_schema.columns
         where table_schema = 'public' and table_name = 'negocio_reglas' and column_name = 'domicilio_redondeo') as ok
union all
select 'Ninguna tienda en modo fijo quedó con redondeo 0',
       not exists (select 1 from negocio_reglas where domicilio_modo = 'fijo' and domicilio_redondeo = 0)
union all
select 'Nadie (anon/authenticated) ejecuta el cálculo interno',
       not has_function_privilege('anon', '_costo_domicilio_km(uuid,numeric,numeric)', 'execute')
       and not has_function_privilege('authenticated', '_costo_domicilio_km(uuid,numeric,numeric)', 'execute');
