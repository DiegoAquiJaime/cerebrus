/**
 * BODEGA AQUÍ JAIME — Google Apps Script API
 * Fase 1: login, catálogos, stock, movimientos, anulación
 *
 * Instalación: ver servare/README.md
 * Ejecutar setup() una vez antes de publicar.
 */

var SHEETS = {
  CONFIG: 'Config',
  USUARIOS: 'Usuarios',
  CENTROS: 'CentrosCosto',
  PRODUCTOS: 'Productos',
  PROVEEDORES: 'Proveedores',
  MOVIMIENTOS: 'Movimientos',
  STOCK: 'Stock',
  LOG: 'Log'
};

var CC_STOCK = ['BODEGA', 'PREELAB', 'BOD_INTERNA'];

// ── HTTP ─────────────────────────────────────────────────────

function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'ping') {
    return json_({ ok: true, service: 'bodega-aqui-jaime', ts: new Date().toISOString() });
  }
  return json_({ ok: false, error: 'Usar POST con accion' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    return json_({ ok: false, error: 'Sistema ocupado, reintenta' });
  }
  try {
    var req = {};
    if (e && e.postData && e.postData.contents) {
      req = JSON.parse(e.postData.contents);
    }
    if (!req.token || req.token !== getConfig_('token_api')) {
      return json_({ ok: false, error: 'No autorizado' });
    }
    switch (req.accion) {
      case 'login': return login_(req);
      case 'catalogos': return catalogos_();
      case 'stock': return stock_(req);
      case 'movimiento': return crearMovimiento_(req);
      case 'anular': return anularMovimiento_(req);
      case 'dashboard': return dashboard_(req);
      case 'productos_bulk': return productosBulk_(req);
      default: return json_({ ok: false, error: 'Acción desconocida: ' + (req.accion || '') });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

// ── Config ───────────────────────────────────────────────────

function getConfig_(clave) {
  var sh = ss_().getSheetByName(SHEETS.CONFIG);
  if (!sh) return '';
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === clave) return data[i][1];
  }
  return '';
}

function setConfig_(clave, valor) {
  var sh = ss_().getSheetByName(SHEETS.CONFIG);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === clave) {
      sh.getRange(i + 1, 2).setValue(valor);
      return;
    }
  }
  sh.appendRow([clave, valor]);
}

// ── Log ────────────────────────────────────────────────────────

function log_(usuario, accion, entidad, entidadId, detalle) {
  var sh = ss_().getSheetByName(SHEETS.LOG);
  sh.appendRow([
    new Date(),
    usuario || '',
    accion || '',
    entidad || '',
    entidadId || '',
    typeof detalle === 'string' ? detalle : JSON.stringify(detalle || {})
  ]);
}

// ── Setup ────────────────────────────────────────────────────

function setup() {
  var ss = ss_();
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);

  ensureSheet_(SHEETS.CONFIG, ['clave', 'valor'], [
    ['token_api', token],
    ['iva_pct', 19],
    ['permitir_stock_negativo', 'NO'],
    ['tolerancia_precio_pct', 2],
    ['alerta_vencimiento_dias', 7],
    ['carpeta_drive_id', '']
  ]);

  ensureSheet_(SHEETS.USUARIOS, ['id', 'nombre', 'rol', 'pin', 'activo'], [
    ['u1', 'Admin', 'ADMIN', '1234', 'SI'],
    ['u2', 'Bodega', 'BODEGA', '5678', 'SI']
  ]);

  ensureSheet_(SHEETS.CENTROS, ['codigo', 'nombre', 'tipo', 'mantiene_stock'], [
    ['PROV', 'Proveedores', 'EXTERNO', 'NO'],
    ['OTROS_IN', 'Otras entradas', 'EXTERNO', 'NO'],
    ['BODEGA', 'Bodega Central', 'INTERNO', 'SI'],
    ['PREELAB', 'Preelaboración', 'INTERNO', 'SI'],
    ['COCINA', 'Cocina', 'FINAL', 'NO'],
    ['COMEDOR', 'Comedor / Barra', 'FINAL', 'NO'],
    ['BOD_INTERNA', 'Bodega uso interno', 'INTERNO', 'SI'],
    ['CASA_OTROS', 'Casa / Otros', 'FINAL', 'NO'],
    ['MERMA', 'Mermas', 'FINAL', 'NO']
  ]);

  ensureSheet_(SHEETS.PRODUCTOS, ['sku', 'nombre', 'categoria', 'unidad', 'tipo', 'costo_promedio', 'stock_min', 'requiere_lote', 'activo'], []);
  ensureSheet_(SHEETS.PROVEEDORES, ['id', 'rut', 'nombre', 'contacto', 'telefono', 'email', 'condicion_pago', 'registro_sanitario', 'activo'], []);
  ensureSheet_(SHEETS.MOVIMIENTOS, [
    'id', 'fecha_hora', 'tipo', 'cc_origen', 'cc_destino', 'sku', 'cantidad',
    'costo_unitario', 'costo_total', 'usuario', 'doc_ref', 'lote', 'nota', 'op_id', 'anula_a', 'estado'
  ], []);
  ensureSheet_(SHEETS.LOG, ['timestamp', 'usuario', 'accion', 'entidad', 'entidad_id', 'detalle'], []);

  setupStockSheet_();

  SpreadsheetApp.flush();
  Logger.log('Setup OK. token_api=' + token);
  return { ok: true, token_api: token };
}

function ensureSheet_(name, headers, rows) {
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clear();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.setFrozenRows(1);
  if (rows && rows.length) {
    sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  return sh;
}

function setupStockSheet_() {
  var ss = ss_();
  var sh = ss.getSheetByName(SHEETS.STOCK);
  if (!sh) sh = ss.insertSheet(SHEETS.STOCK);
  sh.clear();
  var headers = ['sku'].concat(CC_STOCK);
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(1);
  // Fórmulas se aplican al agregar productos vía refreshStockFormulas_()
}

function refreshStockFormulas_() {
  var ss = ss_();
  var prodSh = ss.getSheetByName(SHEETS.PRODUCTOS);
  var stockSh = ss.getSheetByName(SHEETS.STOCK);
  if (!prodSh || !stockSh) return;

  var prods = prodSh.getDataRange().getValues();
  var lastRow = Math.max(prods.length, 2);
  var headers = ['sku'].concat(CC_STOCK);
  stockSh.getRange(1, 1, 1, headers.length).setValues([headers]);

  for (var r = 2; r <= lastRow; r++) {
    var sku = prods[r - 1] ? prods[r - 1][0] : '';
    if (!sku && r > prods.length) break;
    stockSh.getRange(r, 1).setValue(sku || '');
    for (var c = 0; c < CC_STOCK.length; c++) {
      var cc = CC_STOCK[c];
      var col = c + 2;
      var ccCol = columnToLetter_(col);
      var formula = '=SUMIFS(Movimientos!$G:$G,Movimientos!$F:$F,$A' + r + ',Movimientos!$E:$E,' + ccCol + '$1,Movimientos!$P:$P,"VIGENTE")'
        + '-SUMIFS(Movimientos!$G:$G,Movimientos!$F:$F,$A' + r + ',Movimientos!$D:$D,' + ccCol + '$1,Movimientos!$P:$P,"VIGENTE")';
      stockSh.getRange(r, col).setFormula(formula);
    }
  }
}

function columnToLetter_(col) {
  var letter = '';
  while (col > 0) {
    var mod = (col - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}

// ── Lecturas ─────────────────────────────────────────────────

function readTable_(sheetName) {
  var sh = ss_().getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return [];
  var data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  return data.map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = row[i]; });
    return obj;
  });
}

function login_(req) {
  var pin = String(req.pin || '').trim();
  var usuarios = readTable_(SHEETS.USUARIOS);
  for (var i = 0; i < usuarios.length; i++) {
    var u = usuarios[i];
    if (String(u.activo).toUpperCase() !== 'SI') continue;
    if (String(u.pin) === pin) {
      log_(u.nombre, 'LOGIN', 'Usuario', u.id, '');
      return json_({
        ok: true,
        usuario: { id: u.id, nombre: u.nombre, rol: u.rol }
      });
    }
  }
  return json_({ ok: false, error: 'PIN incorrecto' });
}

function catalogos_() {
  return json_({
    ok: true,
    productos: readTable_(SHEETS.PRODUCTOS).filter(function(p) { return String(p.activo).toUpperCase() === 'SI'; }),
    centros: readTable_(SHEETS.CENTROS),
    usuarios: readTable_(SHEETS.USUARIOS).map(function(u) { return { id: u.id, nombre: u.nombre, rol: u.rol }; }),
    config: {
      permitir_stock_negativo: getConfig_('permitir_stock_negativo'),
      iva_pct: Number(getConfig_('iva_pct')) || 19
    }
  });
}

function stock_(req) {
  var cc = req.cc || null;
  var sh = ss_().getSheetByName(SHEETS.STOCK);
  if (!sh || sh.getLastRow() < 2) return json_({ ok: true, stock: [] });

  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  var out = [];

  data.forEach(function(row) {
    var sku = String(row[0] || '');
    if (!sku) return;
    var item = { sku: sku, cantidades: {} };
    for (var c = 1; c < headers.length; c++) {
      var ccCode = String(headers[c]);
      if (cc && cc !== ccCode) continue;
      item.cantidades[ccCode] = Number(row[c]) || 0;
    }
    out.push(item);
  });

  return json_({ ok: true, stock: out });
}

function dashboard_(req) {
  var productos = readTable_(SHEETS.PRODUCTOS).filter(function(p) { return String(p.activo).toUpperCase() === 'SI'; });
  var stockRes = JSON.parse(stock_({ cc: 'BODEGA' }).getContent());
  var stockMap = {};
  (stockRes.stock || []).forEach(function(s) { stockMap[s.sku] = s.cantidades.BODEGA || 0; });

  var bajoMinimo = [];
  productos.forEach(function(p) {
    var stk = stockMap[p.sku] || 0;
    var min = Number(p.stock_min) || 0;
    if (min > 0 && stk < min) {
      bajoMinimo.push({ sku: p.sku, nombre: p.nombre, stock: stk, minimo: min });
    }
  });

  var movs = readTable_(SHEETS.MOVIMIENTOS).filter(function(m) { return String(m.estado) === 'VIGENTE'; });
  var hoy = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var movsHoy = movs.filter(function(m) {
    var fh = m.fecha_hora instanceof Date ? m.fecha_hora : new Date(m.fecha_hora);
    return Utilities.formatDate(fh, Session.getScriptTimeZone(), 'yyyy-MM-dd') === hoy;
  });

  return json_({
    ok: true,
    bajo_minimo: bajoMinimo,
    movimientos_hoy: movsHoy.length,
    productos_activos: productos.length
  });
}

// ── Movimientos ──────────────────────────────────────────────

function nextMovId_() {
  var sh = ss_().getSheetByName(SHEETS.MOVIMIENTOS);
  var last = sh.getLastRow();
  return 'MOV-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd') + '-' + String(last).padStart(5, '0');
}

function getStockSkuCc_(sku, cc) {
  var sh = ss_().getSheetByName(SHEETS.STOCK);
  if (!sh || sh.getLastRow() < 2) return 0;
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var ccCol = headers.indexOf(cc);
  if (ccCol < 0) return 0;
  var data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]) === sku) return Number(data[i][ccCol]) || 0;
  }
  return 0;
}

function ccMantieneStock_(cc) {
  var centros = readTable_(SHEETS.CENTROS);
  for (var i = 0; i < centros.length; i++) {
    if (centros[i].codigo === cc) return String(centros[i].mantiene_stock).toUpperCase() === 'SI';
  }
  return false;
}

function crearMovimiento_(req) {
  var tipo = String(req.tipo || '').trim();
  var ccOrigen = String(req.cc_origen || '').trim();
  var ccDestino = String(req.cc_destino || '').trim();
  var sku = String(req.sku || '').trim();
  var cantidad = Number(req.cantidad);
  var usuario = String(req.usuario || '').trim();
  var nota = String(req.nota || '').trim();

  if (!tipo || !sku || !cantidad || cantidad <= 0) {
    return json_({ ok: false, error: 'Datos incompletos' });
  }
  if (!ccOrigen && !ccDestino) {
    return json_({ ok: false, error: 'Falta origen o destino' });
  }

  var productos = readTable_(SHEETS.PRODUCTOS);
  var prod = null;
  for (var i = 0; i < productos.length; i++) {
    if (productos[i].sku === sku) { prod = productos[i]; break; }
  }
  if (!prod) return json_({ ok: false, error: 'SKU no encontrado: ' + sku });

  var permitirNeg = String(getConfig_('permitir_stock_negativo')).toUpperCase() === 'SI';
  if (ccOrigen && ccMantieneStock_(ccOrigen) && !permitirNeg) {
    var disp = getStockSkuCc_(sku, ccOrigen);
    if (disp < cantidad) {
      return json_({ ok: false, error: 'Stock insuficiente en ' + ccOrigen + ': ' + disp + ' < ' + cantidad });
    }
  }

  var costoUnit = Number(prod.costo_promedio) || 0;
  var id = nextMovId_();
  var sh = ss_().getSheetByName(SHEETS.MOVIMIENTOS);
  sh.appendRow([
    id, new Date(), tipo, ccOrigen, ccDestino, sku, cantidad,
    costoUnit, cantidad * costoUnit, usuario, req.doc_ref || '', req.lote || '', nota,
    req.op_id || '', '', 'VIGENTE'
  ]);

  ensureStockRow_(sku);
  log_(usuario, 'CREAR', 'Movimiento', id, { tipo: tipo, sku: sku, cantidad: cantidad });

  return json_({ ok: true, id: id });
}

function ensureStockRow_(sku) {
  var stockSh = ss_().getSheetByName(SHEETS.STOCK);
  var data = stockSh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === sku) return;
  }
  var row = data.length + 1;
  stockSh.getRange(row, 1).setValue(sku);
  for (var c = 0; c < CC_STOCK.length; c++) {
    var col = c + 2;
    var ccCol = columnToLetter_(col);
    var formula = '=SUMIFS(Movimientos!$G:$G,Movimientos!$F:$F,$A' + row + ',Movimientos!$E:$E,' + ccCol + '$1,Movimientos!$P:$P,"VIGENTE")'
      + '-SUMIFS(Movimientos!$G:$G,Movimientos!$F:$F,$A' + row + ',Movimientos!$D:$D,' + ccCol + '$1,Movimientos!$P:$P,"VIGENTE")';
    stockSh.getRange(row, col).setFormula(formula);
  }
}

function anularMovimiento_(req) {
  var movId = String(req.movimiento_id || '').trim();
  var usuario = String(req.usuario || '').trim();
  var motivo = String(req.motivo || '').trim();

  if (!movId) return json_({ ok: false, error: 'Falta movimiento_id' });
  if (!motivo) return json_({ ok: false, error: 'Motivo obligatorio' });

  var rol = String(req.rol || '').toUpperCase();
  if (rol !== 'ADMIN') return json_({ ok: false, error: 'Solo ADMIN puede anular' });

  var movs = readTable_(SHEETS.MOVIMIENTOS);
  var original = null;
  var origRow = -1;
  for (var i = 0; i < movs.length; i++) {
    if (movs[i].id === movId) { original = movs[i]; origRow = i + 2; break; }
  }
  if (!original) return json_({ ok: false, error: 'Movimiento no encontrado' });
  if (String(original.estado) !== 'VIGENTE') return json_({ ok: false, error: 'Ya anulado' });

  var sh = ss_().getSheetByName(SHEETS.MOVIMIENTOS);
  sh.getRange(origRow, 16).setValue('ANULADO');

  var revId = nextMovId_();
  sh.appendRow([
    revId, new Date(), 'ANULACION_' + original.tipo,
    original.cc_destino, original.cc_origen, original.sku, original.cantidad,
    original.costo_unitario, original.costo_total, usuario, '', '', 'Anula ' + movId + ': ' + motivo,
    original.op_id || '', movId, 'VIGENTE'
  ]);

  log_(usuario, 'ANULAR', 'Movimiento', movId, { reversa: revId, motivo: motivo });
  return json_({ ok: true, reversa_id: revId });
}

// ── Migración productos (ejecutar una vez desde el editor) ───

var IMPORT_SHEET = 'ProductosImport';

/**
 * 1) En Google Sheet: Archivo → Importar → subir productos-migrados.csv
 *    → Insertar nueva hoja → renombrar a "ProductosImport"
 * 2) Apps Script → ejecutar migrarProductosImport
 */
function migrarProductosImport() {
  var ss = ss_();
  var imp = ss.getSheetByName(IMPORT_SHEET);
  if (!imp) {
    throw new Error('Crea la hoja "' + IMPORT_SHEET + '" importando servare/data/productos-migrados.csv');
  }
  var prodSh = ss.getSheetByName(SHEETS.PRODUCTOS);
  if (!prodSh) throw new Error('Falta hoja Productos — ejecuta setup() primero');

  var impData = imp.getDataRange().getValues();
  if (impData.length < 2) throw new Error('ProductosImport está vacía');

  var headers = impData[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var col = {};
  headers.forEach(function(h, i) { col[h] = i; });
  ['sku', 'nombre'].forEach(function(k) {
    if (col[k] === undefined) throw new Error('Falta columna: ' + k);
  });

  var existing = {};
  if (prodSh.getLastRow() > 1) {
    var cur = prodSh.getRange(2, 1, prodSh.getLastRow() - 1, 1).getValues();
    cur.forEach(function(r) { if (r[0]) existing[String(r[0])] = true; });
  }

  var added = 0;
  var skipped = 0;
  for (var r = 1; r < impData.length; r++) {
    var row = impData[r];
    var sku = String(row[col.sku] || '').trim();
    var nombre = String(row[col.nombre] || '').trim();
    if (!sku || !nombre) continue;
    if (existing[sku]) { skipped++; continue; }

    prodSh.appendRow([
      sku,
      nombre,
      col.categoria !== undefined ? row[col.categoria] : '',
      col.unidad !== undefined ? row[col.unidad] : 'UN',
      col.tipo !== undefined ? row[col.tipo] : 'INSUMO',
      col.costo_promedio !== undefined ? (Number(row[col.costo_promedio]) || 0) : 0,
      col.stock_min !== undefined ? (Number(row[col.stock_min]) || 0) : 0,
      col.requiere_lote !== undefined ? row[col.requiere_lote] : 'NO',
      col.activo !== undefined ? row[col.activo] : 'SI'
    ]);
    ensureStockRow_(sku);
    existing[sku] = true;
    added++;
  }

  refreshStockFormulas_();
  log_('SISTEMA', 'IMPORTAR', 'Productos', '', { added: added, skipped: skipped });
  Logger.log('Productos importados: ' + added + ', omitidos (duplicados): ' + skipped);
  return { ok: true, added: added, skipped: skipped };
}

/**
 * API: carga/actualiza productos desde JSON (GitHub, Cursor, script local).
 * POST { accion:'productos_bulk', token, productos:[{sku,nombre,...}], modo:'upsert'|'solo_nuevos' }
 */
function productosBulk_(req) {
  var items = req.productos;
  if (!Array.isArray(items) || !items.length) {
    return json_({ ok: false, error: 'Array productos vacío' });
  }
  var modo = String(req.modo || 'upsert');
  var usuario = String(req.usuario || 'API');

  var prodSh = ss_().getSheetByName(SHEETS.PRODUCTOS);
  if (!prodSh) return json_({ ok: false, error: 'Falta hoja Productos — ejecuta setup()' });

  var skuToRow = {};
  var last = prodSh.getLastRow();
  if (last > 1) {
    var skus = prodSh.getRange(2, 1, last - 1, 1).getValues();
    skus.forEach(function(r, i) {
      if (r[0]) skuToRow[String(r[0])] = i + 2;
    });
  }

  var added = 0;
  var updated = 0;
  var skipped = 0;
  var newRows = [];
  var newSkus = [];

  items.forEach(function(p) {
    var sku = String(p.sku || '').trim();
    var nombre = String(p.nombre || '').trim();
    if (!sku || !nombre) { skipped++; return; }

    var row = [
      sku,
      nombre,
      String(p.categoria || ''),
      String(p.unidad || 'UN'),
      String(p.tipo || 'INSUMO'),
      Number(p.costo_promedio) || 0,
      Number(p.stock_min) || 0,
      String(p.requiere_lote || 'NO').toUpperCase() === 'SI' ? 'SI' : 'NO',
      String(p.activo || 'SI').toUpperCase() === 'NO' ? 'NO' : 'SI'
    ];

    var existingRow = skuToRow[sku];
    if (existingRow) {
      if (modo === 'solo_nuevos') { skipped++; return; }
      prodSh.getRange(existingRow, 1, existingRow, 9).setValues([row]);
      updated++;
    } else {
      newRows.push(row);
      newSkus.push(sku);
      skuToRow[sku] = -1;
      added++;
    }
  });

  if (newRows.length) {
    var start = prodSh.getLastRow() + 1;
    prodSh.getRange(start, 1, start + newRows.length - 1, 9).setValues(newRows);
    newSkus.forEach(function(sku) { ensureStockRow_(sku); });
  }

  refreshStockFormulas_();
  log_(usuario, 'PRODUCTOS_BULK', 'Productos', '', { added: added, updated: updated, skipped: skipped, total: items.length });
  return json_({ ok: true, added: added, updated: updated, skipped: skipped, total: items.length });
}
