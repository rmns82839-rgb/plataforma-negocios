// "Pídelo otra vez": los productos que más repite cada cliente. Archivo .js aparte (Fast Refresh).
/**
 * @param pedidos  lista de "mis pedidos" ({ estado, items: [{ producto_id, cantidad }] }, del más nuevo al más viejo)
 * @param ultimo   último pedido guardado en el celular: [{ id, cantidad }]
 * @param productos catálogo de hoy
 * @returns hasta `limite` productos disponibles, los que más veces pidió primero (a igualdad, el más reciente)
 */
export function productosHabituales(pedidos, ultimo, productos, limite = 3) {
  const cuenta = new Map()      // id → { veces, orden }
  let orden = 0
  const suma = (id) => { if (!id) return; const c = cuenta.get(id) ?? { veces: 0, orden: orden++ }; c.veces += 1; cuenta.set(id, c) }
  for (const p of pedidos ?? []) {
    if (p?.estado === 'cancelado') continue
    for (const it of new Set((p?.items ?? []).map(i => i.producto_id))) suma(it)
  }
  if (!cuenta.size) for (const g of ultimo ?? []) suma(g.id)
  const porId = new Map(productos.map(p => [p.id, p]))
  return [...cuenta.entries()]
    .sort((a, b) => b[1].veces - a[1].veces || a[1].orden - b[1].orden)
    .map(([id]) => porId.get(id))
    .filter(p => p && p.disponible)
    .slice(0, limite)
}
