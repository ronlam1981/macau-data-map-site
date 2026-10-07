import { initChrome, esc, datasetUrl, officialUrl } from './app.js?v=4';
import { lineChart, displaySeries } from './chart.js?v=5';
import { EDITORIAL, topicFor, validPoints, comparison, partOfWhole, observationAge } from './story-data.js?v=2';
import { SHARE_PARENTS, SHARE_COMPLEMENTS } from './story-comparisons.js';
import { LIVE_METRICS, pickLivePair } from './live-observations.js';
import { QUIZ_DEFINITIONS, pickQuiz, buildQuiz } from './quiz-data.js';

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
let registry = [], selection = [], topic = '全部', query = '', savedOnly = false, limit = 9, renderedCount = 0, renderToken = 0;
let snapshotAt = '網站已儲存資料';
let soundOn = true;
try { soundOn = localStorage.getItem('macau-sound-on') !== 'false'; } catch {}
let audioContext;
function playTone(frequency, delay = 0, duration = 0.065, volume = 0.012) {
  if (!soundOn) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    audioContext ||= new AudioContextClass();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    const start = audioContext.currentTime + delay;
    const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain); gain.connect(audioContext.destination);
    oscillator.start(start); oscillator.stop(start + duration + 0.01);
  } catch { /* Audio feedback is optional when a browser blocks Web Audio. */ }
}
function updateSoundToggle() {
  const button = $('sound-toggle');
  button.textContent = soundOn ? '♪ 音效開啟' : '♪ 音效關閉';
  button.setAttribute('aria-pressed', String(soundOn));
  button.setAttribute('aria-label', soundOn ? '關閉互動音效' : '開啟互動音效');
}
updateSoundToggle();
document.addEventListener('click', event => {
  if (event.target.closest('#sound-toggle')) return;
  if (event.target.closest('button:not(:disabled), .round-link')) playTone(440);
});
$('sound-toggle').addEventListener('click', () => {
  soundOn = !soundOn;
  try { localStorage.setItem('macau-sound-on', String(soundOn)); } catch {}
  updateSoundToggle();
  if (soundOn) playTone(660, 0, 0.09);
});
function heading(s) { return EDITORIAL[s.title]?.[0] || `${s.title}，最近有甚麼變化？`; }
function explanation(s) { return EDITORIAL[s.title]?.[2] || `這組記錄展示「${s.title}」隨時間的變化；指標定義以提供部門的資料為準。`; }
function deltaText(data) {
  const change = comparison(data.points, data.unit);
  if (!change) return '未有可對應的去年同期數據';
  return `較 ${change.previous[0]} ${change.direction}${change.delta ? ` ${num(Math.abs(change.value))}${change.unit === '%' ? '' : ' '}${change.unit || ''}` : ''}`;
}
async function shareContext(s, points) {
  const parentTitle = SHARE_PARENTS[s.title];
  if (!parentTitle) return null;
  const totalSeries = registry.find(item => item.title === parentTitle && item.unit === s.unit && item.periodType === s.periodType);
  if (!totalSeries) return null;
  try {
    const total = await readSeries(totalSeries.id);
    const result = partOfWhole(total.points, points);
    if (result?.period !== points.at(-1)?.[0]) return null;
    let remainderLabel = '其餘（總數減本項）';
    const complement = registry.find(item => item.title === SHARE_COMPLEMENTS[s.title]
      && item.unit === s.unit && item.periodType === s.periodType);
    if (complement) {
      try {
        const sibling = await readSeries(complement.id);
        const published = sibling.points.find(([period]) => period === result.period)?.[1];
        if (published != null && Math.abs(published - result.remainder) < Math.max(0.01, result.total * 0.000001))
          remainderLabel = complement.title;
      } catch { /* Keep the valid total comparison when an optional sibling is unavailable. */ }
    }
    return { ...result, totalSeries, series: s, remainderLabel };
  } catch { return null; }
}
function shareChange(context) {
  if (context.previousShare == null) return '';
  const change = context.changePoints;
  const previousLabel = /年\d+月$/.test(context.period) ? '去年同月' : '去年同期';
  if (change === 0) return `${previousLabel} ${num(context.previousShare, 1)}%，佔比持平`;
  const roundedDifference = Math.round(context.share * 10) / 10 - Math.round(context.previousShare * 10) / 10;
  if (!roundedDifference) return `${previousLabel} ${num(context.previousShare, 1)}%，佔比大致持平`;
  return `${previousLabel} ${num(context.previousShare, 1)}%，佔比${roundedDifference > 0 ? '高' : '低'} ${num(Math.abs(roundedDifference), 1)} 個百分點`;
}
function shareCard(context) {
  if (!context) return '';
  const special = context.series.title === '不過夜入境旅客';
  const restLabel = special ? '留宿' : context.remainderLabel;
  return `<div class="visitor-share"><div class="visitor-share-heading"><span>${special ? '佔同月全部入境旅客' : `佔同期${esc(context.totalSeries.title)}`}</span><strong>${num(context.share, 1)}%</strong></div><div class="visitor-share-track" role="img" aria-label="${esc(context.series.title)}佔 ${num(context.share, 1)}%，${esc(restLabel)}佔 ${num(100 - context.share, 1)}%"><i style="width:${context.share}%"></i></div><p>${esc(shareChange(context))}</p></div>`;
}
function shareDetail(context) {
  if (!context) return '';
  const special = context.series.title === '不過夜入境旅客';
  const partLabel = special ? '即日來回' : context.series.title;
  const restLabel = special ? '留宿' : context.remainderLabel;
  const title = special
    ? `${context.period}，每 100 人次約有 ${num(context.share, 0)} 人次即日來回`
    : `${context.period}，${context.series.title}佔整體 ${num(context.share, 1)}%`;
  const unit = context.series.unit || '';
  const note = special
    ? '同月總數扣除不過夜人次得出留宿人次。這些是人次，並非不重複的人數。'
    : context.remainderLabel === '其餘（總數減本項）'
      ? '兩項統計使用相同期間及單位；其餘數值由總數減去本項得出，不一定代表單一類別。'
      : '同一期間的兩類數值相加等於總數。';
  return `<section class="visitor-breakdown" aria-label="與整體比較"><p class="eyebrow">把這個數字放回整體之中</p><h3>${esc(title)}</h3><div class="visitor-breakdown-values"><div><span>${esc(partLabel)}</span><strong>${num(context.part)}</strong><small>${esc(unit)} · ${num(context.share, 1)}%</small></div><div><span>${esc(restLabel)}</span><strong>${num(context.remainder)}</strong><small>${esc(unit)} · ${num(100 - context.share, 1)}%</small></div></div><div class="visitor-share-track" role="img" aria-label="${esc(partLabel)}佔 ${num(context.share, 1)}%，${esc(restLabel)}佔 ${num(100 - context.share, 1)}%"><i style="width:${context.share}%"></i></div><p class="visitor-breakdown-note">${esc(context.totalSeries.title)}合計 ${num(context.total)} ${esc(unit)}${context.previousShare == null ? '' : `；${esc(shareChange(context))}`}。${esc(note)}</p></section>`;
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
async function renderStories(append = false) {
  const token = ++renderToken;
  filterSelection();
  const start = append ? renderedCount : 0;
  const visible = selection.slice(start, limit);
  const moreButton = $('more-stories');
  moreButton.disabled = true;
  if (append) moreButton.textContent = '正在發現故事…';
  else { renderedCount = 0; $('stories').replaceChildren(); }
  $('stories').setAttribute('aria-busy', 'true');
  const cards = await Promise.all(visible.map(async (s, i) => {
    try {
      const raw = await readSeries(s.id), data = displaySeries(raw), last = data.points.at(-1);
      const context = await shareContext(s, raw.points);
      return `<article class="story-card tone-${(start + i) % 4} is-entering" style="--enter-order:${i}" id="story-${esc(s.id)}"><div class="card-top"><span class="eyebrow">${esc(topicFor(s))}</span><button type="button" class="save-story" data-save="${esc(s.id)}" aria-label="收藏故事">♡</button></div>
        <h3><button class="story-open" type="button" data-open="${esc(s.id)}">${esc(heading(s))}</button></h3>
        <p class="story-number">${num(last[1])}<small>${esc(data.unit || '')}</small></p>
        <p class="story-period">${esc(last[0])} · ${esc(s.title)}</p><p class="story-change">${esc(deltaText(data))}</p>${shareCard(context)}
        <div class="story-spark">${spark(data.points)}</div><div class="card-foot"><span>已儲存統計 · ${esc(s.periodType || '定期更新')}</span><button type="button" data-open="${esc(s.id)}" aria-label="展開：${esc(heading(s))}">看故事 ↗</button></div></article>`;
    } catch {
      return `<article class="story-card tone-${(start + i) % 4} is-entering" style="--enter-order:${i}" id="story-${esc(s.id)}"><p class="eyebrow">${esc(topicFor(s))}</p><h3>${esc(heading(s))}</h3><p>這組實際記錄暫時未能讀取。</p><a href="${datasetUrl(s.datasetId)}">查看資料來源 →</a></article>`;
    }
  }));
  if (token !== renderToken) return;
  if (cards.length) $('stories').insertAdjacentHTML('beforeend', cards.join(''));
  else if (!append) $('stories').innerHTML = '<div class="empty">暫時沒有符合的故事。試試其他關鍵字或主題；收藏後可在這裡再次找到。</div>';
  renderedCount = start + cards.length;
  $('story-count').textContent = `${selection.length} 個可探索的統計指標 · 顯示 ${renderedCount} 個`;
  moreButton.hidden = renderedCount >= selection.length;
  moreButton.disabled = false;
  moreButton.textContent = `再發現 ${Math.min(9, selection.length - renderedCount)} 個故事 ↓`;
  $('stories').setAttribute('aria-busy', 'false');
  updateSaved();
  if (append && cards.length) {
    $('story-' + visible[0].id).scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
    playTone(660, 0, 0.1); playTone(880, 0.11, 0.13);
  }
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
    const context = await shareContext(s, raw.points);
    if (token !== detailToken || !dialog.open) return;
    $('story-detail').innerHTML = `<p class="eyebrow">${esc(topicFor(s))} / 數據故事</p><h2 id="dialog-title">${esc(heading(s))}</h2><p class="detail-value">${num(latest[1])}<small>${esc(data.unit || '')}</small></p><p>${esc(latest[0])} · ${esc(deltaText(data))}</p><p class="detail-explanation">${esc(explanation(s))}${raw.remarks ? `<br>來源備註：${esc(raw.remarks)}` : ''}</p>${shareDetail(context)}<div class="detail-chart chart-box" id="detail-chart"></div><p class="muted">${esc(s.title)} · 單位：${esc(data.unit || '來源未標示')}。折線縱軸按資料範圍縮放。</p><details class="table-view"><summary>查看每一期實際數值（${data.points.length} 期）</summary><div class="scroll"><table class="data"><thead><tr><th>期間</th><th>${esc(data.unit || '數值')}</th></tr></thead><tbody>${[...data.points].reverse().map(([p, v]) => `<tr><td>${esc(p)}</td><td>${num(v, 6)}</td></tr>`).join('')}</tbody></table></div></details><div class="detail-source"><p>提供：${esc(s.dept)}<br>網站資料快照：${esc(snapshotAt)}<br>比較方法：比對同一指標的去年相同期間；百分率使用百分點。沒有可對應資料時不計算同比；統計口徑變動請參閱來源備註。</p><a href="${officialUrl(s.datasetId)}" target="_blank" rel="noopener">官方原始資料 ↗</a> · <a href="${datasetUrl(s.datasetId)}">完整數據集內容 →</a>${context ? ` · <a href="${datasetUrl(context.totalSeries.datasetId)}">${esc(context.totalSeries.title)}總數 →</a>` : ''}</div><div class="detail-actions"><button class="btn" type="button" id="share-story">複製故事連結</button><span id="share-status" role="status"></span></div>`;
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
$('more-stories').addEventListener('click', () => { limit += 9; renderStories(true); });
let searchTimer;
$('story-search').addEventListener('input', event => { clearTimeout(searchTimer); query = event.target.value.trim().toLowerCase(); searchTimer = setTimeout(() => { limit = 9; renderStories(); }, 180); });
$('surprise').addEventListener('click', () => {
  for (let i = registry.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [registry[i], registry[j]] = [registry[j], registry[i]]; }
  limit = 9; renderStories();
});
let quizToken = 0;
let previousQuizId = null;
try { previousQuizId = sessionStorage.getItem('macau-last-quiz'); } catch {}
function quizVisual(quiz, revealed) {
  const maximum = Math.max(1, ...quiz.bars.map(bar => bar.value));
  return `<p class="visual-label">${revealed ? '數據揭曉' : '先估一估，再揭開實際數值'}</p>
    <div class="quiz-bars">${quiz.bars.map((bar, index) => `<div class="quiz-bar-row"><div class="quiz-bar-caption"><span>${esc(bar.label)}</span><strong>${revealed ? `${num(bar.value)} ${esc(quiz.unit)}` : '？'}</strong></div><div class="quiz-bar-track"><i class="quiz-bar-fill ${index ? 'second' : ''} ${revealed ? '' : 'concealed'}" style="width:${revealed ? `${bar.value / maximum * 100}%` : '55%'}"></i></div></div>`).join('')}</div>
    <p class="visual-source">資料期間：${esc(quiz.period)}<br>${esc(quiz.note)}<br>資料來源：${quiz.sourceLinks.map(source => `<a href="${datasetUrl(source.datasetId)}">${esc(source.title)}</a>`).join('、')}</p>`;
}
async function feature() {
  const token = ++quizToken;
  $('next-quiz').disabled = true;
  $('feature-heading').textContent = '正在找一個有趣的問題…';
  $('feature-description').textContent = '每個答案都會從實際記錄計算。';
  $('quiz').innerHTML = '<p role="status">正在讀取數據…</p>';
  $('quiz-result').innerHTML = '';
  $('feature-visual').innerHTML = '<span class="loading-copy">下一個問題，藏在數據裡。</span>';
  const remaining = QUIZ_DEFINITIONS.filter(definition =>
    definition.sources.every(title => registry.some(item => item.title === title)));
  while (remaining.length) {
    const definition = pickQuiz(remaining, previousQuizId);
    remaining.splice(remaining.indexOf(definition), 1);
    try {
      const sources = await Promise.all(definition.sources.map(title =>
        readSeries(registry.find(item => item.title === title).id)));
      if (token !== quizToken) return;
      const quiz = buildQuiz(definition, Object.fromEntries(definition.sources.map((title, index) => [title, sources[index]])));
      if (!quiz) continue;
      previousQuizId = quiz.id;
      try { sessionStorage.setItem('macau-last-quiz', quiz.id); } catch {}
      $('feature-heading').textContent = quiz.heading;
      $('feature-description').textContent = `${quiz.intro} 資料期間：${quiz.period}。`;
      $('feature-visual').innerHTML = quizVisual(quiz, false);
      $('quiz').innerHTML = `<button type="button" data-answer="first">${esc(quiz.bars[0].label)}${quiz.word}</button><button type="button" data-answer="second">${esc(quiz.bars[1].label)}${quiz.word}</button><button type="button" data-answer="equal">兩者一樣</button>`;
      $('next-quiz').disabled = false;
      $('quiz').onclick = event => {
        const button = event.target.closest('[data-answer]');
        if (!button || button.disabled) return;
        $('quiz').querySelectorAll('button').forEach(option => {
          option.disabled = true;
          option.classList.toggle('correct', option.dataset.answer === quiz.correct);
        });
        $('feature-visual').innerHTML = quizVisual(quiz, true);
        const answer = quiz.correct === 'equal' ? '兩者一樣。' : `${quiz.bars[quiz.correct === 'first' ? 0 : 1].label}${quiz.word}。`;
        const difference = Math.abs(quiz.bars[0].value - quiz.bars[1].value);
        const differenceUnit = quiz.unit === '%' ? '個百分點' : quiz.unit;
        $('quiz-result').innerHTML = `<p><strong>${button.dataset.answer === quiz.correct ? '估中了！' : '答案揭曉：'} ${esc(answer)}</strong><br>${esc(quiz.bars[0].label)}：${num(quiz.bars[0].value)} ${esc(quiz.unit)}；${esc(quiz.bars[1].label)}：${num(quiz.bars[1].value)} ${esc(quiz.unit)}。相差 ${num(difference)} ${esc(differenceUnit)}。</p>`;
      };
      return;
    } catch { if (token !== quizToken) return; }
  }
  if (token !== quizToken) return;
  $('feature-heading').textContent = '暫時找不到可驗證的題目';
  $('feature-description').textContent = '可以先探索下方的數據故事。';
  $('quiz').innerHTML = '';
  $('quiz').onclick = null;
  $('feature-visual').textContent = '每個故事，都由真實記錄開始。';
  $('next-quiz').disabled = false;
}
$('next-quiz').addEventListener('click', feature);

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
