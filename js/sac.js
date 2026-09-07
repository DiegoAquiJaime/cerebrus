/* Cerebrus — Semana Actual (SAC)
 * Extraído de index.html. Funciones globales (no ES modules) para onclick= del HTML.
 * No tocar facturas (pFac / facSem*) ni servare/.
 * Persistencia: markUnsaved() + saveState() → saveToCloud() (definidos en index.html).
 */
// ============================================================
//  SEMANA ACTUAL (SAC)
// ============================================================

/** Cantidad máxima de días permitida en «Desde/Hasta» (período manual). */
var SAC_PERIODO_MAX_DIAS = 92;

// Semana calendario del mes (1–4) según el día de hoy — sin override de edición
function _sacWeekCalendario() {
  const ranges = getCalWeekRanges();
  const today  = new Date().getDate();
  for (let i=0; i<ranges.length; i++) {
    if (today >= ranges[i].start && today <= ranges[i].end) return i+1;
  }
  return ranges.length;
}

function sacCurrentWeek() { return _sacWeekCalendario(); }

function sacParseISODate(s) {
  if (!s || typeof s !== 'string') return null;
  const p = s.split('-').map(Number);
  if (p.length < 3) return null;
  return new Date(p[0], p[1] - 1, p[2]);
}

function sacYMDLocal(d) {
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/**
 * Semana operativa lunes → domingo (hora local) que contiene `d`.
 * Evita el error de las “semanas 1–4 dentro del mes” cuando el lunes cae en el mes anterior
 * (ej. may 2026: el calendario mensual decía 1–10 may, pero la semana real es 27 abr – 3 may).
 */
function sacMondaySundayRangeContaining(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = x.getDay(); // 0 Dom … 6 Sáb
  const deltaMon = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(x.getFullYear(), x.getMonth(), x.getDate() + deltaMon);
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  return { type: 'range', start: sacYMDLocal(mon), end: sacYMDLocal(sun) };
}

/** Semana ISO lun–dom: 0 = la que contiene hoy, 1 = la anterior, etc. */
function sacIsoWeeksBack(weeksBack) {
  const d = new Date();
  const n = Math.max(0, parseInt(weeksBack, 10) || 0);
  if (n > 0) d.setDate(d.getDate() - n * 7);
  return sacMondaySundayRangeContaining(d);
}

function sacPinIsoWeek(weeksBack) {
  const range = sacIsoWeeksBack(weeksBack);
  pushUndo();
  state.sacPeriodoTrabajo = range;
  if (state.sacSemanaTrabajo) delete state.sacSemanaTrabajo;
  _sacLastVentasKey = '';
  sacRender();
  if (typeof vsSavedRender === 'function') vsSavedRender();
  markUnsaved();
  if (typeof saveState === 'function') saveState('Período SAC ISO', true);
  const has = sacPeriodKeyHasData(sacDataKey());
  notify(has ? '✅ ' + sacPeriodLabel() : '✅ ' + sacPeriodLabel() + ' (vacío — revisá otros períodos abajo)');
}

function sacPeriodKeyHasData(key) {
  if (!key) return false;
  const cargas = (state.sacCargas && state.sacCargas[key]) || [];
  const ing = (state.sacIngresos && state.sacIngresos[key]) || [];
  if (Array.isArray(cargas) && cargas.length) return true;
  if (Array.isArray(ing) && ing.length) return true;
  const days = (state.vsData && state.vsData[key]) || [];
  if (Array.isArray(days) && days.some(d => (d && ((d.est || 0) > 0 || (d.real || 0) > 0)))) return true;
  const ex = (state.vsExtraData && state.vsExtraData[key]) || {};
  if ((ex.monto || 0) > 0 || (ex.realExtra || 0) > 0) return true;
  return false;
}

/** Fechas YMD del período en edición (bloque del mes o rango manual). */
function sacPeriodBoundsYMD() {
  const p = sacNormalizedPeriod();
  if (p.type === 'range') return { start: p.start, end: p.end };
  const ranges = getCalWeekRanges(p.y, p.m - 1);
  const r = ranges[p.w - 1];
  if (!r) return null;
  return {
    start: sacYMDLocal(new Date(p.y, p.m - 1, r.start)),
    end: sacYMDLocal(new Date(p.y, p.m - 1, r.end))
  };
}

function sacIsoRangeKey(bounds) {
  if (!bounds || !bounds.start || !bounds.end) return '';
  return 'R|' + bounds.start + '|' + bounds.end;
}

/** Clave S| del bloque mensual si coincide exactamente con el rango de fechas. */
function sacSlotKeyForBounds(bounds) {
  if (!bounds) return '';
  const a = sacParseISODate(bounds.start);
  const b = sacParseISODate(bounds.end);
  if (!a || !b) return '';
  const y = a.getFullYear();
  const m = a.getMonth() + 1;
  const ranges = getCalWeekRanges(y, m - 1);
  const d0 = a.getDate();
  const d1 = b.getDate();
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    if (r.start === d0 && r.end === d1) return 'S|' + y + '|' + m + '|' + (i + 1);
  }
  return '';
}

/** Claves que comparten el mismo calendario (bloque del mes ↔ lun–dom ISO). */
function sacRelatedDataKeys() {
  const keys = new Set();
  const primary = sacDataKey();
  if (primary) keys.add(primary);
  const b = sacPeriodBoundsYMD();
  if (b) {
    const rk = sacIsoRangeKey(b);
    const sk = sacSlotKeyForBounds(b);
    if (rk) keys.add(rk);
    if (sk) keys.add(sk);
  }
  return [...keys];
}

function sacCurrentPeriodHasData() {
  return sacRelatedDataKeys().some(k => sacPeriodKeyHasData(k));
}

function sacCopyPeriodData(fromKey, toKey) {
  if (!fromKey || !toKey || fromKey === toKey) return false;
  if (!sacPeriodKeyHasData(fromKey) || sacPeriodKeyHasData(toKey)) return false;
  if (!state.vsData) state.vsData = {};
  if (!state.vsExtraData) state.vsExtraData = {};
  if (!state.sacCargas) state.sacCargas = {};
  if (!state.sacIngresos) state.sacIngresos = {};
  if (state.vsData[fromKey])
    state.vsData[toKey] = JSON.parse(JSON.stringify(state.vsData[fromKey]));
  if (state.vsExtraData[fromKey])
    state.vsExtraData[toKey] = JSON.parse(JSON.stringify(state.vsExtraData[fromKey]));
  if (state.sacCargas[fromKey])
    state.sacCargas[toKey] = JSON.parse(JSON.stringify(state.sacCargas[fromKey]));
  if (state.sacIngresos[fromKey])
    state.sacIngresos[toKey] = JSON.parse(JSON.stringify(state.sacIngresos[fromKey]));
  return true;
}

/** Misma semana en clave bloque (S|) y lun–dom (R|): copia la que tenga datos a la(s) vacía(s). */
function sacSyncRelatedPeriodKeys() {
  try {
    const keys = sacRelatedDataKeys();
    const withData = keys.filter(k => sacPeriodKeyHasData(k));
    if (!withData.length) return false;
    const source = withData.find(k => k.startsWith('S|')) || withData.find(k => k.startsWith('R|')) || withData[0];
    let changed = false;
    keys.forEach(k => {
      if (k !== source && sacCopyPeriodData(source, k)) changed = true;
    });
    if (changed && typeof markUnsaved === 'function') markUnsaved();
    return changed;
  } catch (e) { return false; }
}

function sacRelatedKeysForKey(key) {
  const keys = new Set();
  if (key) keys.add(key);
  const parts = String(key).split('|');
  if (parts[0] === 'R' && parts.length >= 3) {
    const sk = sacSlotKeyForBounds({ start: parts[1], end: parts[2] });
    if (sk) keys.add(sk);
  } else if (parts[0] === 'S' && parts.length >= 4) {
    const y = +parts[1], m = +parts[2], w = +parts[3];
    const ranges = getCalWeekRanges(y, m - 1);
    const r = ranges[w - 1];
    if (r) {
      keys.add('R|' + sacYMDLocal(new Date(y, m - 1, r.start)) + '|' + sacYMDLocal(new Date(y, m - 1, r.end)));
    }
  }
  return [...keys];
}

function sacMergeSacStoresFromImported(imported, opts) {
  if (!imported || typeof imported !== 'object') return { merged: 0, keys: [] };
  const stores = ['sacCargas', 'sacIngresos', 'vsData', 'vsExtraData'];
  const onlyEmpty = !(opts && opts.overwrite);
  const mergedKeys = new Set();
  stores.forEach(function(store) {
    const src = imported[store];
    if (!src || typeof src !== 'object') return;
    if (!state[store]) state[store] = {};
    Object.keys(src).forEach(function(k) {
      if (!k) return;
      if (onlyEmpty && sacPeriodKeyHasData(k)) return;
      const val = src[k];
      if (store === 'sacCargas' || store === 'sacIngresos') {
        if (!Array.isArray(val) || !val.length) return;
      } else if (store === 'vsData') {
        if (!Array.isArray(val) || !val.some(function(d) { return d && ((d.est || 0) > 0 || (d.real || 0) > 0); })) return;
      } else if (store === 'vsExtraData') {
        if (!val || ((val.monto || 0) <= 0 && (val.realExtra || 0) <= 0)) return;
      }
      state[store][k] = JSON.parse(JSON.stringify(val));
      mergedKeys.add(k);
    });
  });
  sacSyncRelatedPeriodKeys();
  return { merged: mergedKeys.size, keys: [...mergedKeys] };
}

/** Si el bloque del mes es la misma semana lun–dom, usar clave ISO (evita «vacío» con datos en otra clave). */
function sacPreferIsoWhenSlotMatchesIsoWeek() {
  try {
    const p = state.sacPeriodoTrabajo;
    if (!p || p.type !== 'slot') return false;
    const b = sacPeriodBoundsYMD();
    if (!b) return false;
    const iso = sacMondaySundayRangeContaining(sacParseISODate(b.start) || new Date());
    if (b.start !== iso.start || b.end !== iso.end) return false;
    const sk = sacDataKey();
    const rk = 'R|' + iso.start + '|' + iso.end;
    sacCopyPeriodData(sk, rk);
    state.sacPeriodoTrabajo = { type: 'range', start: iso.start, end: iso.end };
    if (state.sacSemanaTrabajo) delete state.sacSemanaTrabajo;
    _sacLastVentasKey = '';
    return true;
  } catch (e) { return false; }
}

/** Abre el período donde realmente hay ventas/cargas (misma semana, otra clave S| vs R|). */
function sacAlignPeriodToStoredData() {
  try {
    const cur = sacDataKey();
    if (sacPeriodKeyHasData(cur)) return false;
    const related = sacRelatedDataKeys().filter(k => k !== cur && sacPeriodKeyHasData(k));
    if (!related.length) return false;
    const pick = related.find(k => k.startsWith('R|')) || related[0];
    sacAbrirPeriodoPorKey(pick, { silent: true });
    return true;
  } catch (e) { return false; }
}

function sacCollectAllSacKeys() {
  const set = new Set();
  ['sacCargas', 'sacIngresos', 'vsData', 'vsExtraData'].forEach(store => {
    const o = state[store];
    if (!o || typeof o !== 'object') return;
    Object.keys(o).forEach(k => { if (k) set.add(k); });
  });
  return [...set];
}

function sacKeyToHumanLabel(key) {
  const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const parts = String(key).split('|');
  if (parts[0] === 'R' && parts.length >= 3) {
    const a = sacParseISODate(parts[1]);
    const b = sacParseISODate(parts[2]);
    if (a && b) return `${a.getDate()} ${MESES[a.getMonth()]} – ${b.getDate()} ${MESES[b.getMonth()]} ${b.getFullYear()} (lun–dom)`;
  }
  if (parts[0] === 'S' && parts.length >= 4) {
    const y = +parts[1], m = +parts[2], w = +parts[3];
    const ranges = getCalWeekRanges(y, m - 1);
    const r = ranges[w - 1];
    return r ? `Bloque sem. ${w} del mes (${r.start}–${r.end} ${MESES[m - 1]} ${y})` : key;
  }
  if (/^[1-4]$/.test(String(key))) return `Semana antigua «${key}» (mes actual)`;
  return key;
}

function sacAbrirPeriodoPorKey(key, opts) {
  if (!key) return;
  const parts = String(key).split('|');
  if (!opts || !opts.silent) pushUndo();
  if (parts[0] === 'S' && parts.length >= 4) {
    state.sacPeriodoTrabajo = { type: 'slot', y: +parts[1], m: +parts[2], w: +parts[3] };
  } else if (parts[0] === 'R' && parts.length >= 3) {
    state.sacPeriodoTrabajo = { type: 'range', start: parts[1], end: parts[2] };
  } else if (/^[1-4]$/.test(String(key))) {
    const n = new Date();
    state.sacPeriodoTrabajo = { type: 'slot', y: n.getFullYear(), m: n.getMonth() + 1, w: parseInt(key, 10) };
  } else {
    notify('⚠ Clave de período no reconocida: ' + key);
    return;
  }
  if (state.sacSemanaTrabajo) delete state.sacSemanaTrabajo;
  _sacLastVentasKey = '';
  sacRender();
  if (typeof vsSavedRender === 'function') vsSavedRender();
  if (!opts || !opts.silent) {
    markUnsaved();
    if (typeof saveState === 'function') saveState('Período SAC', true);
    notify('✅ Abierto: ' + sacKeyToHumanLabel(key));
  }
}

var _sacPeriodKeysList = [];
function sacAbrirPeriodoPorKeyIdx(i) {
  const k = (_sacPeriodKeysList || [])[i];
  if (k) sacAbrirPeriodoPorKey(k);
}

function sacPeriodDataStats(key) {
  const cargas = ((state.sacCargas && state.sacCargas[key]) || []).length;
  const ing = ((state.sacIngresos && state.sacIngresos[key]) || []).length;
  const days = (state.vsData && state.vsData[key]) || [];
  let ventasEst = 0, ventasReal = 0;
  if (Array.isArray(days)) {
    days.forEach(d => {
      if (!d) return;
      ventasEst += d.est || 0;
      ventasReal += d.real || 0;
    });
  }
  const ex = (state.vsExtraData && state.vsExtraData[key]) || {};
  ventasEst += ex.monto || 0;
  ventasReal += ex.realExtra || 0;
  return { cargas, ing, ventasEst, ventasReal };
}

function sacPeriodoFueCerrado(key) {
  if (!key) return false;
  return (state.sacCierresHistorial || []).some(c => c && c.periodKey === key);
}

/** Si la pantalla muestra una semana vacía pero hay otra abierta (sin cierre en historial), ofrecer abrirla. */
function sacMaybeOfferContinuarSemanaPendiente() {
  return;
  if (cerebrusUsuarioBodega()) return;
  if (window._sacOfferedPendiente) return;
  const curKey = sacDataKey();
  if (sacPeriodKeyHasData(curKey)) return;
  const open = sacCollectAllSacKeys().filter(k => k !== curKey && sacPeriodKeyHasData(k) && !sacPeriodoFueCerrado(k));
  if (!open.length) return;
  const prev = sacIsoWeeksBack(1);
  const prevKey = 'R|' + prev.start + '|' + prev.end;
  const pick = open.includes(prevKey) ? prevKey : open[0];
  window._sacOfferedPendiente = true;
  const lbl = sacKeyToHumanLabel(pick);
  if (confirm(
    'Tienes ventas/cargas guardadas en «' + lbl + '».\n\n' +
    'No hace falta haber pulsado «Cerrar semana» para que existan: solo estás viendo otra semana (hoy: ' + sacPeriodLabel() + ').\n\n' +
    '¿Abrir ese período para seguir trabajando y cerrarlo cuando quieras?'
  )) sacAbrirPeriodoPorKey(pick);
}

function sacRenderPeriodosConDatosList() {
  if (cerebrusUsuarioBodega()) return;
  const wrap = document.getElementById('sac-periodos-datos-wrap');
  const list = document.getElementById('sac-periodos-datos-list');
  if (!wrap || !list) return;
  const cur = sacDataKey();
  const keys = sacCollectAllSacKeys()
    .filter(k => sacPeriodKeyHasData(k) && k !== cur)
    .sort((a, b) => String(b).localeCompare(String(a)));
  if (!keys.length) {
    wrap.style.display = 'none';
    list.innerHTML = '';
    return;
  }
  wrap.style.display = 'block';
  _sacPeriodKeysList = keys;
  list.innerHTML = keys.map((k, i) => {
    const st = sacPeriodDataStats(k);
    const lbl = esc(sacKeyToHumanLabel(k));
    return `<div class="sac-period-alt-row">${lbl} <button type="button" class="fac-btn" style="font-size:9px;padding:2px 8px;margin-left:4px;" onclick="sacAbrirPeriodoPorKeyIdx(${i})">Abrir</button><br><span style="color:#94a3b8;">${st.cargas} cargas · ventas ${typeof fmt === 'function' ? fmt(st.ventasReal) : st.ventasReal}</span></div>`;
  }).join('');
}

function sacRenderPeriodDataBanner() {
  /* Retirado: alineación automática S|↔R| y panel colapsable «Otras semanas con datos». */
}

function sacCierreModalBuildIsoQuick() {
  const el = document.getElementById('sac-cierre-iso-quick');
  if (!el) return;
  el.innerHTML = [1, 0].map(weeksBack => {
    const range = sacIsoWeeksBack(weeksBack);
    const key = 'R|' + range.start + '|' + range.end;
    const has = sacPeriodKeyHasData(key);
    const lbl = sacKeyToHumanLabel(key);
    const pin = weeksBack === 0 ? 'Esta semana' : 'Semana pasada';
    return `<button type="button" class="fac-btn" style="width:100%;text-align:left;font-size:11px;${has ? 'border-color:var(--success);' : ''}" onclick="sacPinIsoWeek(${weeksBack});sacCierreModalCerrar();">
      ${esc(pin)} · ${esc(lbl)}${has ? ' · con datos' : ''}
    </button>`;
  }).join('');
}

// Período en edición: slot del mes (1–4) o rango de fechas libre (cualquier N días respetando sacDataKey).
function sacNormalizedPeriod() {
  const R = state.sacPeriodoTrabajo;
  if (R && R.type === 'range' && R.start && R.end && R.end >= R.start) return R;
  if (R && R.type === 'slot' && R.w >= 1 && R.w <= 4 && R.y && R.m >= 1 && R.m <= 12) return R;
  const leg = state.sacSemanaTrabajo;
  if (leg && leg.w >= 1 && leg.w <= 4) {
    const n = new Date();
    return { type: 'slot', y: n.getFullYear(), m: n.getMonth() + 1, w: leg.w };
  }
  const n = new Date();
  return sacMondaySundayRangeContaining(n);
}

/**
 * Al cargar estado: si quedó guardado el bloque «semana del mes» que coincide con el pin del calendario
 * pero el lunes de la semana real (lunes–domingo) cae en el mes anterior, los egresos/ventas estaban
 * bajo otra clave. Pasa al rango lunes–domingo correcto (una sola corrección silenciosa al abrir).
 */
function sacMigrateMonthSlotWhenIsoWeekStartsPriorMonth() {
  try {
    const p = state.sacPeriodoTrabajo;
    if (!p || p.type !== 'slot') return;
    const n = new Date();
    if (p.y !== n.getFullYear() || p.m !== n.getMonth() + 1) return;
    if (p.w !== _sacWeekCalendario()) return;
    const iso = sacMondaySundayRangeContaining(n);
    const ranges = getCalWeekRanges(p.y, p.m - 1);
    const r = ranges[p.w - 1];
    if (!r) return;
    const slotS = sacYMDLocal(new Date(p.y, p.m - 1, r.start));
    const slotE = sacYMDLocal(new Date(p.y, p.m - 1, r.end));
    if (slotS === iso.start && slotE === iso.end) return;
    const isoMon = sacParseISODate(iso.start);
    if (!isoMon) return;
    if (isoMon.getFullYear() === p.y && isoMon.getMonth() === p.m - 1) return;
    state.sacPeriodoTrabajo = iso;
    if (state.sacSemanaTrabajo) delete state.sacSemanaTrabajo;
    if (typeof markUnsaved === 'function') markUnsaved();
  } catch (e) {}
}

function sacDataKey() {
  const p = sacNormalizedPeriod();
  if (p.type === 'range') return 'R|' + p.start + '|' + p.end;
  return 'S|' + p.y + '|' + p.m + '|' + p.w;
}

function sacPeriodDayCount() {
  const p = sacNormalizedPeriod();
  if (p.type === 'range') {
    const a = sacParseISODate(p.start);
    const b = sacParseISODate(p.end);
    if (!a || !b) return 7;
    const n = Math.floor((b - a) / 86400000) + 1;
    return Math.min(SAC_PERIODO_MAX_DIAS, Math.max(1, n));
  }
  const ranges = getCalWeekRanges(p.y, p.m - 1);
  const r = ranges[p.w - 1];
  if (!r) return 7;
  return Math.min(SAC_PERIODO_MAX_DIAS, r.end - r.start + 1);
}

function sacPeriodLabel() {
  const p = sacNormalizedPeriod();
  const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  if (p.type === 'range') {
    const a = sacParseISODate(p.start);
    const b = sacParseISODate(p.end);
    if (!a || !b) return 'Período';
    return `${a.getDate()} ${MESES[a.getMonth()]} – ${b.getDate()} ${MESES[b.getMonth()]} ${b.getFullYear()}`;
  }
  const ranges = getCalWeekRanges(p.y, p.m - 1);
  const r = ranges[p.w - 1];
  return r ? `${r.start}–${r.end} ${MESES[p.m - 1]} ${p.y}` : `Semana ${p.w}`;
}

function sacDayMeta(i) {
  const p = sacNormalizedPeriod();
  const names = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const icons = ['🟡', '🟡', '🟡', '🟡', '🔴', '🟢', '🟢'];
  let d;
  if (p.type === 'range') {
    const d0 = sacParseISODate(p.start);
    if (!d0) return { line: 'Día ' + (i + 1), dowNum: 1 };
    d = new Date(d0);
    d.setDate(d.getDate() + i);
  } else {
    const ranges = getCalWeekRanges(p.y, p.m - 1);
    const r = ranges[p.w - 1];
    if (!r) return { line: 'Día ' + (i + 1), dowNum: 1 };
    d = new Date(p.y, p.m - 1, r.start + i);
  }
  const dowNum = d.getDay();
  const now = new Date();
  const isToday = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  const line = `${icons[dowNum]} ${names[dowNum]} ${d.getDate()}/${d.getMonth() + 1}`;
  return { line, dowNum, isToday };
}

function vsGetWeekSac(key) {
  const n = sacPeriodDayCount();
  if (!state.vsData) state.vsData = {};
  if (!state.vsData[key]) state.vsData[key] = [];
  while (state.vsData[key].length < n) {
    state.vsData[key].push({ est: 0, real: 0, caja: 0, cerrado: false });
  }
  const arr = state.vsData[key];
  for (let i = 0; i < n; i++) {
    const d = arr[i];
    if (d.est === undefined) d.est = 0;
    if (d.real === undefined) d.real = 0;
    if (d.caja === undefined) d.caja = 0;
    if (d.cerrado === undefined) d.cerrado = false;
  }
  return arr;
}

function vsGetExtraSac(key) {
  if (!state.vsExtraData) state.vsExtraData = {};
  if (!state.vsExtraData[key]) state.vsExtraData[key] = { monto: 0, nota: '', realExtra: 0 };
  return state.vsExtraData[key];
}

function vsHybridTotalKey(key) {
  const n = sacPeriodDayCount();
  const days = vsGetWeekSac(key);
  const exObj = vsGetExtraSac(key);
  const extraM = exObj.monto || 0;
  const extraR = exObj.realExtra || 0;
  let total = 0, realDays = 0, estDays = 0;
  for (let i = 0; i < n && i < days.length; i++) {
    const d = days[i];
    if ((d.real || 0) > 0) { realDays++; continue; }
    if ((d.est || 0) > 0) { total += d.est; estDays++; }
  }
  let extraAdd = 0;
  if (extraR > 0) { /* real extra ya contabilizado aparte */ }
  else if (extraM > 0) extraAdd = extraM;
  return { total: roundCLP(total + extraAdd), realDays, estDays, extra: extraM };
}

/** Suma ventas reales del período: cada día + fila «extra» real (debe alinearse con KPI venta real acumulada). */
function sacWeekSumReal(key) {
  const n = sacPeriodDayCount();
  const days = vsGetWeekSac(key);
  let s = 0;
  for (let i = 0; i < n && i < days.length; i++) s += days[i].real || 0;
  s += vsGetExtraSac(key).realExtra || 0;
  return Math.round(s);
}

/** Base para % mercadería: por día usa real si hay, si no estimado; extra usa real o estimado como en el balance. */
function sacWeekProjectionMercBase(key) {
  const n = sacPeriodDayCount();
  const days = vsGetWeekSac(key);
  const ex = vsGetExtraSac(key);
  let s = 0;
  for (let i = 0; i < n && i < days.length; i++) {
    const d = days[i];
    if ((d.real || 0) > 0) s += d.real;
    else s += d.est || 0;
  }
  if ((ex.realExtra || 0) > 0) s += ex.realExtra;
  else s += ex.monto || 0;
  return Math.round(s);
}

// Número de bloque 1–4 del mes (para comparar con calendario) o el de la semana slot activa
function sacActiveWeek() {
  const p = sacNormalizedPeriod();
  if (p.type === 'slot') return p.w;
  return _sacWeekCalendario();
}

function sacUpdateToolbarDesc() {
  const el = document.getElementById('sac-toolbar-desc');
  if (!el) return;
  const p = sacNormalizedPeriod();
  const lbl = sacPeriodLabel();
  const key = sacDataKey();
  const emptyNote = sacCurrentPeriodHasData() ? '' : ' · sin datos en esta clave';
  if (p.type === 'range') {
    const isoNow = sacMondaySundayRangeContaining(new Date());
    const isoTag = (p.start === isoNow.start && p.end === isoNow.end) ? ' · semana ISO actual' : '';
    el.textContent = `${lbl} · ${sacPeriodDayCount()} días · rango manual${isoTag}${emptyNote}`;
    return;
  }
  const calW = _sacWeekCalendario();
  const n = new Date();
  const sameMonth = p.y === n.getFullYear() && p.m === n.getMonth() + 1;
  if (sameMonth && p.w !== calW) {
    el.textContent = `${lbl} · bloque del mes (≠ lun–dom ISO; hoy: sem. ${calW})${emptyNote}`;
  } else if (!sameMonth) {
    el.textContent = `${lbl} · mes ${p.m}/${p.y}${emptyNote}`;
  } else {
    el.textContent = `${lbl} · bloque del mes${emptyNote}`;
  }
}

function sacRenderHistorialCierres() {
  const body = document.getElementById('sac-cierres-hist-body');
  if (!body) return;
  const arr = state.sacCierresHistorial || [];
  if (!arr.length) {
    body.innerHTML = '<div style="padding:12px;color:#94a3b8;font-size:11px;">Sin cierres aún. «Cerrar semana» guarda el balance y el nombre del período; tus datos siguen en cada semana.</div>';
    return;
  }
  const rows = arr.map(h => {
    const fd = h.ts ? new Date(h.ts).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
    const bal = h.balanceEstimado != null ? h.balanceEstimado : 0;
    return `<tr>
      <td style="padding:8px 12px;font-size:11px;">${esc(fd)}</td>
      <td style="padding:8px 12px;font-size:11px;">${esc(h.periodoLabel || '—')}</td>
      <td style="padding:8px 12px;text-align:right;font-weight:700;">${fmt(bal)}</td>
      <td style="padding:8px 12px;text-align:right;"><button type="button" class="fac-btn" style="font-size:10px;padding:3px 8px;" onclick="sacAbrirDesdeCierre('${h.id}')">Ver</button></td>
      <td style="padding:8px 12px;text-align:right;"><button type="button" class="fac-btn" style="font-size:10px;padding:3px 8px;color:var(--danger);border-color:rgba(239,68,68,.45);" onclick="sacEliminarCierre('${h.id}')">Borrar</button></td>
    </tr>`;
  }).join('');
  body.innerHTML = `<div style="display:flex;justify-content:flex-end;padding:8px 10px;border-bottom:1px solid var(--border);">
    <button type="button" class="fac-btn" style="font-size:10px;padding:4px 10px;color:var(--danger);border-color:rgba(239,68,68,.45);" onclick="sacLimpiarCierres()">Borrar historial</button>
  </div><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:#f8fafc;text-align:left;font-size:9px;text-transform:uppercase;color:#94a3b8;"><th style="padding:8px 12px;">Fecha</th><th style="padding:8px 12px;">Período</th><th style="padding:8px 12px;text-align:right;">Balance al guardar</th><th style="padding:8px 12px;text-align:right;">Abrir</th><th style="padding:8px 12px;text-align:right;">Acción</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function sacEliminarCierre(id) {
  const arr = state.sacCierresHistorial || [];
  const item = arr.find(x => x.id === id);
  if (!item) return;
  if (!confirm(`¿Eliminar cierre "${item.periodoLabel || 'sin nombre'}"?`)) return;
  pushUndo();
  state.sacCierresHistorial = arr.filter(x => x.id !== id);
  sacRenderHistorialCierres();
  markUnsaved();
  if (typeof saveState === 'function') saveState('Eliminó cierre semanal', true);
}

function sacLimpiarCierres() {
  const arr = state.sacCierresHistorial || [];
  if (!arr.length) return;
  if (!confirm(`¿Eliminar todos los cierres guardados (${arr.length})?`)) return;
  pushUndo();
  state.sacCierresHistorial = [];
  sacRenderHistorialCierres();
  markUnsaved();
  if (typeof saveState === 'function') saveState('Limpió cierres semanales', true);
}

function sacAbrirDesdeCierre(cierreId) {
  const c = (state.sacCierresHistorial || []).find(x => x.id === cierreId);
  if (!c || !c.periodKey) {
    notify('⚠ No se pudo abrir ese cierre (sin clave de período)');
    return;
  }
  const parts = String(c.periodKey).split('|');
  pushUndo();
  if (parts[0] === 'S' && parts.length === 4) {
    state.sacPeriodoTrabajo = {
      type: 'slot',
      y: parseInt(parts[1], 10) || new Date().getFullYear(),
      m: parseInt(parts[2], 10) || (new Date().getMonth() + 1),
      w: parseInt(parts[3], 10) || 1
    };
  } else if (parts[0] === 'R' && parts.length === 3) {
    state.sacPeriodoTrabajo = { type: 'range', start: parts[1], end: parts[2] };
  } else {
    notify('⚠ Formato de período no reconocido');
    return;
  }
  if (state.sacSemanaTrabajo) delete state.sacSemanaTrabajo;
  _sacLastVentasKey = '';
  sacRender();
  if (typeof vsSavedRender === 'function') vsSavedRender();
  markUnsaved();
  if (typeof saveState === 'function') saveState('Abrió cierre semanal', true);
  notify(`✅ Abierto: ${c.periodoLabel || 'período guardado'}`);
}

let _sacModalPickW = 1;
let _sacLastVentasKey = '';
let _sacLastVentasN = -1;

function sacRenderVentasDias() {
  const key = sacDataKey();
  const n = sacPeriodDayCount();
  const wrap = document.getElementById('sac-ventas-dias');
  if (!wrap) return;
  if (key === _sacLastVentasKey && n === _sacLastVentasN && wrap.children.length === n) return;
  _sacLastVentasKey = key;
  _sacLastVentasN = n;
  let html = '';
  for (let i = 0; i < n; i++) {
    const meta = sacDayMeta(i);
    const estBr = meta.dowNum === 5 ? 'border-color:rgba(249,115,22,.45);' : 'border-color:rgba(249,115,22,.3);';
    const dayStyle = meta.dowNum === 5 ? 'color:var(--danger);' : (meta.isToday ? 'color:var(--accent);' : '');
    const todayCls = meta.isToday ? ' sac-v-row-today' : '';
    html += `<div class="sac-v-row${todayCls}" id="sac-vrow-${i}">
      <div class="sac-v-day" style="${dayStyle}">${meta.line}</div>
      <input class="sac-v-inp" id="sac-vest-${i}" type="text" inputmode="numeric" placeholder="$0"
        onchange="sacVChange(${i},'est',this.value)" onblur="sacVBlur(this)" style="${estBr}">
      <div style="font-size:9px;color:#94a3b8;text-align:center;">→</div>
      <input class="sac-v-inp real" id="sac-vreal-${i}" type="text" inputmode="numeric" placeholder="$0"
        onchange="sacVChange(${i},'real',this.value)" onblur="sacVBlur(this)" style="border-color:rgba(16,185,129,.3);">
    </div>`;
  }
  wrap.innerHTML = html;
}

function sacModalSelectWeek(w) {
  _sacModalPickW = w;
  sacCierreModalBuildBody();
}

function sacCierreModalBuildBody() {
  const body = document.getElementById('sac-cierre-body');
  if (!body) return;
  const ranges = getCalWeekRanges();
  const now = new Date();
  const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const calW = _sacWeekCalendario();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  body.innerHTML = ranges.map((r, i) => {
    const w = i + 1;
    const sel = w === _sacModalPickW ? 'border-color:var(--accent);background:#fff7ed;box-shadow:0 0 0 1px rgba(249,115,22,.25);' : 'border-color:var(--border);background:var(--white);';
    const wlbl = `${r.start}–${r.end} ${MESES[now.getMonth()]} ${now.getFullYear()}`;
    const pin = w === calW ? ' · 📍 calendario' : '';
    const slotKey = 'S|' + y + '|' + m + '|' + w;
    const hasData = typeof sacPeriodKeyHasData === 'function' && sacPeriodKeyHasData(slotKey);
    const dataTag = hasData ? ' · ✓ con datos' : '';
    return `<button type="button" class="fac-btn" style="width:100%;margin-bottom:8px;text-align:left;border:2px solid;${sel}${hasData ? ';border-color:var(--success)' : ''}" onclick="sacModalSelectWeek(${w})">
      <span style="font-weight:800;">Semana ${w}</span> · ${wlbl}${pin}${dataTag}
    </button>`;
  }).join('');
}

function sacAbrirElegirSemana() {
  const p = sacNormalizedPeriod();
  const de = document.getElementById('sac-rango-desde');
  const ha = document.getElementById('sac-rango-hasta');
  if (de && ha) {
    if (p.type === 'range') {
      de.value = p.start;
      ha.value = p.end;
    } else {
      const ranges = getCalWeekRanges(p.y, p.m - 1);
      const r = ranges[p.w - 1];
      if (r) {
        const d0 = new Date(p.y, p.m - 1, r.start);
        const d1 = new Date(p.y, p.m - 1, r.end);
        de.value = sacYMDLocal(d0);
        ha.value = sacYMDLocal(d1);
      } else {
        const t = new Date();
        de.value = sacYMDLocal(t);
        ha.value = sacYMDLocal(t);
      }
    }
  }
  _sacModalPickW = sacActiveWeek();
  const t = document.getElementById('sac-cierre-title');
  if (t) t.textContent = '📆 Período a trabajar';
  const cb = document.getElementById('sac-cierre-limpiar');
  if (cb) cb.checked = false;
  if (de && ha && !sacPeriodKeyHasData(sacDataKey())) {
    const prev = sacIsoWeeksBack(1);
    const prevKey = 'R|' + prev.start + '|' + prev.end;
    if (sacPeriodKeyHasData(prevKey)) {
      de.value = prev.start;
      ha.value = prev.end;
    }
  }
  sacCierreModalBuildIsoQuick();
  sacCierreModalBuildBody();
  const o = document.getElementById('sac-cierre-overlay');
  if (o) o.classList.add('show');
}

function sacModalAplicarRango() {
  const desde = document.getElementById('sac-rango-desde')?.value;
  const hasta = document.getElementById('sac-rango-hasta')?.value;
  if (!desde || !hasta) { notify('⚠ Elegí fecha desde y hasta'); return; }
  if (hasta < desde) { notify('⚠ «Hasta» debe ser igual o posterior a «Desde»'); return; }
  const da = sacParseISODate(desde);
  const db = sacParseISODate(hasta);
  if (!da || !db || isNaN(da.getTime()) || isNaN(db.getTime())) { notify('⚠ Fechas inválidas'); return; }
  const days = Math.floor((db - da) / 86400000) + 1;
  const maxD = typeof SAC_PERIODO_MAX_DIAS !== 'undefined' ? SAC_PERIODO_MAX_DIAS : 92;
  if (days < 1) { notify('⚠ Duración inválida'); return; }
  if (days > maxD) { notify('⚠ Máximo ' + maxD + ' días por período'); return; }
  const limpiar = document.getElementById('sac-cierre-limpiar')?.checked;
  pushUndo();
  state.sacPeriodoTrabajo = { type: 'range', start: desde, end: hasta };
  if (state.sacSemanaTrabajo) delete state.sacSemanaTrabajo;
  if (limpiar) sacLimpiarPeriodoPorKey(sacDataKey());
  sacCierreModalCerrar();
  _sacLastVentasKey = '';
  sacRender();
  if (typeof vsSavedRender === 'function') vsSavedRender();
  markUnsaved();
  if (typeof saveState === 'function') saveState('Período SAC rango', true);
  notify(`✅ Período: ${sacPeriodLabel()} (${days} días)`);
}

function sacCerrarSemanaClick() {
  const B = sacGetBalanceEstimado();
  const lbl = sacPeriodLabel();
  if (!confirm(`¿Cerrar el período ${lbl}?\n\nSe guardará en el historial el balance estimado (${fmt(B.balance)}). Los datos de este período quedan guardados (podés volver con «Cambiar período»).`)) return;
  pushUndo();
  const p = sacNormalizedPeriod();
  const cierre = {
    id: 'scerr_' + Date.now(),
    ts: Date.now(),
    w: p.type === 'slot' ? p.w : null,
    periodoLabel: lbl,
    periodKey: sacDataKey(),
    balanceEstimado: B.balance
  };
  // Solo se mantiene el cierre más reciente.
  state.sacCierresHistorial = [cierre];
  state.sacPeriodoTrabajo = null;
  if (state.sacSemanaTrabajo) delete state.sacSemanaTrabajo;
  sacRenderHistorialCierres();
  _sacLastVentasKey = '';
  sacRender();
  if (typeof vsSavedRender === 'function') vsSavedRender();
  markUnsaved();
  if (typeof saveState === 'function') saveState('Cierre semana SAC', true);
  notify('✅ Cierre guardado: ' + lbl + '. Definí el próximo tramo con «Cambiar período» (manual: 4, 8… días que quieras, o bloque del mes). Hasta que guardes otro, se usa la semana lunes–domingo que contiene hoy.');
}

function sacCierreModalAplicar() {
  const limpiar = document.getElementById('sac-cierre-limpiar')?.checked;
  const w = _sacModalPickW;
  const ranges = getCalWeekRanges();
  if (w < 1 || w > ranges.length) return;
  pushUndo();
  const n = new Date();
  state.sacPeriodoTrabajo = { type: 'slot', y: n.getFullYear(), m: n.getMonth() + 1, w };
  if (state.sacSemanaTrabajo) delete state.sacSemanaTrabajo;
  if (limpiar) sacLimpiarPeriodoPorKey(sacDataKey());
  sacCierreModalCerrar();
  _sacLastVentasKey = '';
  sacRender();
  if (typeof vsSavedRender === 'function') vsSavedRender();
  markUnsaved();
  if (typeof saveState === 'function') saveState('Semana SAC', true);
  notify(`✅ Bloque del mes: ${sacPeriodLabel()}`);
}

function sacCierreModalCerrar() {
  const o = document.getElementById('sac-cierre-overlay');
  if (o) o.classList.remove('show');
}

function sacLimpiarPeriodoPorKey(key) {
  const n = sacPeriodDayCount();
  if (!state.vsData) state.vsData = {};
  state.vsData[key] = [];
  for (let i = 0; i < n; i++) {
    state.vsData[key].push({ est: 0, real: 0, caja: 0, cerrado: false });
  }
  if (!state.vsExtraData) state.vsExtraData = {};
  state.vsExtraData[key] = { monto: 0, nota: '', realExtra: 0 };
  if (!state.sacCargas) state.sacCargas = {};
  state.sacCargas[key] = [];
  if (!state.sacIngresos) state.sacIngresos = {};
  state.sacIngresos[key] = [];
}

function sacGetCargas(key) {
  key = key || sacDataKey();
  if (!state.sacCargas) state.sacCargas = {};
  if (!state.sacCargas[key]) state.sacCargas[key] = [];
  return state.sacCargas[key];
}

function sacGetIngresos(key) {
  key = key || sacDataKey();
  if (!state.sacIngresos) state.sacIngresos = {};
  if (!state.sacIngresos[key]) state.sacIngresos[key] = [];
  return state.sacIngresos[key];
}

// Totales/balance: sin filas _esPago (son el mismo abono que ya suma pagadoParcial en la carga base).
function sacBaseCargas(cargas) {
  return (cargas || []).filter(c => !c._esPago);
}

function sacCargaPagadoAcum(c) {
  if (c.estado === 'pausa') return 0;
  if (c.estado === 'pagado') return c.monto || 0;
  if (c.estado === 'parcial') {
    if (c.pagadoParcial != null && c.pagadoParcial > 0) return c.pagadoParcial;
    return c.montoReal || 0;
  }
  // nopagado: si quedó un abono previo (p.ej. al deshacer un saldado), respétalo
  if (c.pagadoParcial != null && c.pagadoParcial > 0) {
    return Math.min(c.pagadoParcial, c.monto || 0);
  }
  return 0;
}

function sacCargaPendienteAcum(c) {
  if (c.estado === 'pausa') return 0;
  if (c.estado === 'pagado') return 0;
  const pagado = sacCargaPagadoAcum(c);
  if (c.estado === 'parcial' || pagado > 0) return Math.max(0, (c.monto || 0) - pagado);
  return c.monto || 0;
}

/** Antes de marcar como pagado: guarda cuánto ya estaba abonado, para poder revertir. */
function sacRememberPagadoAntesDeSaldar(c) {
  if (!c || c.estado === 'pagado') return;
  const prev = Math.max(0, Number(c.pagadoParcial) || 0);
  const monto = Math.max(0, Number(c.monto) || 0);
  c._pagadoAntesDeSaldar = Math.min(prev, monto);
}

/** Inferir abonos previos si no hay _pagadoAntesDeSaldar (datos viejos). */
function sacInferirPagadoAntesDeSaldar(c) {
  const monto = Math.max(0, Number(c.monto) || 0);
  const log = Array.isArray(c.auditLog) ? c.auditLog : [];
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (!e) continue;
    if (e.accion === 'pagar_todo' || e.accion === 'estado_pagado') {
      const lastPay = Math.max(0, Number(e.monto) || 0);
      if (lastPay > 0 && lastPay < monto) return monto - lastPay;
      if (e.accion === 'estado_pagado') return 0;
      break;
    }
  }
  return 0;
}

/**
 * Al quitar "pagado": vuelve al pendiente real (abonos previos), no al monto original completo.
 * Ej: 1.000.000 con 500.000 abonados → saldado → deshacer → queda parcial con 500.000 por pagar.
 */
function sacRevertirDesdePagado(c) {
  if (!c) return;
  const monto = Math.max(0, Number(c.monto) || 0);
  let prev = c._pagadoAntesDeSaldar;
  if (prev == null) prev = sacInferirPagadoAntesDeSaldar(c);
  prev = Math.max(0, Math.min(Number(prev) || 0, monto));
  if (prev >= monto) prev = 0;
  delete c.montoReal;
  delete c._pagadoAntesDeSaldar;
  if (prev > 0) {
    c.pagadoParcial = prev;
    c.estado = 'parcial';
  } else {
    c.pagadoParcial = 0;
    c.estado = 'nopagado';
  }
}

function sacMigrateLegacySacKeys() {
  try {
    const n = new Date();
    const y = n.getFullYear();
    const m = n.getMonth() + 1;
    for (let w = 1; w <= 4; w++) {
      const newK = 'S|' + y + '|' + m + '|' + w;
      const oldKs = [String(w), w];
      if (state.vsData) {
        for (const ok of oldKs) {
          if (state.vsData[ok] && state.vsData[ok].length && !state.vsData[newK]) {
            state.vsData[newK] = JSON.parse(JSON.stringify(state.vsData[ok]));
            break;
          }
        }
      }
      if (state.vsExtraData) {
        for (const ok of oldKs) {
          if (state.vsExtraData[ok] && !state.vsExtraData[newK]) {
            const x = state.vsExtraData[ok];
            state.vsExtraData[newK] = { monto: x.monto || 0, nota: x.nota || '', realExtra: x.realExtra || 0 };
            break;
          }
        }
      }
      if (state.sacCargas) {
        for (const ok of oldKs) {
          if (state.sacCargas[ok] && state.sacCargas[ok].length && !state.sacCargas[newK]) {
            state.sacCargas[newK] = state.sacCargas[ok].slice();
            break;
          }
        }
      }
      if (state.sacIngresos) {
        for (const ok of oldKs) {
          if (state.sacIngresos[ok] && state.sacIngresos[ok].length && !state.sacIngresos[newK]) {
            state.sacIngresos[newK] = state.sacIngresos[ok].slice();
            break;
          }
        }
      }
    }
  } catch (e) {}
}

// ── RENDER ──
function sacRender() {
  if (cerebrusUsuarioBodega()) return;
  if (typeof sacSyncRelatedPeriodKeys === 'function') sacSyncRelatedPeriodKeys();
  if (typeof sacPreferIsoWhenSlotMatchesIsoWeek === 'function') sacPreferIsoWhenSlotMatchesIsoWeek();
  if (typeof sacSyncRelatedPeriodKeys === 'function') sacSyncRelatedPeriodKeys();
  if (typeof sacAlignPeriodToStoredData === 'function') sacAlignPeriodToStoredData();
  sacRenderVentasDias();
  const wlbl = sacPeriodLabel();
  const el = document.getElementById('sac-week-lbl'); if (el) el.textContent = wlbl;

  sacLoadVentas();

  const bancoInp = document.getElementById('sac-banco');
  if (bancoInp && document.activeElement !== bancoInp)
    bancoInp.value = (state.cajaEmpresa?.banco || 0) ? fmtCL(state.cajaEmpresa?.banco || 0, 0, 2) : '';

  const efInp = document.getElementById('sac-efectivo');
  if (efInp && document.activeElement !== efInp)
    efInp.value = (state.sacEfectivo || 0) ? fmtCL(state.sacEfectivo || 0, 0, 2) : '';
  const ccInp = document.getElementById('sac-caja-chica');
  if (ccInp && document.activeElement !== ccInp)
    ccInp.value = (state.sacCajaChica || 0) ? fmtCL(state.sacCajaChica || 0, 0, 2) : '';
  const ccNotaInp = document.getElementById('sac-caja-chica-nota');
  if (ccNotaInp && document.activeElement !== ccNotaInp)
    ccNotaInp.value = state.sacCajaChicaNota || '';

  const merc = state.sacMerc || {mode:'monto', val:0};
  const rMonto = document.getElementById('sac-merc-monto');
  const rPct   = document.getElementById('sac-merc-pct');
  if (rMonto) rMonto.checked = merc.mode === 'monto';
  if (rPct)   rPct.checked   = merc.mode === 'pct';
  const mInp = document.getElementById('sac-merc-val');
  if (mInp && document.activeElement !== mInp) mInp.value = merc.val || '';

  sacRenderCargas();
  sacRenderIngresos();
  sacRenderFinanciamientoPanel();
  sacCalcAll();
  sacUpdateToolbarDesc();
  sacRenderPeriodDataBanner();
  sacRenderPeriodosConDatosList();
  sacMaybeOfferContinuarSemanaPendiente();
  sacRenderHistorialCierres();
  if (typeof cerebrusBitacoraRenderLists === 'function') cerebrusBitacoraRenderLists();
  sacRenderReservaPanel();
}

function sacLoadVentas() {
  const key = sacDataKey();
  const n = sacPeriodDayCount();
  const days = vsGetWeekSac(key);
  const extraMonto = vsGetExtraSac(key).monto || 0;
  const extraReal = vsGetExtraSac(key).realExtra || 0;

  for (let i = 0; i < n; i++) {
    const eInp = document.getElementById('sac-vest-' + i);
    const rInp = document.getElementById('sac-vreal-' + i);
    const d = days[i] || {};
    if (eInp && document.activeElement !== eInp) eInp.value = d.est ? fmtCL(d.est,0,2) : '';
    if (rInp && document.activeElement !== rInp) rInp.value = d.real ? fmtCL(d.real,0,2) : '';
  }
  const exEInp = document.getElementById('sac-vest-extra');
  const exRInp = document.getElementById('sac-vreal-extra');
  if (exEInp && document.activeElement !== exEInp) exEInp.value = extraMonto ? fmtCL(extraMonto,0,2) : '';
  if (exRInp && document.activeElement !== exRInp) exRInp.value = extraReal ? fmtCL(extraReal,0,2) : '';

  sacCalcVentas();
}

function sacVChange(dayIdx, field, rawVal) {
  const key = sacDataKey();
  const val = Math.max(0, parseNumCL(rawVal, false));
  if (dayIdx === 'extra') {
    if (field === 'est') vsGetExtraSac(key).monto = val;
    if (field === 'real') vsGetExtraSac(key).realExtra = val;
  } else {
    const days = vsGetWeekSac(key);
    if (days[dayIdx]) days[dayIdx][field] = val;
  }
  sacCalcVentas();
  sacCalcBalance();
  if (document.getElementById('venta')?.classList.contains('active')) vsCalcTotals();
}

function sacVBlur(inp) {
  formatNumericInputValue(inp);
}

function sacCalcVentas() {
  const key = sacDataKey();
  const n = sacPeriodDayCount();
  const days = vsGetWeekSac(key);
  const extraEst = vsGetExtraSac(key).monto || 0;
  const extraReal = vsGetExtraSac(key).realExtra || 0;
  let sumEst = 0, sumReal = 0;
  for (let i = 0; i < n && i < days.length; i++) {
    sumEst += days[i].est || 0;
    sumReal += days[i].real || 0;
  }
  const totalEst = Math.round(sumEst + extraEst);
  const totalReal = sacWeekSumReal(key);

  const hybrid = vsHybridTotalKey(key);
  const hasRealRecorded = totalReal > 0;

  const te = document.getElementById('sac-vest-total');
  const tr = document.getElementById('sac-vreal-total');

  // Show estimated total
  if (te) te.textContent = fmt(totalEst);

  // Pie columna real = suma estricta de reales (días + extra). Antes: faltaba extra y en mixto se mostraba solo lo estimado pendiente.
  if (tr) {
    if (hasRealRecorded) {
      tr.textContent = fmt(totalReal);
      tr.style.color = 'var(--success)';
      const hint = [];
      if (hybrid.realDays > 0) hint.push(hybrid.realDays + ' día(s) con cifra real');
      if (extraReal > 0) hint.push('incluye fila extra');
      if (hybrid.estDays > 0) hint.push(hybrid.estDays + ' día(s) aún solo estimado (no sumados al real)');
      tr.title = hint.length ? hint.join(' · ') : 'Suma ventas reales del período';
    } else {
      tr.textContent = '—';
      tr.title = 'Sin ventas reales aún';
      tr.style.color = '#94a3b8';
    }
  }

  const merc = state.sacMerc || { mode: 'monto', val: 0 };
  const baseV = merc.mode === 'pct' ? sacWeekProjectionMercBase(key) : totalEst;
  if (merc.mode === 'pct' && merc.val > 0) {
    const mercAmt = Math.round(baseV * merc.val / 100);
    const resEl = document.getElementById('sac-merc-result');
    if (resEl) resEl.textContent = '= ' + fmt(mercAmt);
  }
}

// Mercadería mode/value
function sacMercModeChange() {
  if (!state.sacMerc) state.sacMerc = {mode:'monto', val:0};
  const r = document.querySelector('input[name="sac-merc-mode"]:checked');
  state.sacMerc.mode = r?.value || 'monto';
  const mInp = document.getElementById('sac-merc-val');
  if (mInp) mInp.placeholder = state.sacMerc.mode === 'pct' ? '30 (%)' : '0 ($)';
  sacCalcAll();
  markUnsaved();
}

function sacMercValChange(val) {
  if (!state.sacMerc) state.sacMerc = {mode:'monto', val:0};
  state.sacMerc.val = Math.max(0, parseNumCL(val, false));
  sacCalcAll();
  markUnsaved();
}

function sacGetMercMonto() {
  const merc = state.sacMerc || {mode:'monto', val:0};
  if (merc.mode === 'monto') return merc.val || 0;
  const baseVenta = sacWeekProjectionMercBase(sacDataKey());
  return Math.round(baseVenta * (merc.val || 0) / 100);
}

// ── BANCO / EFECTIVO ──
function sacSetBanco(val) {
  const n = parseNumCL(val, true);
  if (!state.cajaEmpresa) state.cajaEmpresa = {};
  state.cajaEmpresa.banco    = n;
  state.cajaEmpresa.bancoUpd = new Date().toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'});
  const inp = document.getElementById('sac-banco');
  if (inp && document.activeElement !== inp) formatNumericInputValue(inp);
  const upd = document.getElementById('sac-banco-upd');
  if (upd) upd.textContent = 'Act. ' + state.cajaEmpresa.bancoUpd;
  sacCalcBalance();
  updateTotalDisponible();
  markUnsaved();
}

function sacDescontarBancoPorEgreso_(monto, motivo) {
  const m = Math.max(0, Math.round(Number(monto) || 0));
  if (!m) return;
  if (!state.cajaEmpresa) state.cajaEmpresa = {};
  const nuevoBanco = Math.round((Number(state.cajaEmpresa.banco) || 0) - m);
  state.cajaEmpresa.banco = nuevoBanco;
  state.cajaEmpresa.bancoUpd = new Date().toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'}) + ' · auto egreso';
  const sacInp = document.getElementById('sac-banco');
  if (sacInp && document.activeElement !== sacInp) sacInp.value = nuevoBanco ? fmtCL(nuevoBanco, 0, 2) : '';
  const dashInp = document.getElementById('dash-banco-empresa');
  if (dashInp && document.activeElement !== dashInp) dashInp.value = nuevoBanco ? fmtCL(nuevoBanco, 0, 2) : '';
  const sacUpd = document.getElementById('sac-banco-upd');
  if (sacUpd) sacUpd.textContent = 'Act. ' + state.cajaEmpresa.bancoUpd;
  const dashUpd = document.getElementById('dash-banco-upd');
  if (dashUpd) dashUpd.textContent = 'Act. ' + state.cajaEmpresa.bancoUpd;
  sacCalcBalance();
  if (typeof updateTotalDisponible === 'function') updateTotalDisponible();
  notify('🏦 Cuenta bancaria empresa descontada: ' + fmt(m) + (motivo ? ' · ' + motivo : ''));
}

function sacAskAutoBancoDescuento_(ctx) {
  return new Promise(function(resolve) {
    const monto = Math.max(0, Math.round(Number(ctx && ctx.monto) || 0));
    const titulo = String((ctx && ctx.titulo) || 'Pago de egreso');
    const detalle = String((ctx && ctx.detalle) || '');
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2600;display:flex;align-items:center;justify-content:center;padding:16px;';
    overlay.innerHTML = `
      <div style="background:var(--white);border-radius:12px;width:460px;max-width:96vw;box-shadow:0 20px 60px rgba(0,0,0,.25);overflow:hidden;">
        <div style="background:#0f172a;padding:13px 16px;display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:13px;font-weight:800;color:white;">🏦 Descuento automático en banco</div>
          <button id="sac-auto-bank-close" style="background:none;border:none;color:rgba(255,255,255,.8);font-size:20px;cursor:pointer;">✕</button>
        </div>
        <div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px;">
          <div style="font-size:12px;font-weight:700;color:#334155;">${esc(titulo)}</div>
          <div style="font-size:11px;color:#64748b;line-height:1.4;">
            ${detalle ? esc(detalle) + '<br>' : ''}Monto del pago: <b>${esc(fmt(monto))}</b>
          </div>
          <label style="font-size:11px;font-weight:700;color:#64748b;">¿Descontar automáticamente este pago de "Cuenta Bancaria empresa"?</label>
          <select id="sac-auto-bank-sel" style="border:1px solid var(--border);border-radius:8px;padding:9px 10px;font-family:inherit;font-size:12px;color:var(--primary);background:var(--white);">
            <option value="no" selected>No, lo ajustaré manualmente</option>
            <option value="si">Sí, descontar automáticamente</option>
          </select>
          <div style="display:flex;justify-content:flex-end;gap:8px;padding-top:2px;">
            <button id="sac-auto-bank-cancel" class="fac-btn" style="font-size:11px;">Cancelar</button>
            <button id="sac-auto-bank-ok" class="fac-btn primary" style="font-size:11px;">Continuar</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = function(result) {
      try { document.body.removeChild(overlay); } catch(e){}
      resolve(result);
    };
    document.getElementById('sac-auto-bank-close').onclick = function() { close({ cancel: true }); };
    document.getElementById('sac-auto-bank-cancel').onclick = function() { close({ cancel: true }); };
    document.getElementById('sac-auto-bank-ok').onclick = function() {
      const sel = document.getElementById('sac-auto-bank-sel');
      close({ cancel: false, descontar: !!(sel && sel.value === 'si') });
    };
    overlay.onclick = function(e) { if (e.target === overlay) close({ cancel: true }); };
  });
}

function sacSetEfectivo(val) {
  state.sacEfectivo = Math.max(0, parseNumCL(val, false));
  const inp = document.getElementById('sac-efectivo');
  if (inp && document.activeElement !== inp) formatNumericInputValue(inp);
  sacCalcBalance();
  if (typeof updateTotalDisponible === 'function') updateTotalDisponible();
  markUnsaved();
}

function sacSetCajaChica(val) {
  state.sacCajaChica = Math.max(0, parseNumCL(val, false));
  const inp = document.getElementById('sac-caja-chica');
  if (inp && document.activeElement !== inp) formatNumericInputValue(inp);
  sacCalcBalance();
  if (typeof updateTotalDisponible === 'function') updateTotalDisponible();
  markUnsaved();
}

function sacSetCajaChicaNota(val) {
  state.sacCajaChicaNota = String(val || '').trim();
  if (typeof updateTotalDisponible === 'function') updateTotalDisponible();
  markUnsaved();
}

function sacReservaEnsure() {
  if (typeof state.sacReservaSaldo !== 'number' || isNaN(state.sacReservaSaldo)) state.sacReservaSaldo = 0;
  if (!Array.isArray(state.sacReservaMovs)) state.sacReservaMovs = [];
}

function sacReservaIngresar() {
  sacReservaEnsure();
  const m = parseNumCL(document.getElementById('sac-reserva-ing-monto')?.value || '', false);
  if (!m || m <= 0) { notify('⚠ Ingresa un monto válido'); return; }
  const concepto = (document.getElementById('sac-reserva-ing-concepto')?.value || '').trim();
  pushUndo();
  state.sacReservaSaldo = (state.sacReservaSaldo || 0) + m;
  state.sacReservaMovs.unshift({
    id: 'r' + Date.now(),
    ts: Date.now(),
    tipo: 'ingreso',
    monto: m,
    concepto: concepto,
    destino: ''
  });
  if (state.sacReservaMovs.length > 80) state.sacReservaMovs.length = 80;
  const im = document.getElementById('sac-reserva-ing-monto');
  const ic = document.getElementById('sac-reserva-ing-concepto');
  if (im) im.value = '';
  if (ic) ic.value = '';
  sacRenderReservaPanel();
  markUnsaved();
  notify('✓ Ingreso a Reserva: ' + fmt(m));
}

function sacReservaTransferir(dest) {
  sacReservaEnsure();
  const m = parseNumCL(document.getElementById('sac-reserva-salida-monto')?.value || '', false);
  const concepto = (document.getElementById('sac-reserva-salida-concepto')?.value || '').trim();
  if (!concepto) { notify('⚠ Indica para qué es el egreso'); return; }
  if (!m || m <= 0) { notify('⚠ Ingresa un monto válido'); return; }
  const saldo = state.sacReservaSaldo || 0;
  if (m > saldo + 0.01) { notify('⚠ Saldo insuficiente en Reserva (' + fmt(saldo) + ')'); return; }
  pushUndo();
  state.sacReservaSaldo = saldo - m;
  const mov = { id: 'r' + Date.now(), ts: Date.now(), tipo: 'salida', monto: m, concepto: concepto, destino: dest };
  if (dest === 'caja') {
    state.sacEfectivo = (state.sacEfectivo || 0) + m;
  } else if (dest === 'caja_chica') {
    state.sacCajaChica = (state.sacCajaChica || 0) + m;
  } else if (dest === 'banco') {
    if (!state.cajaEmpresa) state.cajaEmpresa = {};
    state.cajaEmpresa.banco = (state.cajaEmpresa.banco || 0) + m;
    state.cajaEmpresa.bancoUpd = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  }
  state.sacReservaMovs.unshift(mov);
  if (state.sacReservaMovs.length > 80) state.sacReservaMovs.length = 80;
  const sm = document.getElementById('sac-reserva-salida-monto');
  const sc = document.getElementById('sac-reserva-salida-concepto');
  if (sm) sm.value = '';
  if (sc) sc.value = '';
  sacRender();
  markUnsaved();
  const destTxt = { caja: 'Caja principal', caja_chica: 'Caja chica', banco: 'Banco empresa', otro: 'Otro (solo egreso)' }[dest] || dest;
  notify('✓ ' + fmt(m) + ' desde Reserva → ' + destTxt);
}

function sacRenderReservaPanel() {
  sacReservaEnsure();
  const saldoTxt = fmt(state.sacReservaSaldo || 0);
  const v = document.getElementById('sac-reserva-saldo-val');
  if (v) v.textContent = saldoTxt;
  const chip = document.getElementById('sac-reserva-saldo-chip');
  if (chip) chip.textContent = saldoTxt;
  const el = document.getElementById('sac-reserva-movs');
  if (!el) return;
  const movs = (state.sacReservaMovs || []).slice(0, 25);
  const dl = { caja: '→ Caja principal', caja_chica: '→ Caja chica', banco: '→ Banco empresa', otro: '→ Otro' };
  if (!movs.length) {
    el.innerHTML = '<div style="font-size:11px;color:#94a3b8;">Sin movimientos aún.</div>';
    return;
  }
  el.innerHTML = movs.map(function(m) {
    const isIn = m.tipo === 'ingreso';
    const side = isIn ? '<span style="color:var(--success);font-weight:800;">+</span>' : '<span style="color:var(--danger);font-weight:800;">−</span>';
    const dest = !isIn && m.destino ? '<span class="muted">' + (dl[m.destino] || m.destino) + '</span>' : '';
    return '<div class="sac-res-mov"><span>' + side + ' ' + fmt(m.monto) + ' · ' + esc(m.concepto || '—') + '</span> ' + dest + '</div>';
  }).join('');
}

// ── CARGAS RENDER ──
const SAC_CAT_COLORS = {
  'Crédito':'#ec4899','TC':'#ef4444','Retiro':'#f59e0b','Proveedor':'#f97316',
  'Impuesto':'#6366f1','Servicio':'#0ea5e9','Bono':'#10b981','Arriendo':'#8b5cf6',
  'Compra':'#64748b','RRHH':'#27ae60','Otro':'#94a3b8'
};
let _sacCargaFilter = { cat:'', estado:'', name:'', min:null, max:null };
/** 'activos' = nopagado + parcial + pausa | 'pagados' = solo pagado */
let _sacCargaTab = 'activos';

function sacSetCargaTab(tab) {
  _sacCargaTab = tab === 'pagados' ? 'pagados' : 'activos';
  sacRenderCargas();
}
function sacCatColor(cat) {
  for (const [k,v] of Object.entries(SAC_CAT_COLORS)) if ((cat||'').toLowerCase().includes(k.toLowerCase())) return v;
  return '#94a3b8';
}

function sacSetCargaFilters() {
  const name = (document.getElementById('sac-fil-name')?.value || '').trim().toLowerCase();
  _sacCargaFilter = { cat:'', estado:'', name, min:null, max:null };
  sacRenderCargas();
}

function sacClearCargaFilters() {
  const el = document.getElementById('sac-fil-name');
  if (el) el.value = '';
  _sacCargaFilter = { cat:'', estado:'', name:'', min:null, max:null };
  sacRenderCargas();
}

function sacRenderCargas() {
  const list = document.getElementById('sac-cargas-list'); if (!list) return;
  const tabA = document.getElementById('sac-tab-activos');
  const tabP = document.getElementById('sac-tab-pagados');
  if (tabA) tabA.classList.toggle('sel', _sacCargaTab === 'activos');
  if (tabP) tabP.classList.toggle('sel', _sacCargaTab === 'pagados');

  const cargas = sacGetCargas();

  if (!cargas.length) {
    list.innerHTML = `<div style="padding:24px;text-align:center;color:#94a3b8;font-size:12px;font-style:italic;">
      Sin cargas esta semana — usa <b>+ Agregar</b> o <b>☑ Gastos fijos</b> para agregar
    </div>`;
    sacCalcCargasTotals();
    return;
  }

  const sortedCargas = [...cargas].sort((a, b) => sacCargaSortTs(b) - sacCargaSortTs(a));
  const filteredCargas = sortedCargas.filter(c => {
    const catOk = !_sacCargaFilter.cat || (c.cat || '').toLowerCase().includes(_sacCargaFilter.cat.toLowerCase());
    const estOk = !_sacCargaFilter.estado || (c.estado || 'nopagado') === _sacCargaFilter.estado;
    const nameOk = !_sacCargaFilter.name || (c.nombre || '').toLowerCase().includes(_sacCargaFilter.name);
    const m = Number(c.monto || 0);
    const minOk = _sacCargaFilter.min == null || m >= _sacCargaFilter.min;
    const maxOk = _sacCargaFilter.max == null || m <= _sacCargaFilter.max;
    return catOk && estOk && nameOk && minOk && maxOk;
  });

  const tabFiltered = filteredCargas.filter(c => {
    const es = c.estado || 'nopagado';
    if (_sacCargaTab === 'pagados') return es === 'pagado';
    return es !== 'pagado';
  });

  const CAT_LIST = ['Crédito','TC','Retiro','Proveedor','Impuesto','Servicio','Bono','Arriendo','Compra','RRHH','Otro'];

  if (!filteredCargas.length) {
    list.innerHTML = `<div style="padding:16px;text-align:center;color:#94a3b8;font-size:11px;font-style:italic;">
      No hay egresos que coincidan con los filtros.
    </div>`;
    sacCalcCargasTotals();
    return;
  }

  if (!tabFiltered.length) {
    const msg = _sacCargaTab === 'pagados'
      ? 'No hay egresos pagados en esta vista (revisa filtros o la pestaña Por pagar).'
      : 'No hay egresos pendientes ni en pausa — todo está pagado o revisa filtros.';
    list.innerHTML = `<div style="padding:20px;text-align:center;color:#94a3b8;font-size:11px;font-style:italic;line-height:1.45;">${msg}</div>`;
    sacCalcCargasTotals();
    return;
  }

  list.innerHTML = tabFiltered.map((c,i) => {
    const col     = sacCatColor(c.cat);
    const esCls   = c.estado === 'pagado' ? 'pagado' : c.estado === 'parcial' ? 'parcial' : c.estado === 'pausa' ? 'pausa' : 'nopagado';
    const esTxt   = c.estado === 'pagado' ? '✓ Pagado' : c.estado === 'parcial' ? '⚠ Debe resto' : c.estado === 'pausa' ? '⏸ Pausa' : '○ No pagado';
    const pagadoParcial = c.pagadoParcial || 0;
    const pendienteParcial = Math.max(0, (c.monto || 0) - pagadoParcial);
    const puedePagarTodo = !c._esPago && c.estado !== 'pagado' && c.estado !== 'pausa' && pendienteParcial > 0 && (c.estado === 'parcial' || pagadoParcial > 0);
    const montoEf = c._esPago ? c.monto :
                    c.estado === 'parcial' && pagadoParcial > 0 ? pendienteParcial :
                    c.montoReal != null ? c.montoReal : c.monto;
    const diffTxt = c._esPago ? `<div style="font-size:9px;color:var(--success);">✓ Abono registrado</div>` :
                    c.estado === 'parcial' && pagadoParcial > 0
                      ? `<div style="font-size:9px;color:var(--accent2);">Abonado: ${fmt(pagadoParcial)}</div>`
                      : c.montoReal != null && c.montoReal !== c.monto
      ? `<div style="font-size:9px;${c.montoReal>c.monto?'color:var(--danger)':'color:var(--success)'};">${c.montoReal>c.monto?'+':''}${fmt(Math.abs(c.montoReal-c.monto))}</div>`
      : '';
    const pausaNote = c.estado === 'pausa' ? `<div style="font-size:9px;color:#6366f1;font-weight:700;">No suma a por pagar / balance</div>` : '';

    return `<div class="sac-carga-row ${c.estado==='pagado'?'pagado':''}${c.estado==='pausa'?' pausa':''}" id="sac-cr-${c.id}">
      <div>
        <span class="sac-cat-badge" style="background:${col}22;color:${col};">${esc(c.cat||'Otro')}</span>
      </div>
      <div>
        <div class="sac-nombre">${esc(c.nombre)}</div>
        ${c.resp?`<div style="font-size:9px;color:#94a3b8;">→ ${esc(c.resp)}</div>`:''}
        ${c.nota?`<div style="font-size:9px;color:#94a3b8;font-style:italic;">${esc(c.nota)}</div>`:''}
      </div>
      <div style="text-align:right;min-width:128px;">
        <div class="sac-monto" style="color:${c.estado==='pagado'?'var(--success)':c.estado==='pausa'?'#6366f1':'var(--danger)'};">
          ${fmt(montoEf)}</div>
        ${c.monto !== montoEf?`<div style="font-size:9px;text-decoration:line-through;color:#94a3b8;">${fmt(c.monto)}</div>`:''}
        ${diffTxt}
        ${pausaNote}
      </div>
      <div class="sac-row-actions">
        ${c.estado === 'pausa'
          ? `<button type="button" class="sac-estado-btn pausa" onclick="sacTogglePausa('${c.id}')">⏸ PAUSA · Reactivar</button>`
          : `<button type="button" class="sac-estado-btn ${esCls}" onclick="sacCycleEstado('${c.id}')">${esTxt}</button>
             ${!c._esPago && c.estado !== 'pagado' ? `<button type="button" class="sac-pay-primary" onclick="sacPagarParcial('${c.id}')">Registrar pago</button>` : ''}
             ${!c._esPago && puedePagarTodo ? `<button type="button" class="sac-pay-all" onclick="sacPagarTodoSaldo('${c.id}')">✓ Pagar TODO (${fmt(pendienteParcial)})</button>` : ''}`}
        <details class="sac-actions-menu">
          <summary>Más</summary>
          <div class="sac-actions-panel">
            ${c.estado !== 'pausa' && !c._esPago ? `
             <button type="button" onclick="sacPagarParcial('${c.id}')">◑ Pago parcial</button>
             <button type="button" onclick="sacAjustarSaldo('${c.id}')">✏ Ajustar saldo</button>
             <button type="button" onclick="sacTogglePausa('${c.id}')">⏸ Pausar</button>` : ''}
            <button type="button" onclick="sacEditCarga('${c.id}')">✏ Editar</button>
            <button type="button" class="sac-action-del" onclick="sacDelCarga('${c.id}')">Eliminar</button>
            <details class="sac-row-history">
              <summary>Últimos movimientos</summary>
              ${sacCargaAuditHtml(c) || '<p class="sac-history-empty">Sin movimientos.</p>'}
            </details>
          </div>
        </details>
      </div>
    </div>`;
  }).join('');

  sacCalcCargasTotals();
}

function sacCargaSortTs(c) {
  if (!c || typeof c !== 'object') return 0;
  if (c._updatedAt) return Number(c._updatedAt) || 0;
  const id = String(c.id || '');
  const m = id.match(/(\d{10,})/);
  if (m) return Number(m[1]) || 0;
  return 0;
}
function sacTouchCarga(c) {
  if (c && typeof c === 'object') c._updatedAt = Date.now();
}

var SAC_LOG_LABELS = {
  abono: 'Abono parcial',
  pagar_todo: 'Pago saldo completo',
  pausa: 'Pausa',
  reactivar: 'Reactivar',
  estado_pagado: 'Marcado pagado',
  estado_nopagado: 'No pagado',
  estado_parcial: 'Parcial',
  ajuste_saldo: 'Ajuste saldo'
};

function sacCargaLogPush(c, accion, extra) {
  if (!c || typeof c !== 'object') return;
  if (!Array.isArray(c.auditLog)) c.auditLog = [];
  const now = new Date();
  c.auditLog.push({
    accion: accion,
    usuario: (typeof currentUser !== 'undefined' && currentUser) ? currentUser : '?',
    fecha: now.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    hora: now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
    ts: Date.now(),
  ...(extra || {})
  });
  if (c.auditLog.length > 50) c.auditLog = c.auditLog.slice(-50);
}

function sacCargaAuditHtml(c) {
  if (!c || !Array.isArray(c.auditLog) || !c.auditLog.length) return '';
  return '<div class="sac-audit-log" style="margin-top:4px;">' +
    c.auditLog.slice(-6).reverse().map(function(e) {
      const lab = SAC_LOG_LABELS[e.accion] || e.accion || 'Acción';
      const m = e.monto != null && e.monto > 0 ? ' · ' + fmt(e.monto) : '';
      return '<div style="font-size:8px;color:#64748b;line-height:1.35;">' +
        esc(e.fecha || '') + (e.hora ? ' ' + esc(e.hora) : '') + ' · ' + esc(e.usuario || '?') +
        ' · ' + esc(lab) + m + '</div>';
    }).join('') + '</div>';
}

function sacCalcCargasTotals() {
  const cargas   = sacGetCargas();
  const base     = sacBaseCargas(cargas);
  const total    = Math.round(base.reduce((s,c)=>s+(c.monto||0),0));
  const pagado   = Math.round(base.reduce((s,c)=>s+sacCargaPagadoAcum(c),0));
  const pendiente= Math.round(base.reduce((s,c)=>s+sacCargaPendienteAcum(c),0));
  const mercMonto = Math.round(sacGetMercMonto());
  const grandTotal= Math.round(total + mercMonto);
  const grandPend = Math.round(pendiente + (mercMonto>0?mercMonto:0)); // mercadería always pending

  const set2=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  set2('sac-foot-total',    fmt(grandTotal));
  set2('sac-foot-pagado',   fmt(pagado));
  set2('sac-foot-pendiente',fmt(grandPend));

  const resEl = document.getElementById('sac-merc-result');
  if (resEl) {
    if (state.sacMerc?.mode === 'pct' && mercMonto > 0)
      resEl.textContent = `= ${fmt(mercMonto)}`;
    else if (mercMonto > 0)
      resEl.textContent = `${fmt(mercMonto)}`;
    else
      resEl.textContent = '';
  }
}

/** Monto ya recibido (total o parcial acumulado). */
function sacIngresoRecibidoAcum(it) {
  if (!it) return 0;
  if (typeof it.recibidoAcum === 'number' && it.recibidoAcum > 0) return Math.min(it.monto || 0, it.recibidoAcum);
  if (it.estado === 'recibido') return it.monto || 0;
  return 0;
}
/** Lo que falta por ingresar respecto al monto total del ítem. */
function sacIngresoPendiente(it) {
  const m = it.monto || 0;
  return Math.max(0, m - sacIngresoRecibidoAcum(it));
}

function sacCalcIngresosTotals() {
  const arr = sacGetIngresos();
  const pend = Math.round(arr.reduce((s, x) => s + sacIngresoPendiente(x), 0));
  const rec = Math.round(arr.reduce((s, x) => s + sacIngresoRecibidoAcum(x), 0));
  const set2 = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set2('sac-ing-pend', fmt(pend));
  set2('sac-ing-recib', fmt(rec));
}

function sacRenderIngresos() {
  const list = document.getElementById('sac-ingresos-list');
  if (!list) return;
  const arr = sacGetIngresos();
  if (!arr.length) {
    list.innerHTML = '<div style="padding:8px 10px;text-align:center;color:#94a3b8;font-size:10px;font-style:italic;">Sin ítems · <b>+ Ingreso</b></div>';
    sacCalcIngresosTotals();
    return;
  }
  list.innerHTML = arr.map(it => {
    const recA = sacIngresoRecibidoAcum(it);
    const pend = sacIngresoPendiente(it);
    const esFullRec = pend <= 0.01 && (it.monto || 0) > 0;
    const esParcial = recA > 0 && pend > 0.01;
    let badgeTxt = 'Pendiente';
    let badgeBg = 'rgba(16,185,129,.22)';
    let badgeCol = 'var(--success)';
    if (esFullRec) { badgeTxt = 'Recibido'; badgeBg = 'rgba(148,163,184,.2)'; badgeCol = '#94a3b8'; }
    else if (esParcial) { badgeTxt = 'Parcial'; badgeBg = 'rgba(245,158,11,.18)'; badgeCol = 'var(--warning)'; }
    return `<div class="sac-carga-row ingreso${esFullRec ? ' ingreso-recibido' : ''}" id="sac-ir-${it.id}">
      <div><span class="sac-cat-badge" style="background:${badgeBg};color:${badgeCol};">${badgeTxt}</span></div>
      <div>
        <div class="sac-nombre">${esc(it.nombre || '(sin nombre)')}</div>
        ${it.nota ? `<div style="font-size:9px;color:#94a3b8;font-style:italic;">${esc(it.nota)}</div>` : ''}
      </div>
      <div style="text-align:right;min-width:128px;">
        <div class="sac-monto" style="color:${esFullRec ? '#94a3b8' : 'var(--success)'};">Total ${fmt(it.monto || 0)}</div>
        ${(it.monto || 0) > 0 ? `<div style="font-size:9px;color:#94a3b8;">Recib. ${fmt(recA)} · Falta ${fmt(pend)}</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:3px;align-items:flex-end;">
        ${pend > 0.5 ? `<button type="button" class="sac-estado-btn parcial" onclick="sacIngresoRecibirParcial('${it.id}')" title="Registrar solo una parte del monto total">◑ Recibir parcial</button>` : ''}
        <button type="button" class="sac-estado-btn ${esFullRec ? 'pagado' : 'nopagado'}" onclick="sacCycleIngresoEstado('${it.id}')">${esFullRec ? '✓ Todo recibido' : '○ Marcar todo'}</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:3px;align-items:flex-end;">
        <button type="button" onclick="sacDelIngreso('${it.id}')" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:14px;padding:2px 4px;">✕</button>
        <button type="button" onclick="sacEditIngreso('${it.id}')" style="font-size:9px;background:none;border:none;color:#94a3b8;cursor:pointer;font-family:inherit;">✏ Editar</button>
      </div>
    </div>`;
  }).join('');
  sacCalcIngresosTotals();
}

function sacAddIngresoManual() {
  pushUndo();
  const id = 'si_' + Date.now();
  sacGetIngresos().push({
    id, nombre: '', monto: 0, estado: 'pendiente', nota: ''
  });
  sacRenderIngresos();
  sacCalcBalance();
  markUnsaved();
  sacEditIngreso(id);
}

function sacDelIngreso(id) {
  const k = sacDataKey();
  const arr = sacGetIngresos(k);
  const it = arr.find(x => x.id === id);
  if (!it) return;
  if (!confirm(`¿Eliminar ingreso "${it.nombre || id}" (${fmt(it.monto)})?`)) return;
  pushUndo();
  state.sacIngresos[k] = arr.filter(x => x.id !== id);
  sacRenderIngresos();
  sacCalcBalance();
  markUnsaved();
}

function sacCycleIngresoEstado(id) {
  const it = sacGetIngresos().find(x => x.id === id);
  if (!it) return;
  pushUndo();
  const eraFull = sacIngresoPendiente(it) <= 0.01 && (it.monto || 0) > 0;
  if (eraFull) {
    it.estado = 'pendiente';
    it.recibidoAcum = 0;
  } else {
    it.estado = 'recibido';
    it.recibidoAcum = it.monto || 0;
  }
  sacRenderIngresos();
  sacCalcBalance();
  markUnsaved();
  notify(eraFull ? '○ Vuelve a pendiente (sin lo recibido)' : '✓ Marcado todo el monto como recibido — actualiza banco/caja si aplica');
}

function sacIngresoRecibirParcial(id) {
  const it = sacGetIngresos().find(x => x.id === id);
  if (!it) return;
  const pend = sacIngresoPendiente(it);
  if (pend <= 0) { notify('⚠ No hay monto pendiente en este ítem'); return; }
  const raw = prompt(
    '¿Cuánto ingresas ahora?\n' +
    'Pendiente: ' + fmt(pend) + ' de ' + fmt(it.monto || 0) + '\n\n' +
    'Puedes usar puntos de miles (ej: 1.500.000)',
    ''
  );
  if (raw == null) return;
  const add = parseNumCL(String(raw).trim(), false);
  if (!add || add <= 0) { notify('⚠ Ingresa un monto válido'); return; }
  if (add > pend + 0.5) { notify('⚠ No puede superar lo pendiente (' + fmt(pend) + ')'); return; }
  pushUndo();
  it.recibidoAcum = (typeof it.recibidoAcum === 'number' ? it.recibidoAcum : 0) + add;
  if (it.recibidoAcum > (it.monto || 0)) it.recibidoAcum = it.monto || 0;
  if (sacIngresoPendiente(it) <= 0.5) {
    it.estado = 'recibido';
  } else {
    it.estado = 'parcial';
  }
  sacRenderIngresos();
  sacCalcBalance();
  markUnsaved();
  notify('✓ Recibido ' + fmt(add) + ' · Falta ' + fmt(sacIngresoPendiente(it)));
}

function sacEditIngreso(id) {
  const it = sacGetIngresos().find(x => x.id === id);
  if (!it) return;
  const row = document.getElementById('sac-ir-' + id);
  if (!row) return;
  row.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:8px;padding:4px 0;align-items:center;grid-column:1/-1;">
      <input class="sac-edit-inp" type="text" value="${esc(it.nombre)}" placeholder="Concepto" id="sin-nombre-${id}" style="flex:2;min-width:140px;">
      <input class="sac-edit-inp" type="text" inputmode="numeric" value="${it.monto ? fmtInputCL(it.monto) : ''}" placeholder="Monto $" id="sin-monto-${id}" style="width:110px;text-align:right;" onblur="formatNumericInputValue(this)">
      <input class="sac-edit-inp" type="text" value="${esc(it.nota || '')}" placeholder="Nota (opcional)" id="sin-nota-${id}" style="flex:2;min-width:120px;">
      <button type="button" onclick="sacSaveIngresoEdit('${id}')" class="fac-btn primary" style="font-size:10px;padding:4px 10px;">💾</button>
      <button type="button" onclick="sacRenderIngresos()" class="fac-btn" style="font-size:10px;padding:4px 10px;">✕</button>
    </div>`;
  document.getElementById('sin-nombre-' + id)?.focus();
}

function sacSaveIngresoEdit(id) {
  const it = sacGetIngresos().find(x => x.id === id);
  if (!it) return;
  pushUndo();
  it.nombre = (document.getElementById('sin-nombre-' + id)?.value || '').trim() || it.nombre;
  it.monto = parseNumCL(document.getElementById('sin-monto-' + id)?.value || '0', false) || 0;
  it.nota = (document.getElementById('sin-nota-' + id)?.value || '').trim() || '';
  if (typeof it.recibidoAcum === 'number' && it.recibidoAcum > it.monto) it.recibidoAcum = it.monto;
  if (sacIngresoPendiente(it) <= 0.5) {
    it.estado = 'recibido';
    if (typeof it.recibidoAcum !== 'number' || it.recibidoAcum < it.monto) it.recibidoAcum = it.monto;
  } else if ((it.recibidoAcum || 0) > 0) {
    it.estado = 'parcial';
  } else {
    it.estado = 'pendiente';
    it.recibidoAcum = 0;
  }
  sacRenderIngresos();
  sacCalcBalance();
  markUnsaved();
}

function sacGetBalanceEstimado() {
  const key = sacDataKey();
  const banco     = state.cajaEmpresa?.banco || 0;
  const efectivo  = state.sacEfectivo || 0;
  const cajaChica = state.sacCajaChica || 0;
  const propPend  = (state.propinas||[]).reduce((s,p)=>s+(p.estado==='pendiente'?p.monto:0),0);
  const bancoReal = Math.round(banco - propPend);
  const disponible= Math.round(bancoReal + efectivo + cajaChica);

  const cargas    = sacBaseCargas(sacGetCargas(key));
  const mercMonto = Math.round(sacGetMercMonto());
  const porPagar  = Math.round(cargas.reduce((s,c)=>s+sacCargaPendienteAcum(c),0) + mercMonto);
  const pagado    = Math.round(cargas.reduce((s,c)=>s+sacCargaPagadoAcum(c),0));

  const n = sacPeriodDayCount();
  const days = vsGetWeekSac(key);
  const extra = vsGetExtraSac(key);
  let ventasEstPendientes = 0;
  let ventaRealAcum = 0;
  for (let i = 0; i < n && i < days.length; i++) {
    const d = days[i];
    const est = d.est || 0;
    const real = d.real || 0;
    if (real > 0) ventaRealAcum += real;
    else if (est > 0) ventasEstPendientes += est;
  }
  const exM = extra.monto || 0;
  const exR = extra.realExtra || 0;
  if (exR > 0) ventaRealAcum += exR;
  else if (exM > 0) ventasEstPendientes += exM;
  ventasEstPendientes = Math.round(ventasEstPendientes);
  ventaRealAcum = Math.round(ventaRealAcum);

  const ingresosPorIngresar = Math.round((state.ingresos||[]).reduce((s,i) => {
    return s + (!i.confirmed ? (i.amount||0) : 0);
  }, 0));

  const otrosIngPend = Math.round(sacGetIngresos(key).reduce((s, x) => s + sacIngresoPendiente(x), 0));

  const balance = Math.round(disponible + ventasEstPendientes + ingresosPorIngresar + otrosIngPend - porPagar);

  return {
    balance, disponible, porPagar, pagado, ventasEstPendientes, ventaRealAcum,
    ingresosPorIngresar, otrosIngPend, days, mercMonto
  };
}

function sacCalcBalance() {
  const B = sacGetBalanceEstimado();
  const {
    balance, disponible, porPagar, ventasEstPendientes, ventaRealAcum,
    ingresosPorIngresar, otrosIngPend, pagado, days
  } = B;

  const set2=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  set2('sac-total-disp', fmt(disponible));
  set2('sac-por-pagar',  fmt(porPagar));
  const plbl = document.getElementById('sac-pagado-lbl');
  if (plbl) plbl.textContent = pagado>0 ? `✓ Pagado: ${fmt(pagado)}` : '';

  // Venta real acumulada
  set2('sac-vreal-acum', fmt(ventaRealAcum));
  const vrSub = document.getElementById('sac-vreal-acum-sub');
  if (vrSub) {
    const nD = sacPeriodDayCount();
    const slice = (days || []).slice(0, nD);
    const conReal = slice.filter(d => (d.real || 0) > 0).length;
    const soloEst = slice.filter(d => (d.real || 0) === 0 && (d.est || 0) > 0).length;
    if (conReal > 0) {
      vrSub.textContent = `Referencia: ${conReal} día${conReal!==1?'s':''} con venta real (ya debería estar en banco/caja)` +
        (soloEst ? ` · ${soloEst} día${soloEst!==1?'s':''} aún solo estimado (sí entra al balance)` : '');
    } else if (soloEst > 0) {
      vrSub.textContent = `${soloEst} día${soloEst!==1?'s':''} con estimado pendiente (aún sin real)`;
    } else {
      vrSub.textContent = 'Sin ventas cargadas en el período';
    }
  }

  const balEl  = document.getElementById('sac-balance');
  const subEl  = document.getElementById('sac-balance-sub');
  if (balEl) balEl.style.color = balance >= 0 ? 'var(--success)' : 'var(--danger)';
  if (balEl) balEl.textContent = (balance<0?'-':'')+fmt(Math.abs(balance));
  if (subEl) {
    let subTxt = `Disp. ${fmt(disponible)} (Caja ${fmt(state.sacEfectivo||0)} + C.Chica ${fmt(state.sacCajaChica||0)}) + Vta.Est. ${fmt(ventasEstPendientes)}`;
    if (ingresosPorIngresar > 0) subTxt += ` + Ing.Pend. ${fmt(ingresosPorIngresar)}`;
    if (otrosIngPend > 0) subTxt += ` + Ing.extra SAC ${fmt(otrosIngPend)}`;
    subTxt += ` − Por pagar ${fmt(porPagar)}`;
    subEl.textContent = subTxt;
  }

  updateDashSac(disponible, porPagar, pagado, ventasEstPendientes, balance);
  sacUpdateFinPanelBalance();
  if (typeof updateTotalDisponible === 'function') updateTotalDisponible();
}

function sacUpdateFinPanelBalance() {
  const B = sacGetBalanceEstimado();
  const el = document.getElementById('sac-fin-balance-live');
  const hint = document.getElementById('sac-fin-neg-hint');
  if (el) {
    el.textContent = (B.balance < 0 ? '−' : '') + fmt(Math.abs(B.balance));
    el.style.color = B.balance < 0 ? 'var(--danger)' : 'var(--success)';
  }
  if (hint) hint.style.display = B.balance < 0 ? 'inline' : 'none';
}

function sacRenderFinanciamientoPanel() {
  const wrap = document.getElementById('sac-fin-panel-wrap');
  if (!wrap) return;
  wrap.style.display = 'none';
  wrap.innerHTML = '';
}

function sacGuardarFinanciamientoRegistro() {
  const B = sacGetBalanceEstimado();
  const monto = parseNumCL(document.getElementById('sac-fin-monto')?.value || '0', false) || 0;
  const detalle = (document.getElementById('sac-fin-detalle')?.value || '').trim();
  if (!monto) { notify('⚠ Ingresa el monto que aportó o financió Sebas'); return; }
  if (B.balance >= 0) {
    if (!confirm('El balance estimado no está negativo ahora. ¿Guardar el registro igual (aporte o financiamiento extra)?')) return;
  }
  pushUndo();
  if (!state.sacFinanciamientoRegistro) state.sacFinanciamientoRegistro = [];
  const now = new Date();
  const p = sacNormalizedPeriod();
  const wlbl = sacPeriodLabel();
  state.sacFinanciamientoRegistro.unshift({
    id: 'sfin_' + Date.now(),
    ts: Date.now(),
    y: now.getFullYear(), mo: now.getMonth() + 1,
    w: p.type === 'slot' ? p.w : null,
    periodoLabel: wlbl,
    periodKey: sacDataKey(),
    balanceNegativo: B.balance,
    montoFinanciado: monto,
    detalle: detalle || ''
  });
  const mi = document.getElementById('sac-fin-monto');
  const di = document.getElementById('sac-fin-detalle');
  if (mi) mi.value = '';
  if (di) di.value = '';
  sacRenderFinanciamientoPanel();
  markUnsaved();
  if (typeof saveState === 'function') saveState('Registro financiamiento Sebas', true);
  notify('✅ Registro guardado en historial');
}

function sacEliminarFinanciamientoRegistro(id) {
  if (!confirm('¿Eliminar este registro del historial?')) return;
  pushUndo();
  state.sacFinanciamientoRegistro = (state.sacFinanciamientoRegistro || []).filter(x => x.id !== id);
  sacRenderFinanciamientoPanel();
  markUnsaved();
  if (typeof saveState === 'function') saveState('Eliminó registro financiamiento', true);
  notify('Registro eliminado');
}

function updateDashSac(disponible, porPagar, pagado, ventas, balance) {
  const wlbl = sacPeriodLabel();

  const set2=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  set2('dash-sac-wlbl',    wlbl);
  set2('dash-sac-vest',    fmt(ventas));
  set2('dash-sac-porpagar',fmt(porPagar));
  set2('dash-sac-pagado',  pagado>0?`✓ Pagado: ${fmt(pagado)}`:'');
  set2('dash-sac-disp',    fmt(disponible));

  const bEl = document.getElementById('dash-sac-balance');
  if (bEl) {
    bEl.textContent  = (balance<0?'-':'')+fmt(Math.abs(balance));
    bEl.style.color  = balance>=0?'var(--success)':'var(--danger)';
  }
}

function sacCalcAll() {
  sacCalcVentas();
  sacCalcCargasTotals();
  sacCalcBalance();
}

// ── CARGA ACTIONS ──
function sacAddCargaManual() {
  pushUndo();
  const item = {
    id:       'sc_'+Date.now(),
    nombre:   '',
    cat:      'Otro',
    monto:    0,
    montoReal: null,
    estado:   'nopagado',
    resp:     currentUser || '',
    nota:     ''
  };
  sacTouchCarga(item);
  sacGetCargas().push(item);
  sacRenderCargas();
  sacCalcBalance();
  const cargas = sacGetCargas();
  sacEditCarga(cargas[cargas.length - 1].id);
}

function sacDelCarga(id) {
  const k = sacDataKey();
  const cargas = sacGetCargas(k);
  const c = cargas.find(x => x.id === id);
  if (!c) return;
  if (!confirm(`¿Eliminar "${c.nombre}" (${fmt(c.monto)})?`)) return;
  pushUndo();
  state.sacCargas[k] = cargas.filter(x => x.id !== id);
  sacRenderCargas();
  sacCalcBalance();
}

function sacTogglePausa(id) {
  const c = sacGetCargas().find(x => x.id === id);
  if (!c || c._esPago) return;
  if (c.estado !== 'pausa') {
    if (!confirm('¿Poner esta carga en PAUSA?\n\n• El monto seguirá anotado.\n• NO se sumará a «Por pagar» ni al balance estimado hasta que reactives.\n\n¿Continuar?')) return;
    pushUndo();
    c._pausaPrevEstado = (c.estado === 'parcial' || c.estado === 'pagado' || c.estado === 'nopagado') ? c.estado : 'nopagado';
    c.estado = 'pausa';
    sacCargaLogPush(c, 'pausa', {});
  } else {
    const prev = c._pausaPrevEstado || 'nopagado';
    const lab = { nopagado: 'No pagado (pendiente de pago)', parcial: 'Parcial', pagado: 'Pagado' }[prev] || 'No pagado';
    if (!confirm('¿Quitar PAUSA?\n\nVolverá a: ' + lab + '.\nVolverá a contar en por pagar y en el balance según ese estado.\n\n¿Continuar?')) return;
    pushUndo();
    c.estado = prev;
    delete c._pausaPrevEstado;
    sacCargaLogPush(c, 'reactivar', { detalle: lab });
  }
  sacTouchCarga(c);
  sacRenderCargas();
  sacCalcBalance();
  markUnsaved();
  notify(c.estado === 'pausa' ? '⏸ Carga en pausa (no afecta balance)' : '↩ Pausa quitada');
}

async function sacCycleEstado(id) {
  const c = sacGetCargas().find(x=>x.id===id); if(!c) return;
  if (c.estado === 'pausa') {
    notify('⚠ Está en PAUSA. Usa «⏸ PAUSA · Reactivar» para volver a no pagado / parcial / pagado.');
    return;
  }

  // Desde pagado: deshacer el saldado y volver al pendiente real (conserva abonos previos).
  if (c.estado === 'pagado') {
    const prev = (c._pagadoAntesDeSaldar != null) ? c._pagadoAntesDeSaldar : sacInferirPagadoAntesDeSaldar(c);
    const prevSafe = Math.max(0, Math.min(Number(prev) || 0, c.monto || 0));
    const pendientePrev = Math.max(0, (c.monto || 0) - (prevSafe >= (c.monto || 0) ? 0 : prevSafe));
    const msg = prevSafe > 0
      ? `¿Deshacer pago de "${c.nombre}"?\n\nVolverá a pendiente: ${fmt(pendientePrev)}\n(Se conservan abonos previos: ${fmt(prevSafe)}).`
      : `¿Marcar "${c.nombre}" como No pagado?\n\nPendiente: ${fmt(c.monto || 0)}`;
    if (!confirm(msg)) return;
    pushUndo();
    sacRevertirDesdePagado(c);
    sacCargaLogPush(c, c.estado === 'parcial' ? 'estado_parcial' : 'estado_nopagado', {
      monto: sacCargaPendienteAcum(c)
    });
    sacTouchCarga(c);
    sacRenderCargas();
    sacCalcBalance();
    markUnsaved();
    notify(c.estado === 'parcial'
      ? `⚠ ${c.nombre} — Debe resto ${fmt(sacCargaPendienteAcum(c))}`
      : `○ ${c.nombre} — No pagado`);
    return;
  }

  const order = ['nopagado','parcial','pagado'];
  const idx   = order.indexOf(c.estado||'nopagado');
  const next  = order[(idx+1)%order.length];
  const labels = { nopagado:'No pagado', pagado:'Pagado', parcial:'Parcial (debe un resto)' };
  if (!confirm(`¿Cambiar "${c.nombre}" a ${labels[next]}?\n\n💡 Si quieres registrar un abono, usa «Registrar pago».`)) return;
  let bankOpt = { cancel: false, descontar: false };
  let montoPagoBanco = 0;
  if (next === 'pagado') {
    montoPagoBanco = Math.max(0, sacCargaPendienteAcum(c));
    if (montoPagoBanco > 0) {
      bankOpt = await sacAskAutoBancoDescuento_({
        titulo: 'Marcar egreso como pagado',
        detalle: c.nombre,
        monto: montoPagoBanco
      });
      if (bankOpt.cancel) return;
    }
  }
  pushUndo();
  if (next === 'pagado') {
    sacRememberPagadoAntesDeSaldar(c);
    c.estado = 'pagado';
    if (c.montoReal == null) c.montoReal = c.monto;
    c.pagadoParcial = c.monto || 0;
    sacCargaLogPush(c, 'estado_pagado', { monto: montoPagoBanco || c.monto });
    if (bankOpt.descontar && montoPagoBanco > 0) {
      sacDescontarBancoPorEgreso_(montoPagoBanco, c.nombre);
    }
  } else if (next === 'parcial') {
    c.estado = 'parcial';
    if (!(c.pagadoParcial > 0)) c.pagadoParcial = 0;
    sacCargaLogPush(c, 'estado_parcial', {});
  } else {
    // nopagado explícito: anula abonos (es el ciclo desde parcial → no pagado)
    c.estado = 'nopagado';
    c.pagadoParcial = 0;
    delete c.montoReal;
    delete c._pagadoAntesDeSaldar;
    sacCargaLogPush(c, 'estado_nopagado', {});
  }
  sacTouchCarga(c);
  sacRenderCargas();
  sacCalcBalance();
  markUnsaved();
  notify(c.estado==='pagado'?`✓ ${c.nombre} — Pagado`:c.estado==='parcial'?`◑ ${c.nombre} — Parcial`:`○ ${c.nombre} — No pagado`);
}

function sacEditMonto(id) {
  const c = sacGetCargas().find(x=>x.id===id); if(!c) return;
  const v = prompt(
    `Monto real pagado para "${c.nombre}"\n(Proyectado: ${fmt(c.monto)})\nPuedes usar puntos: 1.500.000`,
    c.montoReal != null ? fmtInputCL(c.montoReal) : fmtInputCL(c.monto)
  );
  if (v === null) return;
  const real = parseNumCL((v||'0'), false)||0;
  pushUndo();
  const nextEstado = real === c.monto ? 'pagado' : real < c.monto ? 'parcial' : 'pagado';
  if (nextEstado === 'pagado' && c.estado !== 'pagado') sacRememberPagadoAntesDeSaldar(c);
  c.montoReal = real;
  c.estado    = nextEstado;
  if (nextEstado === 'pagado') c.pagadoParcial = c.monto || 0;
  else if (nextEstado === 'parcial') c.pagadoParcial = real;
  sacTouchCarga(c);
  sacRenderCargas();
  sacCalcBalance();
  notify(`✓ Monto real: ${fmt(real)}`);
}

/** Saldar el resto pendiente de una carga con abonos previos. */
async function sacPagarTodoSaldo(id) {
  const c = sacGetCargas().find(x => x.id === id);
  if (!c || c._esPago) return;
  if (c.estado === 'pausa') { notify('⚠ Quita PAUSA antes de pagar.'); return; }
  if (c.estado === 'pagado') { notify('⚠ Ya está pagada.'); return; }
  const pendiente = Math.max(0, sacCargaPendienteAcum(c));
  if (pendiente <= 0) { notify('⚠ No hay saldo pendiente'); return; }
  if (!confirm(`¿Pagar TODO el saldo de "${c.nombre}"?\n\nPendiente: ${fmt(pendiente)}`)) return;
  const bankOpt = await sacAskAutoBancoDescuento_({
    titulo: 'Pago saldo completo',
    detalle: c.nombre,
    monto: pendiente
  });
  if (bankOpt.cancel) return;
  pushUndo();
  const cargas = sacGetCargas();
  sacRememberPagadoAntesDeSaldar(c);
  c.pagadoParcial = (c.pagadoParcial || 0) + pendiente;
  c.estado = 'pagado';
  c.montoReal = c.monto;
  sacCargaLogPush(c, 'pagar_todo', { monto: pendiente });
  const pago = {
    id: 'sc_pago_' + Date.now(),
    nombre: `✓ Pago saldo — ${c.nombre}`,
    cat: c.cat,
    monto: pendiente,
    montoReal: pendiente,
    estado: 'pagado',
    resp: c.resp || '',
    nota: `Saldo completo ${fmt(pendiente)}`,
    _esPago: true
  };
  sacTouchCarga(pago);
  cargas.push(pago);
  if (bankOpt.descontar && pendiente > 0) sacDescontarBancoPorEgreso_(pendiente, c.nombre);
  sacTouchCarga(c);
  sacRenderCargas();
  sacCalcBalance();
  markUnsaved();
  notify(`✅ "${c.nombre}" saldada · ${fmt(c.monto)}`);
}

// ── Pago parcial con registro automático ──
// Al registrar un pago parcial de X sobre una carga de Y:
// 1. La carga original queda en Y-X (pendiente)
//    (opcionalmente se puede corregir el saldo pendiente real)
// 2. Se crea automáticamente una carga nueva de X con estado "pagado"
async function sacPagarParcial(id) {
  const cargas = sacGetCargas();
  const c = cargas.find(x=>x.id===id); if(!c) return;
  if (c.estado === 'pausa') { notify('⚠ Quita PAUSA antes de registrar pagos parciales.'); return; }

  const pendiente = c.monto - (c.pagadoParcial||0);
  const v = prompt(
    `Pago parcial para "${c.nombre}"\n` +
    `Total: ${fmt(c.monto)}  |  Ya pagado: ${fmt(c.pagadoParcial||0)}  |  Pendiente: ${fmt(pendiente)}\n\n` +
    `¿Cuánto pagaste ahora?\n` +
    `(Puedes usar puntos: 1.500.000)\n` +
    `(Si el monto real es mayor al pendiente, se ajustará el total)`,
    ''
  );
  if (v === null) return;
  const abono = parseNumCL((v||'0'), false)||0;
  if (!abono) { notify('⚠ Ingresa un monto válido'); return; }
  const bankOpt = await sacAskAutoBancoDescuento_({
    titulo: 'Pago parcial de egreso',
    detalle: c.nombre,
    monto: abono
  });
  if (bankOpt.cancel) return;

  pushUndo();

  if (abono > pendiente) {
    // El monto real supera el saldo pendiente → ajustar monto original y marcar como pagado
    sacRememberPagadoAntesDeSaldar(c);
    const nuevoTotal = (c.pagadoParcial||0) + abono;
    c.monto         = nuevoTotal;
    c.pagadoParcial = nuevoTotal;
    c.montoReal     = nuevoTotal;
    c.estado        = 'pagado';
    sacCargaLogPush(c, 'pagar_todo', { monto: abono });
    sacTouchCarga(c);
    notify(`✅ "${c.nombre}" ajustado a ${fmt(nuevoTotal)} y saldado completamente`);
  } else {
    // Actualizar la carga original
    const abonadoAntes = c.pagadoParcial || 0;
    c.pagadoParcial = abonadoAntes + abono;
    let nuevoPendiente = c.monto - c.pagadoParcial;

    // Permitir corregir el saldo pendiente real para reflejar cambios externos.
    if (nuevoPendiente > 0) {
      const vPend = prompt(
        `Saldo pendiente actual para "${c.nombre}"\n` +
        `Calculado automáticamente: ${fmt(nuevoPendiente)}\n\n` +
        'Si cambió por factores externos, escribe el nuevo saldo.\n' +
        'Deja vacío para mantener el calculado.',
        String(nuevoPendiente)
      );
      if (vPend !== null && String(vPend).trim() !== '') {
        const pendReal = Math.max(0, parseNumCL(vPend, false) || 0);
        c.monto = (c.pagadoParcial || 0) + pendReal;
        nuevoPendiente = pendReal;
      }
    }

    if (nuevoPendiente <= 0) {
      // Saldada completamente — conservar abonos previos para poder deshacer
      c._pagadoAntesDeSaldar = abonadoAntes;
      c.estado    = 'pagado';
      c.montoReal = c.monto;
      sacCargaLogPush(c, 'pagar_todo', { monto: abono });
      sacTouchCarga(c);
      notify(`✅ "${c.nombre}" — ¡Saldado completamente! ${fmt(c.monto)}`);
    } else {
      c.estado = 'parcial';
      sacCargaLogPush(c, 'abono', { monto: abono });
      sacTouchCarga(c);
      // Crear registro del abono pagado
      const pago = {
        id:       'sc_pago_'+Date.now(),
        nombre:   `✓ Pago parcial — ${c.nombre}`,
        cat:      c.cat,
        monto:    abono,
        montoReal: abono,
        estado:   'pagado',
        resp:     c.resp || '',
        nota:     `Abono ${fmt(abono)} · Total vigente: ${fmt(c.monto)} · Pendiente: ${fmt(nuevoPendiente)}`,
        _esPago:  true  // marca para no mostrar botón de pago parcial en este registro
      };
      sacTouchCarga(pago);
      cargas.push(pago);
      notify(`◑ Abono de ${fmt(abono)} registrado · Pendiente: ${fmt(nuevoPendiente)}`);
    }
  }
  if (bankOpt.descontar && abono > 0) {
    sacDescontarBancoPorEgreso_(abono, c.nombre);
  }

  sacRenderCargas();
  sacCalcBalance();
  markUnsaved();
}

function sacAjustarSaldo(id) {
  const c = sacGetCargas().find(x=>x.id===id); if(!c) return;
  if (c._esPago) return;
  if (c.estado === 'pausa') { notify('⚠ Quita PAUSA antes de ajustar saldo.'); return; }
  if (c.estado === 'pagado') { notify('⚠ Esta carga ya está pagada.'); return; }

  const pagado = c.pagadoParcial || 0;
  const pendienteActual = Math.max(0, (c.monto || 0) - pagado);
  const v = prompt(
    `Ajustar saldo pendiente de "${c.nombre}"\n` +
    `Saldo actual: ${fmt(pendienteActual)}  |  Pagado acumulado: ${fmt(pagado)}\n\n` +
    'Ingresa el nuevo saldo pendiente real\n(Puedes usar puntos: 1.500.000):',
    fmtInputCL(pendienteActual)
  );
  if (v === null) return;
  const nuevoPendiente = Math.max(0, parseNumCL((v||'0'), false) || 0);

  pushUndo();
  c.monto = pagado + nuevoPendiente;
  const nextEst = nuevoPendiente <= 0 ? 'pagado' : (pagado > 0 ? 'parcial' : 'nopagado');
  if (nextEst === 'pagado' && c.estado !== 'pagado') sacRememberPagadoAntesDeSaldar(c);
  c.estado = nextEst;
  if (c.estado === 'pagado') {
    c.montoReal = c.monto;
    c.pagadoParcial = c.monto;
  }
  sacCargaLogPush(c, 'ajuste_saldo', { monto: nuevoPendiente });
  sacTouchCarga(c);
  sacRenderCargas();
  sacCalcBalance();
  markUnsaved();
  notify(`✏ Saldo ajustado a ${fmt(nuevoPendiente)} · Total vigente: ${fmt(c.monto)}`);
}

function sacEditCarga(id) {
  const c = sacGetCargas().find(x=>x.id===id); if(!c) return;
  const CAT_LIST = ['Crédito','TC','Retiro','Proveedor','Impuesto','Servicio','Bono','Arriendo','Compra','RRHH','Otro'];
  const row = document.getElementById('sac-cr-'+id); if(!row) return;

  const catOpts = CAT_LIST.map(ct=>`<option value="${ct}" ${c.cat===ct?'selected':''}>${ct}</option>`).join('');
  row.innerHTML = `
    <div colspan="5" style="display:flex;flex-wrap:wrap;gap:8px;padding:4px 0;align-items:center;grid-column:1/-1;">
      <input class="sac-edit-inp" type="text" value="${esc(c.nombre)}" placeholder="Nombre" id="se-nombre-${id}" style="flex:2;min-width:140px;">
      <select class="sac-edit-inp" id="se-cat-${id}" style="flex:1;min-width:100px;">${catOpts}</select>
      <input class="sac-edit-inp" type="text" inputmode="numeric" value="${c.monto ? fmtInputCL(c.monto) : ''}" placeholder="Monto $" id="se-monto-${id}" style="width:110px;text-align:right;" onblur="formatNumericInputValue(this)">
      <input class="sac-edit-inp" type="text" value="${esc(c.resp||'')}" placeholder="Responsable" id="se-resp-${id}" style="width:110px;">
      <input class="sac-edit-inp" type="text" value="${esc(c.nota||'')}" placeholder="Nota" id="se-nota-${id}" style="flex:2;min-width:120px;">
      <button onclick="sacSaveEdit('${id}')" class="fac-btn primary" style="font-size:10px;padding:4px 10px;">💾</button>
      <button onclick="sacRenderCargas()" class="fac-btn" style="font-size:10px;padding:4px 10px;">✕</button>
    </div>`;
  document.getElementById('se-nombre-'+id)?.focus();
}

function sacSaveEdit(id) {
  const c = sacGetCargas().find(x=>x.id===id); if(!c) return;
  pushUndo();
  c.nombre = document.getElementById('se-nombre-'+id)?.value || c.nombre;
  c.cat    = document.getElementById('se-cat-'+id)?.value    || c.cat;
  c.monto  = parseNumCL((document.getElementById('se-monto-'+id)?.value||'0'), false)||0;
  c.resp   = document.getElementById('se-resp-'+id)?.value   || '';
  c.nota   = document.getElementById('se-nota-'+id)?.value   || '';
  sacTouchCarga(c);
  sacRenderCargas();
  sacCalcBalance();
}

// ── CONFIG SELECTOR ──
function sacOpenConfigSel() {
  const body = document.getElementById('sac-sel-body'); if(!body) return;
  // Collect all config items from all expense sections
  const keys = ['mercaderia','rrhh','operacion','pasivos','socias','gestion','ingresos'];
  const keyLabels = {mercaderia:'🛒 Mercadería', rrhh:'👥 RRHH', operacion:'⚡ Operación',
    pasivos:'🏦 Pasivos', socias:'🤝 Socias', gestion:'💼 Gestión', ingresos:'💰 Ingresos'};
  const existing = new Set(sacGetCargas().map(c=>c._fixedId));
  let html = '';
  keys.forEach(k => {
    const items = (state[k]||[]).filter(i=>i.amount>0);
    if (!items.length) return;
    html += `<div style="font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;padding:8px 0 4px;">${keyLabels[k]}</div>`;
    html += items.map(item => {
      const alreadyIn = existing.has(k+'-'+item.id);
      return `<div style="display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border);padding:6px 0;">
        <label class="sac-sel-item" style="flex:1;border:none;padding:0;margin:0;">
        <input type="checkbox" value="${k}|${item.id}" ${alreadyIn?'checked disabled':''}>
        <div style="flex:1;">
          <div style="font-weight:600;font-size:12px;">${esc(item.name)}</div>
          <div style="font-size:10px;color:#94a3b8;">${freqLabel(item.freq)} · preset ${fmt(item.amount)}</div>
        </div>
        </label>
        <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:2px;">
          <span style="font-size:9px;font-weight:700;color:#94a3b8;">Monto carga</span>
          <input type="text" inputmode="numeric" class="sac-sel-monto-inp" value="${item.amount ? fmtInputCL(item.amount) : '0'}"
            ${alreadyIn?'disabled':''} onblur="formatNumericInputValue(this)"
            style="width:92px;text-align:right;border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-size:12px;font-weight:800;font-family:inherit;color:var(--accent2);background:var(--white);">
        </div>
      </div>`;
    }).join('');
  });
  body.innerHTML = html || '<div style="padding:20px;text-align:center;color:#94a3b8;">No hay ítems en Configuración</div>';
  document.getElementById('sac-sel-overlay').classList.add('show');
}

function sacCloseSel() {
  document.getElementById('sac-sel-overlay').classList.remove('show');
}

function sacHelpOpen(text) {
  const overlay = document.getElementById('sac-help-overlay');
  const body = document.getElementById('sac-help-text');
  if (!overlay || !body) return;
  body.textContent = text || 'Sin información disponible.';
  overlay.classList.add('show');
}

function sacHelpClose() {
  const overlay = document.getElementById('sac-help-overlay');
  if (overlay) overlay.classList.remove('show');
}

if (!window.__sacHelpBound) {
  window.__sacHelpBound = true;
  document.addEventListener('click', function(ev) {
    const el = ev.target && ev.target.closest ? ev.target.closest('.sac-help') : null;
    if (!el) return;
    const txt = el.getAttribute('title') || el.dataset.help || '';
    if (!txt) return;
    ev.preventDefault();
    sacHelpOpen(txt);
  });
}

if (!window.__cerebrusNumericFormatBound) {
  window.__cerebrusNumericFormatBound = true;
  document.addEventListener('blur', function(ev) {
    const t = ev && ev.target;
    if (!t || t.tagName !== 'INPUT') return;
    if (t.type !== 'text') return;
    formatNumericInputValue(t);
  }, true);
}

function sacImportSelected() {
  const keys = ['mercaderia','rrhh','operacion','pasivos','socias','gestion','ingresos'];
  const keyLabels = {mercaderia:'Proveedor', rrhh:'RRHH', operacion:'Servicio',
    pasivos:'Crédito', socias:'Retiro', gestion:'Crédito', ingresos:'Ingreso'};
  const checked = document.querySelectorAll('#sac-sel-body input[type=checkbox]:checked:not(:disabled)');
  if (!checked.length) { notify('⚠ Selecciona al menos un ítem'); return; }
  const cambiosCfg = [];
  checked.forEach(cb => {
    const [secKey, itemId] = cb.value.split('|');
    const item = (state[secKey]||[]).find(x=>String(x.id)===itemId);
    if (!item) return;
    const wrap = cb.closest('div');
    const inp = wrap ? wrap.querySelector('.sac-sel-monto-inp') : null;
    const montoNuevo = Math.round(parseNumCL(String(inp && inp.value != null ? inp.value : item.amount), false) || 0);
    const montoPrev = Math.round(parseNumCL(String(item.amount != null ? item.amount : 0), false) || 0);
    if (montoNuevo !== montoPrev) cambiosCfg.push({ secKey, item, montoNuevo, montoPrev });
  });
  let aplicarDefinitivo = false;
  if (cambiosCfg.length) {
    aplicarDefinitivo = confirm(
      'Cambiaste el monto respecto al preset en ' + cambiosCfg.length + ' ítem(es).\n\n' +
      'Aceptar = guardar también en Configuración (permanente para próximas semanas).\n' +
      'Cancelar = solo esta semana en cargas (no modifica el preset).'
    );
  }
  pushUndo();
  let added = 0;
  checked.forEach(cb => {
    const [secKey, itemId] = cb.value.split('|');
    const item = (state[secKey]||[]).find(x=>String(x.id)===itemId);
    if (!item) return;
    const wrap = cb.closest('div');
    const inp = wrap ? wrap.querySelector('.sac-sel-monto-inp') : null;
    const montoNuevo = Math.round(parseNumCL(String(inp && inp.value != null ? inp.value : item.amount), false) || 0);
    if (aplicarDefinitivo && montoNuevo !== (Math.round(parseNumCL(String(item.amount != null ? item.amount : 0), false) || 0))) {
      item.amount = montoNuevo;
    }
    const itemCarga = {
      id:       'sc_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
      nombre:   item.name,
      cat:      keyLabels[secKey] || 'Otro',
      monto:    montoNuevo,
      montoReal: null,
      estado:   'nopagado',
      resp:     '',
      nota:     freqLabel(item.freq),
      _fixedId: secKey+'-'+item.id
    };
    sacTouchCarga(itemCarga);
    sacGetCargas().push(itemCarga);
    added++;
  });
  sacCloseSel();
  sacRenderCargas();
  sacCalcBalance();
  let msg = `✅ ${added} ítem${added!==1?'s':''} agregado${added!==1?'s':''} a la semana`;
  if (cambiosCfg.length && aplicarDefinitivo) msg += ' · Presets actualizados en Configuración';
  else if (cambiosCfg.length) msg += ' · Montos solo en esta semana (preset sin cambiar)';
  notify(msg);
}
