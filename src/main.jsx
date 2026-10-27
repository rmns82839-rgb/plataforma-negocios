import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { iniciarPwa } from './lib/pwa'
import { supabase } from './lib/supabase'

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)

// App instalable: se guarda el aviso de instalación del navegador y se registra el service worker.
iniciarPwa(() => {
  const m = window.location.pathname.match(/^\/[tn]\/([a-z0-9-]+)/)
  if (m && supabase) supabase.rpc('registrar_evento', { p_slug: m[1], p_evento: 'instalo_app' }).then(() => {}, () => {})
})
