import { buscarRepetidos, descomponer } from '../src/cibus/lib/repetidos.js'
let ok = 0, mal = 0
const igual = (n, a, b) => { if (JSON.stringify(a) === JSON.stringify(b)) { ok++; console.log('✓', n) } else { mal++; console.log('✗', n, JSON.stringify(a), '≠', JSON.stringify(b)) } }
const P = (...n) => n.map((nombre, i) => ({ id: i + 1, nombre, codigo: String(7700000000000 + i) }))
const grupos = (...n) => buscarRepetidos(P(...n)).map(g => g.ids)

igual('medida pegada o separada', descomponer('Azúcar Incauca 500g').medidas, descomponer('azucar incauca 500 gr').medidas)
igual('mil con punto', descomponer('Detergente 1.000 g').medidas, ['1000g'])
igual('mismo producto escrito distinto', grupos('Azúcar Incauca 500g', 'azucar incauca 500 gr', 'Arroz Diana 500g'), [[1, 2]])
igual('distinta medida NO se junta', grupos('Aceite 1 L', 'Aceite 500 ml', 'Aceite 1 litro'), [[1, 3]])
igual('500 g y 1000 g NO se juntan', grupos('Arroz Diana 500 g', 'Arroz Diana 1000 g'), [])
igual('plural y orden de palabras', grupos('Globos balón 18 pul', 'Globo balon 18 pulg', 'Balón globo 18 pul'), [[1, 2, 3]])
igual('una letra de más o de menos', grupos('Detergente Fab limon 1000 g', 'Detergente Fab limn 1000 g'), [[1, 2]])
igual('productos distintos no se mezclan', grupos('Dove Shampoo 18ml', 'Dove Acondicionador 18ml', 'Dove Jabon 18ml'), [])
igual('mitad de palabras NO basta', grupos('Pin pop gigante surtido', 'Pin pop mini'), [])
igual('nombres de una palabra iguales', grupos('Cuaderno', 'cuaderno'), [[1, 2]])
igual('talla distinta NO se junta', grupos('Camisa slim fit niño talla 10', 'Camisa slim fit niño talla 12'), [])
igual('palabras pegadas distintas: prefiere NO mezclar', grupos('Camisa slim fit niño talla 10', 'camisa slimfit nino talla 10'), [])  // slimfit ≠ slim fit: prefiere no juntar
const c = buscarRepetidos([{ id: 1, nombre: 'Leche A', codigo: '0077012345678' }, { id: 2, nombre: 'Otra cosa', codigo: '77012345678' }])
igual('mismo código con ceros delante', c.map(g => [g.ids, g.motivo]), [[[1, 2], 'mismo código']])
// rendimiento: 3000 productos
const muchos = Array.from({ length: 3000 }, (_, i) => ({ id: i, nombre: `Producto ${['aseo', 'granos', 'bebida', 'dulce'][i % 4]} marca${i % 300} ${[250, 500, 1000][i % 3]} g`, codigo: String(1000000 + i) }))
const t = Date.now(); const r = buscarRepetidos(muchos); const ms = Date.now() - t
igual(`3000 productos en menos de 3 s (${ms} ms)`, ms < 3000, true)
console.log(`\n${ok} pruebas correctas${mal ? `, ${mal} FALLARON` : ''}`); if (mal) process.exit(1)
