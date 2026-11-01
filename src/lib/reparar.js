// «Reparar»: borra lo que este navegador guardó de la plataforma (copia vieja de la app, caché y un intento de login a medias)
// y vuelve al inicio. Sirve cuando una pestaña se queda en blanco o no deja entrar con Google y en incógnito sí funciona.
// Lo que NO se pierde: nada de la tienda ni de la cuenta; solo toca que volver a iniciar sesión.
export async function repararNavegador(env = globalThis) {
  const pasos = []
  try {
    const regs = (await env.navigator?.serviceWorker?.getRegistrations?.()) || []
    await Promise.all(regs.map((r) => r.unregister())); pasos.push('service worker')
  } catch { /* el navegador no lo permite */ }
  try {
    const claves = (await env.caches?.keys?.()) || []
    await Promise.all(claves.map((k) => env.caches.delete(k))); pasos.push('caché')
  } catch { /* sin caché */ }
  try {
    const ls = env.localStorage
    const borrar = []
    for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && /^sb-|-auth-token|code-verifier/.test(k)) borrar.push(k) }
    borrar.forEach((k) => ls.removeItem(k)); pasos.push('sesión')
  } catch { /* sin almacenamiento */ }
  try { env.sessionStorage?.clear?.() } catch { /* nada */ }
  return pasos
}

// ¿Google devolvió un error al volver a la página? (Supabase lo pone en la dirección)
export const huboErrorDeLogin = (search = '', hash = '') => /[?&#](error|error_code|error_description)=/.test(`${search}${hash}`)
