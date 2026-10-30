-- ============================================================
-- Plataforma multi-negocio — 33: el plan «Tienda» deja de ofrecerse
-- Se corre DESPUÉS del 32. Idempotente. Los negocios que ya estén en ese plan lo conservan: solo deja de salir en /registro.
-- Se empieza ofreciendo Gestión (con precio de lanzamiento de $39.900), Completo y, aparte y discreto, la Vitrina gratis.
-- ============================================================
update planes set activo = false where clave = 'tienda';
-- el precio de lanzamiento de Gestión queda en 39.900 por 6 meses (por si alguien lo cambió)
update planes set precio_fundador = 39900 where clave = 'gestion';

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 3 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'el plan Tienda ya no se ofrece' as chequeo, exists (select 1 from planes where clave = 'tienda' and not activo) as ok
  union all select 2, 'Gestión sale a $39.900 de lanzamiento', exists (select 1 from planes where clave = 'gestion' and activo and precio_fundador = 39900)
  union all select 3, 'siguen disponibles Vitrina, Gestión y Completo', (select count(*) = 3 from planes where activo)
) t order by n;
