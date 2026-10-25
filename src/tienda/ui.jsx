// Piezas de la tienda pública: letra grande, botones grandes y fondos claros (clientes de 50 a 70 años).
import { urlImagen } from '../lib/supabase'

export const MARCA_PLATAFORMA = 'Cibus'

export function Btn({ children, variante = 'principal', className = '', ...p }) {
  const base = 'inline-flex min-h-[56px] w-full items-center justify-center rounded-2xl px-6 text-lg font-semibold transition active:scale-[0.99] disabled:opacity-50'
  const v = {
    principal: 'bg-principal text-white shadow-sm hover:opacity-90',
    suave: 'border-2 border-principal/30 bg-white text-principal hover:bg-principal/5',
    verde: 'bg-[#128C4A] text-white shadow-sm hover:opacity-90',
  }[variante]
  return <button className={`${base} ${v} ${className}`} {...p}>{children}</button>
}

export function Volver({ onClick, texto = 'Volver' }) {
  return (
    <button onClick={onClick} className="mb-4 inline-flex min-h-[48px] items-center rounded-xl px-2 text-lg font-semibold text-principal hover:underline">
      ← {texto}
    </button>
  )
}

export function Aviso({ tipo = 'info', children }) {
  const c = { info: 'border-black/10 bg-white', error: 'border-red-300 bg-red-50 text-red-900', previa: 'border-amber-300 bg-amber-50 text-amber-950', ok: 'border-green-300 bg-green-50 text-green-900' }[tipo]
  return <div role={tipo === 'error' ? 'alert' : undefined} className={`rounded-2xl border-2 px-4 py-3 text-lg leading-snug ${c}`}>{children}</div>
}

export function Campo({ etiqueta, error, ayuda, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-lg font-semibold">{etiqueta}</span>
      {children}
      {ayuda && !error && <span className="mt-1 block text-base text-tinta/60">{ayuda}</span>}
      {error && <span className="mt-1 block text-base font-semibold text-red-700">{error}</span>}
    </label>
  )
}

export const clsInput = 'min-h-[56px] w-full rounded-2xl border-2 border-black/15 bg-white px-4 text-lg outline-none focus:border-principal'

// Logo de la tienda: el suyo si lo subió; si no, la inicial sobre el color de la tienda
export function Logo({ n, tamano = 80 }) {
  const url = urlImagen(n.logo)
  if (url) return <img src={url} alt={n.nombre} style={{ height: tamano }} className="w-auto max-w-[70%] object-contain" />
  return (
    <div aria-hidden="true" style={{ width: tamano, height: tamano, fontSize: tamano * 0.5, backgroundColor: n.logo_auto?.color || undefined }}
      className="flex items-center justify-center rounded-full bg-principal font-bold text-white shadow-sm">
      {n.logo_auto?.inicial || (n.nombre || '?').charAt(0).toUpperCase()}
    </div>
  )
}

export function Cantidad({ valor, onMenos, onMas, max = 99 }) {
  return (
    <div className="grid grid-cols-[56px_1fr_56px] items-center gap-1">
      <button onClick={onMenos} aria-label="Quitar uno" className="h-14 rounded-2xl border-2 border-principal/30 bg-white text-3xl font-bold text-principal">−</button>
      <span className="text-center text-2xl font-bold" aria-live="polite">{valor}</span>
      <button onClick={onMas} disabled={valor >= max} aria-label="Agregar uno" className="h-14 rounded-2xl bg-principal text-3xl font-bold text-white disabled:opacity-40">+</button>
    </div>
  )
}

// Barra fija al pie con el total (no se pierde al desplazar)
export function BarraFija({ children }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-black/10 bg-white px-4 pt-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
      <div className="mx-auto w-full max-w-3xl">{children}</div>
    </div>
  )
}

export function PiePlataforma() {
  return <footer className="mt-12 pb-6 text-center text-sm text-tinta/50">Tienda creada con {MARCA_PLATAFORMA}</footer>
}
