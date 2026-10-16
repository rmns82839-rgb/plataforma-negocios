-- ============================================================
-- Plataforma multi-negocio — 05: almacenamiento de imágenes y canales en vivo
-- Rutas:  {negocio_id}/{carpeta}/archivo     carpetas: productos, prendas (personal) · marca, anuncios (dueño)
-- Canales: envivo:{negocio_id}  ·  pistola:{negocio_id}:{codigo}   (visitas:{slug} es público, sin política)
-- En la base se guarda la RUTA, nunca la URL completa.
-- ============================================================

-- negocio_id escrito en la ruta del archivo (null si la ruta no es válida)
create or replace function negocio_de_ruta(p_ruta text) returns uuid
language sql immutable as $$
  select case when split_part(p_ruta, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_ruta, '/', 1)::uuid end
$$;

-- negocio_id escrito en el tema del canal ('envivo:<uuid>' o 'pistola:<uuid>:<código>')
create or replace function negocio_de_tema(p_tema text) returns uuid
language sql immutable as $$
  select case when split_part(p_tema, ':', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_tema, ':', 2)::uuid end
$$;

-- Bucket único. Público para que las fotos del catálogo carguen por URL; solo se puede ESCRIBIR con permiso.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('negocios', 'negocios', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 3145728,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists negocios_leer   on storage.objects;
drop policy if exists negocios_subir  on storage.objects;
drop policy if exists negocios_cambiar on storage.objects;
drop policy if exists negocios_borrar on storage.objects;

create policy negocios_leer on storage.objects for select to authenticated
  using (bucket_id = 'negocios'
         and (negocio_de_ruta(name) in (select mis_negocios_personal())
              or negocio_de_ruta(name) in (select negocios_soporte())));

create policy negocios_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'negocios' and (
       (split_part(name, '/', 2) in ('productos', 'prendas') and negocio_de_ruta(name) in (select mis_negocios_personal()))
    or (split_part(name, '/', 2) in ('marca', 'anuncios')    and negocio_de_ruta(name) in (select mis_negocios_dueno()))));

create policy negocios_cambiar on storage.objects for update to authenticated
  using (bucket_id = 'negocios' and (
       (split_part(name, '/', 2) in ('productos', 'prendas') and negocio_de_ruta(name) in (select mis_negocios_personal()))
    or (split_part(name, '/', 2) in ('marca', 'anuncios')    and negocio_de_ruta(name) in (select mis_negocios_dueno()))))
  with check (bucket_id = 'negocios' and (
       (split_part(name, '/', 2) in ('productos', 'prendas') and negocio_de_ruta(name) in (select mis_negocios_personal()))
    or (split_part(name, '/', 2) in ('marca', 'anuncios')    and negocio_de_ruta(name) in (select mis_negocios_dueno()))));

create policy negocios_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'negocios' and (
       (split_part(name, '/', 2) in ('productos', 'prendas') and negocio_de_ruta(name) in (select mis_negocios_personal()))
    or (split_part(name, '/', 2) in ('marca', 'anuncios')    and negocio_de_ruta(name) in (select mis_negocios_dueno()))));

-- Canales privados del personal: el negocio escrito en el tema debe ser uno de los tuyos
drop policy if exists envivo_leer      on realtime.messages;
drop policy if exists envivo_escribir  on realtime.messages;
drop policy if exists pistola_leer     on realtime.messages;
drop policy if exists pistola_escribir on realtime.messages;

create policy envivo_leer on realtime.messages for select to authenticated
  using (realtime.topic() like 'envivo:%' and negocio_de_tema(realtime.topic()) in (select mis_negocios_personal()));
create policy envivo_escribir on realtime.messages for insert to authenticated
  with check (realtime.topic() like 'envivo:%' and negocio_de_tema(realtime.topic()) in (select mis_negocios_personal()));
create policy pistola_leer on realtime.messages for select to authenticated
  using (realtime.topic() like 'pistola:%' and negocio_de_tema(realtime.topic()) in (select mis_negocios_personal()));
create policy pistola_escribir on realtime.messages for insert to authenticated
  with check (realtime.topic() like 'pistola:%' and negocio_de_tema(realtime.topic()) in (select mis_negocios_personal()));
