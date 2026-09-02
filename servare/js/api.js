/**
 * Cliente HTTP — Bodega Aquí Jaime
 */

const CFG_KEY = 'bodegaAquiJaimeCfg';

export function getConfig() {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (!raw) return { url: '', token: '' };
    return JSON.parse(raw);
  } catch {
    return { url: '', token: '' };
  }
}

export function saveConfig(url, token) {
  const cfg = { url: String(url || '').replace(/\/$/, ''), token: String(token || '').trim() };
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  return cfg;
}

export function isConfigured() {
  const { url, token } = getConfig();
  return !!(url && token && url.includes('script.google.com'));
}

export async function apiCall(accion, payload = {}) {
  const { url, token } = getConfig();
  if (!url || !token) throw new Error('Configura URL y token en Ajustes');

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ accion, token, ...payload })
  });

  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error('Respuesta inválida del servidor');
  }
  if (!json.ok) throw new Error(json.error || 'Error desconocido');
  return json;
}

export async function testConnection() {
  const { url } = getConfig();
  if (!url) throw new Error('Falta URL');
  const res = await fetch(url + '?action=ping&_=' + Date.now());
  return res.json();
}
