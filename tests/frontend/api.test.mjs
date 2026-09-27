import test from 'node:test';
import assert from 'node:assert/strict';
import { apiHarness, wines } from './helpers.mjs';
import { readFileSync } from 'node:fs';

test('backend catalog and detail use local matched photograph', async () => {
  const wine = {...wines[0], image_url: 'https://invalid.example/missing.webp'};
  const h = apiHarness('/', [{data:{items:[wine]}}, {data:wine}]);
  h.context.window.WINE_LOCAL_IMAGE_MAP.red = './assets/wines/verified.webp';
  const catalog = await h.run('getWines()');
  const detail = await h.run("getWine('red')");
  assert.equal(catalog[0].image_url, 'http://localhost:8080/assets/wines/verified.webp');
  assert.equal(detail.image_url, catalog[0].image_url);
});

test('configured backend receives wines and predict without an API prefix', async () => {
  const config = readFileSync(new URL('../../frontend/config.js', import.meta.url), 'utf8');
  const settings = {};
  Function('window', config)(settings);
  const h = apiHarness(settings.WINE_API_BASE, [{data:wines}, {data:wines[0]}, {data:{slug:'red'}}]);
  h.context.window.location.origin = 'https://wine.example';
  await h.run('getWines()');
  await h.run("getWine('red')");
  await h.run("predictWine(new Blob(['photo']))");
  const urls = h.calls.map(([path]) => new URL(path, h.context.window.location.origin));
  assert.deepEqual(urls.map(url => url.pathname), ['/wines', '/wines/red', '/predict']);
  const origin = new URL(settings.WINE_API_BASE, h.context.window.location.origin).origin;
  assert.ok(urls.every(url => url.origin === origin));
});

test('local catalog is cached and missing wine returns null',async()=>{
  const h=apiHarness('',[{data:wines}]); await h.run('getWines()'); await h.run('getWines()');
  assert.equal(h.calls.length,1); assert.equal(await h.run("getWine('absent')"),null);
  assert.equal((await h.run("getWine('red')")).id,'red');
});
for(const data of [wines,{items:wines}]) test('remote catalog supports array/envelope and relative image URL',async()=>{
  const h=apiHarness('/',[{data}]); const result=await h.run('getWines()');
  assert.equal(h.calls[0][0],'/wines'); assert.equal(result[1].image_url,'http://localhost:8080/assets/white.webp');
  assert.equal(result[0].image_url,'');
});
test('predict posts multipart image without forcing Content-Type',async()=>{
  const h=apiHarness('/',[{data:{slug:'red'}}]); await h.run("predictWine(new Blob(['image'],{type:'image/png'}))");
  const [url, options]=h.calls[0]; assert.equal(url,'/predict'); assert.equal(options.method,'POST');
  assert.equal(await options.body.get('image').text(),'image'); assert.equal(options.headers,undefined);
});
test('offline predict makes no network requests',async()=>{
  const h=apiHarness(''); assert.equal((await h.run('predictWine(null)')).unavailable,true); assert.equal(h.calls.length,0);
});
test('HTTP and network failures propagate',async()=>{
  for(const response of [{ok:false,status:503},new Error('offline')]) {
    const h=apiHarness('/',[response]); await assert.rejects(h.run('getWines()'),/503|offline/);
  }
});
