-- ============================================================
-- Plataforma multi-negocio — 35: el directorio entrega el teléfono y el enlace de mapa de cada tienda
-- Se corre DESPUÉS del 34. Idempotente. Los datos básicos (dirección, ciudad, teléfono) de una tienda abierta al público
-- ya los puso su dueño para que los clientes la encuentren; aquí solo se agregan a la tarjeta del directorio.
-- ============================================================
alter table directorio_externo add column if not exists telefono text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'directorio_externo_telefono_ck') then
    alter table directorio_externo add constraint directorio_externo_telefono_ck check (telefono is null or telefono ~ '^[0-9]{10}$');
  end if;
end $$;

do $$
declare v text := pg_get_functiondef('directorio_tiendas(numeric,numeric,text,text,text,boolean,integer)'::regprocedure);
begin
  if position('''telefono'', ' in v) = 0 then
    v := replace(v, '''lat'', c.lat, ''lng'', c.lng,', '''lat'', c.lat, ''lng'', c.lng, ''telefono'', coalesce(nullif(btrim(c.whatsapp), ''''), nullif(btrim(c.telefono), '''')), ''maps_url'', c.maps_url,');
    v := replace(v, '''lat'', x.lat, ''lng'', x.lng,', '''lat'', x.lat, ''lng'', x.lng, ''telefono'', x.telefono,');
    if position('c.maps_url' in v) = 0 or position('x.telefono' in v) = 0 then raise exception 'No se pudo actualizar directorio_tiendas'; end if;
    execute v;
  end if;
end $$;

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 2 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'la tarjeta lleva el teléfono de las tiendas de la plataforma' as chequeo, pg_get_functiondef('directorio_tiendas(numeric,numeric,text,text,text,boolean,integer)'::regprocedure) like '%c.maps_url%' as ok
  union all select 2, 'y el de las tiendas externas (Cibus)', pg_get_functiondef('directorio_tiendas(numeric,numeric,text,text,text,boolean,integer)'::regprocedure) like '%x.telefono%'
) t order by n;
