// Copiar al portapapeles con respaldo (archivo .js aparte por el Fast Refresh de Vite).
// Devuelve true si se copió. Si el navegador no deja (sin HTTPS, permiso negado, WebView),
// prueba el método antiguo y, si tampoco, el que llama muestra el enlace para copiarlo a mano.
export async function copiarTexto(texto) {
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(texto)
      return true
    }
  } catch { /* sigue con el respaldo */ }
  try {
    const t = document.createElement('textarea')
    t.value = texto
    t.setAttribute('readonly', '')
    t.style.cssText = 'position:fixed;top:0;left:0;opacity:0;'
    document.body.appendChild(t)
    t.select()
    t.setSelectionRange(0, texto.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(t)
    return ok
  } catch { return false }
}
