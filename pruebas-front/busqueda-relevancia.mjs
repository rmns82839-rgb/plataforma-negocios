// «Panela» debe mostrar primero lo que se llama panela y esconder lo que solo se le parece (canela).
import assert from 'node:assert/strict'
import { ordenarPorInicio, coincide } from '../src/cibus/lib/buscar.js'
const ps = ['Café Mezcla de panela', 'Canela astilla', 'Canela polvo', 'FRUTIÑO PANELA', 'Panela en bloque', 'Panela', 'Pañal', 'Arroz Diana'].map((nombre, id) => ({ id, nombre, codigo: null }))
const orden = (q) => ordenarPorInicio(ps.filter(p => coincide([p.nombre, p.codigo], q)), q).map(p => p.nombre)
assert.deepEqual(orden('Panela').slice(0, 2), ['Panela', 'Panela en bloque'])
assert.ok(!orden('Panela').some(n => /canela/i.test(n)), 'canela no debe salir al buscar panela')
assert.deepEqual(orden('aroz'), ['Arroz Diana'])            // con una letra mal puesta sigue encontrando
assert.deepEqual(orden('canela'), ['Canela astilla', 'Canela polvo'])
console.log('✓ búsqueda por relevancia')
