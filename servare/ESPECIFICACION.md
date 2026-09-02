# Sistema de Bodega — Aquí Jaime
## Versión simple: GitHub Pages + Google Sheets

Versión 2.1 — septiembre 2026
Reemplaza la especificación anterior. Misma lógica de negocio, infraestructura mínima.

**Alcance:** sistema de control interno de bodega. No se integra con el punto de venta
ni con contabilidad. Controla lo que entra, lo que se transforma, lo que sale y lo que
se compra.

---

## 1. Arquitectura

```
┌─────────────────────────┐        ┌──────────────────────────┐
│  GitHub Pages           │        │  Google                  │
│  (HTML + JS + Tailwind) │◄──────►│  Apps Script (API)       │
│  Gratis, sin servidor   │  HTTPS │  Google Sheets (BD)      │
│  Instalable como app    │        │  Google Drive (fotos)    │
└─────────────────────────┘        └──────────────────────────┘
```

**Sin npm, sin build, sin servidor.** El repositorio contiene archivos `.html` y `.js` planos; GitHub Pages los publica tal cual. Toda la lógica de datos vive en un solo archivo de Google Apps Script asociado a una planilla de Google Sheets.

### Por qué esta combinación funciona aquí

- Costo cero.
- La planilla es visible y editable directamente si algo falla (red de seguridad importante).
- Google maneja respaldo, historial de versiones y control de acceso.
- Las fotos de facturas van a una carpeta de Drive, que ya se usa a diario.

### Límites reales (conviene conocerlos)

| Límite | Valor | ¿Afecta? |
|---|---|---|
| Celdas por planilla | 10.000.000 | No. Con ~15 columnas, son cientos de miles de movimientos |
| Ejecución de Apps Script | 6 minutos por llamada | No, si los reportes pesados se hacen con fórmulas o tablas dinámicas |
| Usuarios simultáneos escribiendo | ~10-20 sin problemas | No, con 5-8 personas del equipo |
| Velocidad | 1-3 segundos por operación | Aceptable. No es instantáneo como una base de datos real |

**Cuándo migrar:** si en 2-3 años la hoja `Movimientos` pasa de ~100.000 filas o el equipo crece mucho, se migra a Supabase (PostgreSQL). La estructura de este documento está pensada para que esa migración sea copiar tablas, no rediseñar.

---

## 2. Estructura de la planilla (la base de datos)

Un solo archivo de Google Sheets llamado `BODEGA_AQUI_JAIME` con estas pestañas.

### 2.1 `Config`
| clave | valor |
|---|---|
| token_api | (texto secreto, generado al azar) |
| iva_pct | 19 |
| permitir_stock_negativo | NO |
| tolerancia_precio_pct | 2 |
| alerta_vencimiento_dias | 7 |
| carpeta_drive_id | (id de la carpeta de fotos) |

### 2.2 `Usuarios`
`id | nombre | rol | pin | activo`

Roles: `ADMIN`, `BODEGA`, `COCINA`, `PREELAB`, `COMEDOR`, `LECTURA`

### 2.3 `CentrosCosto`
`codigo | nombre | tipo | mantiene_stock`

Datos iniciales:
```
PROV         Proveedores           EXTERNO   NO
OTROS_IN     Otras entradas        EXTERNO   NO
BODEGA       Bodega Central        INTERNO   SI
PREELAB      Preelaboración        INTERNO   SI
COCINA       Cocina                FINAL     NO
COMEDOR      Comedor / Barra       FINAL     NO
BOD_INTERNA  Bodega uso interno    INTERNO   SI
CASA_OTROS   Casa / Otros          FINAL     NO
MERMA        Mermas                FINAL     NO
```

> **Decisión de diseño (sistema de uso interno, sin punto de venta):**
> Cocina y Comedor se tratan como **destino final**: lo que sale de bodega hacia ellos
> se considera consumido en ese momento. No llevan stock propio.
>
> Esto elimina la necesidad de que el chef declare consumo diario plato por plato —
> que sin POS es trabajo manual puro y en la práctica nadie sostiene. El control real
> queda en dos puntos: **lo que sale de bodega** y **el cuadre mensual de inventario**.
>
> Si más adelante se quiere stock en cocina, basta cambiar el tipo a `INTERNO / SI` en
> esta hoja; el resto del sistema no cambia. La devolución de cocina a bodega sigue
> funcionando igual: descuenta del consumo acumulado del período.

### 2.4 `Productos`
`sku | nombre | categoria | unidad | tipo | costo_promedio | stock_min | requiere_lote | activo`

- `unidad`: KG, G, L, ML, UN, CAJA
- `tipo`: INSUMO, PREELABORADO, NO_ALIMENTARIO
- `costo_promedio`: lo recalcula el script en cada entrada. **No se edita a mano.**

### 2.5 `Proveedores`
`id | rut | nombre | contacto | telefono | email | condicion_pago | registro_sanitario | activo`

### 2.6 `Movimientos` — el corazón del sistema
Una fila por línea de movimiento. Todo el stock sale de acá.

`id | fecha_hora | tipo | cc_origen | cc_destino | sku | cantidad | costo_unitario | costo_total | usuario | doc_ref | lote | nota | op_id | anula_a | estado`

- `estado`: `VIGENTE` o `ANULADO`
- `anula_a`: id del movimiento que esta fila reversa
- **Nunca se edita ni se borra una fila.** Para corregir, el sistema escribe una fila nueva de reversa. La hoja se protege para que solo el script pueda escribir.

Tipos de movimiento:
```
ENTRADA_COMPRA        PROV → BODEGA
ENTRADA_OTROS         OTROS_IN → cualquier CC
TRASPASO              BODEGA → BOD_INTERNA  (entre CC que sí llevan stock)
SALIDA_COCINA         BODEGA → COCINA       (consumo)
SALIDA_COMEDOR        BODEGA → COMEDOR      (consumo)
PREELAB_SALIDA        BODEGA → PREELAB      (consume materia prima)
PREELAB_ENTRADA       PREELAB → BODEGA      (ingresa producto procesado)
DEVOLUCION            COCINA/COMEDOR/PREELAB → BODEGA
DEVOL_PROVEEDOR       BODEGA → PROV
SALIDA_CASA_OTROS     cualquier CC → CASA_OTROS
MERMA                 cualquier CC → MERMA
AJUSTE                ± sobre un CC (solo desde toma de inventario)
```

### 2.7 `Stock` — hoja calculada, no se escribe
Columnas `sku` y un centro de costo por columna. Cada celda:

```
=SUMIFS(Movimientos!$G:$G, Movimientos!$F:$F, $A2, Movimientos!$E:$E, B$1, Movimientos!$P:$P, "VIGENTE")
 - SUMIFS(Movimientos!$G:$G, Movimientos!$F:$F, $A2, Movimientos!$D:$D, B$1, Movimientos!$P:$P, "VIGENTE")
```

Es decir: **todo lo que entró al CC menos todo lo que salió del CC.** El saldo nunca se guarda, siempre se deriva. Eso hace imposible que el stock y los movimientos se contradigan.

### 2.8 `Preelaboracion`
`op_id | fecha | responsable | estado | costo_insumos | cantidad_entrada | cantidad_salida | rendimiento_pct | nota | cerrada_en`

### 2.9 `Recetas`
`sku_producto | sku_componente | cantidad | rendimiento_esperado_pct`

### 2.10 `OrdenesCompra`
`folio | fecha | proveedor_id | sku | cantidad_pedida | cantidad_recibida | precio_unitario | subtotal | estado | usuario | nota`

Estados: `BORRADOR`, `ENVIADA`, `PARCIAL`, `RECIBIDA`, `CERRADA`, `ANULADA`

### 2.11 `Recepciones`
`id | folio_oc | fecha | usuario | doc_tipo | doc_numero | doc_fecha | monto_neto | monto_total | url_foto | estado_conciliacion | nota`

- `doc_tipo`: FACTURA, GUIA, BOLETA
- `estado_conciliacion`: OK, DIF_CANTIDAD, DIF_PRECIO, PENDIENTE_FACTURA

### 2.12 `Facturas`
`numero | proveedor_id | fecha | neto | iva | total | recepciones_asociadas | estado_pago | url_archivo`

La columna `recepciones_asociadas` guarda los ids separados por coma. Así una factura quincenal cubre varias guías.

### 2.13 `Inventarios`
`toma_id | fecha | cc | sku | teorico | fisico | diferencia | valor_diferencia | usuario | comentario`

### 2.14 `Log`
`timestamp | usuario | accion | entidad | entidad_id | detalle`

Solo se agrega, nunca se modifica.

### 2.15 `Ventas` (opcional pero recomendada)
`fecha | venta_neta_dia | comentario`

Un solo número al día, digitado a mano desde el cierre de caja. No requiere ninguna
integración. Con eso el sistema calcula el indicador que en el fondo interesa:

```
Costo de materia prima del mes
──────────────────────────────  = % de costo sobre venta
    Venta neta del mes
```

donde el consumo del mes es: `inventario inicial + compras − inventario final`.

Sin punto de venta no se puede comparar plato por plato, pero este porcentaje
mensual ya detecta desviaciones. Si un mes salta de 32 % a 39 %, la respuesta está
en alguna parte del sistema: compras más caras, rendimiento de preelaboración caído,
mermas, o diferencias de inventario. Los cuatro reportes existen.

---

## 3. La preelaboración (lo que hay que hacer bien)

Es el único punto que no conviene simplificar, porque es donde está el valor.

### Flujo en pantalla
1. **Abrir OP** → se genera `op_id`, se elige responsable.
2. **Cargar lo que entra** → escribe filas `PREELAB_SALIDA` (BODEGA → PREELAB).
3. **Registrar lo que sale** → escribe filas `PREELAB_ENTRADA` (PREELAB → BODEGA).
4. **Cerrar OP** → el script calcula rendimiento, costo unitario del producto obtenido, y valida que el stock en PREELAB de esa `op_id` quede en cero (lo que falta se registra como `MERMA`).

### Cálculo
```
Entra:  20,00 kg reineta fresca @ $4.500/kg  →  costo_insumos = $90.000
Sale:   30 filetes de reineta (12,00 kg)
Merma:  8,00 kg

rendimiento     = 12,00 / 20,00 = 60 %
costo por filete = 90.000 / 30 = $3.000
```

El costo de la merma se absorbe en el producto obtenido. Al cerrar, el script escribe `$3.000` como `costo_unitario` de las filas `PREELAB_ENTRADA` y actualiza `costo_promedio` del SKU "filete de reineta" en la hoja `Productos`.

### Alerta de rendimiento
Si la receta declara 62 % esperado y la OP dio 48 %, el sistema pide justificación obligatoria antes de cerrar. Con el tiempo, el reporte de rendimientos por proveedor muestra quién entrega pescado que rinde y quién no.

### Coproductos (opcional, fase 3)
Si de un proceso salen filete + espinazo, la receta define el reparto por porcentaje (ej. 90 % / 10 %). Si no se configura, todo el costo va al producto principal.

---

## 4. Compras: orden → recepción → factura

1. **Crear OC.** Manual, o sugerida por el sistema comparando `Stock` con `stock_min`.
2. **Enviar.** Genera un PDF simple desde el navegador y se comparte por correo o WhatsApp.
3. **Recibir.** Se abre la OC, se marcan cantidades reales, se toma foto del documento (sube a Drive), se ingresa tipo/número/fecha/monto. Al guardar, el script escribe las filas `ENTRADA_COMPRA` y recalcula el precio medio ponderado:

```
nuevo_costo = (stock_actual × costo_actual + cantidad_recibida × precio_recibido)
              ────────────────────────────────────────────────────────────────
                          stock_actual + cantidad_recibida
```

4. **Asociar factura.** Si llegó con guía, la recepción queda `PENDIENTE_FACTURA`. Después se crea la factura y se enlazan las guías correspondientes.
5. **Conciliar.** El sistema marca diferencias entre lo pedido, lo recibido y lo facturado. Reporte exportable para cuentas por pagar.

Todos los montos se manejan **netos**. El IVA solo aparece a nivel de documento.

---

## 5. Trazabilidad de origen (productos del mar)

Los SKU marcados con `requiere_lote = SI` piden en la recepción:

`especie | procedencia (extractiva/acuicultura/importada) | rut y registro del proveedor | tipo y número de documento de origen | fecha de desembarque | zona de captura`

Se guardan en la hoja `Lotes` (`lote_id | sku | ...`) y el campo `lote` de `Movimientos` los enlaza. Un botón genera un PDF de trazabilidad por lote: qué llegó, de quién, con qué documento, y en qué se transformó.

Así la acreditación de origen queda armada sola en la operación diaria.

---

## 6. Archivos del repositorio

```
bodega-aquijaime/
├── index.html              Login por PIN
├── app.html                Aplicación principal (contenedor)
├── manifest.json           Para instalar como app en tablet/celular
├── sw.js                   Service worker (caché offline)
├── css/
│   └── styles.css          Complementos a Tailwind CDN
├── js/
│   ├── api.js              Todas las llamadas a Apps Script
│   ├── auth.js             Login, PIN, sesión en localStorage
│   ├── offline.js          Cola de movimientos sin conexión
│   ├── movimientos.js      Pantalla de movimiento rápido
│   ├── recepcion.js        Recepción contra OC
│   ├── preelaboracion.js   Órdenes de preelaboración
│   ├── compras.js          Órdenes de compra
│   ├── inventario.js       Toma de inventario
│   ├── reportes.js         Consultas y exportación
│   └── ui.js               Componentes comunes, formato CLP, fechas
├── apps-script/
│   └── Codigo.gs           Copiar y pegar en el editor de Apps Script
└── README.md               Instrucciones de instalación
```

**Librerías por CDN** (sin instalar nada):
- Tailwind CSS — `cdn.tailwindcss.com`
- SheetJS — exportar a Excel
- jsPDF + autoTable — órdenes de compra y certificados en PDF
- html5-qrcode — escanear códigos de barras con la cámara del celular

---

## 7. La API (Apps Script)

Un solo archivo `Codigo.gs` con un `doPost(e)` que enruta por `accion`:

```javascript
function doPost(e) {
  const req = JSON.parse(e.postData.contents);
  if (req.token !== getConfig('token_api')) return json({ok:false, error:'No autorizado'});

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);              // evita escrituras simultáneas pisadas
  try {
    switch (req.accion) {
      case 'login':            return login(req);
      case 'catalogos':        return catalogos();          // productos, CC, usuarios
      case 'stock':            return stock(req.cc);
      case 'movimiento':       return crearMovimiento(req);
      case 'anular':           return anularMovimiento(req);
      case 'op_abrir':         return abrirOP(req);
      case 'op_cerrar':        return cerrarOP(req);
      case 'oc_crear':         return crearOC(req);
      case 'oc_recepcionar':   return recepcionar(req);
      case 'factura_asociar':  return asociarFactura(req);
      case 'inventario_cerrar':return cerrarInventario(req);
      case 'reporte':          return reporte(req);
      default: return json({ok:false, error:'Acción desconocida'});
    }
  } finally {
    lock.releaseLock();
  }
}
```

**`LockService` es obligatorio.** Sin él, dos personas grabando al mismo tiempo pueden escribir sobre la misma fila. Es el error más común en este tipo de solución.

Cada función que escribe debe además agregar una fila a `Log`.

---

## 8. Seguridad (lo que se puede y lo que no)

Esto es un sistema interno, no un banco. Medidas razonables:

- El Apps Script se publica como aplicación web con **"Ejecutar como: yo"** y **"Quién tiene acceso: cualquiera con el enlace"**.
- La URL del script y el `token_api` **no van en el código del repositorio**. El usuario los ingresa una vez en la pantalla de configuración y quedan en `localStorage` del dispositivo.
- Login por PIN de 4-6 dígitos por usuario. Sesión con expiración diaria.
- Los permisos por rol se validan **en el Apps Script**, no en el navegador (lo del navegador se puede saltar).
- La planilla se comparte solo con las cuentas que la necesitan; el equipo entra por la aplicación, no por la planilla.
- Las hojas `Movimientos` y `Log` se protegen para que solo el propietario/script escriba.

Limitación honesta: quien obtenga la URL y el token puede llamar la API. Para el riesgo real de un restaurante es aceptable, y siempre queda el `Log`.

---

## 9. Pantallas (en orden de construcción)

1. **Login PIN** — teclado numérico grande, funciona con guantes.
2. **Movimiento rápido** — origen, destino, buscar/escanear producto, cantidad, nota, confirmar. Meta: menos de 20 segundos.
3. **Dashboard** — stock bajo mínimo, OC pendientes, OP abiertas, movimientos del día.
4. **Recepción** — abrir OC, marcar recibido, foto del documento, guardar.
5. **Preelaboración** — abrir OP, cargar entradas, registrar salidas, ver rendimiento en vivo, cerrar.
6. **Órdenes de compra** — listado, crear, sugerir, exportar PDF.
7. **Inventario** — conteo por CC desde el celular, cierre con ajustes.
8. **Reportes** — kardex por producto, consumo por CC, rendimientos, diferencias de inventario, compras por proveedor. Exportables a Excel.
9. **Mantenedores** — productos, proveedores, usuarios, recetas.

---

## 10. Fases

| Fase | Alcance | Tiempo estimado |
|---|---|---|
| **1** | Planilla + Apps Script base + login + movimiento rápido + dashboard | Reemplaza el papel |
| **2** | Órdenes de compra, recepción, asociación de factura, conciliación | Control del gasto |
| **3** | Preelaboración, recetas, rendimientos | Costo real del producto |
| **4** | Inventario, lotes y trazabilidad, reportes completos | Cuadre mensual confiable |
| **5** | PWA offline, escaneo de códigos, etiquetas QR | Operación fluida |

No pasar a la fase siguiente hasta que la anterior lleve dos semanas en uso real.

---

## 11. Prompt para Cursor

> Adjuntar este documento al proyecto y pegar esto:

```
Voy a construir un sistema de control de bodega para mi restaurante.
Adjunto la especificación (bodega-aqui-jaime-version-simple.md). Léela completa
antes de escribir código.

Restricciones de infraestructura, no negociables:
- Frontend: HTML5 + JavaScript vanilla (módulos ES6) + Tailwind por CDN.
  SIN npm, SIN build, SIN frameworks. Se publica en GitHub Pages tal cual.
- Backend: un solo archivo de Google Apps Script.
- Base de datos: Google Sheets, con la estructura de la sección 2.
- Interfaz en español de Chile. Moneda CLP sin decimales. Fechas dd-mm-aaaa.

Empecemos por la FASE 1:

1. Genera el archivo apps-script/Codigo.gs con:
   - doPost con enrutamiento por acción y validación de token
   - LockService en toda operación de escritura
   - Funciones: login, catalogos, stock, crearMovimiento, anularMovimiento
   - crearMovimiento debe validar stock disponible (según Config
     permitir_stock_negativo) y escribir siempre en la hoja Log
   - anularMovimiento NO edita la fila original: escribe una fila de reversa
     con anula_a apuntando al id original y marca ambas
   - Una función setup() que cree todas las pestañas con sus encabezados,
     las fórmulas de la hoja Stock y los datos iniciales de CentrosCosto

2. Genera index.html (login por PIN, teclado numérico grande) y la pantalla
   de movimiento rápido optimizada para tablet.

3. Genera js/api.js con el cliente HTTP, manejo de errores y la configuración
   de URL + token guardada en localStorage.

4. Genera README.md con los pasos exactos para: crear la planilla, pegar el
   script, publicarlo como aplicación web, y activar GitHub Pages.

No implementes todavía compras, preelaboración ni inventario.
Antes de escribir código, muéstrame la lista de archivos que vas a crear y
espera mi confirmación.
```

---

## 12. Definiciones pendientes

1. ~~¿La cocina lleva stock propio?~~ **Resuelto:** no. La salida de bodega a cocina es consumo (sección 2.3). Se puede cambiar después sin rehacer nada.
2. **¿Lote obligatorio en qué productos?** Recomendación: solo pescados, mariscos y carnes.
3. **¿Quién puede anular movimientos?** Recomendación: solo `ADMIN`, con motivo obligatorio.
4. **¿Repositorio público o privado?** Si es público, jamás subir la URL del script ni el token. Si es privado, GitHub Pages requiere cuenta de pago; alternativa gratuita: publicar desde un repositorio público sin secretos en el código (que es lo que propone la sección 8).

---

*Misma lógica que la versión completa, con infraestructura de costo cero. Si el volumen lo exige más adelante, la migración natural es a Supabase manteniendo esta misma estructura de tablas.*
