// Service worker de Matriz. Hace dos cosas: permite instalar la app y acelera lo que no cambia.
//  · Páginas: primero la red; si no hay internet, abre la última versión guardada de la app.
//  · /assets (archivos con huella en el nombre): se guardan para siempre.
//  · Fotos de las tiendas: se muestran al instante y se refrescan en segundo plano. SOLO se guardan respuestas buenas
//    (así una foto que falló una vez no queda "rota" para siempre) y nunca más de MAX_FOTOS.
//  · Avisos push (pedido nuevo para el equipo de la tienda): se muestran aunque la app esté cerrada; al tocarlos abren el panel.
//  · Nunca toca: /api, la base de datos, el login, la música ni nada que no sea GET.
const V = 'v1'
const CACHE_APP = `app-${V}`
const CACHE_ASSETS = `assets-${V}`
const CACHE_FOTOS = `fotos-${V}`
const MAX_FOTOS = 600
const ACTUALES = [CACHE_APP, CACHE_ASSETS, CACHE_FOTOS]

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_APP).then((c) => c.add(new Request('/', { cache: 'reload' }))).catch(() => {}).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => !ACTUALES.includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})

async function podar(nombre, max) {
  const c = await caches.open(nombre)
  const claves = await c.keys()
  for (let i = 0; i < claves.length - max; i++) await c.delete(claves[i])   // las más viejas primero
}

async function pagina(req) {
  try {
    const r = await fetch(req)
    if (r.ok) { const c = await caches.open(CACHE_APP); c.put('/', r.clone()) }
    return r
  } catch {
    return (await caches.match('/')) || new Response('Sin internet. Abre la app cuando tengas conexión.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }
}

async function estatico(req) {
  const c = await caches.open(CACHE_ASSETS)
  const hit = await c.match(req)
  if (hit) return hit
  const r = await fetch(req)
  if (r.ok && r.status === 200) c.put(req, r.clone())
  return r
}

async function foto(e, req) {
  const c = await caches.open(CACHE_FOTOS)
  const hit = await c.match(req.url)
  const red = fetch(new Request(req.url, { mode: 'cors', credentials: 'omit' })).then(async (r) => {
    if (r.ok && r.status === 200 && r.type !== 'opaque') { await c.put(req.url, r.clone()); await podar(CACHE_FOTOS, MAX_FOTOS) }
    return r
  })
  if (hit) { e.waitUntil(red.catch(() => {})); return hit }
  try { return await red } catch { return Response.error() }
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return
    if (req.mode === 'navigate') return e.respondWith(pagina(req))
    if (url.pathname.startsWith('/assets/')) return e.respondWith(estatico(req))
    return
  }
  if (url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/storage/v1/object/public/negocios/') && req.destination === 'image') return e.respondWith(foto(e, req))
})

// ---------- Avisos push ----------
self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { cuerpo: e.data && e.data.text() } }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Matriz', {
    body: d.cuerpo || '', icon: '/icon-192.png', badge: '/favicon-64.png', tag: d.tag || undefined, renotify: Boolean(d.tag),
    vibrate: [200, 100, 200], data: { url: typeof d.url === 'string' && d.url.startsWith('/') ? d.url : '/' },
  }))
})
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/'
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    for (const w of ws) { if (new URL(w.url).origin === self.location.origin && 'focus' in w) { w.navigate(url).catch(() => {}); return w.focus() } }
    return self.clients.openWindow(url)
  }))
})
