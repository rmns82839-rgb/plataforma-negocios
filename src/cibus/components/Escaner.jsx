// src/components/Escaner.jsx
// ------------------------------------------------------------
// Escáner unificado: cámara (BarcodeDetector nativo o ZXing) + pistola
// USB/Bluetooth (teclado HID). Ambas fuentes desembocan en onCodigo.
// Adaptado de FarmaStock: el dígito de control EAN solo se exige a la
// cámara (que puede leer mal); la pistola y el teclado aceptan cualquier
// código, incluidos los internos de la tienda.
// ------------------------------------------------------------
import { useEffect, useRef, useState, useCallback } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import { usePistola } from '../hooks/usePistola'

const COOLDOWN_MS = 1500

const HINTS = new Map([
  [DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.CODE_128,
    BarcodeFormat.QR_CODE,
  ]],
  [DecodeHintType.TRY_HARDER, true],
])

/** Verifica el dígito de control de un EAN/UPC/GTIN. */
function eanValido(codigo) {
  if (!/^\d+$/.test(codigo)) return true
  if (![8, 12, 13, 14].includes(codigo.length)) return false
  const d = codigo.split('').map(Number)
  const control = d.pop()
  let suma = 0
  d.reverse().forEach((n, i) => { suma += n * (i % 2 === 0 ? 3 : 1) })
  return (10 - (suma % 10)) % 10 === control
}

export default function Escaner({ onCodigo, activo = true, compacto = false, fino = false }) {
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const ultimo = useRef({ codigo: '', t: 0 })

  const [camaraActiva, setCamaraActiva] = useState(false)
  const [error, setError] = useState('')
  const [ultimaLectura, setUltimaLectura] = useState('')
  const [tieneLinterna, setTieneLinterna] = useState(null)
  const [linternaOn, setLinternaOn] = useState(false)

  const alternarLinterna = async () => {
    if (!tieneLinterna) return
    const nuevo = !linternaOn
    await tieneLinterna.applyConstraints({ advanced: [{ torch: nuevo }] })
    setLinternaOn(nuevo)
  }

  // Puerta única: todo código pasa por aquí, venga de donde venga
  const emitir = useCallback((codigo, origen = 'pistola') => {
    const limpio = String(codigo).trim()
    if (!limpio) return
    if (origen === 'camara' && !eanValido(limpio)) return
    const ahora = Date.now()
    if (limpio === ultimo.current.codigo && ahora - ultimo.current.t < COOLDOWN_MS) return
    ultimo.current = { codigo: limpio, t: ahora }
    setUltimaLectura(limpio)
    if (navigator.vibrate) navigator.vibrate(60)
    onCodigo?.(limpio)
  }, [onCodigo])

  usePistola((c) => emitir(c, 'pistola'), activo)

  const usarDetectorNativo = async (stream) => {
    const det = new window.BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'upc_a', 'code_128', 'qr_code'],
    })
    let corriendo = true
    const bucle = async () => {
      while (corriendo) {
        try {
          const codigos = await det.detect(videoRef.current)
          if (codigos.length) emitir(codigos[0].rawValue, 'camara')
        } catch { /* cuadro no analizable */ }
        await new Promise(r => setTimeout(r, 150))
      }
    }
    bucle()
    return {
      stop: () => {
        corriendo = false
        stream.getTracks().forEach(t => t.stop())
      },
    }
  }

  const encenderCamara = async () => {
    setError('')
    try {
      if ('BarcodeDetector' in window) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width:  { ideal: 1280 },
            height: { ideal: 720 },
          },
        })
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        controlsRef.current = await usarDetectorNativo(stream)
        const track = stream.getVideoTracks()[0]
        if (track?.getCapabilities?.().torch) setTieneLinterna(track)
        setCamaraActiva(true)
        return
      }

      const lector = new BrowserMultiFormatReader(HINTS)
      controlsRef.current = await lector.decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: 'environment' },
            width:  { ideal: 1280 },
            height: { ideal: 720 },
            focusMode: 'continuous',
          },
        },
        videoRef.current,
        (resultado) => {
          if (resultado) emitir(resultado.getText(), 'camara')
        }
      )
      setCamaraActiva(true)

      const track = videoRef.current?.srcObject?.getVideoTracks?.()[0]
      if (track?.getCapabilities?.().torch) setTieneLinterna(track)
    } catch (e) {
      console.error(e)
      if (e.name === 'NotAllowedError') setError('Permiso de cámara denegado')
      else if (e.name === 'NotFoundError') setError('No se encontró cámara')
      else setError('No se pudo abrir la cámara: ' + e.message)
    }
  }

  const apagarCamara = useCallback(() => {
    controlsRef.current?.stop()
    controlsRef.current = null
    setCamaraActiva(false)
  }, [])

  useEffect(() => () => apagarCamara(), [apagarCamara])

  return (
    <div className="space-y-3">
      <div className={`relative rounded-2xl overflow-hidden bg-slate-900 ${
        fino && !camaraActiva ? 'h-16' : compacto ? 'aspect-[16/7]' : 'aspect-[4/3]'}`}>
        <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />

        {!camaraActiva && (
          <div className={`absolute inset-0 grid place-items-center text-center px-6 ${fino ? 'px-3' : ''}`}>
            <div className={fino ? 'grid grid-cols-[1fr_auto] gap-3 items-center w-full text-left' : 'space-y-3'}>
              <p className="text-slate-300 text-sm">
                {fino ? 'Pistola lista: escanea directo.' : 'La pistola ya está activa. Escanea directo o enciende la cámara.'}
              </p>
              <button
                onClick={encenderCamara}
                className={`${fino ? 'h-11 px-4 text-sm' : 'h-12 px-6'} rounded-xl bg-champagne text-negro font-semibold active:bg-champagne-claro`}
              >
                Encender cámara
              </button>
            </div>
          </div>
        )}

        {camaraActiva && (
          <>
            <div className="absolute inset-0 pointer-events-none grid place-items-center">
              <div className="w-full h-full border-4 border-lima/40 rounded-2xl" />
            </div>
            <div className="absolute top-3 right-3 flex gap-2">
              {tieneLinterna && (
                <button
                  onClick={alternarLinterna}
                  className={`h-10 px-4 rounded-lg text-sm ${
                    linternaOn ? 'bg-naranja text-white' : 'bg-black/60 text-white'}`}
                >
                  Luz
                </button>
              )}
              <button onClick={apagarCamara}
                className="h-10 px-4 rounded-lg bg-black/60 text-white text-sm">
                Apagar
              </button>
            </div>
          </>
        )}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <input
        data-escaner="true"
        placeholder="O digita el código y presiona Enter"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            emitir(e.currentTarget.value, 'manual')
            e.currentTarget.value = ''
          }
        }}
        className="w-full h-12 px-4 rounded-xl border border-slate-300
                   focus:border-marca focus:ring-2 focus:ring-marca/20 outline-none"
      />

      {ultimaLectura && (
        <p className="text-xs text-slate-400 text-center font-mono">
          Última lectura: {ultimaLectura}
        </p>
      )}
    </div>
  )
}
