// Código QR del catálogo para compartir por WhatsApp o descargar e imprimir (mostrador, bolsas, vidrio).
import { useEffect, useState } from 'react'
import Modal from './Modal'
import { armarCartel } from '../lib/cartelQr'
import { enlaceTienda } from '../lib/enlaces'

export default function QrCatalogo({ enlace = enlaceTienda(), onCerrar }) {
  const [cartel, setCartel] = useState(null)
  const [aviso, setAviso] = useState('')
  useEffect(() => {
    let vivo = true, u = null
    armarCartel({ enlace }).then(c => { u = c.url; if (vivo) setCartel(c) }).catch(() => vivo && setAviso('No se pudo armar el código. Intenta de nuevo'))
    return () => { vivo = false; if (u) URL.revokeObjectURL(u) }
  }, [enlace])

  const descargar = () => {
    if (!cartel) return
    const a = document.createElement('a'); a.href = cartel.url; a.download = 'qr-tienda.png'
    document.body.appendChild(a); a.click(); a.remove()
    setAviso('Listo: quedó en tus descargas')
  }
  const compartir = async () => {
    if (!cartel) return
    const archivo = new File([cartel.blob], 'qr-tienda.png', { type: 'image/png' })
    try {
      if (navigator.canShare?.({ files: [archivo] })) { await navigator.share({ files: [archivo], text: `Pide aquí 👉 ${enlace}` }); return }
    } catch (e) { if (e?.name === 'AbortError') return }
    descargar()                                   // si el celular no deja compartir imágenes, se descarga
  }

  return (
    <Modal titulo="Código QR de la tienda" onCerrar={onCerrar}>
      <p className="text-base text-slate-600">Quien lo escanee con la cámara entra directo a tu catálogo. Compártelo por WhatsApp o descárgalo para imprimirlo.</p>
      {cartel ? <img src={cartel.url} alt="Código QR del catálogo de la tienda" className="w-full max-w-xs mx-auto rounded-2xl ring-1 ring-slate-200" />
        : <p className="text-center text-slate-400 py-10">{aviso || 'Preparando el código…'}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={compartir} disabled={!cartel} className="min-h-14 rounded-xl bg-esmeralda text-white text-base font-bold disabled:opacity-40 active:opacity-80">Compartir</button>
        <button onClick={descargar} disabled={!cartel} className="min-h-14 rounded-xl bg-negro text-champagne text-base font-bold disabled:opacity-40 active:opacity-80">Descargar</button>
      </div>
      {aviso && cartel && <p className="text-center text-sm text-slate-500">{aviso}</p>}
      <button onClick={onCerrar} className="w-full min-h-12 rounded-xl bg-slate-100 text-slate-700 text-base font-semibold">← Volver</button>
    </Modal>
  )
}
