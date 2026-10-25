// Reduce una foto antes de subirla (los celulares dan fotos de 5 MB; la tienda necesita ~100 KB)
export async function reducirImagen(archivo, lado = 900, calidad = 0.82) {
  const bmp = await createImageBitmap(archivo)
  const escala = Math.min(1, lado / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * escala), h = Math.round(bmp.height * escala)
  const lienzo = document.createElement('canvas'); lienzo.width = w; lienzo.height = h
  lienzo.getContext('2d').drawImage(bmp, 0, 0, w, h)
  const blob = await new Promise((ok) => lienzo.toBlob(ok, 'image/webp', calidad))
  if (!blob) throw new Error('No pudimos preparar la foto')
  return blob
}

export const nombreArchivo = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.webp`
