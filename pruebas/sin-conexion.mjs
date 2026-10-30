// Pruebas de la copia local del catálogo (src/lib/sinConexion.js).   node pruebas/sin-conexion.mjs
import assert from 'node:assert/strict'
const mem = new Map()
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)) }, removeItem: (k) => { mem.delete(k) }, get length() { return mem.size }, key: (i) => [...mem.keys()][i] ?? null }
const { guardarCopia, leerCopia, fechaCopia } = await import('../src/lib/sinConexion.js')

let n = 0
const prueba = (nombre, f) => { f(); n++; console.log('  ✓', nombre) }
const N = { nombre: 'Tienda A', modulos: ['productos'] }, C = { productos: [{ id: 'a', nombre: 'Arroz', precio_venta: 2500 }], categorias: [] }

prueba('guarda y lee la copia de una tienda', () => { assert.equal(guardarCopia('tienda-a', N, C, 1000), true); const d = leerCopia('tienda-a'); assert.equal(d.n.nombre, 'Tienda A'); assert.equal(d.c.productos[0].nombre, 'Arroz'); assert.equal(d.ts, 1000) })
prueba('sin copia devuelve null', () => assert.equal(leerCopia('no-existe'), null))
prueba('una copia dañada se ignora', () => { mem.set('catalogo-copia:rota', '{no es json'); assert.equal(leerCopia('rota'), null); mem.set('catalogo-copia:vacia', '{"ts":1}'); assert.equal(leerCopia('vacia'), null) })
prueba('una copia demasiado grande no se guarda', () => { const grande = { productos: Array.from({ length: 20000 }, (_, i) => ({ id: String(i), nombre: 'Producto número ' + i, descripcion: 'x'.repeat(40) })) }; assert.equal(guardarCopia('grande', N, grande), false); assert.equal(leerCopia('grande'), null) })
prueba('solo se conservan las copias de las últimas 5 tiendas', () => { mem.clear(); for (let i = 1; i <= 8; i++) guardarCopia('t' + i, N, C, i * 1000); const quedan = [...mem.keys()].filter((k) => k.startsWith('catalogo-copia:')); assert.equal(quedan.length, 5); assert.ok(leerCopia('t8') && leerCopia('t4') && !leerCopia('t1') && !leerCopia('t3')) })
prueba('si el almacenamiento falla, no rompe', () => { const g = globalThis.localStorage; globalThis.localStorage = { setItem() { throw new Error('lleno') }, getItem() { throw new Error('bloqueado') } }; assert.equal(guardarCopia('x', N, C), false); assert.equal(leerCopia('x'), null); globalThis.localStorage = g })
prueba('la fecha sale en español de Colombia', () => assert.match(fechaCopia(Date.UTC(2026, 9, 30, 18, 0)), /30/))
console.log(`\n  ${n} pruebas correctas`)
