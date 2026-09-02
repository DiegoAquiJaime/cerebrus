/**
 * Pantalla movimiento rápido
 */

import { apiCall } from './api.js';
import { getSession } from './auth.js';
import { TIPOS_MOV, toast, fmtQty, debounce, todayInputDate, nowInputTime } from './ui.js';

let catalogos = null;
let stockMap = {};
let ccMantieneStock = {};

export async function initMovimientos() {
  const res = await apiCall('catalogos');
  catalogos = res;
  ccMantieneStock = {};
  (res.centros || []).forEach(c => {
    ccMantieneStock[c.codigo] = String(c.mantiene_stock).toUpperCase() === 'SI';
  });
  buildStockMap();
  renderTipoSelect();
  renderProductList('');
  initFechaHora();
  bindEvents();
  updateUsuarioBadge();
}

function initFechaHora() {
  const fecha = document.getElementById('mov-fecha');
  const hora = document.getElementById('mov-hora');
  if (fecha && !fecha.value) {
    fecha.value = todayInputDate();
    fecha.max = todayInputDate();
  }
  if (hora && !hora.value) hora.value = nowInputTime();
}

function updateUsuarioBadge() {
  const u = getSession();
  const el = document.getElementById('mov-usuario-badge');
  if (el && u) el.textContent = `${u.nombre} (${u.rol})`;
}

export async function refreshMovStock() {
  await buildStockMap();
  updateStockHint();
}

window.refreshMovStock = refreshMovStock;

function buildStockMap() {
  stockMap = {};
  return apiCall('stock', { cc: 'BODEGA' }).then(res => {
    (res.stock || []).forEach(s => {
      stockMap[s.sku] = s.cantidades?.BODEGA ?? 0;
    });
    updateStockHint();
  });
}

function renderTipoSelect() {
  const sel = document.getElementById('mov-tipo');
  if (!sel) return;
  sel.innerHTML = TIPOS_MOV.map(t =>
    `<option value="${t.id}" data-origen="${t.origen}" data-destino="${t.destino}">${t.label}</option>`
  ).join('');
  onTipoChange();
}

function onTipoChange() {
  const sel = document.getElementById('mov-tipo');
  const opt = sel?.selectedOptions[0];
  if (!opt) return;
  document.getElementById('mov-origen').textContent = opt.dataset.origen || '—';
  document.getElementById('mov-destino').textContent = opt.dataset.destino || '—';
  updateStockHint();
}

function getSelectedOrigen() {
  return document.getElementById('mov-tipo')?.selectedOptions[0]?.dataset.origen || '';
}

function renderProductList(q) {
  const list = document.getElementById('mov-productos');
  if (!list || !catalogos) return;
  const term = (q || '').toLowerCase().trim();
  const prods = (catalogos.productos || []).filter(p => {
    if (!term) return true;
    return String(p.nombre).toLowerCase().includes(term) || String(p.sku).toLowerCase().includes(term);
  }).slice(0, 40);

  if (!prods.length) {
    list.innerHTML = '<p class="text-slate-400 text-sm p-4 text-center">Sin productos. Agrega SKUs en la planilla Productos.</p>';
    return;
  }

  list.innerHTML = prods.map(p => {
    const stk = stockMap[p.sku];
    const stkTxt = stk != null ? fmtQty(stk) + ' ' + (p.unidad || '') : '—';
    const sel = document.getElementById('mov-sku')?.value === p.sku;
    return `<button type="button" data-sku="${p.sku}" class="mov-prod-btn w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-emerald-50 transition ${sel ? 'bg-emerald-50 ring-2 ring-emerald-500 ring-inset' : ''}">
      <div class="font-medium text-slate-800">${esc(p.nombre)}</div>
      <div class="text-xs text-slate-500 mt-0.5">${esc(p.sku)} · ${esc(p.categoria || '')} · Stock: ${stkTxt}</div>
    </button>`;
  }).join('');

  list.querySelectorAll('.mov-prod-btn').forEach(btn => {
    btn.addEventListener('click', () => selectProduct(btn.dataset.sku));
  });
}

function selectProduct(sku) {
  document.getElementById('mov-sku').value = sku;
  const p = (catalogos.productos || []).find(x => x.sku === sku);
  document.getElementById('mov-producto-nombre').textContent = p ? p.nombre : sku;
  updateStockHint();
  renderProductList(document.getElementById('mov-buscar')?.value || '');
}

function updateStockHint() {
  const sku = document.getElementById('mov-sku')?.value;
  const hint = document.getElementById('mov-stock-hint');
  if (!hint) return;
  if (!sku) { hint.textContent = ''; return; }

  const p = (catalogos.productos || []).find(x => x.sku === sku);
  const origen = getSelectedOrigen();
  const stkKey = origen === 'BODEGA' ? stockMap[sku] : null;

  if (origen && ccMantieneStock[origen]) {
    const disp = origen === 'BODEGA' ? (stkKey ?? 0) : null;
    if (disp != null) {
      hint.textContent = `Disponible en ${origen}: ${fmtQty(disp)} ${p?.unidad || ''}`;
      hint.className = disp <= 0
        ? 'text-xs text-red-500 mt-1 text-center font-medium'
        : 'text-xs text-slate-400 mt-1 text-center';
    } else {
      hint.textContent = `Origen ${origen} — el servidor validará stock`;
      hint.className = 'text-xs text-slate-400 mt-1 text-center';
    }
  } else {
    hint.textContent = stkKey != null ? `Stock bodega: ${fmtQty(stkKey)} ${p?.unidad || ''}` : '';
    hint.className = 'text-xs text-slate-400 mt-1 text-center';
  }
}

function bindEvents() {
  document.getElementById('mov-tipo')?.addEventListener('change', onTipoChange);
  document.getElementById('mov-buscar')?.addEventListener('input', debounce(e => renderProductList(e.target.value)));
  document.getElementById('mov-form')?.addEventListener('submit', onSubmit);
}

function buildFechaHoraIso() {
  const fecha = document.getElementById('mov-fecha')?.value;
  const hora = document.getElementById('mov-hora')?.value || '12:00';
  if (!fecha) return new Date().toISOString();
  const d = new Date(`${fecha}T${hora}`);
  if (isNaN(d.getTime())) throw new Error('Fecha u hora inválida');
  if (d.getTime() > Date.now() + 60000) throw new Error('No se puede registrar a futuro');
  return d.toISOString();
}

async function onSubmit(e) {
  e.preventDefault();
  const usuario = getSession();
  const sel = document.getElementById('mov-tipo');
  const opt = sel.selectedOptions[0];
  const sku = document.getElementById('mov-sku').value;
  const cantidad = parseFloat(String(document.getElementById('mov-cantidad').value).replace(',', '.'));
  const nota = document.getElementById('mov-nota').value.trim();
  const docRef = document.getElementById('mov-doc')?.value.trim() || '';
  const lote = document.getElementById('mov-lote')?.value.trim() || '';
  const origen = opt.dataset.origen;

  if (!sku) { toast('Selecciona un producto', 'err'); return; }
  if (!cantidad || cantidad <= 0) { toast('Cantidad inválida', 'err'); return; }

  if (origen && ccMantieneStock[origen] && origen === 'BODEGA') {
    const disp = stockMap[sku] ?? 0;
    if (cantidad > disp) {
      toast(`Stock insuficiente: hay ${fmtQty(disp)}`, 'err');
      return;
    }
  }

  let fechaHora;
  try {
    fechaHora = buildFechaHoraIso();
  } catch (err) {
    toast(err.message, 'err');
    return;
  }

  const btn = document.getElementById('mov-submit');
  btn.disabled = true;
  btn.textContent = 'Guardando…';

  try {
    await apiCall('movimiento', {
      tipo: sel.value,
      cc_origen: origen,
      cc_destino: opt.dataset.destino,
      sku,
      cantidad,
      nota,
      doc_ref: docRef,
      lote,
      fecha_hora: fechaHora,
      usuario: usuario?.nombre || '',
      usuario_id: usuario?.id || ''
    });
    toast('✓ Movimiento registrado', 'ok');
    document.getElementById('mov-cantidad').value = '';
    document.getElementById('mov-nota').value = '';
    document.getElementById('mov-doc').value = '';
    document.getElementById('mov-lote').value = '';
    initFechaHora();
    await buildStockMap();
    updateStockHint();
    if (window.refreshDashboard) window.refreshDashboard();
    if (window.invalidateHistorial) window.invalidateHistorial();
  } catch (err) {
    toast(err.message || 'Error al guardar', 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirmar movimiento';
  }
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
