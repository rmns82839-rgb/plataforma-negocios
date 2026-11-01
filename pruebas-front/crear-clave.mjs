import assert from 'node:assert/strict'
import { errorClaveCrear, tieneClavePropia } from '../src/cibus/lib/clave.js'
let n = 0; const t = (nom, fn) => { fn(); n++; console.log('✓', nom) }
t('rechaza una contraseña corta o sin números', () => { assert.match(errorClaveCrear('corta1', 'corta1'), /mínimo 12/); assert.match(errorClaveCrear('sololetrasenlaclave', 'sololetrasenlaclave'), /mínimo 12/) })
t('rechaza si no coinciden', () => assert.match(errorClaveCrear('ClaveSegura2026', 'ClaveSegura2027'), /no coinciden/))
t('acepta una buena', () => assert.equal(errorClaveCrear('ClaveSegura2026', 'ClaveSegura2026'), ''))
t('sabe si ya creó su contraseña', () => { assert.equal(tieneClavePropia({ user_metadata: { tiene_clave: true } }), true); assert.equal(tieneClavePropia({ user_metadata: {} }), false); assert.equal(tieneClavePropia(null), false) })
console.log(`${n} pruebas correctas`)
