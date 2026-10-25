import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { procesarProductos, PLANTILLA, MAX_FILAS } from '../lib/csv'
import { mensajeError } from '../lib/errores'
import { Btn, Volver, Aviso, clsInput } from '../tienda/ui'
import { Titulo, Seccion } from './piezas'

export default function CargaMasiva({ ctx, volver }) {
  const [paso, setPaso] = useState(1)   // 1 pegar · 2 revisar · 3 listo
  const [texto, setTexto] = useState('')
  const [res, setRes] = useState(null)
  const [error, setError] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [hecho, setHecho] = useState(0)
  const nid = ctx.neg.negocio_id
  const conStock = ctx.modulos.includes('caja')

  if (!ctx.modulos.includes('carga_masiva')) {
    return <div><Volver onClick={volver} texto="Volver a los productos" /><Titulo>Cargar muchos productos</Titulo><Aviso>Tu plan no incluye la carga masiva. Puedes crear los productos uno por uno.</Aviso></div>
  }

  const bajarPlantilla = () => {
    const url = URL.createObjectURL(new Blob(['﻿' + PLANTILLA], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = 'plantilla-productos.csv'; a.click(); URL.revokeObjectURL(url)
  }
  const leerArchivo = async (e) => { const a = e.target.files?.[0]; e.target.value = ''; if (a) setTexto(await a.text()) }

  function revisar() {
    const r = procesarProductos(texto)
    if (r.vacio) return setError('Pega la lista o elige un archivo primero.')
    if (r.columnasFaltantes.length) return setError(`Faltan columnas: ${r.columnasFaltantes.join(' y ')}. La primera fila debe tener los títulos (nombre, precio…). Baja la plantilla para ver el ejemplo.`)
    setError(''); setRes(r); setPaso(2)
  }

  const buenas = res?.filas.filter((f) => f.errores.length === 0) || []
  const malas = res?.filas.filter((f) => f.errores.length > 0) || []

  async function cargar() {
    setSubiendo(true); setError(''); setHecho(0)
    const filas = buenas.map(({ datos: d }) => ({
      negocio_id: nid, nombre: d.nombre, categoria: d.categoria, precio_venta: d.precio_venta, precio_compra: d.precio_compra, unidad: d.unidad,
      codigo: d.codigo, descripcion: d.descripcion, publicado: d.publicado, ...(conStock && d.stock != null ? { stock: d.stock } : {}),
    }))
    const conCodigo = filas.filter((x) => x.codigo), sinCodigo = filas.filter((x) => !x.codigo)
    let n = 0
    try {
      for (let i = 0; i < conCodigo.length; i += 50) {
        const { error: e } = await supabase.from('productos').upsert(conCodigo.slice(i, i + 50), { onConflict: 'negocio_id,codigo' })
        if (e) throw e
        n += Math.min(50, conCodigo.length - i); setHecho(n)
      }
      for (let i = 0; i < sinCodigo.length; i += 50) {
        const { error: e } = await supabase.from('productos').insert(sinCodigo.slice(i, i + 50))
        if (e) throw e
        n += Math.min(50, sinCodigo.length - i); setHecho(n)
      }
      const cats = [...new Set(filas.map((x) => x.categoria).filter(Boolean))].map((nombre) => ({ negocio_id: nid, nombre }))
      if (cats.length) await supabase.from('categorias').upsert(cats, { onConflict: 'negocio_id,nombre', ignoreDuplicates: true })
      setPaso(3)
    } catch (e) { setError(`Se cargaron ${n} productos y luego falló: ${mensajeError(e)}`) }
    setSubiendo(false)
  }

  if (paso === 3) {
    return (
      <div>
        <Titulo>¡Listo!</Titulo>
        <Aviso tipo="ok">Se cargaron <b>{hecho}</b> productos.{malas.length > 0 && <> Quedaron {malas.length} sin cargar por tener errores.</>}</Aviso>
        <div className="mt-5"><Btn onClick={volver}>Ver mis productos</Btn></div>
      </div>
    )
  }

  if (paso === 2) {
    return (
      <div className="pb-6">
        <Volver onClick={() => setPaso(1)} texto="Volver a la lista" />
        <Titulo>Revisa antes de cargar</Titulo>
        <div className="mb-4 grid grid-cols-2 gap-3 text-center">
          <div className="rounded-2xl bg-[#128C4A]/10 p-4"><p className="text-4xl font-bold text-[#0d6b38]">{buenas.length}</p><p className="text-lg">listos para cargar</p></div>
          <div className={`rounded-2xl p-4 ${malas.length ? 'bg-red-100' : 'bg-black/5'}`}><p className={`text-4xl font-bold ${malas.length ? 'text-red-800' : ''}`}>{malas.length}</p><p className="text-lg">con errores</p></div>
        </div>
        {res.truncado && <div className="mb-4"><Aviso tipo="previa">Solo se leen las primeras {MAX_FILAS} filas. Carga el resto en otra tanda.</Aviso></div>}
        {malas.length > 0 && (
          <Seccion titulo="Filas con errores (no se cargarán)">
            <ul className="space-y-2 text-lg">{malas.slice(0, 30).map((f) => <li key={f.fila}><b>Fila {f.fila}</b> {f.datos.nombre && `(${f.datos.nombre})`}: {f.errores.join(', ')}</li>)}</ul>
            {malas.length > 30 && <p className="mt-2 text-lg text-tinta/60">…y {malas.length - 30} más.</p>}
          </Seccion>
        )}
        {buenas.length > 0 && (
          <Seccion titulo="Así quedarán los primeros">
            <ul className="space-y-2 text-lg">{buenas.slice(0, 5).map((f) => <li key={f.fila} className="flex justify-between gap-3"><span className="break-words">{f.datos.nombre}</span><b>${f.datos.precio_venta.toLocaleString('es-CO')}</b></li>)}</ul>
          </Seccion>
        )}
        <p className="mb-4 text-lg text-tinta/70">Si un producto trae <b>código</b> y ya existe, se actualiza. Sin código se crea uno nuevo.</p>
        {error && <div className="mb-4"><Aviso tipo="error">{error}</Aviso></div>}
        <Btn onClick={cargar} disabled={subiendo || buenas.length === 0}>{subiendo ? `Cargando… ${hecho} de ${buenas.length}` : `Cargar ${buenas.length} ${buenas.length === 1 ? "producto" : "productos"}`}</Btn>
      </div>
    )
  }

  return (
    <div className="pb-6">
      <Volver onClick={volver} texto="Volver a los productos" />
      <Titulo sub="Copia las filas desde Excel y pégalas aquí, o elige un archivo CSV.">Cargar muchos productos</Titulo>
      <Seccion titulo="1. Baja el ejemplo">
        <p className="mb-3 text-lg">La primera fila lleva los títulos: <b>nombre</b> y <b>precio</b> son obligatorios. Los demás (categoria, unidad, codigo, descripcion, publicado, stock) son opcionales.</p>
        <Btn variante="suave" onClick={bajarPlantilla}>Bajar plantilla de ejemplo</Btn>
      </Seccion>
      <Seccion titulo="2. Pega tu lista o elige el archivo">
        <textarea className={`${clsInput} min-h-[200px] py-3 font-mono text-base`} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="nombre;categoria;precio&#10;Arroz 500 g;Granos;2500" />
        <label className="mt-3 flex min-h-[56px] w-full cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-principal/40 text-lg font-semibold text-principal">
          Elegir archivo CSV
          <input type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={leerArchivo} />
        </label>
      </Seccion>
      {error && <div className="mb-4"><Aviso tipo="error">{error}</Aviso></div>}
      <Btn onClick={revisar} disabled={!texto.trim()}>Revisar</Btn>
    </div>
  )
}
