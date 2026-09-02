/**
 * Autenticación por PIN — sesión diaria
 */

import { apiCall } from './api.js';

const SESSION_KEY = 'bodegaAquiJaimeSession';

export function getSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    const today = new Date().toDateString();
    if (s.date !== today) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s.usuario;
  } catch {
    return null;
  }
}

export function setSession(usuario) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({
    usuario,
    date: new Date().toDateString()
  }));
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export async function loginWithPin(pin) {
  const res = await apiCall('login', { pin });
  setSession(res.usuario);
  return res.usuario;
}

export function requireAuth() {
  const u = getSession();
  if (!u) {
    window.location.href = 'index.html';
    return null;
  }
  return u;
}
