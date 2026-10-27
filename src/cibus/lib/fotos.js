// Fotos de un producto o prenda. En la plataforma la base guarda la RUTA dentro del espacio de archivos; aquí se arma la dirección.
import { urlImagen } from '../../lib/supabase'

/** Dirección pública de una foto: las que ya son direcciones se dejan igual. */
export const urlFoto = (f) => (!f ? null : /^(https?:|blob:|data:|\/)/.test(f) ? f : urlImagen(f))

export const fotosDe = (p) =>
  (p?.imagenes?.length ? p.imagenes : (p?.imagen_url ? [p.imagen_url] : [])).map(urlFoto).filter(Boolean)

export const MAX_FOTOS = 5
