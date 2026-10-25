// Pruebas de las funciones de cálculo del carrito y del mensaje de WhatsApp (sin navegador ni base de datos)
import assert from 'node:assert/strict'
import * as P from '../src/lib/pedido.js'
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
t('validar datos: en modo km pide la distancia', () => assert.ok(P.validarDatos({ entrega: 'domicilio', nombre: 'Ana Pérez', telefono: '3205550001', direccion: 'Calle 1 # 2-3' }, km).km))
t('km con coma', () => assert.equal(P.parseKm('2,5'), 2.5))
t('km inválido', () => assert.equal(P.parseKm('abc'), null))
console.log(`\n${ok} pruebas correctas`)
