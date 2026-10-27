// Precio de venta a partir del costo y el % de ganancia sobre el costo (el mismo % que muestra la pantalla de Compra).
// Se redondea a los 50 pesos más cercanos, que es como se manejan los precios en el mostrador.
export const precioConMargen = (costo, pct) => {
  const c = Number(costo), p = Number(pct)
  if (!(c > 0) || !(p >= 0)) return 0
  return Math.max(50, Math.round(c * (1 + p / 100) / 50) * 50)
}
export const gananciaPorUnidad = (costo, precio) => (Number(precio) > 0 && Number(costo) > 0 ? Number(precio) - Number(costo) : 0)
