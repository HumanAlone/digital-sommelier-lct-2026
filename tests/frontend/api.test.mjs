import test from 'node:test';
import assert from 'node:assert/strict';
import { apiHarness, wines } from './helpers.mjs';

test('local catalog is cached and missing wine returns null',async()=>{
  const h=apiHarness('',[{data:wines}]); await h.run('getWines()'); await h.run('getWines()');
  assert.equal(h.calls.length,1); assert.equal(await h.run("getWine('absent')"),null);
  assert.equal((await h.run("getWine('red')")).id,'red');
});
for(const data of [wines,{items:wines}]) test('remote catalog supports array/envelope and relative image URL',async()=>{
  const h=apiHarness('/api/',[{data}]); const result=await h.run('getWines()');
  assert.equal(h.calls[0][0],'/api/wines'); assert.equal(result[1].image_url,'http://localhost:8080/api/assets/white.webp');
  assert.equal(result[0].image_url,'');
});
test('scan posts multipart image without forcing Content-Type',async()=>{
  const h=apiHarness('/api',[{data:{slug:'red'}}]); await h.run("scanWine(new Blob(['image'],{type:'image/png'}))");
  const [url, options]=h.calls[0]; assert.equal(url,'/api/scan'); assert.equal(options.method,'POST');
  assert.equal(await options.body.get('image').text(),'image'); assert.equal(options.headers,undefined);
});
test('offline scan makes no network requests',async()=>{
  const h=apiHarness(''); assert.equal((await h.run('scanWine(null)')).unavailable,true); assert.equal(h.calls.length,0);
});
test('HTTP and network failures propagate',async()=>{
  for(const response of [{ok:false,status:503},new Error('offline')]) {
    const h=apiHarness('/api',[response]); await assert.rejects(h.run('getWines()'),/503|offline/);
  }
});
test('login persists token, restores user with bearer header, logout clears token',async()=>{
  const user={id:'u',name:'Соня'}; const h=apiHarness('/api',[{data:{user,access_token:'token'}},{data:user}]);
  await h.run("loginUser({email:'a@b.ru',password:'password'})"); await h.run('restoreUser()');
  assert.equal(h.calls[1][1].headers.Authorization,'Bearer token'); h.run('logoutUser()');
  assert.equal(h.context.sessionStorage.getItem('wine:auth-token'),null);
});
test('incomplete auth response cannot create session',async()=>{
  const h=apiHarness('/api',[{data:{access_token:'token'}}]);
  await assert.rejects(h.run('registerUser({})'),/неполные/); assert.equal(h.context.sessionStorage.getItem('wine:auth-token'),null);
});
test('expired session clears stored token',async()=>{
  const h=apiHarness('/api',[{ok:false,status:401,data:{detail:'expired'}}],{'wine:auth-token':'old'});
  assert.equal(await h.run('restoreUser()'),null); assert.equal(h.context.sessionStorage.getItem('wine:auth-token'),null);
});
test('auth error detail is shown to caller',async()=>{
  const h=apiHarness('/api',[{ok:false,status:409,data:{detail:'Email занят'}}]);
  await assert.rejects(h.run('registerUser({})'),/Email занят/);
});
