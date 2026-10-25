-- ============================================================
-- 13 · Tienda DEMO publicada, para probar la tienda pública (/t/demo)
-- ANTES DE CORRER: cambia las 2 líneas marcadas con  <<< CAMBIAR  (tu correo del usuario de prueba y tu WhatsApp).
-- Se puede correr varias veces: no duplica nada.
-- ============================================================
do $$
declare
  v_correo   text := 'CORREO_DEL_USUARIO_DE_PRUEBA@gmail.com';   -- <<< CAMBIAR (el usuario que creaste en Authentication → Users)
  v_whatsapp text := '3000000000';                               -- <<< CAMBIAR (tu celular, 10 dígitos: ahí llegarán los pedidos de prueba)
  v_id uuid;
begin
  select id into v_id from negocios where slug = 'demo';
  if v_id is null then
    v_id := (crear_negocio('demo', 'Tienda Demo', 'tienda', v_correo, 'completo') ->> 'id')::uuid;
  else
    perform activar_plan(v_id, 'completo');
  end if;

  update negocio_config set whatsapp = v_whatsapp, eslogan = 'Prueba de la plataforma', horario = 'Lun a sáb 7am–8pm',
         direccion = 'Calle 5 # 6-7', ciudad = 'Puerto Colombia'
   where negocio_id = v_id;
  update negocio_reglas set domicilio_costo = 4000, envio_gratis_desde = 50000, zona_domicilio = 'Todo Puerto Colombia'
   where negocio_id = v_id;

  if not exists (select 1 from productos where negocio_id = v_id) then
    insert into productos (negocio_id, codigo, nombre, descripcion, categoria, precio_compra, precio_venta, stock, publicado) values
      (v_id, '1001', 'Arroz Diana 500 g', null, 'Granos', 1800, 2500, 40, true),
      (v_id, '1002', 'Aceite de girasol 1 litro', 'Para cocinar y freír', 'Despensa', 9000, 12000, 25, true),
      (v_id, '1003', 'Panela cuadrada', null, 'Despensa', 2200, 3000, 60, true),
      (v_id, '1004', 'Leche entera bolsa 1.100 ml', null, 'Lácteos', 3800, 5200, 30, true),
      (v_id, '1005', 'Huevos AA x30', null, 'Lácteos', 14000, 19500, 0, true);   -- este sale "Agotado" a propósito
  end if;
  if not exists (select 1 from promociones where negocio_id = v_id) then
    insert into promociones (negocio_id, nombre, tipo, categoria, valor) values (v_id, '10% en granos', 'porcentaje', 'Granos', 10);
  end if;
  if not exists (select 1 from ofertas where negocio_id = v_id) then
    insert into ofertas (negocio_id, titulo, detalle, etiqueta) values (v_id, 'Semana del arroz', '10% menos en granos', 'Oferta');
  end if;

  perform publicar_negocio(v_id, true);
end $$;

-- Verificación (debe dar 5 filas en true)
select 'La tienda demo existe y está publicada' as chequeo,
       exists (select 1 from negocios where slug = 'demo' and publicada) as ok
union all select 'Tiene 5 productos', (select count(*) = 5 from productos p join negocios n on n.id = p.negocio_id where n.slug = 'demo')
union all select 'Tiene WhatsApp', exists (select 1 from negocio_config c join negocios n on n.id = c.negocio_id where n.slug = 'demo' and length(c.whatsapp) >= 10)
union all select 'Tiene dueño o invitación pendiente',
       exists (select 1 from negocio_miembros m join negocios n on n.id = m.negocio_id where n.slug = 'demo' and m.rol = 'dueno')
       or exists (select 1 from invitaciones i join negocios n on n.id = i.negocio_id where n.slug = 'demo')
union all select 'El público ya la ve (negocio_publico)', negocio_publico('demo') is not null;
