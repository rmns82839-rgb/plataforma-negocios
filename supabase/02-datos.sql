-- ============================================================
-- Plataforma multi-negocio — 02: tablas de datos del negocio
-- Todas llevan negocio_id. Las relaciones son COMPUESTAS (negocio_id, id):
-- una fila de un negocio no puede apuntar a una fila de otro, ni por error ni a propósito.
-- Requiere PostgreSQL 15 o superior (on delete set null (columna)).
-- ============================================================

-- ---------- Auditoría y accesos ----------
create table auditoria (
  id         bigint generated always as identity primary key,
  negocio_id uuid not null references negocios(id),
  fecha      timestamptz not null default now(),
  usuario    uuid,
  correo     text,
  tabla      text not null,
  accion     text not null,
  registro   text,
  antes      jsonb,
  despues    jsonb
);
create index auditoria_neg_fecha_idx on auditoria (negocio_id, fecha desc);

create table accesos (
  id         bigint generated always as identity primary key,
  negocio_id uuid not null references negocios(id),
  fecha      timestamptz not null default now(),
  usuario    uuid,
  correo     text,
  rol        text,
  evento     text not null default 'entrada',
  detalle    text,
  visto      boolean not null default false   -- el dueño marca como visto el aviso de entrada de soporte
);
create index accesos_neg_fecha_idx on accesos (negocio_id, fecha desc);
create index accesos_neg_rol_idx   on accesos (negocio_id, rol, fecha desc);

-- ---------- Productos (tienda y repuestos) ----------
create table productos (
  id              uuid not null default gen_random_uuid(),
  negocio_id      uuid not null references negocios(id),
  codigo          text,
  nombre          text not null,
  categoria       text,
  precio_compra   numeric not null default 0,
  precio_venta    numeric not null default 0,
  stock           numeric not null default 0,
  stock_minimo    numeric not null default 0,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  fecha_vencimiento date,
  unidad          text not null default 'und',
  publicado       boolean not null default false,
  descripcion     text,
  imagenes        text[] not null default '{}',     -- rutas dentro del bucket, no URLs
  precio_minimo   numeric check (precio_minimo is null or precio_minimo >= 0),
  precio_mayor    numeric check (precio_mayor is null or precio_mayor > 0),
  cantidad_mayor  numeric check (cantidad_mayor is null or cantidad_mayor > 0),
  es_kit          boolean not null default false,
  primary key (negocio_id, id),
  unique (negocio_id, codigo)
);
create index productos_neg_nombre_idx on productos (negocio_id, nombre);
create index productos_neg_pub_idx on productos (negocio_id) where activo and publicado;

create table producto_componentes (
  negocio_id    uuid not null references negocios(id),
  kit_id        uuid not null,
  componente_id uuid not null,
  cantidad      numeric(12,3) not null check (cantidad > 0),
  primary key (negocio_id, kit_id, componente_id),
  check (kit_id <> componente_id),
  foreign key (negocio_id, kit_id)        references productos (negocio_id, id) on delete cascade,
  foreign key (negocio_id, componente_id) references productos (negocio_id, id) on delete restrict
);

create table ajustes_inventario (
  id             uuid not null default gen_random_uuid(),
  negocio_id     uuid not null references negocios(id),
  producto_id    uuid not null,
  stock_anterior numeric not null,
  stock_nuevo    numeric not null,
  motivo         text,
  fecha          timestamptz not null default now(),
  primary key (negocio_id, id),
  foreign key (negocio_id, producto_id) references productos (negocio_id, id)
);
create index ajustes_neg_producto_idx on ajustes_inventario (negocio_id, producto_id, fecha desc);

-- ---------- Clientes ----------
create table clientes (
  id               uuid not null default gen_random_uuid(),
  negocio_id       uuid not null references negocios(id),
  nombre           text not null,
  telefono         text,
  creado_en        timestamptz not null default now(),
  dias_credito     integer not null default 0,
  cupo_credito     numeric not null default 0,
  tipo_documento   text check (tipo_documento is null or tipo_documento in ('CC','CE','NIT','TI','PP','OTRO')),
  documento        text,
  email            text,
  direccion        text,
  tipo_cliente     text not null default 'normal' check (tipo_cliente in ('normal','mayorista')),
  mora_cobrada_hasta date,
  acepta_datos_en  timestamptz,
  acepta_promos    boolean not null default false,
  acepta_promos_en timestamptz,
  origen           text,
  politica_version text,
  primary key (negocio_id, id)
);
create unique index clientes_documento_uni on clientes (negocio_id, coalesce(tipo_documento, ''), documento) where documento is not null;
create index clientes_tel_digitos_idx on clientes (negocio_id, regexp_replace(coalesce(telefono, ''), '\D', '', 'g'));

-- ---------- Ventas ----------
create table ventas (
  id                uuid not null default gen_random_uuid(),
  negocio_id        uuid not null references negocios(id),
  fecha             timestamptz not null default now(),
  total             numeric not null default 0,
  metodo            text not null check (metodo ~ '^[a-z0-9_]{2,30}$'),
  cliente_id        uuid,
  nota              text,
  anulada           boolean not null default false,
  anulada_en        timestamptz,
  motivo_anulacion  text,
  numero            bigint not null,                       -- lo asigna el trigger asignar_numero (por negocio)
  descuento         numeric not null default 0 check (descuento >= 0),
  recibido          numeric,
  anulada_por       text,
  domicilio         boolean not null default false,
  dom_direccion     text,
  dom_telefono      text,
  dom_costo         numeric not null default 0 check (dom_costo >= 0),
  dom_estado        text check (dom_estado in ('pendiente','en_camino','entregado','cancelado')),
  dom_entregado_en  timestamptz,
  primary key (negocio_id, id),
  unique (negocio_id, numero),
  foreign key (negocio_id, cliente_id) references clientes (negocio_id, id)
);
create index ventas_neg_fecha_idx on ventas (negocio_id, fecha desc);
create index ventas_neg_dom_idx on ventas (negocio_id, dom_estado) where domicilio;

create table venta_items (
  id                 uuid not null default gen_random_uuid(),
  negocio_id         uuid not null references negocios(id),
  venta_id           uuid not null,
  producto_id        uuid,
  nombre             text not null,
  cantidad           numeric not null,
  precio_unitario    numeric not null,
  costo_unitario     numeric not null default 0,
  precio_lista       numeric,
  descuento_linea    numeric not null default 0 check (descuento_linea >= 0),
  promo              text,
  prenda_variante_id uuid,
  primary key (negocio_id, id),
  foreign key (negocio_id, venta_id)    references ventas (negocio_id, id) on delete cascade,
  foreign key (negocio_id, producto_id) references productos (negocio_id, id)
);
create index venta_items_neg_venta_idx on venta_items (negocio_id, venta_id);
create index venta_items_neg_prod_idx  on venta_items (negocio_id, producto_id);

create table venta_pagos (
  id         uuid not null default gen_random_uuid(),
  negocio_id uuid not null references negocios(id),
  venta_id   uuid not null,
  metodo     text not null check (metodo ~ '^[a-z0-9_]{2,30}$'),
  monto      numeric not null check (monto > 0),
  recibido   numeric,
  comision   numeric not null default 0 check (comision >= 0),
  primary key (negocio_id, id),
  foreign key (negocio_id, venta_id) references ventas (negocio_id, id) on delete cascade
);
create index venta_pagos_neg_venta_idx on venta_pagos (negocio_id, venta_id);

create table venta_consumos (
  id          uuid not null default gen_random_uuid(),
  negocio_id  uuid not null references negocios(id),
  venta_id    uuid not null,
  producto_id uuid not null,
  cantidad    numeric not null,
  primary key (negocio_id, id),
  foreign key (negocio_id, venta_id)    references ventas (negocio_id, id) on delete cascade,
  foreign key (negocio_id, producto_id) references productos (negocio_id, id)
);
create index venta_consumos_neg_venta_idx on venta_consumos (negocio_id, venta_id);

-- ---------- Fiados ----------
create table fiado_movimientos (
  id           uuid not null default gen_random_uuid(),
  negocio_id   uuid not null references negocios(id),
  cliente_id   uuid not null,
  tipo         text not null check (tipo in ('cargo','abono')),
  monto        numeric not null check (monto > 0),
  venta_id     uuid,
  nota         text,
  fecha        timestamptz not null default now(),
  metodo       text not null default 'efectivo' check (metodo in ('efectivo','transferencia','nequi','daviplata','datafono')),
  fecha_limite date,
  primary key (negocio_id, id),
  foreign key (negocio_id, cliente_id) references clientes (negocio_id, id) on delete cascade,
  foreign key (negocio_id, venta_id)   references ventas (negocio_id, id)
);
create index fiado_neg_cliente_idx on fiado_movimientos (negocio_id, cliente_id, fecha desc);

-- ---------- Formas de pago ----------
create table formas_pago (
  negocio_id uuid not null references negocios(id),
  id         text not null check (id ~ '^[a-z0-9_]{2,30}$'),
  nombre     text not null check (char_length(nombre) between 1 and 30),
  tipo       text not null default 'digital' check (tipo in ('efectivo','digital','datafono','fiado')),
  activa     boolean not null default true,
  orden      integer not null default 100,
  primary key (negocio_id, id),
  check (id <> 'efectivo' or activa)
);

-- ---------- Compras, lotes y gastos ----------
create table compras (
  id         uuid not null default gen_random_uuid(),
  negocio_id uuid not null references negocios(id),
  fecha      timestamptz not null default now(),
  proveedor  text,
  total      numeric not null default 0,
  nota       text,
  primary key (negocio_id, id)
);
create index compras_neg_fecha_idx on compras (negocio_id, fecha desc);

create table compra_items (
  id             uuid not null default gen_random_uuid(),
  negocio_id     uuid not null references negocios(id),
  compra_id      uuid not null,
  producto_id    uuid,
  nombre         text not null,
  cantidad       numeric not null check (cantidad > 0),
  costo_unitario numeric not null default 0,
  primary key (negocio_id, id),
  foreign key (negocio_id, compra_id)   references compras (negocio_id, id) on delete cascade,
  foreign key (negocio_id, producto_id) references productos (negocio_id, id)
);
create index compra_items_neg_compra_idx on compra_items (negocio_id, compra_id);

create table lotes (
  id                uuid not null default gen_random_uuid(),
  negocio_id        uuid not null references negocios(id),
  producto_id       uuid not null,
  compra_id         uuid,
  numero            text,
  fecha_vencimiento date,
  cantidad          numeric not null check (cantidad > 0),
  costo_unitario    numeric not null default 0,
  fecha             timestamptz not null default now(),
  primary key (negocio_id, id),
  foreign key (negocio_id, producto_id) references productos (negocio_id, id) on delete cascade,
  foreign key (negocio_id, compra_id)   references compras (negocio_id, id) on delete set null (compra_id)
);
create index lotes_neg_producto_idx on lotes (negocio_id, producto_id, fecha desc);

create table gastos (
  id          uuid not null default gen_random_uuid(),
  negocio_id  uuid not null references negocios(id),
  fecha       timestamptz not null default now(),
  tipo        text not null default 'otros',
  descripcion text,
  monto       numeric not null check (monto > 0),
  primary key (negocio_id, id)
);
create index gastos_neg_fecha_idx on gastos (negocio_id, fecha desc);

-- ---------- Ropa ----------
create table prendas (
  id          uuid not null default gen_random_uuid(),
  negocio_id  uuid not null references negocios(id),
  nombre      text not null,
  descripcion text,
  categoria   text,
  precio      numeric not null default 0,
  imagen_url  text,                                  -- ruta dentro del bucket (nombre histórico de la columna)
  imagenes    text[] not null default '{}',
  activo      boolean not null default true,
  creado_en   timestamptz not null default now(),
  genero      text not null default 'unisex' check (genero in ('mujer','hombre','ninos','unisex')),
  costo       numeric not null default 0 check (costo >= 0),
  primary key (negocio_id, id)
);

create table prenda_variantes (
  id         uuid not null default gen_random_uuid(),
  negocio_id uuid not null references negocios(id),
  prenda_id  uuid not null,
  talla      text not null,
  color      text not null default '',
  stock      integer not null default 0,
  primary key (negocio_id, id),
  foreign key (negocio_id, prenda_id) references prendas (negocio_id, id) on delete cascade
);
create index prenda_variantes_neg_prenda_idx on prenda_variantes (negocio_id, prenda_id);

-- venta_items.prenda_variante_id apunta a una variante del mismo negocio
alter table venta_items
  add foreign key (negocio_id, prenda_variante_id) references prenda_variantes (negocio_id, id)
  on delete set null (prenda_variante_id);
create index venta_items_neg_variante_idx on venta_items (negocio_id, prenda_variante_id) where prenda_variante_id is not null;

-- ---------- Pedidos en línea ----------
create table pedidos_ropa (
  id         uuid not null default gen_random_uuid(),
  negocio_id uuid not null references negocios(id),
  numero     bigint not null,
  creado_en  timestamptz not null default now(),
  nombre     text,
  telefono   text,
  total      numeric not null default 0,
  estado     text not null default 'pendiente' check (estado in ('pendiente','vendido','cancelado')),
  venta_id   uuid,
  cliente_id uuid,
  direccion  text,
  email      text,
  nota       text,
  domicilio  numeric not null default 0,
  entrega    text not null default 'domicilio' check (entrega in ('domicilio','recoger')),
  primary key (negocio_id, id),
  unique (negocio_id, numero),
  foreign key (negocio_id, venta_id)   references ventas (negocio_id, id)   on delete set null (venta_id),
  foreign key (negocio_id, cliente_id) references clientes (negocio_id, id) on delete set null (cliente_id)
);
create index pedidos_ropa_neg_estado_idx on pedidos_ropa (negocio_id, estado, creado_en desc);

create table pedido_ropa_items (
  id              uuid not null default gen_random_uuid(),
  negocio_id      uuid not null references negocios(id),
  pedido_id       uuid not null,
  prenda_id       uuid,
  variante_id     uuid,
  nombre          text not null,
  talla           text not null,
  color           text not null default '',
  cantidad        integer not null check (cantidad > 0),
  precio_unitario numeric not null,
  descuento       numeric not null default 0,
  promo           text,
  primary key (negocio_id, id),
  foreign key (negocio_id, pedido_id)   references pedidos_ropa (negocio_id, id) on delete cascade,
  foreign key (negocio_id, prenda_id)   references prendas (negocio_id, id)           on delete set null (prenda_id),
  foreign key (negocio_id, variante_id) references prenda_variantes (negocio_id, id) on delete set null (variante_id)
);
create index pedido_ropa_items_neg_idx on pedido_ropa_items (negocio_id, pedido_id);

create table pedidos_tienda (
  id         uuid not null default gen_random_uuid(),
  negocio_id uuid not null references negocios(id),
  numero     bigint not null,
  creado_en  timestamptz not null default now(),
  cliente_id uuid,
  nombre     text,
  telefono   text,
  direccion  text,
  email      text,
  nota       text,
  total      numeric not null default 0,
  estado     text not null default 'pendiente' check (estado in ('pendiente','atendido','cancelado')),
  domicilio  numeric not null default 0,
  entrega    text not null default 'domicilio' check (entrega in ('domicilio','recoger')),
  venta_id   uuid,
  primary key (negocio_id, id),
  unique (negocio_id, numero),
  foreign key (negocio_id, venta_id)   references ventas (negocio_id, id)   on delete set null (venta_id),
  foreign key (negocio_id, cliente_id) references clientes (negocio_id, id) on delete set null (cliente_id)
);
create index pedidos_tienda_neg_estado_idx on pedidos_tienda (negocio_id, estado, creado_en desc);
create index pedidos_tienda_neg_venta_idx  on pedidos_tienda (negocio_id, venta_id);

create table pedido_tienda_items (
  id              uuid not null default gen_random_uuid(),
  negocio_id      uuid not null references negocios(id),
  pedido_id       uuid not null,
  producto_id     uuid,
  nombre          text not null,
  unidad          text,
  cantidad        numeric not null check (cantidad > 0),
  precio_unitario numeric not null,
  descuento       numeric not null default 0,
  promo           text,
  primary key (negocio_id, id),
  foreign key (negocio_id, pedido_id)   references pedidos_tienda (negocio_id, id) on delete cascade,
  foreign key (negocio_id, producto_id) references productos (negocio_id, id)      on delete set null (producto_id)
);
create index pedido_tienda_items_neg_idx on pedido_tienda_items (negocio_id, pedido_id);

-- ---------- Publicidad ----------
create table promociones (
  id             uuid not null default gen_random_uuid(),
  negocio_id     uuid not null references negocios(id),
  nombre         text not null check (char_length(trim(nombre)) between 2 and 60),
  tipo           text not null check (tipo in ('porcentaje','nxm','precio')),
  producto_id    uuid,
  categoria      text,
  valor          numeric,
  lleva          integer,
  paga           integer,
  desde          date not null default current_date,
  hasta          date,
  activa         boolean not null default true,
  creado_en      timestamptz not null default now(),
  prenda_id      uuid,
  categoria_ropa text,
  genero         text check (genero is null or genero in ('mujer','hombre','ninos','unisex')),
  primary key (negocio_id, id),
  check (tipo <> 'porcentaje' or (valor is not null and valor between 1 and 90)),
  check (tipo <> 'precio'     or (valor is not null and valor > 0)),
  check (tipo <> 'nxm'        or (lleva is not null and paga is not null and paga >= 1 and lleva > paga)),
  check (hasta is null or hasta >= desde),
  constraint promo_objetivo_check check (
    (producto_id is not null)::int + (categoria is not null)::int + (prenda_id is not null)::int
    + (categoria_ropa is not null)::int + (genero is not null)::int = 1),
  foreign key (negocio_id, producto_id) references productos (negocio_id, id) on delete cascade,
  foreign key (negocio_id, prenda_id)   references prendas (negocio_id, id)   on delete cascade
);

-- Descuento de una promoción sobre una línea (pura: no consulta tablas; igual que en Matriz)
create or replace function promo_descuento(p promociones, p_precio numeric, p_cant numeric)
returns numeric
language sql immutable as $$
  select greatest(0, least(
    case p.tipo
      when 'porcentaje' then round(p_precio * p_cant * p.valor / 100)
      when 'precio'     then case when p_precio > p.valor then round((p_precio - p.valor) * p_cant) else 0 end
      when 'nxm'        then round(floor(p_cant / p.lleva) * (p.lleva - p.paga) * p_precio)
      else 0
    end,
    round(p_precio * p_cant) - 1))
$$;

create table ofertas (
  id         uuid not null default gen_random_uuid(),
  negocio_id uuid not null references negocios(id),
  catalogo   text not null default 'ambos' check (catalogo in ('tienda','ropa','ambos')),
  titulo     text not null check (char_length(titulo) between 1 and 80),
  detalle    text check (detalle is null or char_length(detalle) <= 400),
  etiqueta   text check (etiqueta is null or char_length(etiqueta) <= 20),
  imagen     text,
  desde      date,
  hasta      date,
  activa     boolean not null default true,
  creado_en  timestamptz not null default now(),
  primary key (negocio_id, id),
  check (desde is null or hasta is null or desde <= hasta),
  constraint ofertas_imagen_check check (imagen is null or imagen like negocio_id::text || '/anuncios/%')
);

create table anuncios (
  id           uuid not null default gen_random_uuid(),
  negocio_id   uuid not null references negocios(id),
  catalogo     text not null default 'tienda' check (catalogo in ('tienda','ropa','ambos')),
  titulo       text not null check (char_length(titulo) between 1 and 80),
  texto        text check (texto is null or char_length(texto) <= 300),
  imagen       text,
  boton_texto  text check (boton_texto is null or char_length(boton_texto) <= 30),
  boton_enlace text check (boton_enlace is null or (char_length(boton_enlace) <= 500 and boton_enlace ~* '^https?://')),
  frecuencia   text not null default 'dia' check (frecuencia in ('sesion','dia')),
  desde        date,
  hasta        date,
  activa       boolean not null default true,
  creado_en    timestamptz not null default now(),
  segundos     integer default 10 check (segundos is null or segundos between 3 and 60),
  primary key (negocio_id, id),
  check (desde is null or hasta is null or desde <= hasta),
  constraint anuncios_imagen_check check (imagen is null or imagen like negocio_id::text || '/anuncios/%')
);

-- ---------- Préstamos ----------
create table prestamos (
  id            uuid not null default gen_random_uuid(),
  negocio_id    uuid not null references negocios(id),
  cliente_id    uuid not null,
  fecha_inicio  date not null default current_date,
  monto         numeric not null check (monto > 0),
  tasa_mensual  numeric not null check (tasa_mensual >= 0),
  frecuencia    text not null check (frecuencia in ('semanal','quincenal','mensual')),
  num_cuotas    integer not null check (num_cuotas between 1 and 120),
  interes_total numeric not null,
  total_a_pagar numeric not null,
  estado        text not null default 'activo' check (estado in ('activo','pagado','cancelado')),
  nota          text,
  creado_en     timestamptz not null default now(),
  primary key (negocio_id, id),
  foreign key (negocio_id, cliente_id) references clientes (negocio_id, id)
);
create index prestamos_neg_cliente_idx on prestamos (negocio_id, cliente_id);

create table prestamo_cuotas (
  id           uuid not null default gen_random_uuid(),
  negocio_id   uuid not null references negocios(id),
  prestamo_id  uuid not null,
  numero       integer not null,
  fecha_limite date not null,
  capital      numeric not null,
  interes      numeric not null,
  valor        numeric not null,
  pagado       numeric not null default 0,
  primary key (negocio_id, id),
  unique (negocio_id, prestamo_id, numero),
  foreign key (negocio_id, prestamo_id) references prestamos (negocio_id, id) on delete cascade
);

create table prestamo_pagos (
  id          uuid not null default gen_random_uuid(),
  negocio_id  uuid not null references negocios(id),
  prestamo_id uuid not null,
  monto       numeric not null check (monto > 0),
  metodo      text not null default 'efectivo' check (metodo in ('efectivo','transferencia','nequi','daviplata','datafono')),
  fecha       timestamptz not null default now(),
  nota        text,
  primary key (negocio_id, id),
  foreign key (negocio_id, prestamo_id) references prestamos (negocio_id, id) on delete cascade
);
create index prestamo_pagos_neg_idx on prestamo_pagos (negocio_id, prestamo_id, fecha desc);

-- ---------- Visitas a los catálogos públicos ----------
create table visitas (
  negocio_id uuid not null references negocios(id),
  dia        date not null,
  catalogo   text not null check (catalogo in ('tienda','ropa')),
  visitante  text not null check (char_length(visitante) between 8 and 64),
  primary key (negocio_id, dia, catalogo, visitante)
);

-- ---------- Vistas internas (corren con los permisos de quien consulta: respetan RLS) ----------
create view clientes_saldo with (security_invoker = true) as
select c.*,
       coalesce(s.saldo, 0) as saldo,
       d.deuda_desde,
       d.vence_el
  from clientes c
  left join (select negocio_id, cliente_id,
                    sum(case tipo when 'cargo' then monto else -monto end) as saldo
               from fiado_movimientos group by negocio_id, cliente_id) s
         on s.negocio_id = c.negocio_id and s.cliente_id = c.id
  left join lateral (
    select min(k.fecha) as deuda_desde,
           min(coalesce(k.fecha_limite,
                        case when c.dias_credito > 0 then (k.fecha + c.dias_credito * interval '1 day')::date end)) as vence_el
      from (select fecha, fecha_limite,
                   sum(monto) over (order by fecha, id) as acumulado
              from fiado_movimientos
             where negocio_id = c.negocio_id and cliente_id = c.id and tipo = 'cargo') k
     where k.acumulado > coalesce((select sum(monto) from fiado_movimientos
                                    where negocio_id = c.negocio_id and cliente_id = c.id and tipo = 'abono'), 0)
  ) d on true;

create view clientes_mora with (security_invoker = true) as
with ab as (
  select negocio_id, cliente_id, coalesce(sum(monto), 0) as abonos
    from fiado_movimientos where tipo = 'abono' group by negocio_id, cliente_id
), ch as (
  select m.negocio_id, m.cliente_id, m.monto, c.mora_cobrada_hasta,
         coalesce(m.fecha_limite,
                  case when c.dias_credito > 0 then (m.fecha + c.dias_credito * interval '1 day')::date end) as limite,
         sum(m.monto) over (partition by m.negocio_id, m.cliente_id order by m.fecha, m.id) as acum
    from fiado_movimientos m
    join clientes c on c.negocio_id = m.negocio_id and c.id = m.cliente_id
   where m.tipo = 'cargo'
), pen as (
  select ch.negocio_id, ch.cliente_id, ch.mora_cobrada_hasta, ch.limite,
         least(ch.monto, ch.acum - coalesce(ab.abonos, 0)) as pendiente
    from ch
    left join ab on ab.negocio_id = ch.negocio_id and ab.cliente_id = ch.cliente_id
   where ch.acum > coalesce(ab.abonos, 0) and ch.limite is not null and ch.limite < hoy_colombia()
)
select p.negocio_id, p.cliente_id,
       sum(p.pendiente) as vencido,
       min(p.limite) as vence_desde,
       hoy_colombia() - min(p.limite) as dias_atraso,
       round(sum(p.pendiente * greatest(hoy_colombia() - greatest(p.limite, coalesce(p.mora_cobrada_hasta, p.limite)), 0))
             * r.mora_mensual / 100 / 30) as recargo
  from pen p
  join negocio_reglas r on r.negocio_id = p.negocio_id
 group by p.negocio_id, p.cliente_id, r.mora_mensual;

create view lotes_saldo with (security_invoker = true) as
select l.id, l.negocio_id, l.producto_id, l.compra_id, l.numero, l.fecha_vencimiento, l.cantidad,
       l.costo_unitario, l.fecha, p.nombre as producto_nombre, p.codigo as producto_codigo,
       greatest(0, least(l.cantidad,
         p.stock - (sum(l.cantidad) over (partition by l.negocio_id, l.producto_id order by l.fecha desc, l.id desc) - l.cantidad))) as restante
  from lotes l
  join productos p on p.negocio_id = l.negocio_id and p.id = l.producto_id;

create view prestamos_resumen with (security_invoker = true) as
select p.id, p.negocio_id, p.cliente_id, p.fecha_inicio, p.monto, p.tasa_mensual, p.frecuencia, p.num_cuotas,
       p.interes_total, p.total_a_pagar, p.estado, p.nota, p.creado_en,
       c.nombre as cliente_nombre, c.tipo_documento as cliente_tipo_documento,
       c.documento as cliente_documento, c.telefono as cliente_telefono,
       coalesce(sum(q.valor - q.pagado), 0) as saldo,
       coalesce(sum(q.pagado), 0) as pagado_total,
       min(q.fecha_limite) filter (where q.pagado < q.valor) as proxima_fecha,
       count(*) filter (where q.pagado < q.valor and q.fecha_limite < current_date) as cuotas_vencidas
  from prestamos p
  join clientes c on c.negocio_id = p.negocio_id and c.id = p.cliente_id
  left join prestamo_cuotas q on q.negocio_id = p.negocio_id and q.prestamo_id = p.id
 group by p.negocio_id, p.id, c.negocio_id, c.id;
