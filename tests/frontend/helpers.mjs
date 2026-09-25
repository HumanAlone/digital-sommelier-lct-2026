import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export const wines = [
  { id: 'red', name: 'Каберне', category: 'Красное', region: 'Кубань', winery: 'Юг', grapes: ['Каберне'], description: 'Описание', image_url: '' },
  { id: 'white', name: 'Шардоне', category: 'Белое', region: 'Крым', winery: 'Море', grapes: ['Шардоне'], description: 'Описание', image_url: './assets/white.webp' },
  { id: 'red2', name: 'Мерло', category: 'Красное', region: 'Кубань', winery: 'Юг', grapes: ['Мерло'], description: 'Описание', image_url: '' },
];
export function storage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,String(v)), removeItem: k => data.delete(k) };
}
export async function appHarness(overrides = {}) {
  const events = {};
  const elements = {};
  const app = { innerHTML: '', addEventListener: (name, fn) => { events[name] = fn; } };
  const context = vm.createContext({
    console, URL, File, Blob,
    window: { scrollTo() {} }, navigator: {},
    document: { querySelector: s => s === '#app' ? app : elements[s] ?? null, addEventListener() {} },
    localStorage: storage(), prompt: () => null,
    hasBackend: false, getWines: async () => structuredClone(wines), restoreUser: async () => null,
    getWine: async () => null, scanWine: async () => ({ slug: '' }), logoutUser() {},
    registerUser: async () => null, loginUser: async () => null,
    ...overrides,
  });
  // Execute the actual application; only its API imports and browser services are substituted.
  const source = readFileSync(new URL('../../frontend/app.js', import.meta.url), 'utf8');
  vm.runInContext(source.replace(/^import .*?;\r?\n/, ''), context);
  await new Promise(resolve => setImmediate(resolve));
  const run = code => vm.runInContext(code, context);
  return { context, elements, app, run, state: run('state'), events,
    click: dataset => events.click({ target: { closest: () => ({ dataset }) } }),
  };
}
export function apiHarness(base = '/api', responses = [], initial = {}) {
  const calls = [];
  const context = vm.createContext({ URL, FormData, Blob,
    window: { WINE_API_BASE: base, location: { origin: 'http://localhost:8080' } },
    sessionStorage: storage(initial),
    fetch: async (...args) => {
      calls.push(args);
      const next = responses.shift();
      if (next instanceof Error) throw next;
      if (!next) throw new Error('Unexpected fetch');
      return { ok: true, json: async () => next.data, ...next };
    },
  });
  const source = readFileSync(new URL('../../frontend/api.js', import.meta.url), 'utf8')
    .replace(/^export /gm, '').replaceAll('import.meta.url', "'http://localhost:8080/api.js'");
  vm.runInContext(source, context);
  return { calls, context, run: code => vm.runInContext(code, context) };
}
