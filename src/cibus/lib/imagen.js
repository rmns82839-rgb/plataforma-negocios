const LIMITE_LOGO = 240000 // caracteres; la base de datos acepta hasta 250000

/**
 * Convierte el logo del negocio en una imagen pequeña (texto "data:image/…") que se guarda
 * junto a los datos del negocio. Solo PNG o JPEG: nunca SVG.
 */
export async function logoADataUrl(archivo) {
  const bitmap = await createImageBitmap(archivo)
  for (const lado of [360, 260, 180]) {
    const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * escala))
    canvas.height = Math.max(1, Math.round(bitmap.height * escala))
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const png = canvas.toDataURL('image/png')
    if (png.length <= LIMITE_LOGO) { bitmap.close?.(); return png }
    // PNG muy pesado: se prueba JPEG con fondo blanco
    ctx.globalCompositeOperation = 'destination-over'
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const jpg = canvas.toDataURL('image/jpeg', 0.85)
    if (jpg.length <= LIMITE_LOGO) { bitmap.close?.(); return jpg }
  }
  bitmap.close?.()
  throw new Error('El logo es demasiado pesado. Prueba con una imagen más sencilla.')
}

// Reduce una foto del celular (varios MB) a un JPEG liviano antes de subirla.
export async function comprimirImagen(archivo, maxLado = 1000, calidad = 0.8) {
  const bitmap = await createImageBitmap(archivo)
  const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * escala)
  canvas.height = Math.round(bitmap.height * escala)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  return new Promise((ok, fallo) =>
    canvas.toBlob(b => (b ? ok(b) : fallo(new Error('No se pudo procesar la foto'))), 'image/jpeg', calidad))
}
