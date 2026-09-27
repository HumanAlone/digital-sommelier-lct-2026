const configuredBase = typeof window.WINE_API_BASE === 'string' && window.WINE_API_BASE.trim() !== '';
const base = configuredBase ? window.WINE_API_BASE.replace(/\/$/, '') : '';

export const hasBackend = configuredBase;
let localCatalog;
const localImageUrls = window.WINE_LOCAL_IMAGE_MAP || {};

async function request(path, options) {
  const response = await fetch(`${base}${path}`, options);
  if (!response.ok) throw new Error(`API: ${response.status}`);
  return response.json();
}

function normalizeWine(wine) {
  const imageUrl = localImageUrls[wine?.id] || wine?.image_url;
  if (!imageUrl || !hasBackend) return { ...wine, image_url: imageUrl || '' };
  if (imageUrl.startsWith('./')) {
    return { ...wine, image_url: new URL(imageUrl, import.meta.url).href };
  }
  const apiRoot = new URL(base || '/', window.location.origin);
  return { ...wine, image_url: new URL(imageUrl, apiRoot).href };
}

export async function getWines() {
  if (!hasBackend) {
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
  if (!hasBackend) return (await getWines()).find((wine) => wine.id === id) || null;
  return normalizeWine(await request(`/wines/${encodeURIComponent(id)}`));
}

export async function predictWine(image) {
  if (!hasBackend) return { wine_id: null, unavailable: true };
  const body = new FormData();
  body.append('image', image);
  return request('/predict', { method: 'POST', body });
}
