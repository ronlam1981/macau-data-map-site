import { esc, officialUrl } from './app.js?v=4';
import { lineChart } from './chart.js?v=5';
import { loadLeaflet, renderBus } from './bus-view.js?v=1';

const n = value => Number(value).toLocaleString('zh-Hant', { maximumFractionDigits: 2 });
const yearOf = period => Number(String(period).match(/^\d{4}/)?.[0]);
const difference = (current, previous, unit) => {
  if (previous == null) return '沒有去年可比較的記錄';
  const delta = current - previous;
  if (delta === 0) return '與去年相同';
  const relative = previous > 0 ? `（${n(Math.abs(delta / previous * 100))}%）` : '';
  return `較去年${delta > 0 ? '增加' : '減少'} ${n(Math.abs(delta))}${esc(unit || '')}${relative}`;
};
function table(points, unit) {
  return `<details class="table-view"><summary>查看完整年份數值（${points.length} 年）</summary><div class="scroll"><table class="data"><thead><tr><th>年份</th><th>數值${unit ? `（${esc(unit)}）` : ''}</th></tr></thead><tbody>${[...points].reverse().map(([period, value]) => `<tr><td>${esc(period)}</td><td>${n(value)}</td></tr>`).join('')}</tbody></table></div></details>`;
}
function bars(items, unit) {
  const max = Math.max(...items.map(item => item.value), 1);
  return `<div class="derived-bars">${items.map(item => `<div class="derived-bar"><span>${esc(item.name)}</span><div class="derived-track"><i style="width:${Math.max(0, item.value / max * 100)}%"></i></div><strong>${n(item.value)}${esc(unit || '')}</strong></div>`).join('')}</div>`;
}
function singleSeries(box, payload, data, dataset) {
  const latest = data.points.at(-1), previous = data.points.find(([p]) => yearOf(p) === yearOf(latest[0]) - 1);
  const partial = yearOf(latest[0]) >= Number(payload.seriesRetrieved?.slice(0, 4) || new Date().getFullYear());
  box.innerHTML = `<section class="story-section derived-story"><div class="story-eyebrow">從完整原始記錄讀取 · ${esc(payload.seriesSource)}</div><h2>${esc(data.title)}，歷年點樣變？</h2><div class="derived-lead"><strong>${n(latest[1])}<small>${esc(data.unit || '')}</small></strong><p>${esc(latest[0])}<br>${partial ? '本年尚未完結，暫不作全年比較' : difference(latest[1], previous?.[1], data.unit)}</p></div>${partial ? `<p class="derived-note">${esc(latest[0])}的來源數值可能只是年內累計，不能與上一個完整年度直接比較。${payload.seriesRetrieved ? `資料抓取：${esc(payload.seriesRetrieved)}。` : ''}</p>` : ''}${data.note ? `<p class="derived-note">口徑提示：${esc(data.note)}</p>` : ''}<div class="chart-card"><div class="chart-box" id="derived-chart"></div>${table(data.points, data.unit)}</div><p class="story-note">以上來自${esc(dataset.dept)}的資料檔；${data.unit ? `單位：${esc(data.unit)}。` : '來源未註明單位。'}不同年份的統計口徑請參閱來源備註。</p></section>`;
  lineChart(box.querySelector('#derived-chart'), { ...data, title: data.title }, { height: 330 });
}
function selectableSeries(box, payload, dataset) {
  box.innerHTML = `<div class="derived-select"><label>選擇數值 <select aria-label="選擇數值">${payload.series.map((s, i) => `<option value="${i}">${esc(s.title)}</option>`).join('')}</select></label></div><div class="derived-selected"></div>`;
  const select = box.querySelector('select'), panel = box.querySelector('.derived-selected');
  const show = () => singleSeries(panel, payload, payload.series[Number(select.value)], dataset);
  select.addEventListener('change', show);
  show();
}
function groupedSeries(box, payload, dataset) {
  const series = payload.series;
  const latestYear = Math.max(...series.map(s => yearOf(s.latestPeriod)));
  const current = series.filter(s => s.points.some(([p]) => yearOf(p) === latestYear));
  const currentBars = current.map(s => ({ name: s.title.split(' · ').slice(1).join(' · ') || s.title,
    value: s.points.find(([p]) => yearOf(p) === latestYear)?.[1] ?? 0 }));
  const labels = new Set(current.map(s => s.title));
  const previous = series.filter(s => labels.has(s.title)).map(s => s.points.find(([p]) => yearOf(p) === latestYear - 1));
  const comparable = previous.length === current.length && previous.every(Boolean);
  const total = currentBars.reduce((sum, item) => sum + item.value, 0);
  const previousTotal = comparable ? previous.reduce((sum, p) => sum + p[1], 0) : null;
  const partial = latestYear >= Number(payload.seriesRetrieved?.slice(0, 4) || new Date().getFullYear());
  const years = [...new Set(current.flatMap(s => s.points.map(([p]) => yearOf(p))))].sort((a, b) => a - b);
  const totals = years.map(year => {
    const matched = current.map(s => s.points.find(([p]) => yearOf(p) === year));
    return matched.every(Boolean) ? [`${year}年`, matched.reduce((sum, p) => sum + p[1], 0)] : null;
  }).filter(Boolean);
  const unit = current[0]?.unit || '';
  const breakdown = payload.breakdownSeries || [];
  const breakdownYear = Math.max(...breakdown.map(s => yearOf(s.latestPeriod)), 0);
  const byType = new Map();
  for (const s of breakdown) {
    const value = s.points.find(([p]) => yearOf(p) === breakdownYear)?.[1];
    if (value === undefined) continue;
    const type = s.title.split(' · ').at(-1);
    byType.set(type, (byType.get(type) || 0) + value);
  }
  box.innerHTML = `<section class="story-section derived-story"><div class="story-eyebrow">從完整原始記錄讀取 · ${esc(payload.seriesSource)}</div><h2>${esc(dataset.name)}：分類數字</h2><div class="derived-lead"><strong>${n(total)}<small>${esc(unit)}</small></strong><p>${latestYear}年 · ${current.length} 個分類合計<br>${partial ? '本年尚未完結，暫不作全年比較' : difference(total, previousTotal, unit)}</p></div><p class="derived-note">以下總數只涵蓋資料檔列出的分類。${partial ? ` ${latestYear}年的來源數值可能只是年內累計，不能與上一個完整年度直接比較。${payload.seriesRetrieved ? `資料抓取：${esc(payload.seriesRetrieved)}。` : ''}` : ''}</p>${bars(currentBars.sort((a,b) => b.value-a.value), unit)}${totals.length > 1 ? `<div class="chart-card"><h3>同一組分類的年度走勢</h3><div class="chart-box" id="derived-chart"></div>${table(totals, unit)}</div>` : ''}${byType.size ? `<div class="derived-secondary"><h3>按車種再細看（${breakdownYear}年）</h3><p>這組細分來自 ${esc(payload.breakdownSource || '另一份資料檔')}，期間與上方最新統計不同，分開顯示。</p>${bars([...byType].map(([name,value]) => ({name,value})), unit)}</div>` : ''}<p class="story-note">提供：${esc(dataset.dept)}。資料內容按原始年份與類別整理；來源文件與下載連結見頁尾。</p></section>`;
  if (totals.length > 1) lineChart(box.querySelector('#derived-chart'), { title: '同一組分類總數', unit, points: totals }, { height: 300 });
}

function externalMapLinks(p) {
  const google = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.lat},${p.lon}`)}`;
  const amap = `https://uri.amap.com/marker?position=${p.lon},${p.lat}&name=${encodeURIComponent(p.name)}&coordinate=wgs84&src=shuzikanmacau&callnative=1`;
  return `<a href="${google}" target="_blank" rel="noopener noreferrer" aria-label="在 Google Maps 打開 ${esc(p.name)}">Google Maps ↗</a><a href="${amap}" target="_blank" rel="noopener noreferrer" aria-label="在高德地圖打開 ${esc(p.name)}">高德地圖 ↗</a>`;
}
async function renderPlaces(box, payload, dataset) {
  const places = payload.places;
  const missing = Math.max(0, (payload.placeRecordCount || places.length) - places.length);
  box.innerHTML = `<section class="story-section map-story"><div class="story-eyebrow">實際地點 · ${esc(payload.placeSource)}</div><h2>${esc(dataset.name)}：地圖上睇</h2><p class="lede">${places.length} 個有可信座標的位置。點選地圖或下方地點，可查看名稱、地址及開放資料。</p>${missing ? `<p class="story-note">另外 ${missing} 筆來源記錄沒有可辨識座標，未放上地圖。</p>` : ''}${payload.retrieved ? `<p class="story-note">資料時間：${esc(payload.retrieved)}；車位數據是快照，不代表此刻空位。</p>` : ''}<label class="map-search-label">搜尋地點 <input class="map-search" type="search" placeholder="輸入名稱或地址"></label><div class="place-layout"><div class="map-frame" role="region" aria-label="${esc(dataset.name)}地圖"><div class="place-map"></div></div><div class="place-list" aria-live="polite"></div></div><p class="story-note">地點座標來自來源資料。底圖：© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>。</p></section>`;
  const search = box.querySelector('.map-search'), list = box.querySelector('.place-list');
  const L = await loadLeaflet();
  const map = L.map(box.querySelector('.place-map'), { scrollWheelZoom: false, preferCanvas: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 18
  }).addTo(map);
  const markers = L.layerGroup().addTo(map);
  const allBounds = L.latLngBounds(places.map(p => [p.lat, p.lon]));
  map.fitBounds(allBounds.pad(.08), { maxZoom: 14 });
  const describe = p => `<strong>${esc(p.name)}</strong>${p.address ? `<br>${esc(p.address)}` : ''}${p.hours ? `<br>開放時間：${esc(p.hours)}` : ''}${p.carSpaces !== undefined ? `<br>汽車空位快照：${n(p.carSpaces)} 個` : ''}${p.motorcycleSpaces !== undefined ? `<br>電單車空位快照：${n(p.motorcycleSpaces)} 個` : ''}${p.observationTime ? `<br>來源時間：${esc(p.observationTime)}` : ''}<div class="place-map-links">${externalMapLinks(p)}</div>`;
  function paint() {
    const q = search.value.trim().toLowerCase();
    const selected = q ? places.filter(p => `${p.name} ${p.address || ''}`.toLowerCase().includes(q)) : places;
    markers.clearLayers();
    for (const p of selected) {
      const marker = L.circleMarker([p.lat, p.lon], { radius: 6, color: '#fff', weight: 1.5, fillColor: '#17717a', fillOpacity: .9 }).bindPopup(describe(p));
      marker.addTo(markers);
    }
    list.innerHTML = `<p class="place-count">${selected.length} 個地點${q ? '符合搜尋' : ''}</p>${selected.slice(0, 180).map((p, i) => `<div class="place-item"><button type="button" class="place-focus" data-place="${i}"><strong>${esc(p.name)}</strong>${p.address ? `<span>${esc(p.address)}</span>` : ''}${p.carSpaces !== undefined ? `<span>汽車空位快照：${n(p.carSpaces)}</span>` : ''}</button><div class="place-map-links">${externalMapLinks(p)}</div></div>`).join('')}${selected.length > 180 ? `<p class="story-note">列表先顯示 180 筆；其餘位置可在地圖查看或搜尋。</p>` : ''}`;
    list.querySelectorAll('[data-place]').forEach(button => button.addEventListener('click', () => {
      const p = selected[Number(button.dataset.place)];
      map.setView([p.lat, p.lon], Math.max(map.getZoom(), 16));
      for (const layer of markers.getLayers()) {
        const position = layer.getLatLng();
        if (position.lat === p.lat && position.lng === p.lon) { layer.openPopup(); break; }
      }
    }));
    if (selected.length && q) map.fitBounds(L.latLngBounds(selected.map(p => [p.lat, p.lon])).pad(.12), { maxZoom: 16 });
  }
  search.addEventListener('input', paint);
  paint();
  setTimeout(() => map.invalidateSize(), 0);
}

export async function renderDerived(dataset, hasExistingSeries) {
  let index;
  try { index = await (await fetch('data/derived/index.json?v=2')).json(); } catch { return false; }
  if (!index[dataset.id]) return false;
  let payload;
  try { payload = await (await fetch(`data/derived/${encodeURIComponent(dataset.id)}.json?v=2`)).json(); } catch { return false; }
  let shown = false;
  if (payload.series?.length && !hasExistingSeries) {
    const box = document.getElementById('interpreted');
    const categoryNames = payload.series.map(s => s.title.split(' · ').slice(1).join(' · '));
    const commonMetric = payload.series.every(s => s.title.split(' · ')[0] === payload.series[0].title.split(' · ')[0]);
    const additive = commonMetric && payload.series.every(s => ['人', '車次'].includes(s.unit)) && categoryNames.every(name => name && !/總數|合計|total/i.test(name));
    if (payload.series.length === 1) singleSeries(box, payload, payload.series[0], dataset);
    else if (additive) groupedSeries(box, payload, dataset);
    else selectableSeries(box, payload, dataset);
    shown = true;
  }
  if (payload.places?.length) {
    const box = document.getElementById('places');
    try { await renderPlaces(box, payload, dataset); }
    catch {
      box.innerHTML = `<section class="story-section"><h2>${esc(dataset.name)}：地點資料</h2><p>地圖暫時未能載入。可到官方資料頁查看原始記錄。</p><a href="${officialUrl(dataset.id)}" target="_blank" rel="noopener">查看官方來源 ↗</a></section>`;
    }
    shown = true;
  }
  if (payload.routes?.length && payload.stops) {
    const box = document.getElementById('places');
    try { await renderBus(box, payload); }
    catch {
      box.innerHTML = `<section class="story-section"><h2>巴士路線資料</h2><p>路線地圖暫時未能載入。可到官方資料頁查看原始記錄。</p><a href="${officialUrl(dataset.id)}" target="_blank" rel="noopener">查看官方來源 ↗</a></section>`;
    }
    shown = true;
  }
  return shown;
}
