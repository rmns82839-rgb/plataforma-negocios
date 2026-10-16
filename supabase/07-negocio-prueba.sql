-- ============================================================
-- Plataforma multi-negocio — 07: negocio de prueba (opcional)
-- Antes: crea el usuario dueño en Authentication → Users (Add user → Create new user).
-- Cambia el correo de abajo por ese usuario y corre este archivo en el SQL Editor.
-- ============================================================
do $$
declare r jsonb; v_id uuid;
begin
  r := crear_negocio('demo', 'Negocio Demo', 'tienda', 'CORREO_DUENO@gmail.com');
  v_id := (r->>'id')::uuid;

  insert into productos (negocio_id, codigo, nombre, categoria, precio_compra, precio_venta, stock, publicado) values
    (v_id, '1001', 'Arroz 500 g',   'Granos',   1800, 2500, 40, true),
    (v_id, '1002', 'Aceite 1 L',    'Despensa', 9000, 12000, 25, true),
    (v_id, '1003', 'Panela unidad', 'Despensa', 2200, 3000, 60, true);
  insert into clientes (negocio_id, nombre, telefono) values (v_id, 'Cliente de prueba', '3000000000');

  raise notice 'Negocio de prueba creado: %', r;
end $$;
