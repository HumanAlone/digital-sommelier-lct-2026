import { getWines, getWine, scanWine, hasBackend, registerUser, loginUser, restoreUser, logoutUser } from './api.js';

const app = document.querySelector('#app');
const saved = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const persist = (key, value) => localStorage.setItem(key, JSON.stringify(value));

const state = {
  page: 'home', previousPage: 'home', wines: [], selectedId: null, loading: true, loadError: false,
  photo: null, previewUrl: null, cameraStatus: 'idle', foundByScan: false,
  query: '', catalogLimit: 24, filtersOpen: false,
  filters: { category: '', region: '', winery: '', grape: '' },
  favorites: saved('wine:v3:favorites', saved('wine:v2:favorites', [])),
  history: saved('wine:v3:history', saved('wine:v2:history', [])),
  collections: saved('wine:v3:collections', saved('wine:v2:collections', [])),
  diary: saved('wine:v3:diary', saved('wine:v2:diary', [])),
  compare: saved('wine:v3:compare', []), selectedCollection: null,
  sommelier: { dish: '', category: '', mood: '' }, sommelierResults: [], user: null,
};

const icons = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-7h6v7"/>',
  catalog: '<path d="M4 4h6v7H4zM14 4h6v7h-6zM4 15h6v5H4zM14 15h6v5h-6z"/>',
  scan: '<path d="M5 7V5a2 2 0 0 1 2-2h2m6 0h2a2 2 0 0 1 2 2v2M5 17v2a2 2 0 0 0 2 2h2m6 0h2a2 2 0 0 0 2-2v-2"/><path d="M8 9h8v6H8z"/>',
  heart: '<path d="M20.8 8.5c0 4.5-8.8 10.4-8.8 10.4S3.2 13 3.2 8.5a4.6 4.6 0 0 1 8.8-1.8 4.6 4.6 0 0 1 8.8 1.8Z"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/>',
  back: '<path d="m15 18-6-6 6-6"/>', chevron: '<path d="m9 18 6-6-6-6"/>',
  camera: '<path d="M4 7h3l2-2h6l2 2h3v12H4z"/><circle cx="12" cy="13" r="3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', close: '<path d="M5 5l14 14M19 5 5 19"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  compare: '<path d="M8 4v16M16 4v16M4 8l4-4 4 4M12 16l4 4 4-4"/>',
  sparkles: '<path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z"/>',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15"/>',
};
const icon = (name, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const wineById = (id) => state.wines.find((wine) => wine.id === id);
const isFavorite = (id) => state.favorites.includes(id);
const unique = (field) => [...new Set(state.wines.map((wine) => wine[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
const uniqueGrapes = () => [...new Set(state.wines.flatMap((wine) => wine.grapes || []))].sort((a, b) => a.localeCompare(b, 'ru'));
const wineType = (wine) => wine?.category || 'Вино';
const image = (wine, className = '') => wine?.image_url
  ? `<img class="wine-image ${className}" src="${esc(wine.image_url)}" alt="Бутылка ${esc(wine.name)}" loading="lazy" decoding="async">`
  : `<div class="wine-placeholder ${className}" aria-label="Нет фотографии"></div>`;
const countWord = (count) => `${count} ${count % 10 === 1 && count % 100 !== 11 ? 'вино' : [2,3,4].includes(count % 10) && ![12,13,14].includes(count % 100) ? 'вина' : 'вин'}`;

function header({ back = false, title = '' } = {}) {
  return `<header class="topbar"><div class="brand-line">${back ? `<button class="icon-button back-button" data-action="back" aria-label="Назад">${icon('back')}</button>` : ''}<button class="brand" data-page="home" aria-label="Своё Вино"><span class="brand-mark">СВ</span><span>СВОЁ ВИНО</span></button></div><button class="account-button" data-page="profile" aria-label="Личный кабинет">${icon('user', 18)}</button></header>${title ? `<div class="title-block"><span class="eyebrow">СВОЁ ВИНО</span><h1>${esc(title)}</h1></div>` : ''}`;
}

function nav() {
  const items = [['home','Главная','home'],['catalog','Каталог','catalog'],['scanner','Сканер','scan'],['favorites','Избранное','heart'],['profile','Профиль','user']];
  const profilePages = ['profile','register','login','history','collections','collectionDetail','diary','taste','settings'];
  return `<nav class="bottom-nav" aria-label="Основная навигация">${items.map(([page,label,glyph]) => {
    const active = state.page === page || (page === 'profile' && profilePages.includes(state.page));
    return `<button data-page="${page}" class="nav-item ${active ? 'active' : ''}" ${active ? 'aria-current="page"' : ''}>${icon(glyph, 20)}<span>${label}</span></button>`;
  }).join('')}</nav>`;
}

function wineCard(wine, compact = false) {
  return `<article class="wine-card ${compact ? 'compact' : ''}"><button class="wine-card-main" data-wine="${esc(wine.id)}">${image(wine)}<span class="wine-card-copy"><small>${esc(wineType(wine))}</small><strong>${esc(wine.name)}</strong><span>${esc(wine.winery || wine.region || '')}</span></span></button><button class="card-heart ${isFavorite(wine.id) ? 'active' : ''}" data-action="toggle-favorite" data-id="${esc(wine.id)}" aria-label="${isFavorite(wine.id) ? 'Убрать из избранного' : 'В избранное'}">${icon('heart', 18)}</button></article>`;
}

function wineRow(wine) {
  return `<article class="wine-row"><button class="wine-row-main" data-wine="${esc(wine.id)}">${image(wine, 'row-image')}<span><small>${esc(wineType(wine))}</small><strong>${esc(wine.name)}</strong><em>${esc(wine.winery || wine.region || '')}</em></span></button><button class="compare-check ${state.compare.includes(wine.id) ? 'active' : ''}" data-action="toggle-compare" data-id="${esc(wine.id)}" aria-label="Добавить к сравнению">${icon('compare', 17)}</button></article>`;
}
const sectionHead = (title, action = '', label = '') => `<div class="section-heading"><div><span class="eyebrow">СВОЁ ВИНО</span><h2>${title}</h2></div>${action ? `<button class="text-button" data-${action.includes(':') ? action.split(':')[0] : 'page'}="${action.includes(':') ? action.split(':')[1] : action}">${label || 'Смотреть все'} ${icon('chevron', 14)}</button>` : ''}</div>`;
const empty = (text) => `<div class="empty-box"><span class="empty-grape">◌</span><p>${esc(text)}</p></div>`;

function home() {
  const featured = state.wines.slice(0, 6);
  const regions = unique('region').slice(0, 4);
  return `${header()}<section class="home-hero"><div class="hero-copy"><span class="eyebrow light">ВИНО С ХАРАКТЕРОМ</span><h1>Открой культуру<br>российского вина</h1><p>Наведите камеру на этикетку — мы найдём бутылку и расскажем о ней.</p></div><div class="hero-actions"><button class="hero-primary" data-page="scanner">${icon('scan',19)} Сканировать этикетку</button><button class="hero-secondary" data-page="catalog">Открыть каталог</button></div></section>
  <section class="quick-grid"><button data-page="sommelier"><span>${icon('sparkles',23)}</span><strong>Цифровой сомелье</strong><small>Подбор за минуту</small></button><button data-page="taste"><span>${icon('user',23)}</span><strong>Паспорт вкуса</strong><small>Ваши предпочтения</small></button></section>
  <section class="section-block">${sectionHead('Свои вина','catalog','Все вина')}<div class="wine-carousel">${featured.map((wine) => wineCard(wine, true)).join('')}</div></section>
  <section class="region-section">${sectionHead('Винодельческие регионы')}<p class="section-lead">Знакомимся с регионами и их характером</p><div class="region-grid">${regions.map((region, index) => `<button class="region-card region-${index + 1}" data-filter-region="${esc(region)}"><span>${index + 1 < 10 ? `0${index + 1}` : index + 1}</span><strong>${esc(region)}</strong><small>${countWord(state.wines.filter((wine) => wine.region === region).length)}</small></button>`).join('')}</div></section>
  <section class="feature-banner"><span>${icon('compare',25)}</span><div><strong>Сомневаетесь между двумя?</strong><p>Добавьте вина в сравнение и изучите их рядом.</p></div><button data-page="compare">Сравнить</button></section>
  <footer class="site-footer"><strong>СВОЁ ВИНО</strong><p>Самый полный независимый каталог российских вин</p><small>Чрезмерное употребление алкоголя вредит вашему здоровью</small></footer>`;
}

function filteredWines() {
  const query = state.query.trim().toLowerCase();
  return state.wines.filter((wine) => {
    const text = `${wine.name} ${wine.winery} ${wine.region} ${(wine.grapes || []).join(' ')}`.toLowerCase();
    return (!query || text.includes(query))
      && (!state.filters.category || wine.category === state.filters.category)
      && (!state.filters.region || wine.region === state.filters.region)
      && (!state.filters.winery || wine.winery === state.filters.winery)
      && (!state.filters.grape || (wine.grapes || []).includes(state.filters.grape));
  });
}

function filterSelect(name, label, values) {
  return `<label>${label}<select data-filter="${name}"><option value="">Все</option>${values.map((value) => `<option value="${esc(value)}" ${state.filters[name] === value ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></label>`;
}

function catalog() {
  const wines = filteredWines();
  const activeCount = Object.values(state.filters).filter(Boolean).length;
  return `${header({ title: 'Свои вина' })}<p class="page-lead">Самый полный независимый каталог российских вин</p><div class="catalog-tools"><label class="search-field">${icon('search',18)}<input id="catalog-search" type="search" placeholder="Название, сорт или винодельня" value="${esc(state.query)}" autocomplete="off"></label><button class="filter-button ${activeCount ? 'active' : ''}" data-action="toggle-filters">${icon('sliders',18)}<span>${activeCount || ''}</span></button></div>${state.filtersOpen ? `<div class="filters-panel">${filterSelect('category','Цвет',unique('category'))}${filterSelect('region','Регион',unique('region'))}${filterSelect('grape','Сорт винограда',uniqueGrapes())}${filterSelect('winery','Производитель',unique('winery'))}<button class="text-button reset-filter" data-action="reset-filters">Сбросить фильтры</button></div>` : ''}<div class="catalog-summary"><span>${countWord(wines.length)}</span>${state.compare.length ? `<button data-page="compare">Сравнить: ${state.compare.length}</button>` : ''}</div><div class="catalog-list">${wines.slice(0,state.catalogLimit).map(wineRow).join('') || empty('По выбранным параметрам вина не найдены.')}</div>${wines.length > state.catalogLimit ? '<button class="secondary-button full load-more" data-action="show-more">Показать ещё</button>' : ''}`;
}

function scanner() {
  return `${header({ back: true, title: 'Сканер этикетки' })}<p class="page-lead">Поместите этикетку целиком в рамку — без сильных бликов и размытия.</p><div class="camera-stage"><video id="camera-preview" autoplay muted playsinline aria-label="Изображение с камеры"></video><div class="camera-frame"><span></span><span></span><span></span><span></span></div><small id="camera-message" role="status">Открываем камеру…</small></div><div class="stacked-actions"><button class="primary-button" data-action="take-photo" id="capture-button" disabled>${icon('camera',18)} Сделать фото</button><button class="secondary-button" data-action="choose-photo">Загрузить из галереи</button><button class="text-button" data-action="retry-camera" id="camera-retry" hidden>Повторить доступ</button></div><input id="photo-input" type="file" accept="image/*" hidden><p class="privacy-note">Фото используется только для поиска вина и не сохраняется интерфейсом.</p>`;
}

function preview() {
  return `${header({ back: true, title: 'Проверьте фото' })}<p class="page-lead">Название и основные элементы этикетки должны быть хорошо видны.</p><div class="preview-stage">${state.previewUrl ? `<img src="${esc(state.previewUrl)}" alt="Фотография этикетки">` : '<div class="preview-label">WINE<br>LABEL</div>'}</div><div class="stacked-actions"><button class="primary-button" data-action="recognize">Найти вино</button><button class="secondary-button" data-page="scanner">Переснять</button></div>${!hasBackend ? '<div class="integration-note"><strong>Интерфейс готов к интеграции</strong><p>Распознавание заработает после подключения API команды. Сейчас можно изучить каталог вручную.</p><button class="text-button" data-page="catalog">Перейти в каталог</button></div>' : ''}`;
}

function recognizing() {
  return `${header()}<div class="recognition"><div class="recognition-mark">${icon('scan',38)}</div><span class="eyebrow">АНАЛИЗ ИЗОБРАЖЕНИЯ</span><h1>Ищем ваше вино</h1><p>Сверяем этикетку с каталогом российских вин</p><div class="progress-line"><i></i></div><ol><li class="done">Фото подготовлено</li><li class="active">Поиск совпадения</li><li>Открытие карточки</li></ol></div>`;
}

function similarWines(wine) {
  return state.wines.filter((item) => item.id !== wine.id).map((item) => {
    let score = 0;
    if (item.category === wine.category) score += 4;
    if (item.region === wine.region) score += 3;
    if (item.winery === wine.winery) score += 2;
    score += (item.grapes || []).filter((grape) => (wine.grapes || []).includes(grape)).length * 5;
    return { item, score };
  }).filter(({score}) => score > 3).sort((a,b) => b.score - a.score).slice(0,4).map(({item}) => item);
}

function result() {
  const wine = wineById(state.selectedId);
  if (!wine) return notFound();
  const similar = similarWines(wine);
  return `${header({ back: true })}<article class="wine-detail-card"><div class="detail-visual">${image(wine,'result-image')}<button class="detail-heart ${isFavorite(wine.id) ? 'active' : ''}" data-action="toggle-favorite" data-id="${esc(wine.id)}">${icon('heart',20)}</button></div><div class="detail-head"><span class="eyebrow">${esc(wine.category || 'РОССИЙСКОЕ ВИНО')}</span><h1>${esc(wine.name)}</h1><p>${esc(wine.winery || '')}</p></div><div class="fact-grid"><div><small>Регион</small><strong>${esc(wine.region || 'Не указан')}</strong></div><div><small>Сорт</small><strong>${esc((wine.grapes || []).join(', ') || 'Не указан')}</strong></div><div><small>Цвет</small><strong>${esc(wine.color_description || wine.category || 'Не указан')}</strong></div></div><section class="detail-section"><h2>О вине</h2><p>${esc(wine.description || 'Описание пока недоступно.')}</p></section><div class="detail-actions"><button class="primary-button" data-page="sommelier">${icon('sparkles',17)} Подобрать гастропару</button><button class="secondary-button" data-action="toggle-compare" data-id="${esc(wine.id)}">${state.compare.includes(wine.id) ? 'Убрать из сравнения' : 'Добавить к сравнению'}</button></div></article>${similar.length ? `<section class="section-block">${sectionHead('Похожие вина')}<div class="wine-carousel">${similar.map((item) => wineCard(item,true)).join('')}</div></section>` : ''}`;
}

function notFound() {
  return `${header({ back: true })}<div class="not-found"><span>?</span><h1>${hasBackend ? 'Вино не найдено' : 'Распознавание скоро появится'}</h1><p>${hasBackend ? 'Попробуйте переснять этикетку или найдите бутылку в каталоге.' : 'Фронтенд уже готов. Для поиска по фотографии нужно подключить API бэкенда и ML.'}</p><button class="primary-button" data-page="catalog">Открыть каталог</button><button class="text-button" data-page="scanner">Попробовать другое фото</button></div>`;
}

const sommelierOptions = {
  dish: [['meat','Мясо и гриль'],['fish','Рыба и морепродукты'],['cheese','Сыры и закуски'],['dessert','Десерты'],['evening','Без блюда']],
  category: [['Красное','Красное'],['Белое','Белое'],['Розовое','Розовое'],['','Довериться сомелье']],
  mood: [['discover','Открыть новое'],['classic','Проверенная классика'],['light','Лёгкий вечер']],
};
function optionGroup(key,title) {
  return `<fieldset><legend>${title}</legend><div class="choice-grid">${sommelierOptions[key].map(([value,label]) => `<button type="button" class="choice ${state.sommelier[key] === value ? 'selected' : ''}" data-sommelier="${key}" data-value="${esc(value)}">${label}</button>`).join('')}</div></fieldset>`;
}
function sommelier() {
  return `${header({ back: true, title: 'Цифровой сомелье' })}<p class="page-lead">Ответьте на три вопроса — подберём вина из российского каталога.</p><form id="sommelier-form" class="sommelier-form">${optionGroup('dish','Что будет на столе?')}${optionGroup('category','Какое вино хочется?')}${optionGroup('mood','Какое настроение?')}<button class="primary-button full" type="submit" ${!state.sommelier.dish || !state.sommelier.mood ? 'disabled' : ''}>Подобрать вина</button></form>${state.sommelierResults.length ? `<section class="sommelier-result"><span class="eyebrow">РЕКОМЕНДАЦИЯ</span><h2>Вам подойдут</h2><p>${sommelierReason()}</p><div class="catalog-list">${state.sommelierResults.map(wineRow).join('')}</div></section>` : ''}`;
}
function sommelierReason() {
  const dish = Object.fromEntries(sommelierOptions.dish)[state.sommelier.dish];
  const category = state.sommelier.category || 'вино разных стилей';
  return `${dish}: подобрали ${category.toLowerCase()}, опираясь на сорт, регион и характер вина.`;
}
function runSommelier() {
  const preferred = state.sommelier.category || ({ meat:'Красное', fish:'Белое', dessert:'Розовое', cheese:'Красное', evening:'' })[state.sommelier.dish];
  const pool = state.wines.filter((wine) => !preferred || wine.category === preferred);
  const offset = state.sommelier.mood === 'discover' ? Math.min(40,pool.length - 1) : state.sommelier.mood === 'light' ? Math.min(12,pool.length - 1) : 0;
  state.sommelierResults = [...pool.slice(offset,offset + 3), ...pool.slice(0,3)].slice(0,3);
}

function compare() {
  const wines = state.compare.map(wineById).filter(Boolean).slice(0,2);
  return `${header({ back: true, title: 'Сравнение вин' })}<p class="page-lead">Сопоставьте две бутылки по основным характеристикам.</p>${wines.length < 2 ? `<div class="compare-hint"><span>${icon('compare',30)}</span><h2>Выберите ещё ${2-wines.length}</h2><p>В каталоге нажмите значок сравнения у нужных вин.</p><button class="primary-button" data-page="catalog">Перейти в каталог</button></div>` : `<div class="compare-grid">${wines.map((wine) => `<article><button class="remove-compare" data-action="toggle-compare" data-id="${esc(wine.id)}">${icon('close',16)}</button>${image(wine)}<small>${esc(wine.category)}</small><h2>${esc(wine.name)}</h2><p>${esc(wine.winery)}</p></article>`).join('')}</div><div class="comparison-table">${[['Регион','region'],['Сорт','grapes'],['Цвет','color_description']].map(([label,key]) => `<div><strong>${label}</strong>${wines.map((wine) => `<span>${esc(Array.isArray(wine[key]) ? wine[key].join(', ') : wine[key] || '—')}</span>`).join('')}</div>`).join('')}</div>`}`;
}

function taste() {
  const interacted = [...new Set([...state.favorites,...state.history,...state.diary.map((entry) => entry.wineId)])].map(wineById).filter(Boolean);
  const categories = Object.entries(interacted.reduce((acc,wine) => ({...acc,[wine.category]:(acc[wine.category]||0)+1}),{})).sort((a,b)=>b[1]-a[1]);
  const regions = Object.entries(interacted.reduce((acc,wine) => ({...acc,[wine.region]:(acc[wine.region]||0)+1}),{})).sort((a,b)=>b[1]-a[1]);
  const grapes = Object.entries(interacted.flatMap((wine)=>wine.grapes||[]).reduce((acc,grape)=>({...acc,[grape]:(acc[grape]||0)+1}),{})).sort((a,b)=>b[1]-a[1]);
  const total = Math.max(1,categories.reduce((sum,[,count])=>sum+count,0));
  return `${header({ back: true, title: 'Паспорт вкуса' })}<p class="page-lead">Профиль складывается из избранного, истории и оценок в дневнике.</p>${interacted.length ? `<div class="taste-hero"><span>${interacted.length}</span><p>вин формируют ваш профиль</p></div><section class="taste-section"><h2>Ваш стиль</h2>${categories.map(([name,count]) => `<div class="taste-bar"><span>${esc(name)}</span><i><b style="width:${Math.round(count/total*100)}%"></b></i><em>${Math.round(count/total*100)}%</em></div>`).join('')}</section><div class="taste-columns"><section><span class="eyebrow">ТОП-РЕГИОН</span><strong>${esc(regions[0]?.[0] || '—')}</strong></section><section><span class="eyebrow">ЛЮБИМЫЙ СОРТ</span><strong>${esc(grapes[0]?.[0] || '—')}</strong></section></div><button class="primary-button full" data-page="recommendations">Получить рекомендации</button>` : `<div class="compare-hint"><span>${icon('heart',30)}</span><h2>Познакомимся со вкусом</h2><p>Сохраняйте и просматривайте вина — здесь появится ваш персональный профиль.</p><button class="primary-button" data-page="catalog">Выбрать первое вино</button></div>`}`;
}

function recommendations() {
  const source = state.favorites.map(wineById).filter(Boolean)[0] || state.history.map(wineById).filter(Boolean)[0];
  const wines = source ? similarWines(source).slice(0,6) : state.wines.slice(12,18);
  return `${header({ back:true,title:'Для вас' })}<p class="page-lead">Рекомендации на основе активности в этом браузере.</p><div class="catalog-list">${wines.map(wineRow).join('')}</div>`;
}

function profile() {
  return `${header({ title:'Личный кабинет' })}${state.user ? '' : '<div class="auth-actions"><button class="primary-button" data-page="register">Регистрация</button><button class="secondary-button" data-page="login">Вход</button></div>'}<div class="profile-card"><div class="profile-avatar">${icon('user',27)}</div><div><span class="eyebrow">${state.user ? 'УЧАСТНИК КЛУБА' : 'ГОСТЕВОЙ РЕЖИМ'}</span><h2>${esc(state.user?.name || state.user?.email || 'Гость')}</h2><p>${state.user?.email ? esc(state.user.email) : 'Ваше пространство для вина'}</p></div></div><div class="stats"><span><strong>${state.history.filter(wineById).length}</strong>просмотров</span><span><strong>${state.favorites.filter(wineById).length}</strong>избранных</span><span><strong>${state.diary.length}</strong>оценок</span></div><div class="menu-list">${[['taste','Паспорт вкуса','Персональный профиль'],['recommendations','Рекомендации','Подборка для вас'],['history','История','Недавно просмотренные'],['collections','Мои подборки','Собственные списки'],['diary','Винный дневник','Оценки и заметки'],['settings','Настройки','Профиль и приложение']].map(([page,title,subtitle]) => `<button class="menu-row" data-page="${page}"><span class="menu-icon">${icon(page === 'taste' ? 'sparkles' : page === 'history' ? 'catalog' : page === 'collections' ? 'heart' : 'user',18)}</span><span><strong>${title}</strong><small>${subtitle}</small></span>${icon('chevron',16)}</button>`).join('')}</div>${state.user ? '<button class="text-button signout-button" data-action="logout">Выйти из аккаунта</button>' : ''}`;
}

function authPage(type) {
  const register = type === 'register';
  return `${header({ back:true,title:register ? 'Регистрация' : 'Вход' })}<p class="page-lead">${register ? 'Создайте аккаунт, чтобы сохранять винное пространство.' : 'Вернитесь к своим винам и рекомендациям.'}</p><form id="${type}-form" class="auth-form">${register ? '<label>Имя<input name="name" autocomplete="name" required placeholder="Как к вам обращаться"></label>' : ''}<label>Электронная почта<input name="email" type="email" autocomplete="email" required placeholder="you@example.com"></label><label>Пароль<input name="password" type="password" autocomplete="current-password" minlength="8" required placeholder="Не менее 8 символов"></label>${register ? '<label>Повторите пароль<input name="confirm" type="password" minlength="8" required placeholder="Повторите пароль"></label>' : ''}<p id="auth-message" class="auth-message" role="alert" hidden></p><button class="primary-button full" type="submit">${register ? 'Зарегистрироваться' : 'Войти'}</button></form><p class="auth-switch">${register ? 'Уже есть аккаунт?' : 'Ещё нет аккаунта?'} <button class="text-button" data-page="${register ? 'login' : 'register'}">${register ? 'Войти' : 'Зарегистрироваться'}</button></p>`;
}
const register = () => authPage('register');
const login = () => authPage('login');
const favorites = () => `${header({title:'Избранное'})}<p class="page-lead">Вина, к которым хочется вернуться.</p><div class="catalog-list">${state.favorites.map(wineById).filter(Boolean).map(wineRow).join('') || empty('Сохраняйте вина из каталога и карточек.')}</div>`;
const history = () => `${header({back:true,title:'История'})}<div class="catalog-list">${state.history.map(wineById).filter(Boolean).map(wineRow).join('') || empty('Просмотренные вина появятся здесь.')}</div>`;

function collections() {
  return `${header({back:true,title:'Мои подборки'})}<button class="primary-button full" data-action="new-collection">${icon('plus',17)} Создать подборку</button><div class="collection-grid">${state.collections.map((collection) => `<button class="collection-card" data-collection="${esc(collection.id)}"><div class="collection-art"><span>${collection.wineIds.length}</span></div><strong>${esc(collection.name)}</strong><small>${countWord(collection.wineIds.length)}</small></button>`).join('') || empty('Создайте список для праздника, подарка или нового открытия.')}</div>`;
}
function collectionDetail() {
  const collection = state.collections.find((item) => item.id === state.selectedCollection);
  if (!collection) return collections();
  return `${header({back:true,title:collection.name})}<button class="secondary-button full" data-action="add-to-collection" data-id="${esc(collection.id)}">Добавить вино</button><div class="catalog-list">${collection.wineIds.map(wineById).filter(Boolean).map(wineRow).join('') || empty('В подборке пока нет вин.')}</div>`;
}
function diary() {
  return `${header({back:true,title:'Винный дневник'})}<p class="page-lead">Сохраняйте впечатления от российских вин.</p>${state.diary.map((entry) => { const wine = wineById(entry.wineId); return wine ? `<article class="diary-card"><span>${'★'.repeat(entry.rating)}${'☆'.repeat(5-entry.rating)}</span><h2>${esc(wine.name)}</h2><p>${esc(entry.note || 'Без заметки')}</p></article>` : ''; }).join('') || empty('Здесь появятся ваши оценки и заметки.')}<button class="primary-button full diary-add" data-action="new-diary">${icon('plus',17)} Добавить запись</button>`;
}
const settings = () => `${header({back:true,title:'Настройки'})}<div class="menu-list settings-list">${[['Данные профиля','Списки хранятся в этом браузере'],['Приватность','Фото не сохраняются интерфейсом'],['Тема приложения','Фирменная светлая'],['О проекте','Хакатон РСХБ.Цифра 2026']].map(([title,subtitle]) => `<div class="menu-row static"><span><strong>${title}</strong><small>${subtitle}</small></span></div>`).join('')}</div>`;

const pages = { home,catalog,scanner,preview,recognizing,result,notfound:notFound,sommelier,compare,taste,recommendations,profile,register,login,favorites,history,collections,collectionDetail,diary,settings };
let cameraStream = null;
let cameraRequestId = 0;

function updateCameraUi(status,message) {
  state.cameraStatus = status;
  const text = document.querySelector('#camera-message');
  const capture = document.querySelector('#capture-button');
  const retry = document.querySelector('#camera-retry');
  if (text) text.textContent = message;
  if (capture) capture.disabled = status !== 'ready';
  if (retry) retry.hidden = status !== 'error';
}
function stopCamera() {
  cameraRequestId += 1;
  cameraStream?.getTracks().forEach((track) => track.stop()); cameraStream = null;
  const video = document.querySelector('#camera-preview'); if (video) video.srcObject = null;
}
async function startCamera() {
  stopCamera(); const requestId = cameraRequestId;
  if (!navigator.mediaDevices?.getUserMedia) { updateCameraUi('error','Камера недоступна. Загрузите фото из галереи.'); return; }
  updateCameraUi('starting','Запрашиваем доступ к камере…');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'}}});
    if (requestId !== cameraRequestId || state.page !== 'scanner') { stream.getTracks().forEach((track)=>track.stop()); return; }
    cameraStream = stream; const video = document.querySelector('#camera-preview'); if (!video) return;
    video.srcObject = stream; await video.play(); updateCameraUi('ready','Этикетка должна быть внутри рамки');
  } catch { if (state.page === 'scanner') updateCameraUi('error','Не удалось включить камеру. Разрешите доступ или загрузите фото.'); }
}
async function capturePhoto() {
  const video = document.querySelector('#camera-preview'); if (!cameraStream || !video?.videoWidth) return;
  const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video,0,0); const blob = await new Promise((resolve)=>canvas.toBlob(resolve,'image/jpeg',.9));
  if (blob) setPhoto(new File([blob],`wine-${Date.now()}.jpg`,{type:'image/jpeg'}));
}
function setPhoto(file) {
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.photo = file; state.previewUrl = URL.createObjectURL(file); go('preview');
}
function render() {
  app.innerHTML = `<div class="desktop-backdrop"><main class="phone-shell page-${state.page}">${state.loading ? '<div class="loading"><span></span><p>Открываем каталог…</p></div>' : pages[state.page]?.() || home()}${['scanner','preview','recognizing'].includes(state.page) ? '' : nav()}</main></div>`;
}
function go(page) {
  if (state.page === 'scanner') stopCamera();
  state.previousPage = state.page; state.page = page; window.scrollTo(0,0); render(); if (page === 'scanner') startCamera();
}
function openWine(id,scanned=false) {
  state.selectedId = id; state.foundByScan = scanned;
  state.history = [id,...state.history.filter((item)=>item!==id)].slice(0,40); persist('wine:v3:history',state.history); go('result');
}
function toggleFavorite(id) {
  state.favorites = isFavorite(id) ? state.favorites.filter((item)=>item!==id) : [id,...state.favorites]; persist('wine:v3:favorites',state.favorites); render();
}
function toggleCompare(id) {
  if (state.compare.includes(id)) state.compare = state.compare.filter((item)=>item!==id);
  else state.compare = [...state.compare,id].slice(-2);
  persist('wine:v3:compare',state.compare); render();
}

app.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-page],[data-action],[data-wine],[data-collection],[data-filter-region],[data-sommelier]');
  if (!target) return;
  if (target.dataset.page) { go(target.dataset.page); return; }
  if (target.dataset.wine) { openWine(target.dataset.wine); return; }
  if (target.dataset.collection) { state.selectedCollection = target.dataset.collection; go('collectionDetail'); return; }
  if (target.dataset.filterRegion) { state.filters.region = target.dataset.filterRegion; state.filtersOpen = true; go('catalog'); return; }
  if (target.dataset.sommelier) { state.sommelier[target.dataset.sommelier] = target.dataset.value; state.sommelierResults = []; render(); return; }
  const {action,id} = target.dataset;
  if (action === 'back') { go(({preview:'scanner',scanner:'home',result:'catalog',collectionDetail:'collections',register:'profile',login:'profile'})[state.page] || state.previousPage || 'home'); }
  if (action === 'toggle-filters') { state.filtersOpen = !state.filtersOpen; render(); }
  if (action === 'reset-filters') { state.filters = {category:'',region:'',winery:'',grape:''}; state.query=''; state.catalogLimit=24; render(); }
  if (action === 'show-more') { state.catalogLimit += 24; render(); }
  if (action === 'toggle-favorite') toggleFavorite(id);
  if (action === 'toggle-compare') toggleCompare(id);
  if (action === 'choose-photo') document.querySelector('#photo-input')?.click();
  if (action === 'take-photo') capturePhoto();
  if (action === 'retry-camera') startCamera();
  if (action === 'recognize') {
    if (!state.photo) return;
    if (!hasBackend) { go('notfound'); return; }
    go('recognizing');
    try { const response = await scanWine(state.photo); const id = response.wine_id || response.slug; let wine = wineById(id); if (!wine && id) wine = await getWine(id); if (wine && !wineById(id)) state.wines.push(wine); wine ? openWine(wine.id,true) : go('notfound'); } catch { go('notfound'); }
  }
  if (action === 'logout') { logoutUser(); state.user=null; go('profile'); }
  if (action === 'new-collection') { const name=prompt('Название подборки'); if(name?.trim()){state.collections.unshift({id:`c${Date.now()}`,name:name.trim(),wineIds:[]});persist('wine:v3:collections',state.collections);render();} }
  if (action === 'add-to-collection') { const name=prompt('Введите точное название вина'); const wine=state.wines.find((item)=>item.name.toLowerCase()===name?.trim().toLowerCase()); const collection=state.collections.find((item)=>item.id===id); if(wine&&collection&&!collection.wineIds.includes(wine.id)){collection.wineIds.push(wine.id);persist('wine:v3:collections',state.collections);render();} }
  if (action === 'new-diary') { const name=prompt('Название вина'); const wine=state.wines.find((item)=>item.name.toLowerCase()===name?.trim().toLowerCase()); if(!wine)return; const rating=Number(prompt('Оценка от 1 до 5','5')); if(rating<1||rating>5)return; const note=prompt('Заметка','')||''; state.diary.unshift({wineId:wine.id,rating,note,date:new Date().toISOString()});persist('wine:v3:diary',state.diary);render(); }
});

app.addEventListener('change',(event) => {
  if (event.target.id === 'photo-input') { const file=event.target.files?.[0]; if(file)setPhoto(file); return; }
  if (event.target.dataset.filter) { state.filters[event.target.dataset.filter]=event.target.value; state.catalogLimit=24; render(); }
});
app.addEventListener('input',(event) => {
  if (event.target.id !== 'catalog-search') return;
  const cursor=event.target.selectionStart; state.query=event.target.value; state.catalogLimit=24; render();
  const input=document.querySelector('#catalog-search'); input?.focus(); input?.setSelectionRange(cursor,cursor);
});
app.addEventListener('submit',async(event) => {
  event.preventDefault(); const form=event.target;
  if (form.id === 'sommelier-form') { runSommelier(); render(); document.querySelector('.sommelier-result')?.scrollIntoView({behavior:'smooth'}); return; }
  if (!['register-form','login-form'].includes(form.id)) return;
  const fields=Object.fromEntries(new FormData(form)); const message=form.querySelector('#auth-message');
  const fail=(text)=>{message.textContent=text;message.hidden=false;};
  if(form.id==='register-form'&&fields.password!==fields.confirm){fail('Пароли не совпадают.');return;}
  if(!hasBackend){fail('Регистрация и вход заработают после подключения сервера.');return;}
  const button=form.querySelector('[type="submit"]');button.disabled=true;
  try{state.user=form.id==='register-form'?await registerUser({name:fields.name.trim(),email:fields.email.trim(),password:fields.password}):await loginUser({email:fields.email.trim(),password:fields.password});go('profile');}catch(error){fail(error.message||'Не удалось связаться с сервером.');button.disabled=false;}
});

async function loadWines() {
  state.loading=true;render();
  try{state.wines=await getWines()||[];state.loadError=false;}catch{state.wines=[];state.loadError=true;}
  state.loading=false;render();
}
loadWines();
restoreUser().then((user)=>{state.user=user;if(state.page==='profile')render();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.page==='scanner')stopCamera();else if(!document.hidden&&state.page==='scanner'&&!cameraStream)startCamera();});
