// Supabase entrega como máximo 1.000 filas por consulta (aunque se pida .range(0, 4999)).
// Esta ayuda pide por páginas de 1.000 hasta traer todo. `armar` debe devolver una consulta NUEVA cada vez.
// Devuelve { data, error } igual que una consulta normal.
export async function traerTodo(armar, pagina = 1000, maxPaginas = 40) {
  let todos = []
  for (let i = 0; i < maxPaginas; i++) {
    const { data, error } = await armar().range(i * pagina, i * pagina + pagina - 1)
    if (error) return { data: i === 0 ? null : todos, error }
    const f = Array.isArray(data) ? data : []
    todos = todos.concat(f)
    if (f.length < pagina) break
  }
  return { data: todos, error: null }
}
