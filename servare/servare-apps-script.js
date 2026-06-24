/**
 * SERVARE — Google Apps Script (inventario / bodega en Sheet propio)
 *
 * Instalación: ver docs/servare-google-sheet.md
 * API compatible con saveParted/getState de Cerebrus, pero solo partición pInv.
 */
var CHUNK_SIZE = 42000;
var PART_SHEET = 'Part_pInv';
var META_SHEET = 'Meta';
var USERS_SHEET = 'Users';
var LOG_SHEET = 'Log';

function doGet(e) { return handleRequest_(e); }
function doPost(e) { return handleRequest_(e); }

function handleRequest_(e) {
  try {
    var action = '';
    var body = {};
    if (e && e.parameter && e.parameter.action) action = String(e.parameter.action);
    if (e && e.postData && e.postData.contents) {
      try { body = JSON.parse(e.postData.contents); } catch (err) {}
      if (body.action) action = String(body.action);
    }
    var out;
    switch (action) {
      case 'getState': out = getState_(); break;
      case 'getVersion': out = getVersion_(); break;
      case 'saveParted': out = saveParted_(body); break;
      case 'verifyPassword': out = verifyPassword_(body); break;
      case 'setPassword': out = setPassword_(body); break;
      case 'ping': out = { ok: true, service: 'servare', ts: new Date().toISOString() }; break;
      default: out = { ok: false, error: 'Acción no reconocida: ' + action };
    }
    return jsonResponse_(out);
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function ensureSheets_() {
  var ss = ss_();
  [META_SHEET, PART_SHEET, USERS_SHEET, LOG_SHEET].forEach(function(name) {
    if (!ss.getSheetByName(name)) ss.insertSheet(name);
  });
  var meta = ss.getSheetByName(META_SHEET);
  if (meta.getLastRow() < 1) {
    meta.getRange(1, 1, 1, 4).setValues([['version', 'lastUser', 'lastDate', 'notes']]);
    meta.getRange(2, 1, 1, 4).setValues([[0, '', '', 'Servare inicializado']]);
  }
  var users = ss.getSheetByName(USERS_SHEET);
  if (users.getLastRow() < 1) {
    users.getRange(1, 1, 1, 2).setValues([['user', 'passHash']]);
  }
}

function readMeta_() {
  ensureSheets_();
  var sh = ss_().getSheetByName(META_SHEET);
  var v = sh.getRange(2, 1).getValue();
  return {
    version: Number(v) || 0,
    lastUser: String(sh.getRange(2, 2).getValue() || ''),
    lastDate: String(sh.getRange(2, 3).getValue() || '')
  };
}

function writeMeta_(user, description) {
  ensureSheets_();
  var sh = ss_().getSheetByName(META_SHEET);
  var meta = readMeta_();
  var next = (Number(meta.version) || 0) + 1;
  sh.getRange(2, 1, 1, 4).setValues([[next, user || '', new Date().toISOString(), description || '']]);
  return next;
}

function getVersion_() {
  var m = readMeta_();
  return { ok: true, version: m.version, lastUser: m.lastUser, lastDate: m.lastDate };
}

function readPartChunks_() {
  ensureSheets_();
  var sh = ss_().getSheetByName(PART_SHEET);
  if (sh.getLastRow() < 2) return '';
  var rows = sh.getRange(2, 1, sh.getLastRow(), 2).getValues();
  rows.sort(function(a, b) { return Number(a[0]) - Number(b[0]); });
  return rows.map(function(r) { return String(r[1] || ''); }).join('');
}

function writePartChunks_(payload) {
  ensureSheets_();
  var sh = ss_().getSheetByName(PART_SHEET);
  sh.clearContents();
  sh.getRange(1, 1, 1, 2).setValues([['chunk', 'data']]);
  var str = String(payload || '');
  if (!str) {
    sh.getRange(2, 1, 1, 2).setValues([[0, '{}']]);
    return;
  }
  var total = Math.ceil(str.length / CHUNK_SIZE) || 1;
  var rows = [];
  for (var i = 0; i < total; i++) {
    rows.push([i, str.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)]);
  }
  sh.getRange(2, 1, rows.length, 2).setValues(rows);
}

function getState_() {
  var raw = readPartChunks_();
  var inv = {};
  if (raw) {
    try { inv = JSON.parse(raw); } catch (e) { inv = {}; }
  }
  var meta = readMeta_();
  return {
    ok: true,
    data: { state: inv, nid: 1 },
    meta: meta
  };
}

function saveParted_(body) {
  body = body || {};
  var parts = body.parts || {};
  var pInv = parts.pInv;
  if (pInv === undefined || pInv === null) {
    return { ok: false, error: 'Servare solo acepta parts.pInv' };
  }
  var str = typeof pInv === 'string' ? pInv : JSON.stringify(pInv);
  if (str.length > CHUNK_SIZE * 200) {
    return { ok: false, error: 'Payload pInv demasiado grande para Servare' };
  }
  writePartChunks_(str);
  var ver = writeMeta_(body.user || '', body.description || 'saveParted pInv');
  appendLog_(body.user, body.description || 'saveParted', str.length);
  return { ok: true, version: ver };
}

function appendLog_(user, desc, bytes) {
  try {
    ensureSheets_();
    var sh = ss_().getSheetByName(LOG_SHEET);
    sh.appendRow([new Date().toISOString(), user || '', desc || '', bytes || 0]);
  } catch (e) {}
}

function sha256_(text) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text));
  return raw.map(function(b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function verifyPassword_(body) {
  body = body || {};
  var user = String(body.user || '').trim();
  var pass = String(body.pass || '');
  if (!user || !pass) return { ok: false, error: 'Usuario o contraseña vacíos' };
  ensureSheets_();
  var sh = ss_().getSheetByName(USERS_SHEET);
  var data = sh.getDataRange().getValues();
  var hash = sha256_(pass);
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === user) {
      if (!data[i][1]) return { ok: true, firstTime: false, needsSet: true };
      return { ok: String(data[i][1]) === hash };
    }
  }
  return { ok: true, firstTime: true };
}

function setPassword_(body) {
  body = body || {};
  var user = String(body.user || '').trim();
  var pass = String(body.pass || '');
  if (!user || !pass) return { ok: false, error: 'Datos incompletos' };
  ensureSheets_();
  var sh = ss_().getSheetByName(USERS_SHEET);
  var data = sh.getDataRange().getValues();
  var hash = sha256_(pass);
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === user) {
      sh.getRange(i + 1, 2).setValue(hash);
      return { ok: true };
    }
  }
  sh.appendRow([user, hash]);
  return { ok: true };
}

/** Ejecutar una vez desde el editor: crea hojas y fila meta. */
function servareSetup() {
  ensureSheets_();
  Logger.log('Servare listo. Publica como Web App y pega la URL en Cerebrus.');
}
