import { esc } from './app.js?v=4';

let leafletReady;
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!leafletReady) {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'assets/vendor/leaflet/leaflet.css'; document.head.append(css);
    leafletReady = new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = 'assets/vendor/leaflet/leaflet.js';
      script.onload = () => window.L ? resolve(window.L) : reject(new Error('Leaflet missing'));
      script.onerror = reject; document.head.append(script);
    });
  }
  return leafletReady;
}

const mapLinks = stop => {
  const google = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${stop.lat},${stop.lon}`)}`;
  const amap = `https://uri.amap.com/marker?position=${stop.lon},${stop.lat}&name=${encodeURIComponent(stop.name)}&coordinate=wgs84&src=shuzikanmacau&callnative=1`;
  return `<div class="place-map-links"><a href="${google}" target="_blank" rel="noopener noreferrer">Google Maps ↗</a><a href="${amap}" target="_blank" rel="noopener noreferrer">高德地圖 ↗</a></div>`;
};

export async function renderBus(box, data) {
  const stops = Object.values(data.stops), routes = data.routes;
  const routeOptions = routes.map((route, index) =>
    `<option value="${index}">${esc(route.number)} · ${esc(route.direction)} 方向（${route.stops.length} 站）</option>`).join('');
  const byStopCount = [...routes].sort((a, b) => b.stops.length - a.stops.length);
  const quick = [...new Set(byStopCount.map(route => route.number))].slice(0, 8);
  const hubs = [...stops].sort((a, b) => b.routes.length - a.routes.length).slice(0, 5);
  box.innerHTML = `<section class="story-section bus-story"><div class="story-eyebrow">從完整路線檔整理 · ${esc(data.source)}</div>
    <h2>巴士路線，放到地圖先睇得明</h2>
    <p class="lede">${stops.length} 個站點、${data.routeNumberCount} 條路線、${routes.length} 個路線方向。選一個方向，即可看路線經過的路段與站點次序。</p>
    <p class="story-note">資料檔日期：${esc(data.sourceDate || '未標示')}。路線與站序取自官方壓縮包；地圖並非即時巴士位置或班次。</p>
    <div class="bus-controls"><label>選擇路線方向<select class="bus-route"><option value="">全部站點</option>${routeOptions}</select></label><label>搜尋站名或站號<input class="bus-search" type="search" placeholder="例如：關閘、M11_1"></label></div>
    <div class="bus-quick"><span>站點較多的路線</span>${quick.map(number => `<button type="button" data-route-number="${esc(number)}">${esc(number)}</button>`).join('')}</div>
    <div class="bus-quick"><span>途經路線較多的站點</span>${hubs.map(stop => `<button type="button" data-hub-stop="${esc(stop.id)}">${esc(stop.name)} · ${stop.routes.length} 線</button>`).join('')}</div>
    <div class="bus-selection" aria-live="polite"></div>
    <div class="place-layout"><div class="map-frame" role="region" aria-label="澳門巴士路線地圖"><div class="place-map"></div></div><div class="place-list bus-stop-list"></div></div>
    <p class="story-note">路線線段來自 ROUTE_NETWORK.shp，站序來自 BUS_ROUTE_SEQ.xls。地圖座標由澳門方格網轉為 WGS84。底圖：© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>。</p></section>`;

  const L = await loadLeaflet();
  const map = L.map(box.querySelector('.place-map'), { scrollWheelZoom: false, preferCanvas: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 18,
  }).addTo(map);
  const routeLayer = L.layerGroup().addTo(map), markerLayer = L.layerGroup().addTo(map);
  const allBounds = L.latLngBounds(stops.map(stop => [stop.lat, stop.lon]));
  map.fitBounds(allBounds.pad(.08), { maxZoom: 12 });
  const select = box.querySelector('.bus-route'), search = box.querySelector('.bus-search');
  const heading = box.querySelector('.bus-selection'), list = box.querySelector('.bus-stop-list');
  let markers = new Map();

  function draw(fit = false) {
    const route = select.value === '' ? null : routes[Number(select.value)];
    const query = search.value.trim().toLowerCase();
    const ordered = route ? route.stops.map(id => data.stops[id]).filter(Boolean) : stops;
    const matching = query ? ordered.filter(stop =>
      `${stop.name} ${stop.code} ${stop.routes.join(' ')}`.toLowerCase().includes(query)) : ordered;
    routeLayer.clearLayers(); markerLayer.clearLayers(); markers = new Map();
    const positions = [];
    if (route) {
      for (const id of route.segments) {
        for (const path of data.segments[id] || []) {
          L.polyline(path, { color: '#713b9a', weight: 5, opacity: .95 }).addTo(routeLayer);
          if (fit) positions.push(...path);
        }
      }
    }
    for (const stop of matching) {
      if (markers.has(stop.id)) continue;
      const marker = L.circleMarker([stop.lat, stop.lon], { radius: route ? 6 : 5,
        color: '#fff', weight: 1.5, fillColor: '#17717a', fillOpacity: .95 });
      marker.bindPopup(`<strong>${esc(stop.code)} · ${esc(stop.name)}</strong><br>經過路線：${esc(stop.routes.join('、'))}${mapLinks(stop)}`);
      marker.addTo(markerLayer); markers.set(stop.id, marker);
      if (fit && query) positions.push([stop.lat, stop.lon]);
    }
    heading.innerHTML = route
      ? `<h3>${esc(route.number)} · ${esc(route.direction)} 方向</h3><p>${esc(route.name)} · ${esc(route.company)} · ${route.stops.length} 個站序記錄</p>${route.remarks ? `<p class="story-note">來源備註：${esc(route.remarks)}</p>` : ''}`
      : '<p>選擇路線方向，可沿官方站序逐站探索。</p>';
    list.innerHTML = `<p class="place-count">${matching.length} 個${route ? '站序記錄' : '站點'}${query ? '符合搜尋' : ''}</p>`
      + matching.slice(0, 140).map((stop, index) => `<div class="place-item"><button type="button" class="place-focus" data-stop="${esc(stop.id)}"><strong>${route ? `${index + 1}. ` : ''}${esc(stop.code)} · ${esc(stop.name)}</strong><span>經過路線：${esc(stop.routes.join('、'))}</span></button>${mapLinks(stop)}</div>`).join('')
      + (matching.length > 140 ? '<p class="story-note">列表先顯示 140 筆；可搜尋站名或站號查看其餘站點。</p>' : '');
    list.querySelectorAll('[data-stop]').forEach(button => button.addEventListener('click', () => {
      const stop = data.stops[button.dataset.stop];
      map.setView([stop.lat, stop.lon], Math.max(map.getZoom(), 16));
      markers.get(stop.id)?.openPopup();
    }));
    if (fit && positions.length) map.fitBounds(L.latLngBounds(positions).pad(.08), { maxZoom: query ? 15 : 13 });
    else if (fit && !route && !query) map.fitBounds(allBounds.pad(.08), { maxZoom: 12 });
  }
  select.addEventListener('change', () => { search.value = ''; draw(true); });
  search.addEventListener('input', () => draw(Boolean(search.value.trim())));
  box.querySelectorAll('[data-route-number]').forEach(button => button.addEventListener('click', () => {
    const index = routes.findIndex(route => route.number === button.dataset.routeNumber);
    if (index < 0) return;
    select.value = String(index); search.value = ''; draw(true);
  }));
  box.querySelectorAll('[data-hub-stop]').forEach(button => button.addEventListener('click', () => {
    const stop = data.stops[button.dataset.hubStop];
    if (!stop) return;
    select.value = ''; search.value = stop.code; draw(false);
    map.setView([stop.lat, stop.lon], 16);
    markers.get(stop.id)?.openPopup();
  }));
  draw();
  setTimeout(() => map.invalidateSize(), 0);
}
