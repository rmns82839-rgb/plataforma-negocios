// Piezas propias del panel (las comunes están en ../tienda/ui.jsx)
export function Titulo({ children, sub }) {
  return (
    <div className="mb-5">
      <h2 className="break-words text-3xl font-bold leading-tight">{children}</h2>
      {sub && <p className="mt-1 text-lg text-tinta/70">{sub}</p>}
    </div>
  )
}

export function Seccion({ titulo, children, className = '' }) {
  return (
    <section className={`mb-5 rounded-2xl border-2 border-black/5 bg-white p-4 sm:p-5 ${className}`}>
      {titulo && <h3 className="mb-3 break-words text-xl font-bold leading-snug">{titulo}</h3>}
      {children}
    </section>
  )
}

export function Insignia({ children, tono = 'gris' }) {
  const c = { gris: 'bg-black/5 text-tinta/70', verde: 'bg-[#128C4A]/10 text-[#0d6b38]', ambar: 'bg-amber-100 text-amber-900', rojo: 'bg-red-100 text-red-800', azul: 'bg-principal/10 text-principal' }[tono]
  return <span className={`inline-block rounded-full px-3 py-1 text-base font-bold ${c}`}>{children}</span>
}

// Interruptor grande con texto (se toca toda la fila)
export function Interruptor({ valor, onChange, texto, ayuda, deshabilitado }) {
  return (
    <button type="button" role="switch" aria-checked={valor} disabled={deshabilitado} onClick={() => onChange(!valor)}
      className="flex min-h-[64px] w-full items-center justify-between gap-4 rounded-2xl border-2 border-black/10 bg-white px-4 py-3 text-left disabled:opacity-50">
      <span><span className="block text-lg font-semibold leading-snug">{texto}</span>{ayuda && <span className="block text-base text-tinta/60">{ayuda}</span>}</span>
      <span aria-hidden="true" className={`flex h-9 w-16 shrink-0 items-center rounded-full p-1 transition ${valor ? 'bg-[#128C4A]' : 'bg-black/20'}`}>
        <span className={`h-7 w-7 rounded-full bg-white shadow transition ${valor ? 'translate-x-7' : ''}`} />
      </span>
    </button>
  )
}

// Dos o más opciones del mismo tamaño
export function Opciones({ valor, opciones, onChange, columnas = 2 }) {
  return (
    <div className={`grid gap-2 ${columnas === 3 ? 'grid-cols-3' : columnas === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'}`} role="group">
      {opciones.map(([v, t]) => (
        <button key={v} type="button" aria-pressed={valor === v} onClick={() => onChange(v)}
          className={`min-h-[56px] rounded-2xl border-2 px-2 py-2 text-lg font-semibold leading-tight ${valor === v ? 'border-principal bg-principal text-white' : 'border-black/10 bg-white'}`}>{t}</button>
      ))}
    </div>
  )
}

export function SoloLectura() {
  return <p className="mb-4 rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-lg">Estás con una cuenta de <b>solo lectura</b> (soporte): puedes mirar todo, pero no cambiar nada.</p>
}

export const fechaHora = (t) => new Date(t).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
