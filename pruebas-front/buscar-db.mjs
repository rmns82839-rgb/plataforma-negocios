import assert from 'node:assert/strict'
import { buscarProductosPorNombre, limpiarIndiceBusqueda, buscarEnIndice } from '../src/cibus/lib/buscar.js'
const PROD = [{ id: 1, nombre: 'Arroz Diana x 500 g', codigo: '7701', activo: true, stock: 5, precio_venta: 2800 }, { id: 2, nombre: 'Vino tinto', codigo: '7702', activo: true, stock: 2, precio_venta: 30000 }, { id: 3, nombre: 'Detergente Fab', codigo: '7703', activo: true, stock: 9, precio_venta: 13500 }, { id: 4, nombre: 'Oculto', codigo: '1', activo: false }]
let pedidos = 0, rotos = false
const sb = { from: () => {
  const q = { f: [], r: null, sel: '*' }
  const b = { select(c) { q.sel = c; return b }, eq(k, v) { q.f.push(r => r[k] === v); return b }, order() { return b }, in(k, v) { q.f.push(r => v.includes(r[k])); return b }, ilike() { return b },
    range(a, z) { pedidos++; return Promise.resolve(rotos ? { data: null, error: { message: 'x' } } : { data: PROD.filter(r => q.f.every(f => f(r))).slice(a, z + 1).map(r => (q.sel === '*' ? r : Object.fromEntries(q.sel.split(',').map(s => s.trim()).map(k => [k, r[k]])))), error: null }) },
    then(res) { return Promise.resolve({ data: PROD.filter(r => q.f.every(f => f(r))), error: null }).then(res) } }
  return b } }
const r = await buscarProductosPorNombre(sb, 'aroz')
assert.deepEqual(r.data.map(x => x.id), [1]); assert.equal(r.data[0].stock, 5, 'trae la fila completa')
assert.deepEqual((await buscarProductosPorNombre(sb, 'bino')).data.map(x => x.id), [2])
assert.deepEqual((await buscarProductosPorNombre(sb, 'OCULTO')).data, [], 'no trae inactivos')
assert.deepEqual((await buscarProductosPorNombre(sb, '7703')).data.map(x => x.id), [3], 'por código')
const antes = pedidos; await buscarProductosPorNombre(sb, 'dtergente'); assert.ok(pedidos - antes <= 2, 'la lista se reutiliza')
limpiarIndiceBusqueda(); rotos = true
const f = await buscarEnIndice('x', () => sb.from('productos').select('id, nombre'), 'a'); assert.equal(f, null, 'si falla la base devuelve null para usar la búsqueda simple')
console.log('db ok')
