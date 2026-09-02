/**
 * Utilidades UI — formato Chile
 */

export function fmtCLP(n) {
  const v = Math.round(Number(n) || 0);
  return '$' + v.toLocaleString('es-CL');
}

export function fmtQty(n) {
  const v = Number(n) || 0;
  if (Number.isInteger(v)) return String(v);
  return v.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 3 });
}

export function fmtFecha(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt)) return '—';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = dt.getFullYear();
  const hh = String(dt.getHours()).padStart(2, '0');
  const mi = String(dt.getMinutes()).padStart(2, '0');
  return `${dd}-${mm}-${yyyy} ${hh}:${mi}`;
}

export function todayInputDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function nowInputTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function daysAgoInputDate(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function labelTipo(id) {
  const t = TIPOS_MOV.find(x => x.id === id);
  return t ? t.label : (id || '—');
}

export function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;
  const colors = {
    info: 'bg-slate-800',
    ok: 'bg-emerald-600',
    err: 'bg-red-600'
  };
  el.className = `fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-white text-sm font-medium shadow-lg transition-opacity ${colors[type] || colors.info}`;
  el.textContent = msg;
  el.classList.remove('opacity-0', 'pointer-events-none');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('opacity-0', 'pointer-events-none'), 3200);
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export const TIPOS_MOV = [
  { id: 'ENTRADA_COMPRA', label: 'Entrada compra', origen: 'PROV', destino: 'BODEGA' },
  { id: 'ENTRADA_OTROS', label: 'Otra entrada', origen: 'OTROS_IN', destino: 'BODEGA' },
  { id: 'TRASPASO', label: 'Traspaso interno', origen: 'BODEGA', destino: 'BOD_INTERNA' },
  { id: 'SALIDA_COCINA', label: 'Salida a cocina', origen: 'BODEGA', destino: 'COCINA' },
  { id: 'SALIDA_COMEDOR', label: 'Salida a comedor', origen: 'BODEGA', destino: 'COMEDOR' },
  { id: 'PREELAB_SALIDA', label: 'A preelaboración', origen: 'BODEGA', destino: 'PREELAB' },
  { id: 'DEVOLUCION', label: 'Devolución a bodega', origen: 'COCINA', destino: 'BODEGA' },
  { id: 'MERMA', label: 'Merma', origen: 'BODEGA', destino: 'MERMA' }
];
