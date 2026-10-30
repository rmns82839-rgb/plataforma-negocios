// Pruebas de la detección de cambios de estado en «Mis pedidos» (src/lib/cambiosPedido.js).   node pruebas/cambios-pedido.mjs
import assert from 'node:assert/strict'
import { detectarCambios, textoEstado } from '../src/lib/cambiosPedido.js'
let n = 0
const prueba = (nombre, f) => { f(); n++; console.log('  ✓', nombre) }
const P = (id, seguimiento, extra = {}) => ({ id, numero: 7, tienda: 'Tienda A', entrega: 'domicilio', estado: 'pendiente', seguimiento, ...extra })

prueba('la primera consulta no avisa nada (solo guarda el estado)', () => { const r = detectarCambios(null, [P('a', 'recibido')]); assert.deepEqual(r.cambios, []); assert.deepEqual(r.mapa, { a: 'recibido' }) })
prueba('sin cambios no avisa', () => assert.deepEqual(detectarCambios({ a: 'recibido' }, [P('a', 'recibido')]).cambios, []))
prueba('un cambio de estado avisa con el texto del nuevo estado', () => { const r = detectarCambios({ a: 'recibido' }, [P('a', 'preparando')]); assert.equal(r.cambios.length, 1); assert.match(r.cambios[0].texto, /está preparando tu pedido N\.º 7/) })
prueba('un pedido nuevo que antes no estaba no avisa', () => assert.deepEqual(detectarCambios({ a: 'recibido' }, [P('a', 'recibido'), P('b', 'recibido')]).cambios, []))
prueba('varios cambios a la vez avisan cada uno', () => assert.equal(detectarCambios({ a: 'recibido', b: 'preparando' }, [P('a', 'preparando'), P('b', 'entregado')]).cambios.length, 2))
prueba('un pedido cancelado no avisa como si avanzara', () => assert.deepEqual(detectarCambios({ a: 'recibido' }, [P('a', 'preparando', { estado: 'cancelado' })]).cambios, []))
prueba('los textos cambian según recoger o domicilio', () => { assert.match(textoEstado(P('a', 'en_camino')), /va en camino/); assert.match(textoEstado(P('a', 'en_camino', { entrega: 'recoger' })), /listo para recoger/); assert.match(textoEstado(P('a', 'entregado')), /entregado/); assert.equal(textoEstado(P('a', 'raro')), '') })
console.log(`\n  ${n} pruebas correctas`)
