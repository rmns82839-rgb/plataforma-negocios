import assert from 'node:assert/strict'
import { conTiempo } from '../src/cibus/lib/conTiempo.js'
let n = 0; const t = async (nom, fn) => { await fn(); n++; console.log('✓', nom) }
await t('devuelve lo que responde la operación si llega a tiempo', async () => { const r = await conTiempo(Promise.resolve({ data: 1, error: null }), 200); assert.equal(r.data, 1); assert.equal(r.error, null) })
await t('si se cuelga, devuelve un error legible', async () => { const r = await conTiempo(new Promise(() => {}), 50); assert.equal(r.error.tiempo, true); assert.match(r.error.message, /tardó demasiado/) })
await t('acepta una operación que no es una promesa normal (con then)', async () => { const r = await conTiempo({ then: (ok) => ok({ data: 2, error: null }) }, 200); assert.equal(r.data, 2) })
console.log(`${n} pruebas correctas`)
