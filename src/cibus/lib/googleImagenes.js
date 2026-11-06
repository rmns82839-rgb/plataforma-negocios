// Abre Google Imágenes con el nombre del producto (misma búsqueda del Catálogo universal). Sin React.
// Con código de barras real (8 a 14 dígitos; los internos de Matriz, que empiezan por 20, no existen fuera de la tienda) también se busca por el código.
export function enlaceGoogle(p, soloLibres = false) {
  const cod = String(p.codigo || '').replace(/\D/g, '')
  const ean = cod.length >= 8 && cod.length <= 14 && !(cod.length === 13 && cod.startsWith('20')) ? cod : ''
  const q = [p.nombre, p.presentacion, ean, '(sitio oficial OR fabricante OR distribuidor)'].filter(Boolean).join(' ')
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}${soloLibres ? '&tbs=sur:fmc' : ''}`
}
