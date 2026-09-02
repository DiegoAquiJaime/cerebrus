/**
 * Historial de movimientos — consulta y anulación (ADMIN)
 */

import { apiCall } from './api.js';
import { getSession } from './auth.js';
import { fmtFecha, fmtQty, labelTipo, toast, daysAgoInputDate, todayInputDate } from './ui.js';

let loaded = false;

export function initHistorial() {
  const desde = document.getElementById('hist-desde');
  const hasta = document.getElementById('hist-hasta');
  if (desde && !desde.value) desde.value = daysAgoInputDate(7);
  if (hasta && !hasta.value) hasta.value = todayInputDate();

  document.getElementById('hist-filtrar')?.addEventListener('click', () => loadHistorial(true));
  document.getElementById('hist-anular-cancel')?.addEventListener('click', closeAnularModal);
  document.getElementById('hist-anular-form')?.addEventListener('submit', onAnularSubmit);
}

export async function loadHistorial(force = false) {
  if (loaded && !force) return;
  const el = document.getElementById('hist-content');
  if (!el) return;

  el.innerHTML = '<p class="text-slate-400 text-sm text-center py-6">Cargando…</p>';

  try {
    const res = await apiCall('movimientos_list', {
      desde: document.getElementById('hist-desde')?.value || '',
      hasta: document.getElementById('hist-hasta')?.value || '',
      limite: 80
    });
    loaded = true;
    renderHistorial(res.movimientos || []);
  } catch (err) {
    el.innerHTML = `<p class="text-red-500 text-sm">${esc(err.message)}</p>`;
  }
}

function renderHistorial(items) {
  const el = document.getElementById('hist-content');
  const session = getSession();
  const isAdmin = session?.rol === 'ADMIN';

  if (!items.length) {
    el.innerHTML = '<p class="text-slate-400 text-sm bg-white rounded-xl p-4 border border-slate-100">Sin movimientos en este período.</p>';
    return;
  }

  el.innerHTML = items.map(m => {
    const meta = [
      m.usuario ? `👤 ${esc(m.usuario)}` : '',
      m.doc_ref ? `📄 ${esc(m.doc_ref)}` : '',
      m.lote ? `Lote ${esc(m.lote)}` : '',
      m.nota ? esc(m.nota) : ''
    ].filter(Boolean).join(' · ');

    const anularBtn = isAdmin
      ? `<button type="button" class="hist-anular text-xs text-red-600 font-medium px-2 py-1 rounded-lg hover:bg-red-50" data-id="${esc(m.id)}">Anular</button>`
      : '';

    return `<article class="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
      <div class="flex justify-between items-start gap-2">
        <div class="min-w-0 flex-1">
          <div class="text-xs text-slate-400">${fmtFecha(m.fecha_hora)}</div>
          <div class="font-medium text-slate-800 text-sm mt-0.5 truncate">${esc(m.nombre)}</div>
          <div class="text-xs text-slate-500">${esc(m.sku)}</div>
        </div>
        <div class="text-right shrink-0">
          <div class="text-sm font-bold text-emerald-700">${fmtQty(m.cantidad)}</div>
          ${anularBtn}
        </div>
      </div>
      <div class="mt-2 text-xs text-slate-600">
        <span class="inline-block bg-slate-100 rounded px-1.5 py-0.5 mr-1">${esc(labelTipo(m.tipo))}</span>
        ${esc(m.cc_origen)} → ${esc(m.cc_destino)}
      </div>
      ${meta ? `<div class="mt-1.5 text-xs text-slate-500 leading-relaxed">${meta}</div>` : ''}
      <div class="mt-1 text-[10px] text-slate-300 font-mono">${esc(m.id)}</div>
    </article>`;
  }).join('');

  el.querySelectorAll('.hist-anular').forEach(btn => {
    btn.addEventListener('click', () => openAnularModal(btn.dataset.id));
  });
}

function openAnularModal(movId) {
  document.getElementById('hist-anular-id').value = movId;
  document.getElementById('hist-anular-id-label').textContent = movId;
  document.getElementById('hist-anular-motivo').value = '';
  document.getElementById('hist-anular-modal').classList.remove('hidden');
}

function closeAnularModal() {
  document.getElementById('hist-anular-modal')?.classList.add('hidden');
}

async function onAnularSubmit(e) {
  e.preventDefault();
  const session = getSession();
  const movId = document.getElementById('hist-anular-id').value;
  const motivo = document.getElementById('hist-anular-motivo').value.trim();
  if (!motivo) { toast('Indica el motivo de anulación', 'err'); return; }

  const btn = document.getElementById('hist-anular-submit');
  btn.disabled = true;
  btn.textContent = 'Anulando…';

  try {
    await apiCall('anular', {
      movimiento_id: movId,
      motivo,
      usuario: session?.nombre || '',
      rol: session?.rol || ''
    });
    toast('Movimiento anulado', 'ok');
    closeAnularModal();
    loaded = false;
    await loadHistorial(true);
    if (window.refreshDashboard) window.refreshDashboard();
    if (window.refreshMovStock) window.refreshMovStock();
  } catch (err) {
    toast(err.message || 'Error al anular', 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirmar anulación';
  }
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
