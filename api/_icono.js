// Dibuja el ícono PNG de la app de una tienda: su logo sobre blanco, o —si no subió logo— la marca Matriz sobre el color de la tienda.
import sharp from 'sharp'

export const TAMANOS = [180, 192, 512]
const HEX = /^#[0-9A-Fa-f]{6}$/

// Marca Matriz en dorado, para las tiendas que todavía no tienen logo
const ISOTIPO = (px) => `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 100 100"><defs><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="#fff"/><polygon points="50,52 46,0 78,0" fill="#000"/></mask></defs><path mask="url(#m)" fill="#E9D29B" fill-rule="evenodd" d="M50 12a40 40 0 1 1 0 80a40 40 0 1 1 0-80zM47 18a34 34 0 1 0 0 68a34 34 0 1 0 0-68z"/><path fill="#E9D29B" d="M56 27C68 41 66 62 44 77C36 58 42 38 56 27Z"/></svg>`

// logo: Buffer o null. mascara = ícono "maskable" (más margen, para que el celular lo recorte en círculo sin cortar el logo)
export async function dibujarIcono({ logo, color, size, mascara = false }) {
  if (!TAMANOS.includes(size)) throw new Error('Tamaño no permitido')
  const fondo = HEX.test(color || '') ? color : '#0B0B0C'
  const margen = Math.round(size * (mascara ? 0.22 : 0.1))
  const interior = size - margen * 2
  if (logo) {
    const dentro = await sharp(logo, { failOn: 'none' }).rotate().resize(interior, interior, { fit: 'inside', background: '#FFFFFF' }).png().toBuffer()
    return sharp({ create: { width: size, height: size, channels: 4, background: '#FFFFFF' } }).composite([{ input: dentro, gravity: 'center' }]).png({ compressionLevel: 9 }).toBuffer()
  }
  const marca = await sharp(Buffer.from(ISOTIPO(interior))).png().toBuffer()
  return sharp({ create: { width: size, height: size, channels: 4, background: fondo } }).composite([{ input: marca, gravity: 'center' }]).png({ compressionLevel: 9 }).toBuffer()
}
