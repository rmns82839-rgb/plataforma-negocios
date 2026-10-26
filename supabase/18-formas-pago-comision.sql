-- =====================================================================
-- 18. C6a: comisión por forma de pago
--     Antes solo el datáfono cobraba comisión (un % general de la tienda). Ahora cada forma de pago
--     (Nequi, Daviplata, datáfono, la que el dueño agregue…) tiene su propio % y se descuenta de la ganancia.
--     Es aditivo e idempotente: se puede correr dos veces.
-- =====================================================================

alter table formas_pago add column if not exists comision numeric not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'formas_pago'::regclass and conname = 'formas_pago_comision_rango') then
    alter table formas_pago add constraint formas_pago_comision_rango check (comision >= 0 and comision <= 20);
  end if;
end $$;

-- Las ventas ahora toman la comisión de la forma de pago (y no solo del datáfono).
do $$
declare
  v_firma text;
  v_def   text;
  v_viejo constant text := 'case when forma.tipo = ''datafono'' then round(v_monto * v_neg.comision_datafono / 100) else 0 end';
begin
  foreach v_firma in array array[
    'registrar_venta(uuid,jsonb,jsonb,uuid,text,date,numeric,jsonb)',
    'registrar_venta_ropa(uuid,jsonb,jsonb,uuid,text,numeric,uuid,date,jsonb)'] loop
    v_def := pg_get_functiondef(v_firma::regprocedure);
    if position('forma.comision' in v_def) = 0 then
      if position(v_viejo in v_def) = 0 then raise exception 'No se pudo actualizar %', v_firma; end if;
      execute replace(v_def, v_viejo, 'round(v_monto * forma.comision / 100)');
    end if;
  end loop;

  -- La comisión del datáfono que ya tenían las tiendas pasa a la forma "datáfono" (solo la primera vez)
  update formas_pago fp set comision = nr.comision_datafono
    from negocio_reglas nr
   where nr.negocio_id = fp.negocio_id and fp.tipo = 'datafono' and fp.comision = 0 and nr.comision_datafono > 0;
end $$;

notify pgrst, 'reload schema';

-- Verificación: debe dar 4 filas en true
select 'formas_pago tiene la columna comision' as chequeo,
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'formas_pago' and column_name = 'comision') as ok
union all
select 'La comisión solo puede estar entre 0 y 20 %',
       exists (select 1 from pg_constraint where conrelid = 'formas_pago'::regclass and conname = 'formas_pago_comision_rango')
union all
select 'registrar_venta cobra la comisión de cada forma de pago',
       position('forma.comision' in pg_get_functiondef('registrar_venta(uuid,jsonb,jsonb,uuid,text,date,numeric,jsonb)'::regprocedure)) > 0
union all
select 'registrar_venta_ropa también',
       position('forma.comision' in pg_get_functiondef('registrar_venta_ropa(uuid,jsonb,jsonb,uuid,text,numeric,uuid,date,jsonb)'::regprocedure)) > 0;
