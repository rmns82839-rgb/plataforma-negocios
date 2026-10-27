// Si una pantalla falla, en vez de dejar todo en blanco se muestra el motivo y un botón para recargar.
import { Component } from 'react'

export default class ErrorPantalla extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="min-h-full grid place-items-center p-6 text-center">
        <div className="max-w-sm space-y-3">
          <p className="font-semibold text-slate-700">Algo falló en esta pantalla</p>
          <p className="text-xs text-slate-400 break-words">{String(this.state.error?.message ?? this.state.error)}</p>
          <button onClick={() => window.location.reload()} className="h-12 px-6 rounded-xl bg-negro text-hueso font-medium">Recargar</button>
        </div>
      </div>
    )
  }
}
