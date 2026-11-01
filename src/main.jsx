import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { iniciarPwa } from './lib/pwa'
import { supabase } from './lib/supabase'
import { aplicarVista, hacenFaltaMarco } from './lib/vistaPantalla'
import VistaMarco from './tienda/VistaMarco'
import { repararNavegador } from './lib/reparar'

if (window.location.pathname === '/reparar') {
  // /reparar: borra lo guardado de la plataforma en este navegador y vuelve al inicio
  document.getElementById('root').innerHTML = '<p style="font:600 22px sans-serif;text-align:center;padding:48px 16px">Reparando… un momento 🔧</p>'
  repararNavegador().then(() => window.location.replace('/'), () => window.location.replace('/'))
} else {
aplicarVista()
createRoot(document.getElementById('root')).render(<StrictMode>{hacenFaltaMarco() ? <VistaMarco /> : <App />}</StrictMode>)


// App instalable: se guarda el aviso de instalación del navegador y se registra el service worker.
iniciarPwa(() => {
  const m = window.location.pathname.match(/^\/[tn]\/([a-z0-9-]+)/)
  if (m && supabase) supabase.rpc('registrar_evento', { p_slug: m[1], p_evento: 'instalo_app' }).then(() => {}, () => {})
})
}
