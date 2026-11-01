import assert from 'node:assert/strict'
import { repararNavegador, huboErrorDeLogin } from '../src/lib/reparar.js'
let n = 0; const t = async (nom, fn) => { await fn(); n++; console.log('✓', nom) }
const ls = (obj) => { const d = { ...obj }; return { get length() { return Object.keys(d).length }, key: (i) => Object.keys(d)[i], removeItem: (k) => { delete d[k] }, _d: d } }
await t('borra service workers, caché y la sesión, pero no el resto', async () => {
  let desreg = 0; const borradas = []
  const env = { navigator: { serviceWorker: { getRegistrations: async () => [{ unregister: async () => { desreg++ } }, { unregister: async () => { desreg++ } }] } },
    caches: { keys: async () => ['app-v1', 'fotos-v1'], delete: async (k) => { borradas.push(k) } },
    localStorage: ls({ 'sb-abc-auth-token': '1', 'sb-abc-auth-token-code-verifier': '2', 'matriz:registro': '3', 'borrador-caja@x': '4' }), sessionStorage: { clear() {} } }
  const pasos = await repararNavegador(env)
  assert.equal(desreg, 2); assert.deepEqual(borradas, ['app-v1', 'fotos-v1'])
  assert.deepEqual(Object.keys(env.localStorage._d).sort(), ['borrador-caja@x', 'matriz:registro']); assert.equal(pasos.length, 3)
})
await t('no se rompe si el navegador no tiene nada de eso', async () => { await repararNavegador({}) })
await t('detecta el error que Google devuelve en la dirección', () => {
  assert.ok(huboErrorDeLogin('?error=access_denied&error_code=x', '')); assert.ok(huboErrorDeLogin('', '#error_description=algo'))
  assert.ok(!huboErrorDeLogin('?code=abc', '')); assert.ok(!huboErrorDeLogin('', ''))
})
console.log(`${n} pruebas correctas`)
