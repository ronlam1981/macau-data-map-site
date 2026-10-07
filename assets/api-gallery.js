import { esc, datasetUrl, THEME_ICON } from "./app.js?v=4";
import { lineChart, fmtNum, displaySeries } from "./chart.js?v=5";

function compactValue(v, unit) {
  const divisor = unit === "百萬澳門元" ? 100 : unit === "千澳門元" ? 100000 : null;
  return { value: fmtNum(divisor ? v / divisor : v, divisor ? 2 : null),
           unit: divisor ? "億澳門元" : unit || "" };
}

export function setupApiGallery({ box, filters, shuffle, datasets, seriesIndex, count = 4, rotate = false }) {
  const skip = /變動率|增長率|自殺|死亡|兇殺|命案|虐待|性侵|愛滋|癌症|墮胎|流產/;
  const series = seriesIndex.filter(s => s.n >= 12 && !skip.test(s.title));
  const byTheme = new Map();
  for (const s of series) {
    if (!byTheme.has(s.theme)) byTheme.set(s.theme, []);
    byTheme.get(s.theme).push(s);
  }
  let theme = "", timer = null;
  let seen = new Set();

  if (filters) {
    const counts = new Map();
    for (const d of datasets) counts.set(d.theme, (counts.get(d.theme) || 0) + 1);
    filters.innerHTML = `<button class="chip" data-theme="" aria-pressed="true">全部 ${datasets.length}</button>` +
      [...counts].sort((a, b) => b[1] - a[1]).map(([name, n]) =>
        `<button class="chip" data-theme="${esc(name)}" aria-pressed="false">${THEME_ICON[name] || "📊"} ${esc(name)} ${n}</button>`).join("");
    filters.addEventListener("click", e => {
      const b = e.target.closest("[data-theme]"); if (!b) return;
      theme = b.dataset.theme; seen.clear();
      filters.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
      paint();
    });
  }

  async function paint() {
    const candidates = theme ? byTheme.get(theme) || [] : series;
    if (!candidates.length) {
      box.innerHTML = `<p class="muted">這個分類暫時沒有可直接畫圖的 API 數據。下方可瀏覽全部數據集。</p>`;
      return;
    }
    let unused = candidates.filter(s => !seen.has(s.id));
    if (unused.length < count) { seen.clear(); unused = [...candidates]; }
    const picks = [];
    const pickedThemes = new Set();
    while (unused.length && picks.length < count) {
      const diverse = unused.filter(s => !pickedThemes.has(s.theme));
      const source = diverse.length ? diverse : unused;
      const item = source[Math.floor(Math.random() * source.length)];
      unused = unused.filter(s => s.id !== item.id);
      seen.add(item.id); pickedThemes.add(item.theme); picks.push(item);
    }
    box.innerHTML = picks.map((s, i) => {
      const val = compactValue(s.last[1], s.unit);
      return `<a class="api-card" href="${datasetUrl(s.datasetId)}">
        <div class="api-art api-art-${i % 4}"><span class="api-icon" aria-hidden="true">${THEME_ICON[s.theme] || "📊"}</span>
          <span class="api-spark" id="api-spark-${i}"></span></div>
        <div class="api-card-body"><span class="api-badge">${esc(s.theme)} · 資料快照</span>
        <strong>${esc(s.title)}</strong><div class="api-value">${val.value}<small>${esc(val.unit)}</small></div>
        <span class="api-period">${esc(s.last[0])} · ${esc(s.dept)}</span></div></a>`;
    }).join("");
    await Promise.all(picks.map(async (s, i) => {
      try {
        const raw = await (await fetch(`data/series/${encodeURIComponent(s.id)}.json`)).json();
        const target = box.querySelector(`#api-spark-${i}`);
        if (target) lineChart(target, displaySeries({ ...raw, points: raw.points.slice(-50) }),
          { compact: true, height: 105 });
      } catch (e) { /* card still shows the latest verified snapshot */ }
    }));
  }
  if (shuffle) shuffle.addEventListener("click", paint);
  if (rotate && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    timer = setInterval(() => { if (!document.hidden) paint(); }, 18000);
  }
  paint();
  return { paint, stop: () => { if (timer) clearInterval(timer); } };
}
