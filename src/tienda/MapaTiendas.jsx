// Mapa de /tiendas: un punto por tienda, con su logo (o su inicial y color). Google Maps si hay clave; si no carga, OpenStreetMap.
// Tocar un punto selecciona la tienda; seleccionar una tienda desde la lista centra el mapa en ella.
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { cargarGoogleMaps, hayGoogle } from '../lib/googleMaps'
import { MAPA } from '../lib/mapa'
import { urlImagen } from '../lib/supabase'

const urlLogo = (t) => urlImagen(t.logo) || (typeof t.logo_url === 'string' && t.logo_url.startsWith('/') ? t.logo_url : null)

/** El punto del mapa: círculo con el logo, borde blanco y sombra. */
export function elementoPunto(t, activa) {
  const d = document.createElement('div')
  const tam = activa ? 56 : 46
  d.style.cssText = `width:${tam}px;height:${tam}px;border-radius:50%;background:#fff;border:${activa ? 4 : 3}px solid ${activa ? '#D8B978' : '#fff'};box-shadow:0 2px 10px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:pointer;box-sizing:border-box;transition:all .15s`
  d.title = t.nombre
  const url = urlLogo(t)
  if (url) {
    const i = document.createElement('img'); i.src = url; i.alt = t.nombre; i.style.cssText = 'width:100%;height:100%;object-fit:contain;padding:3px'
    i.onerror = () => { d.removeChild(i); d.appendChild(inicial(t)) }
    d.appendChild(i)
  } else d.appendChild(inicial(t))
  return d
}
function inicial(t) {
  const s = document.createElement('div')
  s.style.cssText = `width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#fff;font:700 20px system-ui;background:${t.logo_auto?.color || '#1E3A5F'}`
  s.textContent = t.logo_auto?.inicial || (t.nombre || '?').charAt(0).toUpperCase()
  return s
}

const tienePunto = (t) => t.lat != null && t.lng != null && Number.isFinite(Number(t.lat)) && Number.isFinite(Number(t.lng))
const conPunto = (l) => l.filter(tienePunto)

function MapaGoogle({ tiendas, seleccion, onSeleccion, pos, alto, onFallo }) {
  const el = useRef(null), mapa = useRef(null), puntos = useRef(new Map()), cb = useRef(onSeleccion), yo = useRef(null)
  cb.current = onSeleccion
  const gmRef = useRef(null)

  useEffect(() => {
    let vivo = true
    cargarGoogleMaps().then((gm) => {
      if (!vivo) return
      if (!gm || !el.current) { onFallo(); return }
      gmRef.current = gm
      mapa.current = new gm.Map(el.current, { center: MAPA.centroPorDefecto, zoom: MAPA.zoomPorDefecto, gestureHandling: 'greedy', mapTypeControl: false, streetViewControl: false, fullscreenControl: false, clickableIcons: false })
      pintar()
    })
    return () => { vivo = false; puntos.current.forEach((o) => o.setMap(null)); puntos.current.clear() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function crearOverlay(gm, t, activa) {
    class Punto extends gm.OverlayView {
      constructor() { super(); this.pos = new gm.LatLng(Number(t.lat), Number(t.lng)); this.div = null }
      onAdd() {
        this.div = document.createElement('div'); this.div.style.position = 'absolute'
        this.div.appendChild(elementoPunto(t, activa))
        this.div.addEventListener('click', (e) => { e.stopPropagation(); cb.current(t.slug) })
        this.getPanes().overlayMouseTarget.appendChild(this.div)
      }
      draw() {
        const p = this.getProjection()?.fromLatLngToDivPixel(this.pos); if (!p || !this.div) return
        const tam = activa ? 56 : 46
        this.div.style.left = `${p.x - tam / 2}px`; this.div.style.top = `${p.y - tam / 2}px`; this.div.style.zIndex = activa ? 10 : 1
      }
      onRemove() { this.div?.remove(); this.div = null }
    }
    return new Punto()
  }

  function pintar() {
    const gm = gmRef.current, m = mapa.current; if (!gm || !m) return
    puntos.current.forEach((o) => o.setMap(null)); puntos.current.clear()
    const lista = conPunto(tiendas)
    for (const t of lista) { const o = crearOverlay(gm, t, t.slug === seleccion); o.setMap(m); puntos.current.set(t.slug, o) }
  }
  useEffect(() => { pintar() }, [tiendas, seleccion]) // eslint-disable-line react-hooks/exhaustive-deps

  // Encuadre: todas las tiendas (y la persona) cuando cambia la lista
  useEffect(() => {
    const gm = gmRef.current, m = mapa.current; if (!gm || !m) return
    const lista = conPunto(tiendas); if (!lista.length) return
    if (lista.length === 1) { m.setCenter({ lat: Number(lista[0].lat), lng: Number(lista[0].lng) }); m.setZoom(15); return }
    const b = new gm.LatLngBounds(); lista.forEach((t) => b.extend({ lat: Number(t.lat), lng: Number(t.lng) })); if (pos) b.extend(pos)
    m.fitBounds(b, 60)
  }, [tiendas]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {   // seleccionar desde la lista: centra el mapa
    const m = mapa.current, t = tiendas.find((x) => x.slug === seleccion)
    if (m && t && tienePunto(t)) m.panTo({ lat: Number(t.lat), lng: Number(t.lng) })
  }, [seleccion]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {   // la persona
    const gm = gmRef.current, m = mapa.current; if (!gm || !m) return
    yo.current?.setMap(null); yo.current = null
    if (pos) yo.current = new gm.Marker({ position: pos, map: m, title: 'Tú estás aquí', icon: { path: gm.SymbolPath.CIRCLE, scale: 8, fillColor: '#1a73e8', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 } })
  }, [pos])

  return <div ref={el} style={{ height: alto, position: 'relative', zIndex: 0, isolation: 'isolate' }} className="w-full overflow-hidden rounded-2xl border-2 border-black/10 bg-black/5" role="application" aria-label="Mapa de tiendas" />
}

function MapaOSM({ tiendas, seleccion, onSeleccion, pos, alto }) {
  const el = useRef(null), mapa = useRef(null), capa = useRef(null), cb = useRef(onSeleccion), yo = useRef(null)
  cb.current = onSeleccion
  useEffect(() => {
    const m = L.map(el.current, { scrollWheelZoom: true, zoomControl: true }).setView([MAPA.centroPorDefecto.lat, MAPA.centroPorDefecto.lng], MAPA.zoomPorDefecto)
    L.tileLayer(MAPA.mosaicos, { maxZoom: MAPA.zoomMax, attribution: MAPA.atribucion }).addTo(m)
    capa.current = L.layerGroup().addTo(m); mapa.current = m
    setTimeout(() => m.invalidateSize(), 60)
    return () => { m.remove(); mapa.current = null }
  }, [])
  useEffect(() => {
    const m = mapa.current; if (!m) return
    capa.current.clearLayers()
    for (const t of conPunto(tiendas)) {
      const activa = t.slug === seleccion, tam = activa ? 56 : 46
      const ic = L.divIcon({ className: '', html: elementoPunto(t, activa), iconSize: [tam, tam], iconAnchor: [tam / 2, tam / 2] })
      L.marker([Number(t.lat), Number(t.lng)], { icon: ic, keyboard: false, zIndexOffset: activa ? 1000 : 0 }).on('click', () => cb.current(t.slug)).addTo(capa.current)
    }
  }, [tiendas, seleccion])
  useEffect(() => {
    const m = mapa.current; if (!m) return
    const lista = conPunto(tiendas); if (!lista.length) return
    const pts = lista.map((t) => [Number(t.lat), Number(t.lng)]); if (pos) pts.push([pos.lat, pos.lng])
    if (pts.length === 1) m.setView(pts[0], 15); else m.fitBounds(pts, { padding: [50, 50] })
  }, [tiendas]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const m = mapa.current, t = tiendas.find((x) => x.slug === seleccion)
    if (m && t && tienePunto(t)) m.panTo([Number(t.lat), Number(t.lng)])
  }, [seleccion]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const m = mapa.current; if (!m) return
    yo.current?.remove(); yo.current = null
    if (pos) yo.current = L.circleMarker([pos.lat, pos.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1 }).addTo(m)
  }, [pos])
  return <div ref={el} style={{ height: alto, position: 'relative', zIndex: 0, isolation: 'isolate' }} className="w-full overflow-hidden rounded-2xl border-2 border-black/10" role="application" aria-label="Mapa de tiendas" />
}

export default function MapaTiendas(props) {
  const [google, setGoogle] = useState(() => hayGoogle())
  return google ? <MapaGoogle {...props} onFallo={() => setGoogle(false)} /> : <MapaOSM {...props} />
}
