/**
 * Pantalla movimiento rápido
 */

import { apiCall } from './api.js';
import { getSession } from './auth.js';
import { TIPOS_MOV, toast, fmtQty, debounce } from './ui.js';

let catalogos = null;
let stockMap = {};

export async function initMovimientos() {
  const res = await apiCall('catalogos');
  catalogos = res;
  buildStockMap();
  renderTipoSelect();
  renderProductList('');
  bindEvents();
}

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
  if (!hint || !sku) { if (hint) hint.textContent = ''; return; }
  const p = (catalogos.productos || []).find(x => x.sku === sku);
  const stk = stockMap[sku];
  hint.textContent = stk != null ? `Disponible en bodega: ${fmtQty(stk)} ${p?.unidad || ''}` : '';
}

function bindEvents() {
  document.getElementById('mov-tipo')?.addEventListener('change', onTipoChange);
  document.getElementById('mov-buscar')?.addEventListener('input', debounce(e => renderProductList(e.target.value)));
  document.getElementById('mov-form')?.addEventListener('submit', onSubmit);
}

async function onSubmit(e) {
  e.preventDefault();
  const usuario = getSession();
  const sel = document.getElementById('mov-tipo');
  const opt = sel.selectedOptions[0];
  const sku = document.getElementById('mov-sku').value;
  const cantidad = parseFloat(String(document.getElementById('mov-cantidad').value).replace(',', '.'));
  const nota = document.getElementById('mov-nota').value.trim();

  if (!sku) { toast('Selecciona un producto', 'err'); return; }
  if (!cantidad || cantidad <= 0) { toast('Cantidad inválida', 'err'); return; }

  const btn = document.getElementById('mov-submit');
  btn.disabled = true;
  btn.textContent = 'Guardando…';

  try {
    await apiCall('movimiento', {
      tipo: sel.value,
      cc_origen: opt.dataset.origen,
      cc_destino: opt.dataset.destino,
      sku,
      cantidad,
      nota,
      usuario: usuario?.nombre || ''
    });
    toast('✓ Movimiento registrado', 'ok');
    document.getElementById('mov-cantidad').value = '';
    document.getElementById('mov-nota').value = '';
    await buildStockMap();
    updateStockHint();
    if (window.refreshDashboard) window.refreshDashboard();
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
