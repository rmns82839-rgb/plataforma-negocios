# Plataforma multi-negocio — Negocio, costos y decisiones

> Documento de consulta del proyecto. Datos al **19 de octubre de 2026**.
> Los precios de Supabase y Vercel, la TRM y los precios de la competencia **cambian**: verifícalos antes de cobrar o firmar algo.
> Las cifras marcadas como *hipótesis* son estimaciones, no datos de mercado. No es asesoría legal, contable ni tributaria.

---

## 1. Dónde estamos

| Etapa | Estado |
|---|---|
| 1. Diseño | Hecho y aprobado |
| 2. Proyecto nuevo, base vacía, negocio de prueba | Hecho, aprobado con condiciones |
| 2b. RPC de negocio y pruebas de aislamiento | Entregado. **224/224 pruebas** en simulador local. Código en GitHub (`rmns82839-rgb/plataforma-negocios`, rama `master`). **Falta tu aprobación** |
| Prueba real en Supabase nuevo | **En curso**: correr `01` a `08`, crear dueño, correr `09`, `select * from verificar_aislamiento();` (todo en `ok = true`) |
| 3. Marca configurable, módulos, rutas, service worker por negocio | Espera la aprobación de 2b |
| 4. Módulo de repuestos de motos | Pendiente |
| 5. Prueba de aislamiento con dos negocios falsos (ampliada) | Pendiente |
| 6. Migrar la tienda de Nelson | Solo con su autorización, ensayada en copia |

**Regla firme:** nada de la app original de Nelson (Matriz/Cibus) se toca: ni su base, ni su marca, ni su eslogan, ni su ícono, ni sus imágenes.

**No se avanza a `api/`, modo práctica ni editor de marca hasta aprobar 2b.**

---

## 2. Decisión de infraestructura

**Se queda en Supabase.** La plataforma depende de cuatro piezas que Supabase trae juntas: login (`auth.uid()`), RLS por negocio, fotos (Storage con permisos por carpeta) y tiempo real por canal.

**Neon** es solo la base de datos (no se verificó su plan actual). Pasarse implicaría reescribir el login, el almacenamiento de fotos, el tiempo real y la capa de API, y volver a probar todo el aislamiento. No se recomienda.

**Región elegida:** East US (North Virginia), pareja de la región por defecto de Vercel. Es una apuesta razonable, no una medición. No se puede cambiar después sin migrar.

**Estrategia de proyectos**
- El proyecto gratis actual = **pruebas (staging)**, con datos falsos. Se conserva siempre para ensayar migraciones.
- La **producción** nace en plan Pro **el día que entre el primer dato real de un cliente**, aunque sea un piloto gratis.

---

## 3. Límites del plan gratis y cuándo pagar

| | Supabase gratis | Supabase Pro |
|---|---|---|
| Base de datos | 500 MB | 8 GB |
| Fotos | 1 GB | 100 GB |
| Tráfico de salida | 5 GB/mes | 250 GB/mes |
| Copias de seguridad | **No hay** | Diarias, 7 días |
| Pausa por inactividad | **Pausa tras 1 semana sin uso** | Nunca |
| Tiempo real | 200 conexiones, 2 M mensajes | 500 conexiones, 5 M mensajes |
| Costo | $0 | desde $25/mes (incluye $10 de servidor Micro) |

**Vercel Hobby (gratis) es solo para uso personal no comercial.** Para cobrar necesitas Vercel Pro ($20/mes por usuario).

**Motivos para pasar a pago (ninguno es el tamaño):**
1. Sin copias de seguridad, un error significa perder el negocio de alguien.
2. Si el negocio cierra una semana, el proyecto gratis se pausa.
3. Vercel gratis no permite uso comercial.

### Medición real de la tienda de Nelson (Matriz)

| Recurso | Usado | Límite gratis | % |
|---|---|---|---|
| Base de datos | 17 MB | 500 MB | ~3,4 % |
| Fotos | 48 MB (595 archivos) | 1 GB | ~4,8 % |

- Parte de los 17 MB es de Supabase (usuarios, sesiones, `storage.objects`), no de la tienda.
- Ventas, ítems y pagos suman unos **0,8 MB**; la auditoría, 0,26 MB. La auditoría es la que más crece: archivar lo de más de 12 meses cuando haga falta.
- Foto promedio: **~80 KB**. Con ese catálogo, 1 GB alcanza para **~20 tiendas**.
- La plataforma acepta hasta 3 MB por foto: **comprimir al subir** (WebP, unos 150 KB como máximo) en la etapa 3.
- **Lo que puede apretar antes que el tamaño es el tráfico de salida:** un catálogo completo de 595 fotos pesa ~48 MB; 100 cargas completas ≈ 4,8 GB. Solución: miniaturas, carga perezosa y caché (etapa 3).
- Pendiente: saber desde hace cuántos meses usa Nelson la app para estimar el crecimiento por año.

---

## 4. Costo mensual de mantener la plataforma

TRM oficial del 16 de octubre de 2026: **$3.170 por dólar** (cambia cada día).

| Concepto | 1 negocio | 5 negocios | 20 negocios |
|---|---|---|---|
| Supabase Pro | $25 | $25 | $25 |
| Servidor de la base (Micro incluido; Small $15, Medium $60) | $0 | $0–5 | $5–50 |
| Vercel Pro (1 usuario) | $20 | $20 | $20 |
| Dominio | ~$1 | ~$1 | ~$1 |
| **Total USD** | **~$46** | **~$46–51** | **~$51–96** |
| **Total COP** | **~$146.000** | **~$146.000–162.000** | **~$162.000–304.000** |

**No incluye:** tu tiempo, impuestos, comisión de pasarela de pago, ni PITR (+$100 USD ≈ $317.000/mes).

Dejar activado el **tope de gasto** de Supabase Pro y configurar el **límite de gasto** en Vercel (no viene por defecto).

---

## 5. Precios al cliente (hipótesis a validar en la fase 0)

Referencia de mercado, según el blog de Alegra (parte interesada, verificar): Alegra Emprendedor **$74.900/mes**, Alegra Pyme **$163.900/mes**, Siigo Nube Emprendedor ~**$191.000/mes**. Ellos incluyen facturación electrónica y contabilidad; esta plataforma **no**, por eso puede costar mucho menos.

| Plan | Qué incluye | Precio mensual sugerido |
|---|---|---|
| Básico | Caja, inventario, fiados | $39.900 |
| Completo | + tienda en línea, pedidos, reportes, saldo prepago | $59.900 |
| Plus | + ropa o repuestos, varios usuarios, préstamos | $89.900 |

Pago único de instalación y capacitación: **$100.000–200.000** (ayuda a cubrir los primeros meses).

---

## 6. Punto de equilibrio

**Sostenerse sola** (cubrir ~$146.000 de infraestructura):

| Precio por cliente | Clientes |
|---|---|
| $40.000 | 4 |
| $60.000 | 3 |
| $80.000 | 2 |

**Rentable:** `clientes = (infraestructura + tu meta mensual) ÷ precio`. Con infraestructura de ~$200.000:

| Meta mensual | A $40.000 | A $60.000 | A $80.000 |
|---|---|---|---|
| $1.000.000 | ~30 | ~20 | ~15 |
| $2.000.000 | ~55 | ~37 | ~28 |

Sumar **~25 % más de clientes** para cubrir bajas, mora y el primer mes gratis. Si Nelson cobra comisión recurrente por las tiendas que traiga, cada una de ellas deja menos.

**Lectura:** la infraestructura es barata y el margen por cliente es alto. Lo difícil es **conseguir clientes, cobrarles a tiempo y darles soporte** (1–2 horas al mes por tienda al inicio).

---

## 7. Conceptos básicos

### Tiempo real (Realtime)
- Cuenta **conexiones abiertas** (cada celular o computador con la app abierta), no negocios ni usuarios.
- Usos: pedidos en línea que aparecen en la caja sin recargar; la pistola (el celular escanea y manda el código a la caja).
- Cada canal lleva el id del negocio (`envivo:{negocio}`, `pistola:{negocio}:{código}`) y una política deja entrar solo a su personal. Ya probado.
- ~3 conexiones por negocio en horario de atención → 20 negocios ≈ 60 de 500. ~180.000 mensajes/mes con 20 negocios frente a 5 M incluidos.
- **Los clientes que miran el catálogo NO usan tiempo real** (serían miles de conexiones).

### Copias diarias vs. PITR
- **Diaria:** una foto de la base cada noche. Si algo se daña a las 2 p.m., se recupera el estado de la noche anterior y se pierden las ventas desde entonces.
- **PITR (por punto en el tiempo):** graba cada cambio; permite volver a cualquier segundo (por ejemplo, un minuto antes del error). Cuesta **$100 USD/mes** por 7 días de historia.
- Al principio **no hace falta**: copias diarias + tu copia semanal propia. Se activa cuando haya muchas tiendas vendiendo todo el día o carteras de fiado grandes.
- **Aviso:** restaurar Supabase devuelve **toda la base** (todos los negocios). Para el error de un solo cliente se restaura en un proyecto aparte y se copian solo sus filas. El respaldo por negocio de la app es clave.

---

## 8. Lista antes de cobrarle a un cliente

**Copias de seguridad**
- [ ] Supabase Pro (copias diarias, 7 días).
- [ ] Copia semanal propia de toda la base fuera de Supabase.
- [ ] Respaldo en zip por negocio adaptado al `slug` (falta `src/lib/respaldo.js`).
- [ ] Probar una restauración real, al menos una vez, en el proyecto de pruebas.

**Monitoreo**
- [ ] Prueba de disponibilidad (UptimeRobot u otra) con aviso al correo.
- [ ] Alertas de errores (Sentry u otra).
- [ ] Revisión mensual de avisos de seguridad y rendimiento (Advisors).
- [ ] Revisar consultas lentas cuando haya clientes.

**Límites y condiciones**
- [ ] Registro público de usuarios cerrado (Authentication → Sign In / Providers → apagar *Allow new users to sign up*).
- [ ] Cuotas por negocio: productos, tamaño de fotos (3 MB, bajar con compresión), pedidos pendientes (300).
- [ ] **No prometer porcentaje de disponibilidad (SLA)** en el contrato.
- [ ] Contrato con política de datos (Ley 1581): tú encargado, cada negocio responsable de sus clientes.
- [ ] Procedimiento escrito de baja de un negocio y entrega de sus datos.
- [ ] Clave `service_role` o `secret` **nunca** en el front ni en el chat.

---

## 9. Riesgos de compartir un solo proyecto

| Riesgo | Cómo evitarlo |
|---|---|
| Un negocio con consultas pesadas ralentiza a todos | Índices que empiecen por `negocio_id`, reportes con rango de fechas, paginación, tiempo máximo por consulta, subir el servidor de la base |
| Una migración mala afecta a todos | Probarla primero en pruebas, migraciones repetibles, copia justo antes |
| Fuga de datos entre clientes (el peor caso) | Las 224 pruebas y `verificar_aislamiento()` antes de cada cambio |
| Usuarios creados por cualquiera | Registro público cerrado; negocios creados solo desde la consola SQL |
| Cliente grande o sensible que quiere aislamiento | Mismo esquema: se mueve a su propio proyecto exportando por `negocio_id` (herramienta por construir) |
| Pasar límite de conexiones o de tiempo real | Monitorear y subir de plan |

---

## 10. Módulos pedidos por Nelson (para la etapa 3)

Cada negocio los activa o apaga. Reglas de interfaz que se mantienen: simétrica y ordenada, botón **Volver** en cada paso, totales clave fijos, **títulos completos sin cortar con "…"**, todo formulario conserva lo escrito si se recarga.

- Saldo prepago de clientes (recargas, consumo en caja, devolución, ajuste, bono opcional con plazo que decide el dueño), con movimientos que no se pueden borrar y que cuentan en el cuadre de caja. **No existe aún en la plataforma:** requiere su propia migración, tablas, integración con el cuadre y pruebas de aislamiento.
- Pedidos de la tienda en línea: modal "Recibir pedido" con desglose y valor del domicilio, y pasar el pedido a la caja.
- Historial de compras por cliente (filtros por fechas y producto).
- Fiados y abonos.
- Importar fotos de productos (pegar texto, buscar por código de barras e imagen genérica) y publicar varios productos a la vez.
- Modo práctica para la cuenta de soporte (simula escrituras sin tocar datos reales).
- Guía del dueño dentro de la app.

Pendiente de etapa 3 además: marca configurable, rutas `/n/{slug}/…` (`tienda`, `catalogo`, `pistola`, `ingreso`), `/plataforma` para soporte, service worker con caché `{slug}-`, manifest dinámico, compresión de fotos, miniaturas y carga perezosa.

---

## 11. La idea de la red (paréntesis estratégico)

Red de tiendas de barrio con catálogo universal: el cliente escanea un QR, comparte su ubicación y ve la tienda abierta más cercana que tenga lo que busca.

**Resumen de la recomendación**
- Seguir con el plan multi-tenant; la red se suma después, sin editar los archivos de 2b (migración 10 aparte, con solo tablas y columnas vacías).
- **Fase 0, sin programar:** hablar con 3–5 tiendas, medir cuánto coincide el catálogo, probar QR que abren WhatsApp con contador de escaneos, cartas de intención, una hora con abogado y consulta de antecedentes marcarios (SIC).
- Idea pequeña y viable: página "Red Lite" (listado por barrio + botón de WhatsApp) antes del panel completo.
- Aliado/vendedor (Nelson): rol de plataforma que **no ve ventas ni clientes**; su comisión se calcula sobre las mensualidades pagadas, no sobre las ventas de las tiendas.
- Ubicación del cliente: se procesa en su dispositivo; el servidor no la recibe hasta el pedido.
- Dinero: la plataforma **nunca toca el dinero** (pago directo cliente-tienda).
- Quedan fuera del piloto: licor y cigarrillos, domiciliario compartido, compras colectivas.

**Marca de la red (en exploración)**
- Nombre candidato: **Cuadra** (otros: Cerquita, Esquina, Vecino, Del Barrio, A la Mano). **Sin verificar** en la SIC, dominio ni redes.
- Logo: concepto "molinete" (cuatro bloques color verde azulado `#0F766E` alrededor de un cuadrado naranja `#C2410C` con un pin blanco propio). Se redibuja como SVG exacto cuando elijas la versión.
- La marca de la red es un dato (`redes`), no se escribe en el código. No usar la marca de Nelson hasta que haya acuerdo escrito.

---

## 12. Decisiones pendientes (resolver antes de cobrarle a alguien)

1. **¿Quién es el primer cliente que paga?** (tiendas de barrio o tienda de repuestos). Define si después de la etapa 3 viene la etapa 4 de repuestos o portar el panel de tienda de Matriz.
2. **Acuerdo escrito con Nelson** sobre la red: marca, de quién es el código y los datos, vendedor o socio, comisión, qué pasa si se separan.
3. Aprobación de 2b (después de que `verificar_aislamiento()` dé todo en `ok = true`).
4. Nombre y logo definitivos de la red.

---js80KrD
## 13. Fuentes consultadas

- Supabase — precios: https://supabase.com/pricing
- Vercel — precios: https://vercel.com/pricing
- TRM del 16 de octubre de 2026 (Portafolio): https://www.portafolio.co/economia/finanzas/precio-del-dolar-hoy-en-colombia-asi-cotiza-la-divisa-este-16-de-octubre-tras-perder-casi-504569
- Alegra vs Siigo (blog de Alegra, parte interesada): https://blog.alegra.com/colombia/alegra-vs-siigo-colombia/JPOQE6X3B
