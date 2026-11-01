import assert from 'node:assert/strict'
import { leerRegistro, guardarRegistro, borrarRegistro, hayRegistroEnCurso } from '../src/lib/borradorRegistro.js'
const mem = () => { const d = {}; return { getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = v }, removeItem: (k) => { delete d[k] } } }
let n = 0; const t = (nom, fn) => { fn(); n++; console.log('✓', nom) }
const f = { tipo: 'tienda', plan: 'gestion', nombre_negocio: 'Eliyon', ciudad: 'Barranquilla', nombre_contacto: 'Ivan', email: 'a@b.co', telefono: '3054494534', mensaje: '', acepta: true, sitio_web: 'robot' }
t('guarda y recupera lo escrito y el paso', () => { const a = mem(); guardarRegistro(f, 'revisar', 1000, a); const r = leerRegistro(2000, a); assert.equal(r.paso, 'revisar'); assert.equal(r.f.nombre_negocio, 'Eliyon'); assert.equal(r.f.acepta, true) })
t('no guarda el campo trampa de robots', () => { const a = mem(); guardarRegistro(f, 'datos', 1000, a); assert.ok(!('sitio_web' in leerRegistro(1500, a).f)) })
t('caduca a las 12 horas', () => { const a = mem(); guardarRegistro(f, 'datos', 0, a); assert.equal(leerRegistro(13 * 3600 * 1000, a), null) })
t('un registro vacío no deja nada guardado', () => { const a = mem(); guardarRegistro(f, 'datos', 0, a); guardarRegistro({ acepta: false }, 'tipo', 5, a); assert.equal(leerRegistro(10, a), null) })
t('borrar limpia todo', () => { const a = mem(); guardarRegistro(f, 'datos', 0, a); borrarRegistro(a); assert.equal(hayRegistroEnCurso(10, a), false) })
t('hayRegistroEnCurso detecta datos escritos', () => { const a = mem(); guardarRegistro(f, 'datos', 0, a); assert.equal(hayRegistroEnCurso(10, a), true) })
t('datos dañados no rompen nada', () => { const a = mem(); a.setItem('matriz:registro', '{no es json'); assert.equal(leerRegistro(1, a), null) })
console.log(`${n} pruebas correctas`)
