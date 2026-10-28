import assert from 'node:assert/strict'
import { coincide, ordenarPorInicio, plegar, puntaje } from '../src/cibus/lib/buscar.js'
let ok = 0, mal = 0
const t = (n, f) => { try { f(); ok++ } catch (e) { mal++; console.log('✗', n, '→', e.message) } }
const si = (campo, q) => t(`"${q}" debe encontrar "${campo}"`, () => assert.ok(coincide([campo], q)))
const no = (campo, q) => t(`"${q}" NO debe encontrar "${campo}"`, () => assert.ok(!coincide([campo], q)))
for (const [c, q] of [
  ['José Vizcaíno', 'jose'], ['José Vizcaíno', 'JOSE viz'], ['Piñón', 'pinon'], ['Arroz Diana x 500 g', 'ARROZ'], ['Arroz Diana x 500 g', 'aroz'], ['Arroz Diana x 500 g', 'arros'],
  ['Arroz Diana x 500 g', 'arrroz'], ['Arroz Diana x 500 g', 'arzoz'], ['Arroz Diana x 500 g', 'diana arroz'], ['Vino tinto', 'bino'], ['Vino tinto', 'bino tinto'],
  ['Detergente Fab', 'dtergente'], ['Detergente Fab', 'detegente'], ['Detergente Fab', 'detergnte fab'], ['Galletas Festival', 'galleta'], ['Galleta Festival', 'galletas'],
  ['Coca Cola 1.5 L', 'cocacola'], ['Coca Cola 1.5 L', 'koka kola'], ['Huevos AA', 'uevos'], ['Huevos AA', 'huebos'], ['Jabón Rey', 'xabon'] ,
  ['Cédula 1.234.567', '1234567'], ['Cédula 1.234.567', '234567'], ['Leche Entera', 'lechee'], ['Chocolate', 'xocolate'], ['Chocolate', 'chocolat'], ['Zapatos', 'sapatos'], ['Gaseosa', 'gasiosa'], ['Quesito', 'kesito'], ['Mayonesa', 'mallonesa'],
  ['Aceite Girasol', 'giraso'], ['Aceite Girasol', 'jirasol'], ['Azúcar', 'asucar'], ['Pañales', 'panales'], ['Cerveza', 'servesa'], ['Limón', 'limon'], ['Limón', 'limn'],
]) si(c, q)
for (const [c, q] of [['Arroz Diana', 'frijol'], ['Arroz Diana', 'xyz'], ['Leche', 'lec he x'], ['Arroz', 'ap'], ['Pan', 'sal'], ['Aceite', 'azul'], ['Cédula 1.234.567', '7654321']]) no(c, q)
t('ranking: el que empieza igual va primero', () => {
  const r = ordenarPorInicio([{ nombre: 'Salsa de arroz' }, { nombre: 'Arroz Diana' }, { nombre: 'Aroz suelto' }], 'arroz').map(x => x.nombre)
  assert.deepEqual(r, ['Arroz Diana', 'Aroz suelto', 'Salsa de arroz'])
})
t('consulta vacía coincide con todo', () => assert.ok(coincide(['x'], '')))
t('plegar es estable', () => assert.equal(plegar('Chócolate  LLave'), plegar('chocolate yabe')))
console.log(`${ok} ok, ${mal} mal`)
