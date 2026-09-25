import test from 'node:test';
import assert from 'node:assert/strict';
import { appHarness, wines, storage } from './helpers.mjs';

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
test('guest profile shows login and registration; authenticated profile shows logout',async()=>{
  const h=await appHarness(); h.run("go('profile')"); assert.match(h.app.innerHTML,/Регистрация/);
  h.state.user={id:'u',name:'Соня'}; h.run('render()'); assert.match(h.app.innerHTML,/Выйти из аккаунта/);
  assert.doesNotMatch(h.app.innerHTML,/class="auth-actions"/);
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
for(const response of [{slug:'red'},{wine_id:'white'}]) test(`scan opens matching card: ${JSON.stringify(response)}`,async()=>{
  const h=await appHarness({hasBackend:true,scanWine:async()=>response}); h.state.photo=new Blob(['image']);
  await h.click({action:'recognize'}); assert.equal(h.state.page,'result'); assert.equal(h.state.selectedId,response.slug||response.wine_id);
});
for(const scanWine of [async()=>({slug:''}),async()=>{throw Error('offline');}]) test('failed scan displays recovery screen',async()=>{
  const h=await appHarness({hasBackend:true,scanWine}); h.state.photo=new Blob(['image']);
  await h.click({action:'recognize'}); assert.equal(h.state.page,'notfound'); assert.match(h.app.innerHTML,/Попробовать другое фото/);
});
test('similar wines exclude selected wine and sommelier respects selected color',async()=>{
  const h=await appHarness(); assert.equal(h.run("similarWines(wineById('red'))[0].id"),'red2');
  Object.assign(h.state.sommelier,{dish:'fish',category:'Белое',mood:'classic'}); h.run('runSommelier()');
  assert.equal(h.state.sommelierResults.length,1); assert.equal(h.state.sommelierResults[0].id,'white');
});
