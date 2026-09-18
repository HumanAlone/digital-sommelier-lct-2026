const base = window.WINE_API_BASE?.replace(/\/$/, '') || '';

export const hasBackend = Boolean(base);
let localCatalog;
let authToken = sessionStorage.getItem('wine:auth-token') || '';

async function request(path, options) {
  const response = await fetch(`${base}${path}`, options);
  if (!response.ok) throw new Error(`API: ${response.status}`);
  return response.json();
}

function normalizeWine(wine) {
  if (!wine?.image_url || !base) return wine;
  return { ...wine, image_url: new URL(wine.image_url, `${base}/`).href };
}

export async function getWines() {
  if (!base) {
    if (!localCatalog) {
      const response = await fetch(new URL('./catalog.json', import.meta.url));
      if (!response.ok) throw new Error(`Каталог: ${response.status}`);
      localCatalog = await response.json();
    }
    return localCatalog;
  }
  const result = await request('/wines');
  return (Array.isArray(result) ? result : result.items).map(normalizeWine);
}

export async function getWine(id) {
  if (!base) return (await getWines()).find((wine) => wine.id === id) || null;
  return normalizeWine(await request(`/wines/${encodeURIComponent(id)}`));
}

export async function scanWine(image) {
  if (!base) return { wine_id: null, unavailable: true };
  const body = new FormData();
  body.append('image', image);
  return request('/scan', { method: 'POST', body });
}

async function authRequest(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(typeof data.detail === 'string' ? data.detail : `Ошибка сервера: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function startSession(path, fields) {
  const data = await authRequest(path, { method: 'POST', body: JSON.stringify(fields) });
  if (!data.access_token || !data.user?.id) throw new Error('Сервер вернул неполные данные аккаунта.');
  authToken = data.access_token;
  sessionStorage.setItem('wine:auth-token', authToken);
  return data.user;
}

export const registerUser = (fields) => startSession('/auth/register', fields);
export const loginUser = (fields) => startSession('/auth/login', fields);

export async function restoreUser() {
  if (!base || !authToken) return null;
  try { return await authRequest('/auth/me'); }
  catch { logoutUser(); return null; }
}

export function logoutUser() {
  authToken = '';
  sessionStorage.removeItem('wine:auth-token');
}
