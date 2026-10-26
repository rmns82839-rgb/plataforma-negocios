// Pruebas del armazón y de la capa negocio_id (sin navegador ni base de datos).
// Correr:  npm run pruebas:panel
import assert from 'node:assert/strict'
let ok = 0
const t = (n, f) => Promise.resolve().then(f).then(() => { ok++; console.log('✓', n) }, (e) => { console.log('✗', n, '→', e.message); process.exitCode = 1 })

// Cliente falso que anota lo que se le pide
function falso() {
  const llamadas = []
  const q = (tabla, accion, args) => {
    const reg = { tabla, accion, args, filtros: [] }; llamadas.push(reg)
    const b = { eq: (c, v) => { reg.filtros.push([c, v]); return b }, select: () => b, single: () => b, order: () => b, then: (r) => r({ data: [], error: null }) }
    return b
  }
  return { llamadas, from: (tabla) => ({ select: (...a) => q(tabla, 'select', a), insert: (...a) => q(tabla, 'insert', a), upsert: (...a) => q(tabla, 'upsert', a), update: (...a) => q(tabla, 'update', a), delete: (...a) => q(tabla, 'delete', a) }),
    rpc: (n, p) => { llamadas.push({ rpc: n, p }); return Promise.resolve({ data: null, error: null }) }, storage: {}, auth: {} }
}

const { dbDe, TABLAS_GLOBALES } = await import('../src/lib/negocioDb.js')
const { traerTodo } = await import('../src/lib/traerTodo.js')
const { repartir } = await import('../src/panel/barra.js')
const N = 'neg-1'

await t('select filtra por negocio', () => { const f = falso(); dbDe(N, f).from('productos').select('*'); assert.deepEqual(f.llamadas[0].filtros, [['negocio_id', N]]) })
await t('update filtra por negocio', () => { const f = falso(); dbDe(N, f).from('productos').update({ stock: 1 }).eq('id', 'p1'); assert.deepEqual(f.llamadas[0].filtros, [['negocio_id', N], ['id', 'p1']]) })
await t('delete filtra por negocio', () => { const f = falso(); dbDe(N, f).from('clientes').delete().eq('id', 'c1'); assert.deepEqual(f.llamadas[0].filtros, [['negocio_id', N], ['id', 'c1']]) })
await t('insert de una fila lleva negocio_id', () => { const f = falso(); dbDe(N, f).from('productos').insert({ nombre: 'A' }); assert.deepEqual(f.llamadas[0].args[0], { nombre: 'A', negocio_id: N }) })
await t('insert de varias filas lleva negocio_id en todas', () => { const f = falso(); dbDe(N, f).from('productos').insert([{ nombre: 'A' }, { nombre: 'B' }]); assert.ok(f.llamadas[0].args[0].every((x) => x.negocio_id === N)) })
await t('no se puede insertar en otro negocio', () => { const f = falso(); dbDe(N, f).from('productos').insert({ nombre: 'A', negocio_id: 'otro' }); assert.equal(f.llamadas[0].args[0].negocio_id, N) })
await t('upsert lleva negocio_id', () => { const f = falso(); dbDe(N, f).from('categorias').upsert([{ nombre: 'X' }]); assert.equal(f.llamadas[0].args[0][0].negocio_id, N) })
await t('tabla global no se filtra', () => { const f = falso(); dbDe(N, f).from('planes').select('*'); assert.deepEqual(f.llamadas[0].filtros, []); assert.ok(TABLAS_GLOBALES.has('planes')) })
await t('rpc agrega p_negocio_id', () => { const f = falso(); dbDe(N, f).rpc('registrar_abono', { p_monto: 5 }); assert.deepEqual(f.llamadas[0].p, { p_negocio_id: N, p_monto: 5 }) })
await t('rpc que no usa negocio no lo recibe', () => { const f = falso(); dbDe(N, f).rpc('mis_negocios'); assert.deepEqual(f.llamadas[0].p, {}) })
await t('sin negocio falla', () => assert.throws(() => dbDe('', falso())))

await t('barra: caja, productos y fiados cuando el plan los tiene', () => {
  const b = ['pedidos', 'caja', 'fiados', 'clientes', 'productos'].map((k) => [k, '', k, ''])
  const r = repartir(b); assert.deepEqual(r.enBarra, ['caja', 'productos', 'fiados']); assert.deepEqual(r.enMas.map((x) => x[0]), ['pedidos', 'clientes'])
})
await t('barra: sin caja ni fiados entra pedidos', () => {
  const b = ['pedidos', 'productos', 'categorias'].map((k) => [k, '', k, ''])
  const r = repartir(b); assert.deepEqual(r.enBarra, ['productos', 'pedidos']); assert.deepEqual(r.enMas.map((x) => x[0]), ['categorias'])
})
await t('barra: nunca más de 3 (más Inicio y Más = 5)', () => assert.ok(repartir(['caja', 'productos', 'fiados', 'pedidos'].map((k) => [k, '', k, ''])).enBarra.length <= 3))

await t('traerTodo junta las páginas de 1000', async () => {
  const N_ = 2655
  const r = await traerTodo(() => ({ range: async (a, b) => ({ data: Array.from({ length: Math.max(0, Math.min(b + 1, N_) - a) }, (_, i) => a + i), error: null }) }))
  assert.equal(r.data.length, N_); assert.equal(new Set(r.data).size, N_)
})
await t('traerTodo devuelve el error', async () => { const r = await traerTodo(() => ({ range: async () => ({ data: null, error: { message: 'x' } }) })); assert.equal(r.error.message, 'x') })

console.log(`\n${ok} pruebas pasaron`)
