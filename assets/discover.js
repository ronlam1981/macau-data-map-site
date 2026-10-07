import { initChrome, esc, datasetUrl, officialUrl } from './app.js?v=4';
import { lineChart, displaySeries } from './chart.js?v=5';
import { EDITORIAL, topicFor, validPoints, comparison, visitorShare, observationAge } from './story-data.js';
import { LIVE_METRICS, pickLivePair } from './live-observations.js';

initChrome('home');
const $ = id => document.getElementById(id);
const num = (value, digits = 2) => Number(value).toLocaleString('zh-Hant', { maximumFractionDigits: digits });
const cache = new Map();
async function readJSON(url, timeout = 12000) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timer); }
}
function readSeries(id) {
  if (!cache.has(id)) cache.set(id, readJSON(`data/series/${encodeURIComponent(id)}.json`).then(raw => {
    const points = validPoints(raw.points);
    if (!points.length) throw new Error('No valid points');
    return { ...raw, points };
  }).catch(error => { cache.delete(id); throw error; }));
  return cache.get(id);
}
let saved = new Set();
try { const value = JSON.parse(localStorage.getItem('macau-saved-stories') || '[]'); if (Array.isArray(value)) saved = new Set(value.filter(x => typeof x === 'string')); } catch {}
let registry = [], selection = [], topic = '全部', query = '', savedOnly = false, limit = 9, renderToken = 0;
let snapshotAt = '網站已儲存資料';
function heading(s) { return EDITORIAL[s.title]?.[0] || `${s.title}，最近有甚麼變化？`; }
function explanation(s) { return EDITORIAL[s.title]?.[2] || `這組記錄展示「${s.title}」隨時間的變化；指標定義以提供部門的資料為準。`; }
function deltaText(data) {
  const change = comparison(data.points, data.unit);
  if (!change) return '未有可對應的去年同期數據';
  return `較 ${change.previous[0]} ${change.direction}${change.delta ? ` ${num(Math.abs(change.value))}${change.unit === '%' ? '' : ' '}${change.unit || ''}` : ''}`;
}
function spark(points) {
  const recent = points.slice(-36), values = recent.map(p => p[1]);
  if (recent.length < 2) return '<span class="muted">尚未有足夠記錄繪圖</span>';
  const low = Math.min(...values), high = Math.max(...values), span = high - low || 1;
  const path = recent.map((p, i) => `${i ? 'L' : 'M'}${(i / (recent.length - 1) * 300).toFixed(1)},${(66 - (p[1] - low) / span * 52).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 300 80" role="img" aria-label="${esc(recent[0][0])} 至 ${esc(recent.at(-1)[0])}走勢，詳細數值可展開查看"><path d="${path} L300,80 L0,80 Z" fill="currentColor" opacity=".07"/><path d="${path}" fill="none" stroke="currentColor" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>`;
}
function updateSaved() {
  $('saved-count').textContent = saved.size;
  document.querySelectorAll('[data-save]').forEach(button => {
    const on = saved.has(button.dataset.save);
    button.textContent = on ? '♥' : '♡'; button.setAttribute('aria-pressed', String(on));
    const item = registry.find(s => s.id === button.dataset.save);
    button.setAttribute('aria-label', `${on ? '取消收藏' : '收藏'}：${item ? heading(item) : '故事'}`);
  });
}
function filterSelection() {
  selection = registry.filter(s => (topic === '全部' || topicFor(s) === topic)
    && (!savedOnly || saved.has(s.id)) && (!query || `${heading(s)} ${s.title} ${s.theme} ${topicFor(s)}`.toLowerCase().includes(query)));
}
async function renderStories() {
  const token = ++renderToken;
  filterSelection();
  const visible = selection.slice(0, limit);
  $('story-count').textContent = `${selection.length} 個可探索的統計指標 · 顯示 ${visible.length} 個`;
  $('more-stories').hidden = selection.length <= limit;
  $('stories').setAttribute('aria-busy', 'true');
  $('stories').innerHTML = visible.length ? visible.map((s, i) => `<article class="story-card tone-${i % 4}" id="story-${esc(s.id)}"><p class="eyebrow">${esc(topicFor(s))}</p><h3>${esc(heading(s))}</h3><p class="muted">讀取實際記錄中…</p></article>`).join('') : '<div class="empty">暫時沒有符合的故事。試試其他關鍵字或主題；收藏後可在這裡再次找到。</div>';
  await Promise.all(visible.map(async (s, i) => {
    try {
      const raw = await readSeries(s.id), data = displaySeries(raw), last = data.points.at(-1);
      if (token !== renderToken) return;
      const card = $('story-' + s.id);
      card.innerHTML = `<div class="card-top"><span class="eyebrow">${esc(topicFor(s))}</span><button type="button" class="save-story" data-save="${esc(s.id)}" aria-label="收藏故事">♡</button></div>
        <h3><button class="story-open" type="button" data-open="${esc(s.id)}">${esc(heading(s))}</button></h3>
        <p class="story-number">${num(last[1])}<small>${esc(data.unit || '')}</small></p>
        <p class="story-period">${esc(last[0])} · ${esc(s.title)}</p><p class="story-change">${esc(deltaText(data))}</p>
        <div class="story-spark">${spark(data.points)}</div><div class="card-foot"><span>已儲存統計 · ${esc(s.periodType || '定期更新')}</span><button type="button" data-open="${esc(s.id)}" aria-label="展開：${esc(heading(s))}">看故事 ↗</button></div>`;
    } catch {
      if (token !== renderToken) return;
      $('story-' + s.id).innerHTML = `<p class="eyebrow">${esc(topicFor(s))}</p><h3>${esc(heading(s))}</h3><p>這組實際記錄暫時未能讀取。</p><a href="${datasetUrl(s.datasetId)}">查看資料來源 →</a>`;
    }
  }));
  if (token === renderToken) { $('stories').setAttribute('aria-busy', 'false'); updateSaved(); }
}
let detailToken = 0;
async function openStory(id) {
  const s = registry.find(item => item.id === id); if (!s) return;
  const token = ++detailToken, dialog = $('story-dialog');
  $('story-detail').innerHTML = `<h2 id="dialog-title">${esc(heading(s))}</h2><p role="status">讀取故事中…</p>`;
  if (!dialog.open) dialog.showModal();
  const url = new URL(location.href); url.searchParams.set('story', id); history.replaceState(null, '', url);
  try {
    const raw = await readSeries(s.id), data = displaySeries(raw), latest = data.points.at(-1);
    if (token !== detailToken || !dialog.open) return;
    $('story-detail').innerHTML = `<p class="eyebrow">${esc(topicFor(s))} / 數據故事</p><h2 id="dialog-title">${esc(heading(s))}</h2><p class="detail-value">${num(latest[1])}<small>${esc(data.unit || '')}</small></p><p>${esc(latest[0])} · ${esc(deltaText(data))}</p><p class="detail-explanation">${esc(explanation(s))}${raw.remarks ? `<br>來源備註：${esc(raw.remarks)}` : ''}</p><div class="detail-chart chart-box" id="detail-chart"></div><p class="muted">${esc(s.title)} · 單位：${esc(data.unit || '來源未標示')}。折線縱軸按資料範圍縮放。</p><details class="table-view"><summary>查看每一期實際數值（${data.points.length} 期）</summary><div class="scroll"><table class="data"><thead><tr><th>期間</th><th>${esc(data.unit || '數值')}</th></tr></thead><tbody>${[...data.points].reverse().map(([p, v]) => `<tr><td>${esc(p)}</td><td>${num(v, 6)}</td></tr>`).join('')}</tbody></table></div></details><div class="detail-source"><p>提供：${esc(s.dept)}<br>網站資料快照：${esc(snapshotAt)}<br>比較方法：比對同一指標的去年相同期間；百分率使用百分點。沒有可對應資料時不計算同比；統計口徑變動請參閱來源備註。</p><a href="${officialUrl(s.datasetId)}" target="_blank" rel="noopener">官方原始資料 ↗</a> · <a href="${datasetUrl(s.datasetId)}">完整數據集內容 →</a></div><div class="detail-actions"><button class="btn" type="button" id="share-story">複製故事連結</button><span id="share-status" role="status"></span></div>`;
    lineChart($('detail-chart'), { ...data, title: s.title }, { height: 360 });
    $('share-story').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(location.href); $('share-status').textContent = '連結已複製'; }
      catch { $('share-status').textContent = '請複製瀏覽器網址分享這個故事。'; }
    });
  } catch { $('story-detail').innerHTML = `<h2 id="dialog-title">${esc(heading(s))}</h2><p>記錄暫時未能載入，請稍後重試。</p><a href="${datasetUrl(s.datasetId)}">查看資料來源</a>`; }
}
$('close-story').addEventListener('click', () => $('story-dialog').close());
$('story-dialog').addEventListener('close', () => { detailToken++; const url = new URL(location.href); url.searchParams.delete('story'); history.replaceState(null, '', url); });
document.addEventListener('click', event => {
  const open = event.target.closest('[data-open]'); if (open) openStory(open.dataset.open);
  const save = event.target.closest('[data-save]');
  if (save) {
    const id = save.dataset.save; saved.has(id) ? saved.delete(id) : saved.add(id);
    try { localStorage.setItem('macau-saved-stories', JSON.stringify([...saved])); } catch {}
    updateSaved(); if (savedOnly) renderStories();
  }
});
$('saved-only').addEventListener('click', () => { savedOnly = !savedOnly; $('saved-only').setAttribute('aria-pressed', String(savedOnly)); limit = 9; renderStories(); });
$('more-stories').addEventListener('click', () => { limit += 9; renderStories(); });
let searchTimer;
$('story-search').addEventListener('input', event => { clearTimeout(searchTimer); query = event.target.value.trim().toLowerCase(); searchTimer = setTimeout(() => { limit = 9; renderStories(); }, 180); });
$('surprise').addEventListener('click', () => {
  for (let i = registry.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [registry[i], registry[j]] = [registry[j], registry[i]]; }
  limit = 9; renderStories();
});
async function feature() {
  try {
    const total = registry.find(s => s.title === '入境旅客'), stay = registry.find(s => s.title === '留宿入境旅客');
    if (!total || !stay) throw new Error('Missing series');
    const [a, b] = await Promise.all([readSeries(total.id), readSeries(stay.id)]), share = visitorShare(a.points, b.points);
    if (!share) throw new Error('No common period');
    $('feature-visual').innerHTML = `<p class="visual-label">如果把旅客縮成 100 個人次…</p><div class="waffle concealed" id="waffle" aria-hidden="true">${Array.from({ length: 100 }, (_, i) => `<i class="${i < Math.round(share.share) ? 'day' : 'night'}"></i>`).join('')}</div><div class="waffle-legend" id="waffle-legend">先選一個答案，揭開這幅圖。</div><p class="visual-source">統計期間：${esc(share.period)} · 統計暨普查局<br>圖示四捨五入至整數百分比；非此刻入境人數。</p>`;
    $('quiz').innerHTML = '<button type="button" data-answer="stay">多數會過夜</button><button type="button" data-answer="day">多數即日來回</button><button type="button" data-answer="half">剛好一半一半</button>';
    $('quiz').addEventListener('click', event => {
      const button = event.target.closest('[data-answer]'); if (!button) return;
      const correct = share.share === 50 ? 'half' : share.share > 50 ? 'day' : 'stay';
      $('quiz').querySelectorAll('button').forEach(b => { b.disabled = true; b.classList.toggle('correct', b.dataset.answer === correct); });
      $('waffle').classList.remove('concealed');
      $('waffle-legend').innerHTML = `<span><i class="legend-day"></i> 即日來回 ${num(share.share, 1)}%</span><span><i class="legend-night"></i> 留宿 ${num(100 - share.share, 1)}%</span>`;
      $('quiz-result').innerHTML = `<p><strong>${button.dataset.answer === correct ? '估中了！' : '答案揭曉：'} ${correct === 'day' ? '多數即日來回。' : correct === 'stay' ? '多數會留宿。' : '剛好各佔一半。'}</strong><br>${esc(share.period)}共有 ${num(share.total, 0)} 入境旅客人次，其中 ${num(share.sameDay, 0)} 人次不過夜。</p><button type="button" class="text-button" data-open="${esc(total.id)}">接著看：旅客數目怎樣變化？ →</button>`;
    });
  } catch { $('quiz').innerHTML = '<p>旅客記錄暫時未能讀取，可先探索下方故事。</p>'; $('feature-visual').textContent = '每個故事，都由真實記錄開始。'; }
}

const liveSources = {
  air: 'https://www.smg.gov.mo/smg/airQuality/latestAirConcentration.json',
  weather: 'https://xml.smg.gov.mo/c_actualweather.xml',
};
function checkedObservations(payload, metric) {
  const candidate = payload?.metrics?.[metric] || (['temperature', 'pm25'].includes(metric) ? payload?.records : null);
  if (!payload?.sourceAt || !Array.isArray(candidate)) throw new Error('Invalid feed');
  const records = candidate.filter(r => r.name && typeof r.value === 'number' && Number.isFinite(r.value));
  if (!records.length) throw new Error('No observations');
  return { ...payload, records };
}
async function getLive(kind, metric) {
  try { return { data: checkedObservations(await readJSON(`api/live/${kind}`), metric), snapshot: false }; } catch {}
  if (kind === 'air') {
    try {
      const raw = await readJSON(liveSources.air, 8000);
      const fields = { pm25: 'HE_PM2_5', pm10: 'HE_PM10', no2: 'HE_NO2', o3: 'HE_O3' };
      const records = Object.values(raw).filter(v => v && typeof v === 'object' && v.Chinese && String(v[fields[metric]] ?? '').trim() !== '')
        .map(v => ({ name: v.Chinese, value: Number(v[fields[metric]]), time: /^\d{10}$/.test(v.DDTT || '') ? `${v.DDTT.slice(0, 4)}-${v.DDTT.slice(4, 6)}-${v.DDTT.slice(6, 8)} ${v.DDTT.slice(8, 10)}時` : '來源未標示' })).filter(r => r.value >= 0);
      return { data: checkedObservations({ sourceAt: raw.datetime, metrics: { [metric]: records } }, metric), snapshot: false };
    } catch {}
  }
  return { data: checkedObservations(await readJSON(`data/live/${kind}.json`), metric), snapshot: true };
}
async function renderLive(kind, metric) {
  const box = $('live-' + kind), source = LIVE_METRICS[kind][metric];
  box.setAttribute('aria-busy', 'true');
  box.dataset.metric = metric;
  box.innerHTML = `<p class="eyebrow">${esc(source.label)}</p><h3>${esc(source.title)}</h3><p role="status">正在讀取氣象局觀測…</p>`;
  try {
    const { data, snapshot } = await getLive(kind, metric), age = observationAge(data.sourceAt);
    const fresh = !snapshot && age !== null && age >= -5 && age <= 120;
    const status = snapshot ? '已儲存快照 · 即時讀取未成功' : fresh ? '已連線 · 來源兩小時內更新' : '已連線 · 來源時間需留意';
    const records = [...data.records].sort((a, b) => b.value - a.value), highest = records[0];
    const minimum = Math.min(...records.map(r => r.value), 0);
    const maximum = Math.max(...records.map(r => r.value), 1);
    box.innerHTML = `<div class="card-top"><span class="eyebrow">${esc(source.label)}</span><span class="live-status ${fresh ? 'is-fresh' : ''}">${esc(status)}</span></div><h3>${esc(source.title)}</h3><p class="observation-value">${num(highest.value, 1)}<small>${esc(source.unit)}</small><span>${esc(highest.name)} · 本批最高</span></p><div class="observation-bars">${records.slice(0, 6).map(r => `<div class="observation-row"><span>${esc(r.name)}</span><div><i style="width:${(r.value - minimum) / (maximum - minimum) * 100}%"></i></div><strong>${num(r.value, 1)}</strong></div>`).join('')}</div>${records.length > 6 ? `<p class="observation-more">先顯示數值最高的 6 站；完整 ${records.length} 站可在下方展開。</p>` : ''}<p class="observation-time">來源發布：${esc(data.sourceAt)}（澳門時間）<br>${records.length} 個有有效數值的測站 · ${snapshot ? '顯示最近儲存的觀測' : '頁面每 5 分鐘重新讀取'}</p><p class="observation-note">${esc(source.note)}</p><details class="observation-source"><summary>來源與各站觀測時間</summary><ul>${records.map(r => `<li>${esc(r.name)}：${num(r.value, 1)} ${esc(source.unit)} · ${esc(r.time || '來源未標示')}</li>`).join('')}</ul><a href="${liveSources[kind]}" target="_blank" rel="noopener">氣象局原始觀測 ↗</a></details>`;
  } catch { box.innerHTML = `<p class="eyebrow">${esc(source.label)}</p><h3>${esc(source.title)}</h3><p>暫時未能取得有效觀測。可換一組數據或前往來源網站。</p><a href="${liveSources[kind]}" target="_blank" rel="noopener">查看氣象局來源 ↗</a>`; }
  finally { box.setAttribute('aria-busy', 'false'); }
}
let refreshing = false;
let livePair = null;
try { livePair = JSON.parse(sessionStorage.getItem('macau-last-live-pair')); } catch {}
async function refreshLive(change = false) {
  if (refreshing) return;
  refreshing = true; $('refresh-live').disabled = true; $('refresh-live').textContent = '正在讀取…';
  if (change || !livePair) {
    livePair = pickLivePair(livePair);
    try { sessionStorage.setItem('macau-last-live-pair', JSON.stringify(livePair)); } catch {}
  }
  await Promise.allSettled(['weather', 'air'].map(kind => renderLive(kind, livePair[kind])));
  refreshing = false; $('refresh-live').disabled = false; $('refresh-live').textContent = '換一組數據 ↻';
}
$('refresh-live').addEventListener('click', () => refreshLive(true));
refreshLive(true);
setInterval(() => { if (!document.hidden) refreshLive(false); }, 300000);

try {
  registry = await readJSON('data/series_index.json?v=3');
  registry = registry.filter(s => s.id && s.datasetId && s.title);
  const order = Object.keys(EDITORIAL);
  registry.sort((a, b) => (order.includes(a.title) ? order.indexOf(a.title) : 999) - (order.includes(b.title) ? order.indexOf(b.title) : 999));
  const topics = ['全部', ...new Set(registry.map(topicFor))];
  $('topics').innerHTML = topics.map(t => `<button type="button" data-topic="${esc(t)}" aria-pressed="${t === topic}">${esc(t)}</button>`).join('');
  $('topics').addEventListener('click', event => { const button = event.target.closest('[data-topic]'); if (!button) return; topic = button.dataset.topic; limit = 9; $('topics').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button))); renderStories(); });
  await Promise.all([renderStories(), feature()]);
  const requested = new URL(location.href).searchParams.get('story'); if (requested) openStory(requested);
} catch { $('stories').innerHTML = '<p>故事索引暫時未能讀取。<a href="index.html">重新載入</a>，或先查看上方即時觀測。</p>'; $('stories').setAttribute('aria-busy', 'false'); $('story-count').textContent = '故事暫時未能載入'; $('quiz').textContent = '旅客故事暫時未能讀取。'; }
readJSON('data/catalog.json?v=4').then(cat => { snapshotAt = cat.generated; $('snapshot-note').textContent = `統計目錄快照：${cat.generated}。各指標的資料期間以卡片標示為準；不代表來源網站目前的最新版本。`; }).catch(() => {});
