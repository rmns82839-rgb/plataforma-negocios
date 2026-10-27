// fetch con memoria: si hay internet funciona igual que siempre y guarda la respuesta de las consultas;
// si no hay internet devuelve la última respuesta guardada de esa misma consulta. Las escrituras no se tocan.
import { guardarCache, leerCache } from './offline'

const LECTURA_RPC = /\/rest\/v1\/rpc\/(es_|listar|mfa)/

const aTexto = (b) => (typeof b === 'string' ? b : '')

export async function fetchConMemoria(entrada, init = {}) {
  const url = typeof entrada === 'string' ? entrada : (entrada?.url ?? String(entrada))
  const metodo = String(init.method ?? entrada?.method ?? 'GET').toUpperCase()
  const guardable = url.includes('/rest/v1/') && !url.includes('/rest/v1/rpc/')
    ? metodo === 'GET'
    : metodo === 'POST' && LECTURA_RPC.test(url)
  if (!guardable) return fetch(entrada, init)

  let acepta = ''
  try { acepta = new Headers(init.headers ?? entrada?.headers).get('accept') ?? '' } catch { /* sin cabeceras */ }
  const clave = `${metodo} ${url} ${acepta} ${metodo === 'POST' ? aTexto(init.body) : ''}`
  try {
    const res = await fetch(entrada, init)
    if (res.ok) {
      res.clone().text().then(cuerpo => guardarCache(clave, {
        cuerpo, tipo: res.headers.get('content-type'), rango: res.headers.get('content-range'),
      })).catch(() => {})
    }
    return res
  } catch (e) {
    const g = await leerCache(clave)
    if (!g) throw e
    const cab = { 'content-type': g.tipo ?? 'application/json' }
    if (g.rango) cab['content-range'] = g.rango
    return new Response(g.cuerpo, { status: 200, headers: cab })
  }
}
