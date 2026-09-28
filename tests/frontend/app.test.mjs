import test from 'node:test';
import assert from 'node:assert/strict';
import { appHarness, wines, storage } from './helpers.mjs';

test('dark theme toggles in settings, survives reload and switches back', async () => {
  const localStorage = storage();
  const h = await appHarness({ localStorage });
  h.run("go('settings')");
  assert.equal(h.context.document.documentElement.dataset.theme, 'light');
  await h.click({ action: 'toggle-theme' });
  assert.equal(h.context.document.documentElement.dataset.theme, 'dark');
  assert.match(h.app.innerHTML, /role="switch" aria-checked="true"/);
  const reloaded = await appHarness({ localStorage });
  assert.equal(reloaded.context.document.documentElement.dataset.theme, 'dark');
  await reloaded.click({ action: 'toggle-theme' });
  assert.equal(reloaded.context.document.documentElement.dataset.theme, 'light');
  assert.equal(JSON.parse(localStorage.getItem('wine:theme')), 'light');
});

test('theme remains usable when browser storage cannot be written', async () => {
  const h = await appHarness({ localStorage: { getItem() { throw Error('unavailable'); }, setItem() { throw Error('unavailable'); } } });
  await h.click({ action: 'toggle-theme' });
  assert.equal(h.context.document.documentElement.dataset.theme, 'dark');
});

for (const query of ['каберне', ' КАБЕРНЕ ', 'Юг', 'Крым', 'Шардоне']) {
  test(`search by name, winery, region or grape: ${query}`, async () => {
    const h = await appHarness(); h.state.query = query;
    const expected = query.trim().toLowerCase() === 'юг' ? 2 : 1;
    assert.equal(h.run('filteredWines().length'), expected);
  });
}
test('filters combine and reset clears search and pagination', async () => {
  const h = await appHarness(); Object.assign(h.state.filters, { category: 'Красное', grape: 'Мерло', region: 'Кубань', winery: 'Юг' });
  assert.equal(h.run('filteredWines()[0].id'), 'red2');
  h.state.query = 'missing'; assert.equal(h.run('filteredWines().length'), 0);
  await h.click({ action: 'reset-filters' });
  assert.equal(h.run('filteredWines().length'), 3); assert.equal(h.state.catalogLimit, 24);
});
test('pagination renders 24 then 48 records', async () => {
  const h = await appHarness({ getWines: async () => Array.from({length: 60}, (_,i) => ({...wines[0], id: String(i)})) });
  h.run("go('catalog')"); assert.equal((h.app.innerHTML.match(/class="wine-row"/g)||[]).length, 24);
  await h.click({ action: 'show-more' }); assert.equal((h.app.innerHTML.match(/class="wine-row"/g)||[]).length, 48);
});
test('favorites toggle, persist and survive reload', async () => {
  const localStorage = storage(); const h = await appHarness({ localStorage });
  await h.click({ action:'toggle-favorite', id:'red' });
  const reloaded = await appHarness({ localStorage }); assert.equal(reloaded.state.favorites[0], 'red');
  await reloaded.click({ action:'toggle-favorite', id:'red' }); assert.equal(localStorage.getItem('wine:v3:favorites'), '[]');
});
test('corrupt storage falls back to empty lists', async () => {
  const h = await appHarness({localStorage:storage({'wine:v3:favorites':'{broken'})});
  assert.equal(h.state.favorites.length, 0);
});
test('history deduplicates, orders most recent first and caps at 40', async () => {
  const h = await appHarness(); for(let i=0;i<45;i++) h.run(`openWine('${i}')`);
  h.run("openWine('10')"); assert.equal(h.state.history.length,40); assert.equal(h.state.history[0],'10');
  assert.equal(h.state.history.filter(id=>id==='10').length,1);
});
test('comparison keeps last two wines and supports removal', async () => {
  const h = await appHarness(); for(const id of ['red','white','red2']) await h.click({action:'toggle-compare',id});
  assert.equal(JSON.stringify(h.state.compare), '["white","red2"]');
  await h.click({action:'toggle-compare',id:'white'}); assert.equal(h.state.compare.length,1);
});
test('collection creation trims names, ignores empty input and avoids duplicate wines', async () => {
  const answers = ['  Подарки  ', '   ', 'Каберне', 'Каберне', 'несуществующее'];
  const h = await appHarness({prompt:()=>answers.shift()});
  await h.click({action:'new-collection'}); await h.click({action:'new-collection'});
  assert.equal(h.state.collections.length,1); assert.equal(h.state.collections[0].name,'Подарки');
  const id=h.state.collections[0].id;
  for(let i=0;i<3;i++) await h.click({action:'add-to-collection',id});
  assert.equal(JSON.stringify(h.state.collections[0].wineIds),'["red"]');
});
test('diary saves valid rating and escapes user text in rendered HTML', async () => {
  const answers=['Каберне','4','<img src=x onerror=alert(1)>'];
  const h=await appHarness({prompt:()=>answers.shift()}); await h.click({action:'new-diary'});
  assert.equal(h.state.diary[0].rating,4); h.run("go('diary')");
  assert.match(h.app.innerHTML,/&lt;img/); assert.doesNotMatch(h.app.innerHTML,/<img src=x/);
});
for(const rating of ['0','6','abc','2.5',null]) test(`diary rejects invalid rating ${rating}`,async()=>{
  const answers=['Каберне',rating,'note']; const h=await appHarness({prompt:()=>answers.shift()});
  await h.click({action:'new-diary'}); assert.equal(h.state.diary.length,0);
});
test('profile is available without authentication controls',async()=>{
  const h=await appHarness(); h.run("go('profile')");
  assert.match(h.app.innerHTML,/Мой профиль/);
  assert.doesNotMatch(h.app.innerHTML,/Регистрация|Вход|Выйти из аккаунта|auth-actions/);
});

test('denied camera leaves file upload available and capture disabled',async()=>{
  const h=await appHarness({navigator:{mediaDevices:{getUserMedia:async()=>{throw Error('denied');}}}});
  h.elements['#capture-button']={}; h.elements['#camera-message']={}; h.elements['#camera-retry']={};
  h.state.page='scanner'; await h.run('startCamera()');
  assert.equal(h.state.cameraStatus,'error'); assert.equal(h.elements['#capture-button'].disabled,true);
  assert.match(h.run('scanner()'),/Загрузить из галереи/);
});
test('camera acquired after navigation is stopped',async()=>{
  let resolve, stopped=0; const h=await appHarness({navigator:{mediaDevices:{getUserMedia:()=>new Promise(r=>{resolve=r;})}}});
  h.state.page='scanner'; const pending=h.run('startCamera()'); h.run("go('home')");
  resolve({getTracks:()=>[{stop:()=>stopped++}]}); await pending; assert.equal(stopped,1);
});
for(const response of [{slug:'red',confidence:.92,gap:.2},{wine_id:'white',confidence:.78,gap:.12}]) test(`prediction opens matching card when confident: ${JSON.stringify(response)}`,async()=>{
  const h=await appHarness({hasBackend:true,predictWine:async()=>response}); h.state.photo=new Blob(['image']);
  await h.click({action:'recognize'}); assert.equal(h.state.page,'result'); assert.equal(h.state.selectedId,response.slug||response.wine_id);
});
test('low scores still open the model chosen slug without loading alternatives',async()=>{
  const response={slug:'red',confidence:.54,gap:.03,top1_slug:'red',top2_slug:'red2',top3_slug:'white'};
  const h=await appHarness({hasBackend:true,predictWine:async()=>response}); h.state.photo=new Blob(['image']);
  await h.click({action:'recognize'});
  assert.equal(h.state.page,'result');
  assert.equal(h.state.selectedId,'red');
  assert.doesNotMatch(h.app.innerHTML,/Нашли несколько похожих этикеток/);
});
for(const predictWine of [async()=>({slug:''}),async()=>{throw Error('offline');}]) test('failed scan displays recovery screen',async()=>{
  const h=await appHarness({hasBackend:true,predictWine}); h.state.photo=new Blob(['image']);
  await h.click({action:'recognize'}); assert.equal(h.state.page,'notfound'); assert.match(h.app.innerHTML,/Попробовать другое фото/);
});
test('similar wines exclude selected wine and sommelier respects selected color',async()=>{
  const h=await appHarness(); assert.equal(h.run("similarWines(wineById('red'))[0].id"),'red2');
  Object.assign(h.state.sommelier,{dish:'fish',category:'Белое',mood:'classic'}); h.run('runSommelier()');
  assert.equal(h.state.sommelierResults.length,1); assert.equal(h.state.sommelierResults[0].id,'white');
});
