-- ============================================================
-- Plataforma multi-negocio — 36: precio de fundador que se mantiene
-- Se corre DESPUÉS del 35. Idempotente.
-- Los primeros clientes conservan su precio de lanzamiento mientras sigan con nosotros (meses_fundador = 0 significa «sin fecha de fin»).
-- ============================================================
update planes set meses_fundador = 0 where clave in ('gestion', 'completo') and precio_fundador is not null;

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: debe decir ok = true ----------
select 'Gestión y Completo mantienen su precio de fundador' as chequeo,
       (select count(*) = 2 from planes where clave in ('gestion', 'completo') and meses_fundador = 0 and precio_fundador is not null) as ok;
