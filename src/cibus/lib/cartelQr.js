// Arma una imagen lista para compartir o imprimir: título, código QR grande y el enlace de la tienda.
// Todo se dibuja en el celular (canvas); no se sube nada a ningún lado.
export async function armarCartel({ enlace, titulo = 'Escanea y pide', subtitulo = 'Tienda en línea · Pide por WhatsApp' }) {
  const QR = (await import('qrcode')).default ?? (await import('qrcode'))
  const qr = await QR.toDataURL(enlace, { margin: 1, width: 760, errorCorrectionLevel: 'M', color: { dark: '#14091f', light: '#ffffff' } })
  const img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = qr })
  const W = 1000, H = 1300
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d')
  g.fillStyle = '#0b0b0b'; g.fillRect(0, 0, W, H)
  g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(100, 250, 800, 800, 36); g.fill()
  g.drawImage(img, 120, 270, 760, 760)
  g.textAlign = 'center'; g.fillStyle = '#e8d5a8'
  g.font = 'bold 84px system-ui, sans-serif'; g.fillText(titulo, W / 2, 150)
  g.font = '40px system-ui, sans-serif'; g.fillText(subtitulo, W / 2, 210)
  g.fillStyle = '#ffffff'; g.font = 'bold 40px system-ui, sans-serif'
  g.fillText(enlace.replace(/^https?:\/\//, ''), W / 2, 1130)
  g.fillStyle = '#e8d5a8'; g.font = '34px system-ui, sans-serif'; g.fillText('Apunta la cámara de tu celular al código', W / 2, 1200)
  const blob = await new Promise(r => c.toBlob(r, 'image/png'))
  return { blob, url: URL.createObjectURL(blob) }
}
