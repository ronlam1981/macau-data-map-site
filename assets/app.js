/* 共用：主題切換、資料載入、頁首 */

export const THEME_ICONS = { light: "☀", dark: "☾" };

export function initChrome(current) {
  document.querySelectorAll(".nav a").forEach(a => {
    if (a.dataset.page === current) a.setAttribute("aria-current", "page");
  });
  const btn = document.querySelector(".theme-btn");
  if (!btn) return;
  const saved = (() => { try { return localStorage.getItem("theme"); } catch { return null; } })();
  if (saved) document.documentElement.dataset.theme = saved;
  const paint = () => {
    const t = document.documentElement.dataset.theme
      || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    btn.textContent = THEME_ICONS[t === "dark" ? "light" : "dark"];
    btn.setAttribute("aria-label", t === "dark" ? "切換至淺色" : "切換至深色");
  };
  paint();
  btn.addEventListener("click", () => {
    const now = document.documentElement.dataset.theme
      || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = now === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch {}
    paint();
  });
}

let _catalog = null;
export async function catalog() {
  if (!_catalog) _catalog = await (await fetch("data/catalog.json?v=4")).json();
  return _catalog;
}
export async function seriesIndex() {
  return (await fetch("data/series_index.json?v=3")).json();
}
export async function series(id) {
  return (await fetch(`data/series/${id}.json`)).json();
}

export const THEME_ICON = {
  "醫療衛生": "🏥", "旅遊及博彩": "🎰", "創業及營商": "🏪", "教育": "🎓",
  "行政及法律事務": "🏛", "公共安全及出入境": "🛂", "城市環境": "🌏",
  "社會保障": "🤝", "公共交通": "🚌", "就業": "💼", "財政稅務": "💰",
  "住房人口": "🏠", "文化": "🎭", "體育": "🏃", "公證及登記": "📋", "其他數據": "📦",
};

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function datasetUrl(id) { return `dataset.html?id=${encodeURIComponent(id)}`; }

/* 官方數據集頁面 */
export function officialUrl(id) { return `https://data.gov.mo/detail?id=${encodeURIComponent(id)}`; }
