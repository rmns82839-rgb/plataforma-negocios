// Traduce los mensajes técnicos de la base de datos a frases que entienda cualquier persona
export function mensajeError(e) {
  const m = String(e?.message || e || '')
  if (/Tu plan permite hasta/.test(m)) return m
  if (/solo puede consultar|solo lectura/i.test(m)) return 'Tu cuenta es de solo lectura: puedes mirar, pero no cambiar nada.'
  if (/row-level security|permission denied|No autorizado/i.test(m)) return 'No tienes permiso para hacer esto con tu cuenta.'
  if (/duplicate key|already exists|unique/i.test(m)) return 'Ya existe uno con ese nombre o código. Cambia el nombre o el código.'
  if (/color_(principal|acento)|contraste/i.test(m)) return 'Ese color es muy claro: el texto blanco no se leería. Elige uno más oscuro.'
  if (/Solo el dueño/.test(m)) return m
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.'
  if (/violates check constraint/i.test(m)) return 'Alguno de los datos no es válido. Revisa lo que escribiste.'
  return m.length > 0 && m.length < 220 ? m : 'Algo salió mal. Intenta de nuevo.'
}
