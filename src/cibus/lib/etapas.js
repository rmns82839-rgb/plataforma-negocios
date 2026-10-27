// Qué pantallas del panel de Cibus ya están pasadas a la plataforma (y con qué módulo se encienden).
// Las que todavía no, se muestran con la pantalla anterior de la plataforma (LEGADO) o se esconden.
//   modulo: módulo de la plataforma que debe estar encendido (null = siempre)
export const NUEVAS = {
  caja:     { modulo: 'caja' },
  retiros:  { modulo: 'caja' },
  ventas:   { modulo: 'caja' },
  pagos:    { modulo: 'caja' },
  gastos:   { modulo: 'caja' },
  exportar: { modulo: 'caja' },
  equipo:   { modulo: null },
  auditoria:{ modulo: null },
  cuenta:   { modulo: null },
  respaldo: { modulo: null },
  promos:   { modulo: 'publicidad' },
  ofertas:  { modulo: 'publicidad' },
  productos:{ modulo: 'productos' },
  fiados:   { modulo: 'fiados' },
  prestamos:{ modulo: 'prestamos' },
  reportes: { modulo: 'reportes' },
  tablero:  { modulo: 'reportes' },
  envivo:   { modulo: 'caja' },
  practica: { modulo: null },
}
// Pantallas de Cibus que aún usan la versión anterior de la plataforma: id de Cibus → [id de la pantalla anterior, módulo]
export const LEGADO = {
  clientes: ['clientes', null],
  pedidostienda: ['pedidos', null],
  formas: ['formas', 'caja'],
  plan: ['plan', null],
  categorias: ['categorias', 'productos'],
  negocio: ['tienda', null],
  comentarios: ['vitrina', 'opiniones'],
  menudia: ['vitrina', 'menu_del_dia'],
  musica: ['vitrina', 'musica_fondo'],
  resumen: ['resumen', 'resumen_semanal'],
}
// Funciones sueltas que dependen de SQL que todavía no está en la plataforma (se encienden en su etapa)
export const FUNCIONES = { prestamoRapido: true }

export const disponible = (id, modulos, soloDueno = false) => {
  const e = NUEVAS[id]
  if (e) return !e.modulo || modulos.includes(e.modulo)
  const l = LEGADO[id]
  return Boolean(l) && (!l[1] || modulos.includes(l[1]))
}
