import { useEffect, useState } from 'react'

// Router mínimo: /  ·  /t/{slug} (tienda)  ·  /t/{slug}/panel  ·  (/n/{slug} sigue funcionando)
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
    return { vista: partes[2] === 'panel' ? 'panel' : 'publico', slug: partes[1].toLowerCase() }
  }
  return { vista: 'inicio', slug: null }
}
