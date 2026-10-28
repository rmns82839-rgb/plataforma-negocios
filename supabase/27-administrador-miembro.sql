-- ============================================================
-- Plataforma multi-negocio — 27: un administrador de la plataforma también puede ser miembro (dueño o cajero) de una tienda
-- Se corre DESPUÉS del 26. Es aditivo e idempotente: se puede volver a correr.
--
-- Por qué: quien administra la plataforma suele tener también su propia tienda (p. ej. la de pruebas).
-- Qué cambia: la regla «una cuenta de plataforma no puede ser miembro de un negocio» ahora vale solo para el nivel «soporte»
--             (solo lectura). El nivel «administrador» puede ser miembro. Todo lo demás sigue igual:
--             el administrador lee las demás tiendas como soporte (solo lectura) y escribe solo en las suyas.
-- ============================================================

create or replace function miembro_no_es_soporte() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from plataforma_admins where user_id = new.user_id and nivel = 'soporte') then
    raise exception 'Ese usuario es de soporte de la plataforma y no puede ser miembro de un negocio';
  end if;
  return new;
end;
$$;

-- _alta_negocio (SQL 26): el dueño de una tienda nueva tampoco puede ser de nivel «soporte» (el administrador sí)
do $$
declare v text := pg_get_functiondef('_alta_negocio(text, text, text, text, text)'::regprocedure);
begin
  if position('where user_id = v_dueno and nivel = ''soporte''' in v) = 0 then
    v := replace(v, 'where user_id = v_dueno)', 'where user_id = v_dueno and nivel = ''soporte'')');
    if position('where user_id = v_dueno and nivel = ''soporte''' in v) = 0 then raise exception 'No se pudo actualizar _alta_negocio'; end if;
    execute v;
  end if;
end $$;

revoke all on function _alta_negocio(text, text, text, text, text) from public, anon, authenticated;
notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 3 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'verificar_aislamiento: todo en orden' as chequeo, (select bool_and(ok) from verificar_aislamiento()) as ok
  union all select 2, 'El candado de miembros solo aplica al nivel soporte',
         position('nivel = ''soporte''' in pg_get_functiondef('miembro_no_es_soporte()'::regprocedure)) > 0
  union all select 3, 'El alta de tiendas solo rechaza como dueño al nivel soporte',
         position('nivel = ''soporte''' in pg_get_functiondef('_alta_negocio(text, text, text, text, text)'::regprocedure)) > 0
) t order by n;
