import { mountExplorer } from './series-explorer.js?v=1';

const DATASET_ID = '025edc1e-3836-4984-947b-166376b727ef';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export async function renderVisitorStay(dataset) {
  if (dataset.id !== DATASET_ID) return false;
  const root = document.getElementById('interpreted');
  try {
    const response = await fetch('data/visitor_stay.json?v=1');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    if (!rows.length) throw new Error('No rows');
    const origins = [...new Set(rows.map(row => row.origin))];
    const districts = [...new Set(rows.map(row => row.district))];
    root.innerHTML = `<section class="story-section visitor-stay">
      <div class="story-eyebrow">旅遊局 · 區域旅遊數據</div>
      <h2>按來源地和統計分區查看平均逗留時間</h2>
      <p class="lede">選擇一個來源地及一個統計分區，再用起期、迄期或圖表查看每月原始數值。</p>
      <div class="visitor-dimensions"><label>來源地<select data-origin>${origins.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('')}</select></label><label>統計分區<select data-district>${districts.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('')}</select></label></div>
      <p class="visitor-method">不同來源地或分區的平均數不可直接加總，也不可在沒有旅客人次權重時再取平均。下圖始終只顯示一個精確組合。</p>
      <div data-explorer></div>
      <p class="visitor-provenance">來源：${esc(payload.source)}<br>統計期間：${esc(payload.periodStart)} 至 ${esc(payload.periodEnd)}<br>官方檔案更新：${esc(payload.sourceUpdated)}；本站抓取：${esc(payload.retrievedAt)}（澳門時間）<br>原始單位：分鐘。${Number.isFinite(payload.worksheetRows) ? `工作表共 ${payload.worksheetRows.toLocaleString('zh-Hant')} 行，其中 ${rows.length.toLocaleString('zh-Hant')} 筆非空資料。` : ''}</p>
    </section>`;
    const origin = root.querySelector('[data-origin]'), district = root.querySelector('[data-district]'), explorer = root.querySelector('[data-explorer]');
    const render = () => {
      const selected = rows.filter(row => row.origin === origin.value && row.district === district.value);
      explorer.className = '';
      explorer.replaceChildren();
      mountExplorer(explorer, {
        id: DATASET_ID,
        title: `${origin.value}／${district.value}平均逗留時間`,
        unit: '分鐘', periodType: '月度',
        points: selected.map(row => [row.period, row.value]),
      }, { source: payload.officialUrl });
    };
    origin.addEventListener('change', render);
    district.addEventListener('change', render);
    render();
    return true;
  } catch {
    root.innerHTML = '<section class="story-section"><h2>區域旅遊數據暫時未能讀取</h2><p>請先使用下方原表預覽，或到官方資料頁查看。</p></section>';
    return false;
  }
}
