// Pruebas de las funciones de cálculo del carrito y del mensaje de WhatsApp (sin navegador ni base de datos)
import assert from 'node:assert/strict'
import * as P from '../src/lib/pedido.js'
import * as C from '../src/lib/csv.js'
let ok = 0
const t = (n, f) => { try { f(); ok++; console.log('✓', n) } catch (e) { console.log('✗', n, '→', e.message); process.exitCode = 1 } }

const tienda = { domicilio_modo: 'fijo', domicilio_costo: 4000, envio_gratis_desde: 50000, modulos: ['domicilio_km'] }
const km = { ...tienda, domicilio_modo: 'km', domicilio_km_incluidos: 2, domicilio_valor_km: 1000, domicilio_redondeo: 500, domicilio_radio_max_km: 10 }

t('formato de pesos', () => assert.equal(P.cop(12500), '$12.500'))
t('domicilio fijo', () => assert.equal(P.costoDomicilio(tienda, 10000, null), 4000))
t('envío gratis desde el mínimo', () => assert.equal(P.costoDomicilio(tienda, 50000, null), 0))
t('km: dentro de los incluidos solo la base', () => assert.equal(P.costoDomicilio(km, 10000, 1.5), 4000))
t('km: 5 km → 7 000', () => assert.equal(P.costoDomicilio(km, 10000, 5), 7000))
t('km: 5,1 km → 7 100 → 7 000 (al más cercano)', () => assert.equal(P.costoDomicilio(km, 10000, 5.1), 7000))
t('km: 5,3 km → 7 500', () => assert.equal(P.costoDomicilio(km, 10000, 5.3), 7500))
t('km: justo en medio sube (5,25 → 7 500)', () => assert.equal(P.costoDomicilio(km, 10000, 5.25), 7500))
t('km: paso 1000', () => assert.equal(P.costoDomicilio({ ...km, domicilio_redondeo: 1000 }, 10000, 5.3), 7000))
t('km: al peso', () => assert.equal(P.costoDomicilio({ ...km, domicilio_redondeo: 0 }, 10000, 5.3), 7300))
t('km: fuera de zona', () => assert.equal(P.costoDomicilio(km, 10000, 12), undefined))
t('km: sin distancia todavía', () => assert.equal(P.costoDomicilio(km, 10000, null), null))
t('km: gratis por monto', () => assert.equal(P.costoDomicilio(km, 60000, 8), 0))
t('km sin el módulo → tarifa fija', () => assert.equal(P.costoDomicilio({ ...km, modulos: [] }, 10000, 8), 4000))

const prod = { id: 'p1', categoria: 'Granos', precio_venta: 2500 }
t('promo porcentaje 10 %', () => assert.equal(P.descuentoPromo({ tipo: 'porcentaje', valor: 10 }, 2500, 2), 500))
t('promo 3x2', () => assert.equal(P.descuentoPromo({ tipo: 'nxm', lleva: 3, paga: 2 }, 1000, 3), 1000))
t('promo precio especial', () => assert.equal(P.descuentoPromo({ tipo: 'precio', valor: 2000 }, 2500, 4), 2000))
t('la promo nunca deja el producto gratis', () => assert.equal(P.descuentoPromo({ tipo: 'porcentaje', valor: 90 }, 1, 1), 0))
t('se elige la mejor promo del producto', () => assert.equal(P.mejorPromo([{ producto_id: 'p1', tipo: 'porcentaje', valor: 10, nombre: 'A' }, { categoria: 'Granos', tipo: 'porcentaje', valor: 20, nombre: 'B' }, { producto_id: 'otro', tipo: 'porcentaje', valor: 50, nombre: 'C' }], prod, 2).nombre, 'B'))
t('totales del carrito', () => { const r = P.totales([{ producto: prod, cantidad: 2 }], [{ producto_id: 'p1', tipo: 'porcentaje', valor: 10, nombre: 'A' }]); assert.equal(r.bruto, 5000); assert.equal(r.subtotal, 4500) })

t('WhatsApp: 10 dígitos → 57…', () => assert.equal(P.numeroWhatsapp('300 111 2233'), '573001112233'))
t('WhatsApp: ya con 57', () => assert.equal(P.numeroWhatsapp('+57 300 111 2233'), '573001112233'))
t('WhatsApp: número inválido', () => assert.equal(P.numeroWhatsapp('123'), null))
t('mensaje de pedido', () => {
  const m = P.mensajePedido({ tienda: 'Tienda A', numero: 7, nombre: 'Ana Pérez', lineas: [{ cantidad: 2, nombre: 'Arroz', subtotal: 5000 }], subtotal: 5000, domicilio: 4000, total: 9000, entrega: 'domicilio', direccion: 'Calle 1 # 2-3', nota: 'Timbre', practica: false })
  assert.match(m, /#7/); assert.match(m, /2 × Arroz — \$5\.000/); assert.match(m, /\*Total: \$9\.000\*/); assert.match(m, /Dirección: Calle 1/)
})
t('mensaje a recoger no pide dirección', () => { const m = P.mensajePedido({ tienda: 'T', numero: 1, nombre: 'Ana', lineas: [], subtotal: 0, domicilio: 0, total: 0, entrega: 'recoger', direccion: 'x' }); assert.ok(!m.includes('Dirección')) })
t('mensaje de práctica se marca', () => assert.match(P.mensajePedido({ tienda: 'T', numero: 1, nombre: 'Ana', lineas: [], subtotal: 0, domicilio: 0, total: 0, entrega: 'recoger', practica: true }), /PRÁCTICA/))
t('url de WhatsApp codificada', () => assert.match(P.urlWhatsapp('3001112233', 'Hola\n1 × A'), /^https:\/\/wa\.me\/573001112233\?text=Hola%0A1%20%C3%97%20A$/))
t('validar datos: faltan campos', () => { const e = P.validarDatos({ entrega: 'domicilio', nombre: 'A', telefono: '123', direccion: '' }, tienda); assert.ok(e.nombre && e.telefono && e.direccion) })
t('validar datos: a recoger no pide dirección', () => assert.deepEqual(P.validarDatos({ entrega: 'recoger', nombre: 'Ana Pérez', telefono: '3205550001' }, tienda), {}))
t('validar datos: en modo km pide confirmar la dirección', () => assert.ok(P.validarDatos({ entrega: 'domicilio', nombre: 'Ana Pérez', telefono: '3205550001', direccion: 'Calle 1 # 2-3' }, km, null).calculo))
t('km con coma', () => assert.equal(P.parseKm('2,5'), 2.5))
t('km inválido', () => assert.equal(P.parseKm('abc'), null))

// ---- carga masiva ----
t('csv: separa por punto y coma', () => assert.deepEqual(C.leerTabla('a;b\n1;2'), [['a','b'],['1','2']]))
t('csv: separa por tabulador (pegado desde Excel)', () => assert.deepEqual(C.leerTabla('a\tb\n1\t2'), [['a','b'],['1','2']]))
t('csv: respeta comillas', () => assert.deepEqual(C.leerTabla('a,b\n"x, y",2'), [['a','b'],['x, y','2']]))
t('csv: quita el BOM y las líneas vacías', () => assert.equal(C.leerTabla('\uFEFFa;b\n\n1;2\n\n').length, 2))
t('precio: $2.500 → 2500', () => assert.equal(C.leerPrecio('$2.500'), 2500))
t('precio: 2500 → 2500', () => assert.equal(C.leerPrecio('2500'), 2500))
t('precio: 12.500,50 → 12500.5', () => assert.equal(C.leerPrecio('12.500,50'), 12500.5))
t('precio: 1,250 (miles en inglés) → 1250', () => assert.equal(C.leerPrecio('1,250'), 1250))
t('precio: texto → null', () => assert.equal(C.leerPrecio('barato'), null))
t('carga: la plantilla es válida', () => { const r = C.procesarProductos(C.PLANTILLA); assert.equal(r.filas.length, 2); assert.ok(r.filas.every((f) => f.errores.length === 0)); assert.equal(r.filas[0].datos.precio_venta, 2500); assert.equal(r.filas[0].datos.stock, 40) })
t('carga: faltan columnas obligatorias', () => assert.deepEqual(C.procesarProductos('nombre;categoria\nA;B').columnasFaltantes, ['precio']))
t('carga: errores por fila', () => { const r = C.procesarProductos('nombre;precio;unidad;publicado\n;100;und;si\nArroz;abc;und;si\nSal;500;galones;si\nAzúcar;800;kg;quizás'); assert.equal(r.filas.filter((f) => f.errores.length).length, 4) })
t('carga: encabezados con tilde y mayúsculas', () => { const r = C.procesarProductos('Producto;Categoría;Precio;Código\nArroz;Granos;2500;77'); assert.equal(r.filas[0].errores.length, 0); assert.equal(r.filas[0].datos.codigo, '77') })
t('carga: código repetido', () => { const r = C.procesarProductos('nombre;precio;codigo\nA;100;1\nB;200;1'); assert.ok(r.filas[1].errores.some((e) => /repetido/.test(e))) })
t('carga: publicado vacío = sí, "no" = no', () => { const r = C.procesarProductos('nombre;precio;publicado\nA;100;\nB;200;no'); assert.equal(r.filas[0].datos.publicado, true); assert.equal(r.filas[1].datos.publicado, false) })
t('carga: más de 500 filas se recorta', () => { const t = 'nombre;precio\n' + Array.from({ length: 520 }, (_, i) => `P${i};100`).join('\n'); const r = C.procesarProductos(t); assert.equal(r.filas.length, 500); assert.equal(r.truncado, true) })
t('carga: texto vacío', () => assert.equal(C.procesarProductos('').vacio, true))

// ---- C4: cálculo del servidor ----
import { llamarDomicilio, MENSAJE_RESPALDO } from '../src/lib/domicilio.js'
const kmR = { ...km, domicilio_costo: 4000, domicilio_tarifa_respaldo: 6000 }
t('calculado: km 5 → 7 000', () => assert.equal(P.costoDomicilioCalculado(km, 10000, { estado: 'ok', km: 5 }), 7000))
t('calculado: sin cálculo todavía → null', () => assert.equal(P.costoDomicilioCalculado(km, 10000, null), null))
t('calculado: fuera de zona → undefined', () => assert.equal(P.costoDomicilioCalculado(km, 10000, { estado: 'fuera_de_zona' }), undefined))
t('calculado: respaldo usa la tarifa de respaldo (6 000)', () => assert.equal(P.costoDomicilioCalculado(kmR, 10000, { respaldo: true }), 6000))
t('calculado: respaldo sin tarifa propia usa la base (4 000)', () => assert.equal(P.costoDomicilioCalculado(km, 10000, { respaldo: true }), 4000))
t('calculado: respaldo con compra grande → sin costo', () => assert.equal(P.costoDomicilioCalculado(kmR, 60000, { respaldo: true }), 0))
t('calculado: tienda en modo fijo ignora el cálculo', () => assert.equal(P.costoDomicilioCalculado(tienda, 10000, { estado: 'ok', km: 9 }), 4000))
const dat = { nombre: 'Ana Pérez', telefono: '3001234567', direccion: 'Calle 10 # 5-20, Centro', entrega: 'domicilio' }
t('validar: en modo km falta confirmar la dirección', () => assert.ok(P.validarDatos(dat, km, null).calculo))
t('validar: con cálculo ok pasa', () => assert.deepEqual(P.validarDatos(dat, km, { estado: 'ok', km: 3 }), {}))
t('validar: con respaldo pasa (no se bloquea)', () => assert.deepEqual(P.validarDatos(dat, km, { respaldo: true }), {}))
t('validar: fuera de zona no pasa', () => assert.ok(P.validarDatos(dat, km, { estado: 'fuera_de_zona' }).calculo))
t('validar: recoger no pide cálculo', () => assert.deepEqual(P.validarDatos({ ...dat, entrega: 'recoger' }, km, null), {}))
t('validar: tienda de tarifa fija no pide cálculo', () => assert.deepEqual(P.validarDatos(dat, tienda, null), {}))

{
  const casos = [
    ['red caída', async () => { throw new Error('offline') }],
    ['servidor 500 con HTML', async () => ({ json: async () => { throw new Error('no json') } })],
    ['respuesta sin estado', async () => ({ json: async () => ({ x: 1 }) })],
  ]
  for (const [n, f] of casos) {
    const r = await llamarDomicilio({ accion: 'buscar' }, f)
    try { assert.equal(r.respaldo, true); assert.equal(r.mensaje, MENSAJE_RESPALDO); assert.ok(!/error|500|undefined/i.test(r.mensaje)); ok++; console.log('✓ API caída (' + n + '): respaldo con mensaje claro') } catch (e) { console.log('✗', n, e.message); process.exitCode = 1 }
  }
  const buena = await llamarDomicilio({ accion: 'buscar' }, async () => ({ json: async () => ({ estado: 'ok', candidatos: [] }) }))
  try { assert.equal(buena.estado, 'ok'); ok++; console.log('✓ API responde: se devuelve tal cual') } catch (e) { console.log('✗', e.message); process.exitCode = 1 }
}

// ---- C5b: direcciones guardadas ----
{
  const D = await import('../src/lib/direcciones.js')
  const mem = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) } } }
  const base = { etiqueta: 'Casa', direccion: 'Calle 133b # 95b-19, Villa Elisa', sena: 'Portón verde', lat: 4.7512, lng: -74.0931 }
  const tt = async (n, f) => { try { await f(); ok++; console.log('✓', n) } catch (e) { console.log('✗', n, '→', e.message); process.exitCode = 1 } }
  await tt('texto del pedido: dirección + seña', () => assert.equal(D.textoDireccion(base), 'Calle 133b # 95b-19, Villa Elisa · Seña: Portón verde'))
  await tt('texto sin seña', () => assert.equal(D.textoDireccion({ ...base, sena: '' }), 'Calle 133b # 95b-19, Villa Elisa'))
  await tt('texto nunca pasa de 160', () => assert.ok(D.textoDireccion({ direccion: 'a'.repeat(160), sena: 'b'.repeat(100) }).length <= 160))
  await tt('validar: dirección corta y punto ausente', () => { const e = D.validarDireccion({ direccion: 'ab', lat: null, lng: null }); assert.ok(e.direccion && e.punto) })
  await tt('validar: dirección y punto correctos', () => assert.deepEqual(D.validarDireccion(base), {}))
  await tt('sin cuenta: se guarda en el celular y se lista', async () => {
    const a = mem(); const g = await D.guardar(null, null, base, true, a)
    assert.ok(D.esLocal(g.dir.id)); const l = await D.listar(null, null, a)
    assert.equal(l.lista.length, 1); assert.equal(l.lista[0].lat, 4.7512); assert.equal(l.cuenta, false)
  })
  await tt('sin cuenta: corregir no crea otra', async () => {
    const a = mem(); const g = await D.guardar(null, null, base, true, a)
    await D.guardar(null, null, { ...base, id: g.dir.id, direccion: 'Calle 133b # 95b-20' }, true, a)
    const l = await D.listar(null, null, a); assert.equal(l.lista.length, 1); assert.ok(l.lista[0].direccion.endsWith('20'))
  })
  await tt('sin cuenta: máximo 5', async () => {
    const a = mem(); for (let i = 0; i < 5; i++) await D.guardar(null, null, { ...base, direccion: 'Carrera ' + i + ' # 1-2 Suba' }, true, a)
    const g = await D.guardar(null, null, base, true, a); assert.match(g.error, /5 direcciones/)
  })
  await tt('la última usada va primero', async () => {
    const a = mem(); const g1 = await D.guardar(null, null, base, true, a); await new Promise(r => setTimeout(r, 5))
    await D.guardar(null, null, { ...base, etiqueta: 'Trabajo', direccion: 'Carrera 7 # 12-30 Centro' }, true, a); await new Promise(r => setTimeout(r, 5))
    await D.marcarUso(null, null, g1.dir.id, a); const l = await D.listar(null, null, a); assert.equal(l.lista[0].id, g1.dir.id)
  })
  await tt('borrar en el celular', async () => {
    const a = mem(); const g = await D.guardar(null, null, base, true, a); assert.equal(await D.borrar(null, null, g.dir.id, a), true)
    assert.equal((await D.listar(null, null, a)).lista.length, 0)
  })
  await tt('almacenamiento dañado no rompe', async () => { const a = { getItem: () => '{no json', setItem: () => { throw new Error('lleno') } }; assert.equal((await D.listar(null, null, a)).lista.length, 0); const g = await D.guardar(null, null, base, true, a); assert.ok(g.dir) })
  await tt('con cuenta y aceptación: va a la base con los datos limpios', async () => {
    let llamada; const rpc = async (n, a) => { llamada = { n, a }; return { data: { ...a.p_datos, id: 'uuid-1' }, error: null } }
    const g = await D.guardar({}, rpc, base, true, mem())
    assert.equal(llamada.n, 'guardar_direccion'); assert.equal(llamada.a.p_datos.acepta_datos, true); assert.equal(llamada.a.p_datos.id, null); assert.equal(g.dir.id, 'uuid-1')
  })
  await tt('con cuenta y sin aceptar: no se guarda nada', async () => {
    let n = 0; const rpc = async () => { n++; return { data: null, error: null } }; const a = mem()
    const g = await D.guardar({}, rpc, base, false, a); assert.equal(g.dir, null); assert.equal(n, 0); assert.equal(D.leerLocal(a).length, 0)
  })
  await tt('con cuenta: error de la base se muestra claro', async () => { const g = await D.guardar({}, async () => ({ data: null, error: { message: 'Ya tienes 5 direcciones guardadas' } }), base, true, mem()); assert.match(g.error, /5 direcciones/) })
  await tt('con cuenta: si la base cae, no lanza', async () => { const g = await D.guardar({}, async () => { throw new Error('red') }, base, true, mem()); assert.ok(g.error) })
  await tt('con cuenta: lista de la base; si falla, usa el celular', async () => {
    const a = mem(); await D.guardar(null, null, base, true, a)
    const l1 = await D.listar({}, async () => ({ data: [{ id: 'u1', etiqueta: 'Casa', direccion: 'x', lat: 1, lng: 2, ultimo_uso: '2026-01-01' }], error: null }), a)
    assert.equal(l1.lista[0].id, 'u1'); assert.equal(l1.cuenta, true)
    const l2 = await D.listar({}, async () => { throw new Error('red') }, a); assert.equal(l2.lista.length, 1); assert.equal(l2.cuenta, false)
    const l3 = await D.listar({}, async () => ({ data: [], error: null }), a); assert.equal(l3.lista.length, 1)
  })
  await tt('una dirección del celular nunca se manda a corregir en la base', async () => {
    let enviado; const rpc = async (n, a) => { enviado = a; return { data: { id: 'u9' }, error: null } }
    await D.guardar({}, rpc, { ...base, id: 'l-abc' }, true, mem()); assert.equal(enviado.p_datos.id, null)
  })
}

// ---- C6: caja, fiados y reportes ----
{
  const K = await import('../src/lib/caja.js')
  const tt = async (n, f) => { try { await f(); ok++; console.log('✓', n) } catch (e) { console.log('✗', n, '→', e.message); process.exitCode = 1 } }
  await tt('día en Bogotá: 23:30 del 24 en Bogotá es 04:30 UTC del 25', () => assert.equal(K.diaBogota(new Date('2026-10-25T04:30:00Z')), '2026-10-24'))
  await tt('día en Bogotá: justo después de medianoche', () => assert.equal(K.diaBogota(new Date('2026-10-25T05:00:00Z')), '2026-10-25'))
  await tt('rango hoy', () => { const r = K.rangoPeriodo('hoy', new Date('2026-10-25T17:00:00Z')); assert.equal(r.desde, '2026-10-25T05:00:00.000Z'); assert.equal(r.hasta, '2026-10-26T05:00:00.000Z') })
  await tt('rango 7 días incluye hoy y 6 anteriores', () => assert.equal(K.rangoPeriodo('7d', new Date('2026-10-25T17:00:00Z')).desde, '2026-10-19T05:00:00.000Z'))
  await tt('rango 30 días', () => assert.equal(K.rangoPeriodo('30d', new Date('2026-10-25T17:00:00Z')).desde, '2026-09-26T05:00:00.000Z'))
  await tt('rango mes empieza el día 1', () => assert.equal(K.rangoPeriodo('mes', new Date('2026-10-25T17:00:00Z')).desde, '2026-10-01T05:00:00.000Z'))
  await tt('rango mes con la noche del último día aún en el mes anterior', () => assert.equal(K.rangoPeriodo('mes', new Date('2026-11-01T03:00:00Z')).desde, '2026-10-01T05:00:00.000Z'))
  await tt('variación', () => { assert.equal(K.variacion(120, 100), 20); assert.equal(K.variacion(50, 100), -50); assert.equal(K.variacion(10, 0), null); assert.equal(K.variacion('x', 5), null) })
  await tt('subtotal a precio de lista', () => assert.equal(K.subtotalLista([{ producto: { precio_venta: 2500 }, cantidad: 2 }, { producto: { precio_venta: 999.5 }, cantidad: 1 }]), 6000))
  await tt('un solo pago: monto = total y recibido', () => assert.deepEqual(K.armarPagos([{ metodo: 'efectivo' }], 5700, '10.000').pagos, [{ metodo: 'efectivo', monto: 5700, recibido: 10000 }]))
  await tt('efectivo recibido menor que el total', () => assert.match(K.armarPagos([{ metodo: 'efectivo' }], 5700, '5000').error, /menor/))
  await tt('pago dividido: el último se queda con el resto', () => assert.deepEqual(K.armarPagos([{ metodo: 'efectivo', monto: '2000' }, { metodo: 'nequi', monto: '' }], 5700).pagos, [{ metodo: 'efectivo', monto: 2000 }, { metodo: 'nequi', monto: 3700 }]))
  await tt('pago dividido que se pasa del total', () => assert.ok(K.armarPagos([{ metodo: 'efectivo', monto: '9000' }, { metodo: 'nequi', monto: '' }], 5700).error))
  await tt('no se repite la forma de pago', () => assert.match(K.armarPagos([{ metodo: 'efectivo', monto: '1000' }, { metodo: 'efectivo' }], 5700).error, /repitas/))
  await tt('sin forma de pago ni total', () => { assert.match(K.armarPagos([{ metodo: '' }], 5700).error, /Elige/); assert.ok(K.armarPagos([{ metodo: 'efectivo' }], 0).error) })
  await tt('cambio', () => { assert.equal(K.cambio('10.000', 5700), 4300); assert.equal(K.cambio('', 5700), null); assert.equal(K.cambio('5000', 5700), null) })
  await tt('mensaje de cobro amable', () => { const m = K.mensajeCobro({ nombre: 'Luz Marina Torres', saldo: 45000, tienda: 'Tienda Demo' }); assert.match(m, /^Hola Luz,/); assert.match(m, /\$45\.000/); assert.match(m, /Tienda Demo/) })
  // ---- C6a ----
  await tt('venta nueva usa el menor número libre', () => { const a = K.nuevaVenta([]); const b = K.nuevaVenta([a]); const c = K.nuevaVenta([a, b]); assert.deepEqual([a.n, b.n, c.n], [1, 2, 3]); assert.equal(K.nuevaVenta([{ n: 2 }, { n: 3 }]).n, 1) })
  await tt('descuento en % sobre el subtotal', () => { assert.equal(K.descuentoGeneral('pct', '10', 25500), 2550); assert.equal(K.descuentoGeneral('pct', '5', 10010), 501); assert.equal(K.descuentoGeneral('pct', '500', 1000), 1000); assert.equal(K.descuentoGeneral('monto', '1.500', 9999), 1500) })
  await tt('agregar pagos: suma, junta la misma forma y calcula lo que falta', () => {
    let p = K.agregarPago([], { metodo: 'efectivo', monto: 5000, recibido: 20000 })
    assert.deepEqual(p, [{ metodo: 'efectivo', monto: 5000, recibido: 20000 }])
    p = K.agregarPago(p, { metodo: 'nequi', monto: 3000 })
    assert.equal(K.faltante(p, 10000), 2000)
    p = K.agregarPago(p, { metodo: 'efectivo', monto: 2000 })
    assert.deepEqual(p[0], { metodo: 'efectivo', monto: 7000, recibido: 22000 })
    assert.equal(K.faltante(p, 10000), 0); assert.equal(K.cambioTotal(p), 15000)
  })
  await tt('quitar pago y pago en cero se ignora', () => { const p = [{ metodo: 'a', monto: 1 }, { metodo: 'b', monto: 2 }]; assert.deepEqual(K.quitarPago(p, 'a'), [{ metodo: 'b', monto: 2 }]); assert.equal(K.agregarPago(p, { metodo: 'c', monto: 0 }), p) })
  await tt('botones de formas de pago: 3 por fila y última fila repartida', () => {
    assert.deepEqual(K.spansMetodos(6), Array(6).fill('col-span-2'))
    assert.deepEqual(K.spansMetodos(7), [...Array(6).fill('col-span-2'), 'col-span-6'])
    assert.deepEqual(K.spansMetodos(5), [...Array(3).fill('col-span-2'), 'col-span-3', 'col-span-3'])
    assert.deepEqual(K.spansMetodos(1), ['col-span-6']); assert.deepEqual(K.spansMetodos(2), ['col-span-3', 'col-span-3'])
  })
  await tt('comisión de una forma de pago', () => { assert.equal(K.comisionDe({ comision: 2.5 }, 10000), 250); assert.equal(K.comisionDe({}, 10000), 0); assert.equal(K.comisionDe({ comision: 3 }, 15000), 450) })
  await tt('fecha límite del fiado (hora de Bogotá)', () => { assert.equal(K.fechaLimite(7, new Date('2026-10-26T03:00:00Z')), '2026-11-01'); assert.equal(K.fechaLimite(0), null); assert.equal(K.fechaLimite(30, new Date('2026-10-25T12:00:00Z')), '2026-11-24') })
  await tt('id de forma de pago', () => { assert.equal(K.idForma('Bre-B Bancolombia', []), 'bre_b_bancolombia'); assert.equal(K.idForma('Nequi', ['nequi']), 'nequi_2'); assert.equal(K.idForma('Ñandú ✓', []), 'nandu'); assert.equal(K.idForma('!', []), null) })
  await tt('comisión escrita por una persona', () => { assert.equal(K.leerComision('2,5'), 2.5); assert.equal(K.leerComision(''), 0); assert.equal(K.leerComision('25'), null); assert.equal(K.leerComision('abc'), null); assert.equal(K.leerComision('20'), 20) })
  await tt('lo guardado en el equipo se sanea (6 ventas, 2 días, datos raros)', () => {
    const ahora = Date.now()
    const v = (o) => ({ id: 'x' + Math.random(), n: 1, ts: ahora, carrito: { a: 2, b: 0, c: -1 }, descTipo: 'raro', descValor: 'a1b0', descLinea: { a: '300', b: 0 }, pagos: [{ metodo: 'efectivo', monto: 100 }, { metodo: 5, monto: 3 }, { metodo: 'x', monto: 0 }], plazo: 9, ...o })
    const r = K.sanearVentas({ lista: [v(), v(), v(), v(), v(), v(), v(), v({ ts: ahora - 3 * 86400000 })], activa: 'no existe' }, ahora)
    assert.equal(r.lista.length, 6); assert.equal(r.activa, r.lista[0].id)
    assert.deepEqual(r.lista[0].carrito, { a: 2 }); assert.equal(r.lista[0].descTipo, 'monto'); assert.equal(r.lista[0].descValor, '10'); assert.deepEqual(r.lista[0].descLinea, { a: '300' }); assert.equal(r.lista[0].pagos.length, 1); assert.equal(r.lista[0].plazo, 0)
    assert.equal(K.sanearVentas({ lista: [v({ ts: ahora - 3 * 86400000 })] }, ahora), null); assert.equal(K.sanearVentas(null), null); assert.equal(K.sanearVentas({ lista: 'x' }), null)
  })
}

console.log(`\n${ok} pruebas correctas`)
