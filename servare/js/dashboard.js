/**
 * Dashboard — stock bajo mínimo, movimientos del día
 */

import { apiCall } from './api.js';
import { fmtQty } from './ui.js';

export async function initDashboard() {
  window.refreshDashboard = loadDashboard;
  await loadDashboard();
}

async function loadDashboard() {
  const el = document.getElementById('dash-content');
  if (!el) return;
  try {
    const res = await apiCall('dashboard', {});
    el.innerHTML = `
      <div class="grid grid-cols-2 gap-3 mb-6">
        <div class="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
          <div class="text-2xl font-bold text-emerald-600">${res.movimientos_hoy || 0}</div>
          <div class="text-xs text-slate-500 mt-1">Movimientos hoy</div>
        </div>
        <div class="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
          <div class="text-2xl font-bold text-slate-800">${res.productos_activos || 0}</div>
          <div class="text-xs text-slate-500 mt-1">Productos activos</div>
        </div>
      </div>
      <h3 class="text-sm font-semibold text-slate-700 mb-2">Stock bajo mínimo</h3>
      ${renderBajoMinimo(res.bajo_minimo || [])}
    `;
  } catch (err) {
    el.innerHTML = `<p class="text-red-500 text-sm">${err.message}</p>`;
  }
}

function renderBajoMinimo(items) {
  if (!items.length) {
    return '<p class="text-slate-400 text-sm bg-white rounded-xl p-4 border border-slate-100">Todo en orden — sin alertas de stock.</p>';
  }
  return `<div class="space-y-2">${items.map(p => `
    <div class="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex justify-between items-center">
      <div>
        <div class="font-medium text-slate-800 text-sm">${esc(p.nombre)}</div>
        <div class="text-xs text-slate-500">${esc(p.sku)}</div>
      </div>
      <div class="text-right text-sm">
        <span class="text-amber-700 font-bold">${fmtQty(p.stock)}</span>
        <span class="text-slate-400"> / ${fmtQty(p.minimo)}</span>
      </div>
    </div>
  `).join('')}</div>`;
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
