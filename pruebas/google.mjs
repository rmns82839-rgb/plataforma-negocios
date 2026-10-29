// Pruebas del proveedor Google (fetch simulado): direcciones, filtros, ruta y selección por variable de entorno.
import { geocodificar, rutaKm } from '../api/_google.js'
import { crearProveedor } from '../api/_proveedor.js'
let ok = 0, mal = 0
const t = (n, c) => { if (c) ok++; else { mal++; console.log('FALLA:', n) } }
const resp = (obj, status = 200) => async () => ({ ok: status < 400, status, json: async () => obj })
const foco = { lat: 10.9685, lng: -74.7813 }

const res = (lat, lng, tipo, loc = 'ROOFTOP', extra = {}) => ({ formatted_address: 'Calle 72 # 45-10, Barranquilla', geometry: { location: { lat, lng }, location_type: loc }, types: [tipo], address_components: [{ long_name: 'Barranquilla', types: ['locality'] }], ...extra })

let url
const f1 = async (u) => { url = u; return { ok: true, status: 200, json: async () => ({ status: 'OK', results: [
  res(10.99, -74.80, 'street_address'),
  { ...res(10.97, -74.78, 'locality'), formatted_address: 'Barranquilla' },                       // municipio: se descarta
  { ...res(4.6, -74.08, 'street_address'), formatted_address: 'Calle 72, Bogotá' },                // lejos: se descarta
  { ...res(10.98, -74.79, 'neighborhood', 'APPROXIMATE'), formatted_address: 'Barrio Prado' },
  { ...res(10.99, -74.80, 'street_address'), },                                                    // repetido
] }) } }
const c = await geocodificar('calle 72 45-10', foco, 'K', f1, { radioKm: 30 })
t('2 candidatos útiles', c.length === 2)
t('exacto no es aproximado', c[0].aproximada === false && c[0].confianza === 1)
t('barrio es aproximado', c[1].aproximada === true)
t('manda clave y país', url.includes('key=K') && url.includes('country%3ACO') && url.includes('bounds='))
t('sin resultados', (await geocodificar('x', foco, 'K', resp({ status: 'ZERO_RESULTS', results: [] }))).length === 0)
let e; try { await geocodificar('x', foco, 'K', resp({ status: 'REQUEST_DENIED' })) } catch (x) { e = x }
t('clave negada → 403', e && e.status === 403)
e = null; try { await geocodificar('x', foco, 'K', resp({ status: 'OVER_QUERY_LIMIT' })) } catch (x) { e = x }
t('cupo → 429', e && e.status === 429)
e = null; try { await geocodificar('x', foco, 'K', resp({}, 500)) } catch (x) { e = x }
t('http 500 lanza', !!e)
const p = await geocodificar('x', foco, 'K', resp({ status: 'OK', results: [res(10.99, -74.8, 'street_address', 'RANGE_INTERPOLATED', { partial_match: true })] }))
t('coincidencia parcial baja la confianza', p[0].confianza <= 0.55)

let cuerpo, cab
const f2 = async (u, o) => { cuerpo = JSON.parse(o.body); cab = o.headers; return { ok: true, status: 200, json: async () => ({ routes: [{ distanceMeters: 4321 }] }) } }
t('ruta en km', Math.abs(await rutaKm(foco, { lat: 10.99, lng: -74.8 }, 'K', f2) - 4.321) < 1e-9)
t('ruta pide solo distancia y clave en cabecera', cab['X-Goog-FieldMask'] === 'routes.distanceMeters' && cab['X-Goog-Api-Key'] === 'K' && cuerpo.travelMode === 'DRIVE')
e = null; try { await rutaKm(foco, foco, 'K', resp({ routes: [] })) } catch (x) { e = x }
t('ruta sin datos lanza', !!e)

t('proveedor google', crearProveedor({ MAPA_PROVEEDOR: 'google', GOOGLE_MAPS_SERVER_KEY: 'K' }).nombre === 'google')
e = null; try { await crearProveedor({ MAPA_PROVEEDOR: 'google' }).buscar('x', foco, {}) } catch (x) { e = x }
t('google sin clave falla claro', e && /Sin clave/.test(e.message))
t('ors sigue por defecto', crearProveedor({ ORS_API_KEY: 'a' }).nombre === 'ors')
e = null; try { crearProveedor({ MAPA_PROVEEDOR: 'otro' }) } catch (x) { e = x }
t('proveedor desconocido lanza', !!e)
console.log(`google: ${ok} ok, ${mal} fallas`); process.exit(mal ? 1 : 0)
