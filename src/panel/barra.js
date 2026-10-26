// Qué botones van en la barra de abajo y cuáles en "Más" (archivo aparte para poder probarlo sin navegador)

const BARRA = ['caja', 'productos', 'fiados', 'pedidos']       // lo que se prefiere ver en la barra (los que el plan permita)

/** Reparte los botones del panel entre la barra de abajo y el menú "Más". */
export function repartir(botones) {
  const disponibles = botones.map(b => b[0])
  const enBarra = BARRA.filter(k => disponibles.includes(k)).slice(0, 3)
  const enMas = botones.filter(b => !enBarra.includes(b[0]))
  return { enBarra, enMas }
}
