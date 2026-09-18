import { getWines, getWine, scanWine, hasBackend, registerUser, loginUser, restoreUser, logoutUser } from './api.js';

const app = document.querySelector('#app');
const saved = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const persist = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const state = {
  page: 'home', wines: [], selectedId: null, query: '', showAll: false, searchLimit: 30,
  photo: null, previewUrl: null,
  loading: true, loadError: false, foundByScan: false, cameraStatus: 'idle',
  favorites: saved('wine:v2:favorites', []),
  history: saved('wine:v2:history', []), collections: saved('wine:v2:collections', []),
  diary: saved('wine:v2:diary', []), selectedCollection: null,
  user: null,
};

const icons = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-7h6v7"/>',
  scan: '<path d="M5 7V5a2 2 0 0 1 2-2h2m6 0h2a2 2 0 0 1 2 2v2M5 17v2a2 2 0 0 0 2 2h2m6 0h2a2 2 0 0 0 2-2v-2"/><path d="M8 9h8v6H8z"/>',
  heart: '<path d="M20.8 8.5c0 4.5-8.8 10.4-8.8 10.4S3.2 13 3.2 8.5a4.6 4.6 0 0 1 8.8-1.8 4.6 4.6 0 0 1 8.8 1.8Z"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  camera: '<path d="M4 7h3l2-2h6l2 2h3v12H4z"/><circle cx="12" cy="13" r="3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M5 5l14 14M19 5 5 19"/>',
  star: '<path d="m12 2 3 6.4 7 .9-5.1 4.9 1.3 7-6.2-3.3-6.2 3.3 1.3-7L2 9.3l7-.9z"/>',
};
const icon = (name, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const wineById = (id) => state.wines.find((wine) => wine.id === id);
const wineType = (wine) => [wine?.category || (wine?.color === 'red' ? 'Красное' : wine?.color === 'rose' ? 'Розовое' : 'Белое'), wine?.sweetness === 'dry' ? 'сухое' : wine?.sweetness === 'semi-dry' ? 'полусухое' : wine?.sweetness === 'sweet' ? 'сладкое' : ''].filter(Boolean).join(' · ');
const image = (wine, className = '') => wine?.image_url
  ? `<img class="wine-image ${className}" src="${esc(wine.image_url)}" alt="Бутылка ${esc(wine.name)}" loading="lazy" decoding="async" />`
  : `<div class="wine-placeholder ${className}" aria-label="Фотография вина появится после подключения датасета"></div>`;
const isFavorite = (id) => state.favorites.includes(id);
const wineCount = (count) => `${count} ${count % 10 === 1 && count % 100 !== 11 ? 'вино' : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? 'вина' : 'вин'}`;

function header({ back = false, title = '' } = {}) {
  return `<header class="topbar">
    <div class="brand-line">${back ? `<button class="icon-button back-button" data-action="back" aria-label="Назад">${icon('back', 19)}</button>` : ''}<span class="brand">· СВОЁ ВИНО</span></div>
    <button class="account-button" data-page="profile" aria-label="Личный кабинет">${icon('user', 17)}</button>
  </header>${title ? `<h1 class="page-title">${esc(title)}</h1>` : ''}`;
}
function nav() {
  const items = [ ['home','Главная','home'], ['favorites','Избранное','heart'], ['scanner','Сканер','scan'], ['profile','Профиль','user'] ];
  return `<nav class="bottom-nav" aria-label="Основная навигация">${items.map(([page, label, glyph]) => `<button data-page="${page}" class="nav-item ${state.page === page || (page === 'profile' && ['register', 'login'].includes(state.page)) ? 'active' : ''}" aria-label="${label}" ${state.page === page ? 'aria-current="page"' : ''}>${icon(glyph, 20)}<span>${label}</span></button>`).join('')}</nav>`;
}
function wineRow(wine, { heart = false } = {}) {
  if (!wine) return '';
  return `<button class="wine-row" data-wine="${esc(wine.id)}">${image(wine, 'row-image')}<span class="row-copy"><strong>${esc(wine.name)}</strong><small>${[wine.winery, wineType(wine)].filter(Boolean).map(esc).join(' · ')}</small></span>${heart ? `<span class="row-heart ${isFavorite(wine.id) ? 'filled' : ''}">${icon('heart', 17)}</span>` : icon('chevron', 17)}</button>`;
}
function empty(text) { return `<div class="empty-box"><p>${esc(text)}</p></div>`; }

function home() {
  const popular = state.wines.slice(0, 4);
  const filtered = state.wines.filter((wine) => `${wine.name} ${wine.winery} ${wine.region} ${(wine.grapes || []).join(' ')}`.toLowerCase().includes(state.query.toLowerCase()));
  return `${header()}<section class="home-intro"><h1>Найдите своё вино</h1><p>Сфотографируйте этикетку — мы узнаем вино и покажем подробности.</p></section>${state.loadError ? '<div class="error-box">Не удалось загрузить каталог. Проверьте подключение к серверу.<button class="secondary-button" data-action="reload-wines">Повторить</button></div>' : ''}
    <section class="hero-card"><span class="hero-orbit" aria-hidden="true"></span><div><h2>Наведи камеру<br>на этикетку</h2><p>Раскройте мир хорошего вкуса</p></div><button class="light-button" data-page="scanner">Сканировать этикетку ${icon('chevron', 16)}</button></section>
    ${popular.length ? `<section class="section-block"><div class="section-heading"><h2>Вина из каталога</h2><button class="text-button" data-action="show-search">Все вина →</button></div><div class="popular-grid">${popular.map((wine) => `<button class="popular-card" data-wine="${esc(wine.id)}">${image(wine)}<strong>${esc(wine.name)}</strong><small>${esc(wineType(wine))}</small></button>`).join('')}</div></section>
    <section class="section-block search-block"><h2>Найти по названию</h2><label class="search-field">${icon('search', 18)}<input id="wine-search" type="search" placeholder="Название или винодельня" value="${esc(state.query)}" autocomplete="off"></label>${state.query || state.showAll ? `<div class="search-results">${filtered.length ? `<p class="search-count">Найдено: ${filtered.length}. Показано: ${Math.min(filtered.length, state.searchLimit)}.</p>${filtered.slice(0, state.searchLimit).map((wine) => wineRow(wine)).join('')}${filtered.length > state.searchLimit ? '<button class="secondary-button full" data-action="show-more">Показать ещё</button>' : ''}` : empty('Ничего не нашлось. Попробуйте другое название.')}</div>` : ''}</section>` : `<section class="section-block">${empty('Каталог вин появится здесь после подключения датасета.')}</section>`}`;
}
function scanner() {
  return `${header({ back: true, title: 'Сканирование этикетки' })}<p class="subtle">Поместите этикетку целиком в рамку.</p><div class="camera-stage"><video id="camera-preview" autoplay muted playsinline aria-label="Изображение с камеры"></video><div class="camera-frame" aria-hidden="true"></div><small id="camera-message" role="status">Открываем камеру…</small></div><div class="stacked-actions"><button class="primary-button" data-action="take-photo" id="capture-button" disabled>Сделать фото</button><button class="secondary-button" data-action="choose-photo">Загрузить из галереи</button><button class="secondary-button" data-action="native-camera" id="native-camera-button" hidden>Открыть камеру устройства</button><button class="text-button camera-retry" data-action="retry-camera" id="camera-retry" hidden>Повторить доступ к камере</button></div><input id="photo-input" type="file" accept="image/*" hidden><input id="native-camera-input" type="file" accept="image/*" capture="environment" hidden><p class="helper-note">Браузер попросит разрешение на камеру. Если камеры нет, загрузите снимок из галереи.</p>`;
}
function preview() {
  return `${header({ back: true, title: 'Проверьте фотографию' })}<p class="subtle">Этикетка должна быть читаемой и без сильных бликов.</p><div class="preview-stage">${state.previewUrl ? `<img src="${esc(state.previewUrl)}" alt="Выбранная фотография этикетки">` : '<div class="preview-label">WINE<br>LABEL</div>'}</div><div class="stacked-actions"><button class="primary-button" data-action="recognize">Распознать вино</button><button class="secondary-button" data-page="scanner">Переснять</button></div>${!hasBackend ? '<p class="helper-note">Каталог готов. Распознавание по фото подключим вместе с ML и бэкендом.</p>' : ''}`;
}
function recognizing() {
  return `${header()}<div class="status-center"><div class="spinner" aria-hidden="true"></div><h1>Распознаём вино...</h1><p>Это займёт всего несколько секунд</p><ul class="scan-steps"><li class="done">Фото получено</li><li>Ищем совпадение</li><li>Открываем карточку</li></ul></div>`;
}
function result() {
  const wine = wineById(state.selectedId);
  if (!wine) return notFound();
  return `${header({ back: true })}<p class="success-line">${state.foundByScan ? '✓ Вино найдено' : 'Карточка вина'}</p><div class="result-hero">${image(wine, 'result-image')}</div><h1 class="result-title">${esc(wine.name)}</h1><p class="wine-meta">${[wine.winery, wine.region, wine.country, wine.vintage].filter(Boolean).map(esc).join(' · ')}</p><div class="chips"><span>${esc(wineType(wine))}</span>${wine.grapes?.length ? `<span>${esc(wine.grapes.join(', '))}</span>` : ''}${wine.abv ? `<span>${esc(wine.abv)}</span>` : ''}</div>${wine.color_description ? `<p class="wine-detail"><strong>Цвет:</strong> ${esc(wine.color_description)}</p>` : ''}<p class="description">${esc(wine.description || 'Описание пока недоступно.')}</p><div class="stacked-actions">${wine.food_pairings?.length ? '<button class="primary-button" data-page="digital">Советы сомелье</button>' : ''}<button class="secondary-button" data-action="toggle-favorite" data-id="${esc(wine.id)}">${isFavorite(wine.id) ? 'Убрать из избранного' : 'Сохранить в избранное'}</button></div>`;
}
function notFound() {
  if (!hasBackend) return `${header({ back: true })}<div class="status-center"><div class="question-mark">?</div><h1>Распознавание скоро появится</h1><p>Каталог вин уже доступен. Поиск по этикетке подключим вместе с моделью и бэкендом.</p><div class="stacked-actions wide"><button class="primary-button" data-page="home">Открыть каталог</button></div></div>`;
  return `${header({ back: true })}<div class="status-center"><div class="question-mark">?</div><h1>Не удалось найти вино</h1><p>Попробуйте сфотографировать этикетку ещё раз или выберите вино вручную.</p><div class="stacked-actions wide"><button class="primary-button" data-page="scanner">Переснять фото</button><button class="secondary-button" data-page="home">Выбрать из каталога</button></div>${state.wines.length ? `<h2 class="try-title">Или посмотрите похожие вина</h2><div class="mini-grid">${state.wines.slice(0, 2).map((wine) => `<button data-wine="${esc(wine.id)}">${image(wine)}<strong>${esc(wine.name)}</strong></button>`).join('')}</div>` : ''}</div>`;
}
function digital() {
  const wine = wineById(state.selectedId);
  if (!wine) return notFound();
  return `${header({ back: true, title: 'Цифровой сомелье' })}<p class="subtle">Рекомендации на основе найденного вина.</p>${wineRow(wine)}<h2 class="section-title">С чем сочетать?</h2><div class="pairing-list">${(wine.food_pairings || []).map((food) => `<div>${esc(food)}</div>`).join('') || '<div>Сочетания появятся позже</div>'}</div><div class="advice-card"><strong>Совет сомелье</strong><p>Подавайте вино при подходящей температуре и дайте ему немного раскрыться в бокале.</p></div>`;
}
function profile() {
  return `${header({ title: 'Личный кабинет' })}${state.user ? '' : '<div class="auth-actions"><button class="primary-button" data-page="register">Регистрация</button><button class="secondary-button" data-page="login">Вход</button></div>'}<div class="profile-head"><div class="profile-avatar"></div><div><strong>${esc(state.user?.name || state.user?.email || 'Гость')}</strong><small>${state.user ? esc(state.user.email || 'Ваше пространство для вина') : 'Ваше пространство для вина'}</small></div></div>${state.user ? '<button class="text-button signout-button" data-action="logout">Выйти из аккаунта</button>' : ''}<div class="stats"><span><strong>${state.history.filter(wineById).length}</strong>просмотров</span><span><strong>${state.favorites.filter(wineById).length}</strong>избранных</span><span><strong>${state.collections.length}</strong>подборки</span></div><div class="menu-list">${[['history','История просмотров','Бутылки, которые вы открывали'],['recommendations','Рекомендации для вас','Вина на ваш вкус'],['favorites','Избранное','Сохранённые вина'],['collections','Мои подборки','Ваши собственные списки'],['diary','Винный дневник','Личные заметки о винах'],['settings','Настройки','Профиль и приложение']].map(([page,title,subtitle]) => `<button class="menu-row" data-page="${page}"><span class="menu-dot"></span><span><strong>${title}</strong><small>${subtitle}</small></span>${icon('chevron', 17)}</button>`).join('')}</div>`;
}
function register() {
  return `${header({ back: true, title: 'Регистрация' })}<p class="subtle">Создайте аккаунт, чтобы сохранять своё винное пространство.</p><form id="register-form" class="auth-form"><label>Имя<input name="name" type="text" autocomplete="name" maxlength="80" required placeholder="Как к вам обращаться"></label><label>Электронная почта<input name="email" type="email" autocomplete="email" required placeholder="you@example.com"></label><label>Пароль<input name="password" type="password" autocomplete="new-password" minlength="8" required placeholder="Не менее 8 символов"></label><label>Повторите пароль<input name="confirm" type="password" autocomplete="new-password" minlength="8" required placeholder="Повторите пароль"></label><p id="auth-message" class="auth-message" role="alert" hidden></p><button class="primary-button full" type="submit">Зарегистрироваться</button></form><p class="auth-switch">Уже есть аккаунт? <button class="text-button" data-page="login">Войти</button></p>`;
}
function login() {
  return `${header({ back: true, title: 'Вход' })}<p class="subtle">Войдите в свой аккаунт.</p><form id="login-form" class="auth-form"><label>Электронная почта<input name="email" type="email" autocomplete="email" required placeholder="you@example.com"></label><label>Пароль<input name="password" type="password" autocomplete="current-password" required placeholder="Ваш пароль"></label><p id="auth-message" class="auth-message" role="alert" hidden></p><button class="primary-button full" type="submit">Войти</button></form><p class="auth-switch">Ещё нет аккаунта? <button class="text-button" data-page="register">Зарегистрироваться</button></p>`;
}
function favorites() {
  const wines = state.favorites.map(wineById).filter(Boolean);
  return `${header({ title: 'Избранное' })}${wines.length ? `<div class="wine-list">${wines.map((wine) => wineRow(wine, { heart: true })).join('')}</div>` : empty('Пока здесь пусто. Сохраните вино из каталога или результата сканирования.')}`;
}
function history() {
  const wines = state.history.map(wineById).filter(Boolean);
  return `${header({ back: true, title: 'История' })}${wines.length ? `<div class="wine-list"><h2>Недавно просмотренные</h2>${wines.map((wine) => wineRow(wine)).join('')}</div>` : empty('История появится после просмотра первого вина.')}`;
}
function collections() {
  return `${header({ back: true, title: 'Мои подборки' })}<button class="primary-button full" data-action="new-collection">${icon('plus', 17)} Создать новую подборку</button>${state.collections.length ? `<div class="collection-grid">${state.collections.map((collection) => `<button class="collection-card" data-collection="${esc(collection.id)}"><div class="collection-art"></div><strong>${esc(collection.name)}</strong><small>${wineCount(collection.wineIds.length)}</small></button>`).join('')}</div>` : empty('Подборок пока нет. Вы сможете собрать их, когда появятся вина.')}`;
}
function collectionDetail() {
  const collection = state.collections.find((item) => item.id === state.selectedCollection);
  if (!collection) return collections();
  const wines = collection.wineIds.map(wineById).filter(Boolean);
  return `${header({ back: true, title: collection.name })}${state.wines.length ? `<button class="secondary-button full" data-action="add-to-collection" data-id="${esc(collection.id)}">Добавить вино</button>` : ''}<div class="wine-list">${wines.length ? wines.map((wine) => wineRow(wine)).join('') : empty('В этой подборке пока нет вин.')}</div>`;
}
function recommendations() {
  return `${header({ back: true, title: 'Для вас' })}<p class="subtle">На основе ваших сохранённых и просмотренных вин.</p>${empty('Рекомендации появятся после подключения каталога и модели.')}`;
}
function settings() {
  return `${header({ back: true, title: 'Настройки' })}<div class="menu-list settings-list">${[['Профиль и данные','Избранное, история и заметки пока хранятся в этом браузере'],['Уведомления','Пока не подключены'],['Приватность','Фотографии отправляются только на настроенный API'],['Тема приложения','Светлая'],['О приложении','Своё Вино · прототип']].map(([title, subtitle]) => `<div class="menu-row static"><span><strong>${title}</strong><small>${subtitle}</small></span></div>`).join('')}</div>`;
}
function diary() {
  const entries = state.diary.map((entry) => ({ ...entry, wine: wineById(entry.wineId) })).filter((entry) => entry.wine);
  return `${header({ back: true, title: 'Винный дневник' })}<p class="subtle">Запоминайте вина, которые вы открывали.</p>${entries.map((entry) => `<article class="diary-card"><strong>${esc(entry.wine.name)}</strong><span class="diary-stars">${'★'.repeat(entry.rating)}${'☆'.repeat(5 - entry.rating)}</span><p>${esc(entry.note || 'Без заметки')}</p></article>`).join('') || empty('Записи появятся, когда в каталоге будут вина.')}${state.wines.length ? `<button class="primary-button full" data-action="new-diary">${icon('plus', 17)} Добавить заметку</button>` : ''}`;
}

const pages = { home, scanner, preview, recognizing, result, notfound: notFound, digital, profile, register, login, favorites, history, collections, collectionDetail, recommendations, settings, diary };
let cameraStream = null;
let cameraRequestId = 0;

function updateCameraUi(status, message) {
  state.cameraStatus = status;
  const statusElement = document.querySelector('#camera-message');
  const captureButton = document.querySelector('#capture-button');
  const retryButton = document.querySelector('#camera-retry');
  const nativeButton = document.querySelector('#native-camera-button');
  if (statusElement) statusElement.textContent = message;
  if (captureButton) captureButton.disabled = status !== 'ready';
  if (retryButton) retryButton.hidden = status !== 'error';
  if (nativeButton) nativeButton.hidden = status !== 'error';
}

function stopCamera() {
  cameraRequestId += 1;
  cameraStream?.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  const video = document.querySelector('#camera-preview');
  if (video) video.srcObject = null;
  state.cameraStatus = 'idle';
}

async function startCamera() {
  stopCamera();
  const requestId = cameraRequestId;
  if (!navigator.mediaDevices?.getUserMedia) {
    updateCameraUi('error', 'Камера недоступна в этом браузере. Откройте сайт на localhost или по HTTPS.');
    return;
  }
  updateCameraUi('starting', 'Запрашиваем доступ к камере…');
  const mediaPromise = navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
  let timedOut = false;
  let timeoutId;
  mediaPromise.then((stream) => {
    if (timedOut) stream.getTracks().forEach((track) => track.stop());
  }).catch(() => {});
  try {
    const stream = await Promise.race([
      mediaPromise,
      new Promise((_, reject) => { timeoutId = setTimeout(() => { timedOut = true; reject(new Error('Camera request timed out')); }, 15000); }),
    ]);
    if (requestId !== cameraRequestId || state.page !== 'scanner') {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    cameraStream = stream;
    const video = document.querySelector('#camera-preview');
    if (!video) { stopCamera(); return; }
    video.srcObject = stream;
    await video.play();
    if (requestId === cameraRequestId && state.page === 'scanner') updateCameraUi('ready', 'Этикетка должна быть внутри рамки');
  } catch (error) {
    if (requestId !== cameraRequestId || state.page !== 'scanner') return;
    timedOut = true;
    stopCamera();
    const message = error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError'
      ? 'Доступ к камере запрещён. Разрешите его в настройках браузера или загрузите фото.'
      : error.name === 'NotFoundError'
        ? 'Камера не найдена. Загрузите фото из галереи.'
        : 'Не удалось включить камеру. Попробуйте ещё раз или загрузите фото.';
    updateCameraUi('error', message);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function capturePhoto() {
  const video = document.querySelector('#camera-preview');
  if (!cameraStream || !video?.videoWidth || !video.videoHeight) return;
  const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob || state.page !== 'scanner') return;
  setPhoto(new File([blob], `wine-label-${Date.now()}.jpg`, { type: 'image/jpeg' }));
}

function setPhoto(file) {
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.photo = file;
  state.previewUrl = URL.createObjectURL(file);
  go('preview');
}

function render() {
  app.innerHTML = `<div class="desktop-backdrop"><main class="phone-shell page-${state.page}">${state.loading ? '<div class="loading">Загружаем вина…</div>' : pages[state.page]?.() || home()}${['scanner','preview','recognizing'].includes(state.page) ? '' : nav()}</main></div>`;
}
function go(page) {
  if (state.page === 'scanner') stopCamera();
  state.page = page;
  window.scrollTo(0, 0);
  render();
  if (page === 'scanner') startCamera();
}
function openWine(id, scanned = false) {
  state.selectedId = id;
  state.foundByScan = scanned;
  state.history = [id, ...state.history.filter((item) => item !== id)].slice(0, 30);
  persist('wine:v2:history', state.history);
  go('result');
}
function choosePhoto() { document.querySelector('#photo-input')?.click(); }
function openNativeCamera() { document.querySelector('#native-camera-input')?.click(); }
function toggleFavorite(id) {
  state.favorites = isFavorite(id) ? state.favorites.filter((item) => item !== id) : [id, ...state.favorites];
  persist('wine:v2:favorites', state.favorites); render();
}

app.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-page],[data-action],[data-wine],[data-collection]');
  if (!target) return;
  if (target.dataset.page) { go(target.dataset.page); return; }
  if (target.dataset.wine) { openWine(target.dataset.wine); return; }
  if (target.dataset.collection) { state.selectedCollection = target.dataset.collection; go('collectionDetail'); return; }
  const { action, id } = target.dataset;
  if (action === 'back') { go(({ preview: 'scanner', scanner: 'home', result: 'home', digital: 'result', collectionDetail: 'collections', register: 'profile', login: 'profile' })[state.page] || 'profile'); }
  if (action === 'logout') { logoutUser(); state.user = null; go('profile'); }
  if (action === 'show-search') { state.showAll = true; render(); document.querySelector('#wine-search')?.focus(); document.querySelector('.search-block')?.scrollIntoView({ behavior: 'smooth' }); }
  if (action === 'show-more') { state.searchLimit += 30; render(); }
  if (action === 'choose-photo') choosePhoto();
  if (action === 'native-camera') openNativeCamera();
  if (action === 'take-photo') capturePhoto();
  if (action === 'retry-camera') startCamera();
  if (action === 'recognize') {
    if (!state.photo) return;
    if (!hasBackend) { go('notfound'); return; }
    go('recognizing');
    try {
      const result = await scanWine(state.photo);
      if (result.wine_id) {
        let wine = wineById(result.wine_id);
        if (!wine && hasBackend) { wine = await getWine(result.wine_id); if (wine) state.wines.push(wine); }
        if (wine) openWine(result.wine_id, true); else go('notfound');
      } else go('notfound');
    } catch { go('notfound'); }
  }
  if (action === 'toggle-favorite') toggleFavorite(id);
  if (action === 'reload-wines') loadWines();
  if (action === 'new-collection') {
    const name = prompt('Название подборки');
    if (name?.trim()) { state.collections.unshift({ id: `c${Date.now()}`, name: name.trim(), wineIds: [] }); persist('wine:v2:collections', state.collections); render(); }
  }
  if (action === 'add-to-collection') {
    const options = state.wines.map((wine, index) => `${index + 1}. ${wine.name}`).join('\n');
    const choice = Number(prompt(`Какое вино добавить? Введите номер:\n${options}`));
    const wine = state.wines[choice - 1]; const collection = state.collections.find((item) => item.id === id);
    if (wine && collection && !collection.wineIds.includes(wine.id)) { collection.wineIds.push(wine.id); persist('wine:v2:collections', state.collections); render(); }
  }
  if (action === 'new-diary') {
    const options = state.wines.map((wine, index) => `${index + 1}. ${wine.name}`).join('\n');
    const choice = Number(prompt(`Выберите вино по номеру:\n${options}`)); const wine = state.wines[choice - 1];
    if (!wine) return;
    const rating = Number(prompt('Оценка от 1 до 5', '5'));
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return;
    const note = prompt('Ваша заметка', '') || '';
    state.diary.unshift({ wineId: wine.id, rating, note, date: new Date().toISOString() });
    persist('wine:v2:diary', state.diary); render();
  }
});
app.addEventListener('submit', async (event) => {
  const form = event.target;
  if (!['register-form', 'login-form'].includes(form.id)) return;
  event.preventDefault();
  const message = form.querySelector('#auth-message');
  const showError = (text) => { message.textContent = text; message.hidden = false; };
  const fields = Object.fromEntries(new FormData(form));
  if (form.id === 'register-form' && fields.password !== fields.confirm) {
    showError('Пароли не совпадают.');
    return;
  }
  if (!hasBackend) {
    showError('Регистрация и вход заработают после подключения сервера.');
    return;
  }
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  message.hidden = true;
  try {
    state.user = form.id === 'register-form'
      ? await registerUser({ name: fields.name.trim(), email: fields.email.trim(), password: fields.password })
      : await loginUser({ email: fields.email.trim(), password: fields.password });
    go('profile');
  } catch (error) {
    showError(error.message || 'Не удалось связаться с сервером. Попробуйте ещё раз.');
    button.disabled = false;
  }
});
app.addEventListener('change', (event) => {
  if (!['photo-input', 'native-camera-input'].includes(event.target.id)) return;
  const file = event.target.files?.[0];
  if (!file) return;
  setPhoto(file);
});
app.addEventListener('input', (event) => {
  if (event.target.id !== 'wine-search') return;
  const cursor = event.target.selectionStart;
  state.query = event.target.value;
  state.searchLimit = 30;
  state.showAll = true;
  render();
  const input = document.querySelector('#wine-search');
  input?.focus(); input?.setSelectionRange(cursor, cursor);
});

async function loadWines() {
  state.loading = true; state.loadError = false; render();
  try { state.wines = await getWines() || []; }
  catch { state.wines = []; state.loadError = true; }
  state.loading = false; render();
}
loadWines();
restoreUser().then((user) => { state.user = user; if (state.page === 'profile') render(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.page === 'scanner') stopCamera();
  else if (!document.hidden && state.page === 'scanner' && !cameraStream) startCamera();
});
