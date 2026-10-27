// Ayudas para las ofertas que ve el cliente en los catálogos.
const clave = (catalogo) => `ofertas-vistas-${catalogo}`

/** Para no repetir la ventana: se recuerda (solo en esta pestaña) qué ofertas ya salieron. */
export const firma = (ofertas) => ofertas.map(o => o.id).sort().join(',')

export const yaVistas = (catalogo, ofertas) => {
  try { return sessionStorage.getItem(clave(catalogo)) === firma(ofertas) } catch { return false }
}
export const marcarVistas = (catalogo, ofertas) => {
  try { sessionStorage.setItem(clave(catalogo), firma(ofertas)) } catch { /* sin almacenamiento: se muestra de nuevo */ }
}

/** "Hasta el 15 de octubre" (la fecha llega como AAAA-MM-DD) */
export const hastaTexto = (hasta) => {
  if (!hasta) return ''
  const [a, m, d] = String(hasta).split('-').map(Number)
  if (!a || !m || !d) return ''
  return `Hasta el ${new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long' }).format(new Date(a, m - 1, d))}`
}

export const mensajeOferta = (o, catalogo) =>
  `Hola, vi la oferta "${o.titulo}"${o.etiqueta ? ` (${o.etiqueta})` : ''} en el catálogo de ${catalogo === 'ropa' ? 'ropa' : 'la tienda'} y quiero aprovecharla.`
