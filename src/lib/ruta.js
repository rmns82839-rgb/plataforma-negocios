import { useEffect, useState } from 'react'

// Router mínimo: /  ·  /tiendas (directorio)  ·  /t/{slug} (tienda)  ·  /t/{slug}/mis-pedidos  ·  /t/{slug}/panel  ·  /t/{slug}/pistola (el celular como pistola)  ·  (/n/{slug} sigue funcionando)
export function ir(path) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function useRuta() {
  const [path, setPath] = useState(window.location.pathname)
  useEffect(() => {
    const f = () => setPath(window.location.pathname)
    window.addEventListener('popstate', f)
    return () => window.removeEventListener('popstate', f)
  }, [])
  const partes = path.split('/').filter(Boolean)
  if ((partes[0] === 't' || partes[0] === 'n') && partes[1]) {
    if (partes[2] === 'privacidad' || partes[2] === 'terminos') return { vista: 'legal', slug: partes[1].toLowerCase(), legal: partes[2] }
    const v = partes[2] === 'panel' ? 'panel' : partes[2] === 'mis-pedidos' ? 'mis-pedidos' : partes[2] === 'pistola' ? 'pistola' : 'publico'
    return { vista: v, slug: partes[1].toLowerCase() }
  }
  if (partes[0] === 'tiendas') return { vista: 'directorio', slug: null }
  return { vista: 'inicio', slug: null }
}
