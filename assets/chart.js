/* 單序列折線圖：無依賴 SVG，附十字準星 + 浮標 */
const NS = "http://www.w3.org/2000/svg";
const el = (n, a = {}) => { const e = document.createElementNS(NS, n);
  for (const k in a) e.setAttribute(k, a[k]); return e; };
const escHtml = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

export function fmtNum(v, forcedDecimals = null) {
  if (v == null || isNaN(v)) return "—";
  const a = Math.abs(v);
  const d = forcedDecimals ?? (a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3);
  return v.toLocaleString("zh-Hant", { minimumFractionDigits: 0, maximumFractionDigits: d });
}

/* 展示層換算；原始檔與下載資料保留官方單位。 */
export function displaySeries(data) {
  const unit = String(data.unit || "").trim();
  const divisor = unit === "百萬澳門元" ? 100 : unit === "千澳門元" ? 100000 : null;
  if (!divisor) return data;
  return { ...data, unit: "億澳門元", points: data.points.map(([period, value]) => [period, value / divisor]) };
}

/* 把「2026年第2季」「1990年1月」轉成可排序的數值，並給出短標籤 */
export function parsePeriod(s) {
  s = String(s || "");
  let m = s.match(/(\d{4})\s*年\s*第?\s*(\d+)\s*季/);
  if (m) return { t: +m[1] + (+m[2] - 1) / 4, year: +m[1], short: `${m[1]} Q${m[2]}` };
  m = s.match(/(\d{4})\s*年\s*(\d+)\s*月/);
  if (m) return { t: +m[1] + (+m[2] - 1) / 12, year: +m[1], short: `${m[1]}/${String(m[2]).padStart(2, "0")}` };
  m = s.match(/(\d{4})/);
  if (m) return { t: +m[1], year: +m[1], short: m[1] };
  return { t: NaN, year: NaN, short: s };
}

/**
 * 繪製折線圖
 * @param {HTMLElement} box 容器
 * @param {{points:[string,number][], unit?:string, title?:string}} data
 * @param {{height?:number, area?:boolean, compact?:boolean}} opt
 */
export function lineChart(box, data, opt = {}) {
  const pts = data.points.map(([p, v]) => ({ ...parsePeriod(p), label: p, v }))
                        .filter(p => !isNaN(p.t) && p.v != null)
                        .sort((a, b) => a.t - b.t);
  box.innerHTML = "";
  if (pts.length < 2) { box.innerHTML = '<p class="muted">數據點不足，無法繪圖。</p>'; return; }

  const compact = !!opt.compact;
  const W = 1000, H = opt.height || (compact ? 150 : 330);
  const m = compact ? { t: 8, r: 8, b: 18, l: 8 } : { t: 14, r: 16, b: 30, l: 62 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;

  const xs = pts.map(p => p.t), ys = pts.map(p => p.v);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (y0 === y1) { y0 -= 1; y1 += 1; }
  const pad = (y1 - y0) * 0.08; y1 += pad; y0 = y0 > 0 && y0 - pad < 0 ? 0 : y0 - pad;
  const X = t => m.l + (x1 === x0 ? iw / 2 : (t - x0) / (x1 - x0) * iw);
  const Y = v => m.t + ih - (v - y0) / (y1 - y0) * ih;

  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img",
    "aria-label": `${data.title || ""} 折線圖，${pts[0].label} 至 ${pts.at(-1).label}` });

  /* 刻度：Y 軸 4 格，細實線，不用虛線 */
  if (!compact) {
    const step = niceStep((y1 - y0) / 4);
    for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) {
      svg.appendChild(el("line", { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v),
        stroke: "var(--line)", "stroke-width": 1 }));
      const tx = el("text", { x: m.l - 10, y: Y(v) + 4, "text-anchor": "end",
        fill: "var(--text-muted)", "font-size": 13 });
      tx.textContent = fmtNum(v, data.unit === "億澳門元" ? 2 : null); svg.appendChild(tx);
    }
    /* X 軸年份標籤，最多 7 個 */
    const years = [...new Set(pts.map(p => p.year))];
    const every = Math.max(1, Math.ceil(years.length / 7));
    years.filter((_, i) => i % every === 0).forEach(yr => {
      const p = pts.find(p => p.year === yr);
      const tx = el("text", { x: X(p.t), y: H - 8, "text-anchor": "middle",
        fill: "var(--text-muted)", "font-size": 13 });
      tx.textContent = yr; svg.appendChild(tx);
    });
  }

  const line = pts.map((p, i) => `${i ? "L" : "M"}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join("");
  if (opt.area !== false) {
    svg.appendChild(el("path", { d: `${line}L${X(pts.at(-1).t)},${Y(y0)}L${X(pts[0].t)},${Y(y0)}Z`,
      fill: "var(--series-1)", opacity: compact ? .13 : .09 }));
  }
  svg.appendChild(el("path", { d: line, fill: "none", stroke: "var(--series-1)",
    "stroke-width": compact ? 2 : 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));

  /* 端點：直接標示最新值（選擇性直標，不是每點都標） */
  const last = pts.at(-1);
  svg.appendChild(el("circle", { cx: X(last.t), cy: Y(last.v), r: compact ? 3.5 : 4.5,
    fill: "var(--series-1)", stroke: "var(--surface-1)", "stroke-width": 2 }));

  box.appendChild(svg);
  if (compact) return;

  /* 十字準星 + 浮標 */
  const hit = el("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent" });
  const cross = el("line", { y1: m.t, y2: m.t + ih, stroke: "var(--line-strong)",
    "stroke-width": 1, opacity: 0 });
  const dot = el("circle", { r: 5, fill: "var(--series-1)", stroke: "var(--surface-1)",
    "stroke-width": 2, opacity: 0 });
  svg.append(cross, dot, hit);

  const tip = document.createElement("div"); tip.className = "tip"; box.appendChild(tip);
  const show = ev => {
    const r = svg.getBoundingClientRect();
    const px = (ev.clientX - r.left) / r.width * W;
    let best = pts[0], bd = Infinity;
    for (const p of pts) { const d = Math.abs(X(p.t) - px); if (d < bd) { bd = d; best = p; } }
    cross.setAttribute("x1", X(best.t)); cross.setAttribute("x2", X(best.t));
    cross.setAttribute("opacity", 1);
    dot.setAttribute("cx", X(best.t)); dot.setAttribute("cy", Y(best.v)); dot.setAttribute("opacity", 1);
    tip.innerHTML = `${escHtml(best.label)}<br><b>${fmtNum(best.v, data.unit === "億澳門元" ? 2 : null)}</b> ${escHtml(data.unit || "")}`;
    tip.style.opacity = 1;
    const lx = X(best.t) / W * r.width, ty = Y(best.v) / H * r.height;
    tip.style.left = Math.min(Math.max(lx - tip.offsetWidth / 2, 0), r.width - tip.offsetWidth) + "px";
    tip.style.top = Math.max(ty - tip.offsetHeight - 12, 0) + "px";
  };
  const hide = () => { tip.style.opacity = 0; cross.setAttribute("opacity", 0); dot.setAttribute("opacity", 0); };
  box.addEventListener("pointermove", show);
  box.addEventListener("pointerleave", hide);
}

function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
