// Crear un usuario (correo + contraseña) y meterlo al equipo de UNA tienda. Lógica pura: la red se inyecta (f), así se prueba sola.
// La llave de servicio (SUPABASE_SERVICE_ROLE_KEY) vive solo en Vercel y se usa únicamente para crear la cuenta de Auth;
// quién pide y a qué tienda lo añade se comprueba SIEMPRE con la sesión del propio dueño.
const CORREO = /^[^\s@]+@[^\s@]+\.[^@\s]{2,}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function crearUsuario({ cuerpo, token, base, anon, servicio }, f = fetch) {
  const fin = (http, c) => ({ http, cuerpo: c })
  if (!base || !anon) return fin(500, { error: 'Faltan las variables de Supabase en Vercel' })
  if (!servicio) return fin(503, { error: 'Falta la variable SUPABASE_SERVICE_ROLE_KEY en Vercel. Mientras tanto, la persona puede entrar con Google y usa «Ya tiene cuenta» para darle acceso.' })
  if (!token) return fin(401, { error: 'Sesión no válida' })
  const negocio = String(cuerpo?.negocio_id || '')
  const email = String(cuerpo?.email || '').trim().toLowerCase()
  const password = String(cuerpo?.password || '')
  const rol = cuerpo?.rol === 'dueno' ? 'dueno' : 'cajero'
  if (!UUID.test(negocio)) return fin(400, { error: 'Falta la tienda' })
  if (!CORREO.test(email) || email.length > 120) return fin(400, { error: 'El correo no es válido' })
  if (password.length < 8 || password.length > 72) return fin(400, { error: 'La contraseña debe tener entre 8 y 72 caracteres' })

  const rpc = (nombre, args, llave, bearer) => f(`${base}/rest/v1/rpc/${nombre}`, {
    method: 'POST', headers: { apikey: llave, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
  })
  // 1. ¿Quien pide es dueño DE ESA tienda (y no es soporte)?  Se mira con su propia sesión.
  const esDueno = await rpc('es_dueno', { p_negocio_id: negocio }, anon, token).then((r) => (r.ok ? r.json() : false)).catch(() => false)
  if (esDueno !== true) return fin(403, { error: 'Solo el dueño de la tienda puede crear usuarios' })
  const esSoporte = await rpc('es_soporte', { p_negocio_id: negocio }, anon, token).then((r) => (r.ok ? r.json() : true)).catch(() => true)
  if (esSoporte !== false) return fin(403, { error: 'La cuenta de soporte es de solo lectura' })

  // 2. Crear la cuenta ya confirmada
  const crear = await f(`${base}/auth/v1/admin/users`, {
    method: 'POST', headers: { apikey: servicio, Authorization: `Bearer ${servicio}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  const creado = await crear.json().catch(() => ({}))
  if (!crear.ok) {
    const ya = /already|registered|exists/i.test(JSON.stringify(creado))
    return fin(ya ? 409 : 400, { error: ya ? 'Ese correo ya tiene cuenta. Usa «Ya tiene cuenta» para darle acceso.' : (creado.msg || creado.message || creado.error_description || 'No se pudo crear el usuario') })
  }
  // 3. Meterlo al equipo (con la sesión del dueño: la función valida que sea dueño y respeta el límite del plan)
  const acceso = await rpc('invitar_miembro', { p_negocio_id: negocio, p_email: email, p_rol: rol }, anon, token)
  if (!acceso.ok) {
    await f(`${base}/auth/v1/admin/users/${creado.id}`, { method: 'DELETE', headers: { apikey: servicio, Authorization: `Bearer ${servicio}` } }).catch(() => {})   // sin cuentas huérfanas
    const e = await acceso.json().catch(() => ({}))
    return fin(400, { error: e.message || 'No se pudo dar acceso al usuario' })
  }
  return fin(200, { ok: true, email, rol })
}
