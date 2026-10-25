// Mapa con un pin que se mueve tocando el mapa o arrastrándolo. Leaflet + OpenStreetMap (ver ../lib/mapa.js).
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MAPA } from '../lib/mapa'

const icono = L.divIcon({
  className: '',
  html: '<div style="width:34px;height:34px;border-radius:50% 50% 50% 0;background:#c0392b;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.45);transform:rotate(-45deg)"></div>',
  iconSize: [34, 34], iconAnchor: [17, 34],
})

export default function MapaPin({ centro, pin, onPin, alto = 320 }) {
  const el = useRef(null), mapa = useRef(null), marca = useRef(null), cb = useRef(onPin)
  cb.current = onPin

  useEffect(() => {
    const c = pin || centro || MAPA.centroPorDefecto
    const m = L.map(el.current, { scrollWheelZoom: false, zoomControl: true }).setView([c.lat, c.lng], pin ? MAPA.zoomPin : centro ? 15 : MAPA.zoomPorDefecto)
    L.tileLayer(MAPA.mosaicos, { maxZoom: MAPA.zoomMax, attribution: MAPA.atribucion }).addTo(m)
    const mk = L.marker([c.lat, c.lng], { draggable: true, icon: icono, keyboard: false }).addTo(m)
    mk.on('dragend', () => { const p = mk.getLatLng(); cb.current(Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6))) })
    m.on('click', (e) => { mk.setLatLng(e.latlng); cb.current(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))) })
    mapa.current = m; marca.current = mk
    setTimeout(() => m.invalidateSize(), 50)
    return () => { m.remove(); mapa.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Si el pin cambia desde afuera (otra coincidencia, GPS), el mapa lo sigue
  useEffect(() => {
    if (!pin || !mapa.current) return
    const p = marca.current.getLatLng()
    if (Math.abs(p.lat - pin.lat) > 1e-6 || Math.abs(p.lng - pin.lng) > 1e-6) {
      marca.current.setLatLng([pin.lat, pin.lng]); mapa.current.setView([pin.lat, pin.lng], Math.max(mapa.current.getZoom(), MAPA.zoomPin - 1))
    }
  }, [pin])

  return <div ref={el} style={{ height: alto, position: 'relative', zIndex: 0, isolation: 'isolate' }} className="w-full overflow-hidden rounded-2xl border-2 border-black/10" role="application" aria-label="Mapa: toca o arrastra el pin hasta tu puerta" />
}
