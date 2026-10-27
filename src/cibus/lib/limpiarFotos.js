// Una sola vez por equipo: borra las fotos que el celular guardó "para verse sin internet".
// Si en ese momento una foto aún no existía (error), quedaba guardado el error y se veía el ícono roto.
const MARCA = 'fotos-limpias-v1'

export async function limpiarFotosGuardadas() {
  try {
    if (localStorage.getItem(MARCA)) return
    if (typeof caches === 'undefined') return
    await caches.delete('fotos-productos')
    localStorage.setItem(MARCA, String(Date.now()))
  } catch { /* sin almacenamiento: no pasa nada, las fotos se piden de nuevo */ }
}
