// Mapa de Google con un pin que se mueve tocando el mapa o arrastrándolo. Mismas propiedades que MapaPinOSM.
// Si Google no carga, avisa por onFallo y el contenedor (MapaPin) muestra el mapa de OpenStreetMap.
import { useEffect, useRef } from 'react'
import { cargarGoogleMaps } from '../lib/googleMaps'
import { MAPA } from '../lib/mapa'

const redondo = (n) => Number(Number(n).toFixed(6))

export default function MapaPinGoogle({ centro, pin, onPin, alto = 320, onFallo }) {
  const el = useRef(null), mapa = useRef(null), marca = useRef(null), cb = useRef(onPin), fallo = useRef(onFallo)
  cb.current = onPin; fallo.current = onFallo

  useEffect(() => {
    let vivo = true
    cargarGoogleMaps().then((gm) => {
      if (!vivo) return
      if (!gm || !el.current) { fallo.current && fallo.current(); return }
      const c = pin || centro || MAPA.centroPorDefecto
      const m = new gm.Map(el.current, {
        center: { lat: c.lat, lng: c.lng }, zoom: pin ? MAPA.zoomPin : centro ? 15 : MAPA.zoomPorDefecto,
        gestureHandling: 'cooperative', mapTypeControl: false, streetViewControl: false, fullscreenControl: false, clickableIcons: false,
      })
      const mk = new gm.Marker({ position: { lat: c.lat, lng: c.lng }, map: m, draggable: true })
      mk.addListener('dragend', () => { const p = mk.getPosition(); cb.current(redondo(p.lat()), redondo(p.lng())) })
      m.addListener('click', (e) => { mk.setPosition(e.latLng); cb.current(redondo(e.latLng.lat()), redondo(e.latLng.lng())) })
      mapa.current = m; marca.current = mk
    })
    return () => { vivo = false; mapa.current = null; marca.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Si el pin cambia desde afuera (otra coincidencia, GPS), el mapa lo sigue
  useEffect(() => {
    if (!pin || !mapa.current || !marca.current) return
    const p = marca.current.getPosition()
    if (!p || Math.abs(p.lat() - pin.lat) > 1e-6 || Math.abs(p.lng() - pin.lng) > 1e-6) {
      marca.current.setPosition({ lat: pin.lat, lng: pin.lng }); mapa.current.setCenter({ lat: pin.lat, lng: pin.lng })
      if ((mapa.current.getZoom() || 0) < MAPA.zoomPin - 1) mapa.current.setZoom(MAPA.zoomPin - 1)
    }
  }, [pin])

  return <div ref={el} style={{ height: alto, position: 'relative', zIndex: 0, isolation: 'isolate' }} className="w-full overflow-hidden rounded-2xl border-2 border-black/10 bg-black/5" role="application" aria-label="Mapa: toca o arrastra el pin hasta tu puerta" />
}
