// Vender en el mostrador. Hasta 6 ventas abiertas a la vez (cada una se guarda en este equipo mientras se arma).
// El total real de cada venta SIEMPRE lo calcula el servidor (promociones, mayorista…): aquí solo se arman los datos.
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { traerTodo } from '../lib/traerTodo'
import { mensajeError } from '../lib/errores'
import { cop } from '../lib/pedido'
import { subtotalLista, aNumero, nuevaVenta, sanearVentas, descuentoGeneral, MAX_VENTAS, fechaLimite, sumaPagos, envioDe, domicilioParaServidor } from '../lib/caja'
import { Btn } from '../tienda/ui'
import VentaArmar from './VentaArmar'
import VentaCobrar from './VentaCobrar'
import Recibo from './Recibo'

const COLS = 'id,codigo,nombre,unidad,categoria,precio_venta,stock,es_kit'
const clave = (nid, uid) => `caja-ventas:${nid}:${uid}`

function leerEquipo(nid, uid) {
  try { return sanearVentas(JSON.parse(localStorage.getItem(clave(nid, uid)) || 'null')) } catch { return null }
}
function inicial(nid, uid) {
  const g = leerEquipo(nid, uid)
  if (g) return g
  const v = nuevaVenta([])
  return { lista: [v], activa: v.id }
}

export default function CajaVender({ ctx, irAlDia }) {
  const nid = ctx.neg.negocio_id
  const uid = ctx.userId || 'sin-usuario'
  const sim = ctx.soloLectura            // soporte: recorre todo, pero la venta es simulada
  const [productos, setProductos] = useState(null)
  const [formasTodas, setFormasTodas] = useState([])
  const [estado, setEstado] = useState(() => inicial(nid, uid))
  const [calc, setCalc] = useState(null)          // {total, base, desc} de la venta activa
  const [errTotal, setErrTotal] = useState('')
  const [calculando, setCalculando] = useState(false)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [hecha, setHecha] = useState(null)
  const seq = useRef(0)

  const venta = estado.lista.find((v) => v.id === estado.activa) || estado.lista[0]
  const formas = useMemo(() => formasTodas.filter((f) => (f.tipo !== 'fiado' || ctx.modulos.includes('fiados')) && (f.tipo !== 'prepago' || ctx.modulos.includes('prepago'))), [formasTodas, ctx.modulos])

  // Guardar en el equipo cada cambio (si el navegador no deja, la caja sigue funcionando)
  useEffect(() => { try { localStorage.setItem(clave(nid, uid), JSON.stringify(estado)) } catch { /* sin almacenamiento */ } }, [estado, nid, uid])

  const cargarProductos = () => traerTodo(() => supabase.from('productos').select(COLS).eq('negocio_id', nid).eq('activo', true).order('nombre').order('id'))
    .then(({ data, error: e }) => { if (e) setError(mensajeError(e)); else setProductos(data || []) })
  useEffect(() => {
    cargarProductos()
    ;(async () => {   // «comision» existe desde el SQL 18; si aún no se ha corrido, la caja sigue andando sin ella
      let r = await supabase.from('formas_pago').select('id,nombre,tipo,orden,comision').eq('negocio_id', nid).eq('activa', true).order('orden')
      if (r.error) r = await supabase.from('formas_pago').select('id,nombre,tipo,orden').eq('negocio_id', nid).eq('activa', true).order('orden')
      setFormasTodas(r.data || [])
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nid])

  const cambiar = (parche) => setEstado((e) => ({ ...e, lista: e.lista.map((v) => (v.id === e.activa ? { ...v, ...parche } : v)) }))
  const lineas = useMemo(() => Object.entries(venta.carrito).map(([id, cantidad]) => ({ producto: productos?.find((p) => p.id === id), cantidad })).filter((l) => l.producto && l.cantidad > 0), [venta.carrito, productos])
  const items = lineas.reduce((s, l) => s + Number(l.cantidad), 0)
  const lista = subtotalLista(lineas)

  // El domicilio se cobra aparte de los productos: el servidor lo suma al registrar la venta
  const envio = envioDe(venta.dom)
  const calcF = useMemo(() => (calc ? { ...calc, envio, total: calc.total + envio } : null), [calc, envio])

  const mover = (id, c) => setEstado((e) => ({ ...e, lista: e.lista.map((v) => {
    if (v.id !== e.activa) return v
    const carrito = { ...v.carrito }; const descLinea = { ...v.descLinea }
    if (c <= 0) { delete carrito[id]; delete descLinea[id] } else carrito[id] = Math.min(c, 9999)
    return { ...v, carrito, descLinea, pagos: [] }
  }) }))
  const ponerDescLinea = (id, texto) => setEstado((e) => ({ ...e, lista: e.lista.map((v) => (v.id === e.activa ? { ...v, descLinea: { ...v.descLinea, [id]: texto }, pagos: [] } : v)) }))

  // Productos que se mandan al servidor (con su descuento por línea, si lo tienen)
  const itemsServidor = useMemo(() => lineas.map((l) => {
    const d = aNumero(venta.descLinea[l.producto.id])
    return { producto_id: l.producto.id, cantidad: l.cantidad, ...(d > 0 ? { descuento: d } : {}) }
  }), [lineas, venta.descLinea])
  const claveCalc = JSON.stringify([itemsServidor, venta.cliente?.id ?? null, venta.descTipo, venta.descValor])

  // El servidor dice cuánto vale de verdad. Con descuento en %, primero se pide el subtotal y luego el total con el descuento.
  useEffect(() => {
    if (itemsServidor.length === 0) { setCalc(null); setErrTotal(''); setCalculando(false); return }
    const mi = ++seq.current
    setCalculando(true)
    const t = setTimeout(async () => {
      const pedir = (d) => supabase.rpc('previsualizar_venta', { p_negocio_id: nid, p_items: itemsServidor, p_cliente_id: venta.cliente?.id ?? null, p_descuento: d })
      let base = null, d = 0, r
      if (venta.descTipo === 'pct' && aNumero(venta.descValor) > 0) {
        r = await pedir(0)
        if (!r.error) { base = Number(r.data.total); d = descuentoGeneral('pct', venta.descValor, base); r = d > 0 ? await pedir(d) : r }
      } else { d = aNumero(venta.descValor); r = await pedir(d) }
      if (mi !== seq.current) return
      setCalculando(false)
      if (r.error) { setCalc(null); setErrTotal(mensajeError(r.error)); return }
      const total = Number(r.data.total)
      setCalc({ total, base: base ?? total + d, desc: d }); setErrTotal('')
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveCalc, nid])

  // Si el total baja y ya hay más pagos que total, se borran los pagos para volver a pedirlos
  useEffect(() => { if (calcF && sumaPagos(venta.pagos) > calcF.total) cambiar({ pagos: [] }) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [calcF])

  // ---------- Ventas abiertas ----------
  function agregarVenta() {
    if (estado.lista.length >= MAX_VENTAS) return
    const v = nuevaVenta(estado.lista)
    setEstado((e) => ({ lista: [...e.lista, v], activa: v.id })); setError(''); setCalc(null)
  }
  function irA(id) { if (id !== estado.activa) { setEstado((e) => ({ ...e, activa: id })); setError(''); setCalc(null) } }
  function quitarVenta(id) {
    setEstado((e) => {
      const lista = e.lista.filter((v) => v.id !== id)
      if (lista.length === 0) { const v = nuevaVenta([]); return { lista: [v], activa: v.id } }
      return { lista, activa: e.activa === id ? lista[0].id : e.activa }
    })
    setCalc(null); setError('')
  }

  async function registrar() {
    setError('')
    if (!calcF || sumaPagos(venta.pagos) !== calcF.total) return setError('Los pagos no suman el total de la venta')
    const usaFiado = venta.pagos.some((p) => formas.find((f) => f.id === p.metodo)?.tipo === 'fiado')
    if (usaFiado && !venta.cliente) return setError('Para fiar debes elegir un cliente')
    if (venta.pagos.some((p) => formas.find((f) => f.id === p.metodo)?.tipo === 'prepago') && !venta.cliente) return setError('Para cobrar con saldo debes elegir un cliente')
    const d = domicilioParaServidor(venta.dom)
    if (d.error) return setError(d.error)
    const resumen = { total: calcF.total, cambio: venta.pagos.reduce((s, p) => s + (p.recibido > p.monto ? p.recibido - p.monto : 0), 0) }
    setOcupado(true)
    if (sim) { setOcupado(false); setHecha({ ...resumen, numero: 'PRUEBA', simulada: true }); quitarVenta(venta.id); return }
    const { data: id, error: e } = await supabase.rpc('registrar_venta', {
      p_negocio_id: nid, p_items: itemsServidor, p_pagos: venta.pagos, p_cliente_id: venta.cliente?.id ?? null, p_nota: null,
      p_fecha_limite: usaFiado ? fechaLimite(venta.plazo) : null, p_descuento: calc.desc, p_domicilio: d.dom,
    })
    if (e) { setOcupado(false); return setError(mensajeError(e)) }
    const { data: v } = await supabase.from('ventas').select('numero,total').eq('negocio_id', nid).eq('id', id).single()
    setOcupado(false)
    setHecha({ ...resumen, numero: v?.numero ?? '', total: Number(v?.total ?? calcF.total), id })
    quitarVenta(venta.id)
    cargarProductos()    // el stock cambió
  }

  // ---------- Listo ----------
  if (hecha) {
    const otras = estado.lista.filter((v) => Object.keys(v.carrito).length > 0)
    return (
      <div className="pb-6">
        <div className="mb-5 rounded-2xl border-2 border-green-300 bg-green-50 p-5 text-center">
          <p className="text-3xl font-bold text-green-900">✓ Venta {hecha.simulada ? 'de prueba' : `#${hecha.numero}`} registrada</p>
          <p className="mt-2 text-4xl font-bold">{cop(hecha.total)}</p>
          {hecha.cambio > 0 && <p className="mt-3 text-2xl font-bold text-principal">Devuelve {cop(hecha.cambio)}</p>}
          {hecha.simulada && <p className="mt-2 text-lg">Estás en solo lectura: no se guardó nada.</p>}
        </div>
        {hecha.id && <div className="mb-5"><Recibo nid={nid} ventaId={hecha.id} marca={ctx.marca} formas={formasTodas} /></div>}
        <div className="space-y-3">
          <Btn variante="verde" onClick={() => { setHecha(null); setCalc(null) }}>{otras.length > 0 ? `Seguir con mis ${otras.length === 1 ? 'otra venta abierta' : `${otras.length} ventas abiertas`}` : 'Hacer otra venta'}</Btn>
          <Btn variante="suave" onClick={irAlDia}>Ver el resumen del día</Btn>
        </div>
      </div>
    )
  }

  return (
    <div>
      <section aria-label="Ventas abiertas" className="mb-4">
        <div className="grid grid-cols-3 gap-2">
          {estado.lista.map((v) => {
            const n = Object.keys(v.carrito).length
            const act = v.id === estado.activa
            return (
              <button key={v.id} type="button" aria-pressed={act} onClick={() => irA(v.id)}
                className={`min-h-[64px] rounded-2xl border-2 px-1 text-center leading-tight ${act ? 'border-principal bg-principal text-white' : 'border-black/10 bg-white'}`}>
                <span className="block text-lg font-bold">Venta {v.n}</span>
                <span className={`block text-base ${act ? 'text-white/80' : 'text-tinta/60'}`}>{n === 0 ? 'vacía' : `${n} ${n === 1 ? 'producto' : 'productos'}`}</span>
              </button>
            )
          })}
          {estado.lista.length < MAX_VENTAS && (
            <button type="button" onClick={agregarVenta} className="min-h-[64px] rounded-2xl border-2 border-dashed border-principal/40 bg-white px-1 text-lg font-bold leading-tight text-principal">+ Otra venta</button>
          )}
        </div>
        {estado.lista.length >= MAX_VENTAS && <p className="mt-2 text-base text-tinta/60">Llegaste al máximo de {MAX_VENTAS} ventas abiertas. Termina o descarta una.</p>}
      </section>

      {venta.paso === 'cobrar' ? (
        <VentaCobrar ctx={ctx} nid={nid} sim={sim} venta={venta} cambiar={cambiar} formas={formas} calc={calcF} calculando={calculando} errTotal={errTotal} error={error} ocupado={ocupado} domicilios={ctx.modulos.includes('domicilios')}
          onVolver={() => { cambiar({ paso: 'armar', pagos: [] }); setError('') }} onRegistrar={registrar} />
      ) : (
        <VentaArmar productos={productos} error={error} venta={venta} lineas={lineas} mover={mover} ponerDescLinea={ponerDescLinea} calc={calc} calculando={calculando} errTotal={errTotal}
          items={items} lista={lista} onCobrar={() => cambiar({ paso: 'cobrar' })} onDescartar={() => quitarVenta(venta.id)} />
      )}
    </div>
  )
}
