-- ============================================================
-- Plataforma multi-negocio — 34: el directorio entrega la ubicación de cada tienda (para el mapa de /tiendas)
-- Se corre DESPUÉS del 33. Idempotente. Solo agrega los campos lat y lng a la respuesta de directorio_tiendas
-- (la dirección y el punto de una tienda abierta al público ya son públicos). No toca ninguna tabla.
-- ============================================================
do $$
declare v text := pg_get_functiondef('directorio_tiendas(numeric,numeric,text,text,text,boolean,integer)'::regprocedure);
begin
  if position('''lat'', c.lat' in v) = 0 then
    v := replace(v, '''ciudad'', c.ciudad, ''direccion'', c.direccion,', '''ciudad'', c.ciudad, ''direccion'', c.direccion, ''lat'', c.lat, ''lng'', c.lng,');
    v := replace(v, '''ciudad'', x.ciudad, ''direccion'', x.direccion,', '''ciudad'', x.ciudad, ''direccion'', x.direccion, ''lat'', x.lat, ''lng'', x.lng,');
    if position('''lat'', c.lat' in v) = 0 or position('''lat'', x.lat' in v) = 0 then raise exception 'No se pudo actualizar directorio_tiendas'; end if;
    execute v;
  end if;
end $$;

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 2 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'el directorio entrega lat y lng de las tiendas de la plataforma' as chequeo, pg_get_functiondef('directorio_tiendas(numeric,numeric,text,text,text,boolean,integer)'::regprocedure) like '%''lat'', c.lat%' as ok
  union all select 2, 'y de las tiendas externas (Cibus)', pg_get_functiondef('directorio_tiendas(numeric,numeric,text,text,text,boolean,integer)'::regprocedure) like '%''lat'', x.lat%'
) t order by n;
