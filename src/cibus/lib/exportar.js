// Exportar a Excel (.xlsx). La librería se carga solo cuando se exporta,
// así no pesa en la app. Archivo .js aparte por el Fast Refresh de Vite.

/** Date → Date cuyos componentes UTC son la hora local (Excel no maneja zonas horarias). */
const alReloj = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000)

const celda = (valor, tipo) => {
  if (valor === null || valor === undefined || valor === '') return null
  if (tipo === 'fecha' || tipo === 'fechahora') {
    const solo = tipo === 'fecha' && /^\d{4}-\d{2}-\d{2}$/.test(String(valor))
    const d = solo ? new Date(`${valor}T00:00:00Z`) : alReloj(new Date(valor))
    if (Number.isNaN(d.getTime())) return { value: String(valor) }
    return { value: d, type: Date, format: tipo === 'fecha' ? 'dd/mm/yyyy' : 'dd/mm/yyyy hh:mm' }
  }
  if (tipo === 'numero') {
    const n = Number(valor)
    return Number.isFinite(n) ? { value: n, type: Number } : { value: String(valor) }
  }
  return { value: String(valor) }
}

const nombreHoja = (t, usados) => {
  let base = String(t).replace(/[\\/?*[\]:]/g, ' ').slice(0, 28) || 'Hoja'
  let nombre = base, i = 2
  while (usados.has(nombre)) nombre = `${base} ${i++}`
  usados.add(nombre)
  return nombre
}

/**
 * @param hojas [{ nombre, columnas: [{ titulo, ancho?, tipo?: 'texto'|'numero'|'fecha'|'fechahora', valor: (fila) => any }], filas }]
 * @returns Blob .xlsx
 */
export async function construirExcel(hojas) {
  const { default: writeExcelFile } = await import('write-excel-file/universal')
  const usados = new Set()
  const hojasXlsx = hojas.map(h => {
    const cabecera = h.columnas.map(c => ({ value: c.titulo, fontWeight: 'bold', backgroundColor: '#E2F0E9' }))
    const cuerpo = h.filas.map(f => h.columnas.map(c => celda(c.valor(f), c.tipo)))
    return {
      data: [cabecera, ...cuerpo],
      sheet: nombreHoja(h.nombre, usados),
      columns: h.columnas.map(c => ({ width: c.ancho ?? 16 })),
      stickyRowsCount: 1,
    }
  })
  return writeExcelFile(hojasXlsx.length === 1 ? hojasXlsx[0].data : hojasXlsx,
                        hojasXlsx.length === 1 ? { sheet: hojasXlsx[0].sheet, columns: hojasXlsx[0].columns, stickyRowsCount: 1 } : undefined)
    .toBlob()
}

export function bajarArchivo(blob, nombre) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
