import { cantidadTexto } from '../src/cibus/lib/cantidadVenta.js'
let f = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); if (!c) f++ }
ok(cantidadTexto({ cantidad: 0.35, unidad: 'kg' }).principal === '0,35 kg', '0,35 kg')
ok(cantidadTexto({ cantidad: 0.35, unidad: 'kg' }).extra === '350 g', 'y 350 g')
ok(cantidadTexto({ cantidad: 2, unidad: 'und' }).principal === '2 und', '2 und')
ok(cantidadTexto({ cantidad: 1.25, unidad: 'lb' }).principal === '1,25 lb' && cantidadTexto({ cantidad: 1.25, unidad: 'lb' }).extra === '', 'libras sin gramos')
ok(cantidadTexto({ cantidad: 0.002, unidad: 'kg' }).principal === '0,002 kg', 'tres decimales exactos')
ok(cantidadTexto({ cantidad: 12, unidad: null }).principal === '12 und', 'sin unidad = und')
process.exit(f ? 1 : 0)
