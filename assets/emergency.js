import { lineChart, fmtNum } from "./chart.js?v=5";

export async function renderEmergency(box) {
  const data = await (await fetch("data/emergency.json")).json();
  const total = data.totals;
  const change = (total["2023"] - total["2019"]) / total["2019"] * 100;
  const top = [...data.ages].sort((a, b) => b.total2023 - a.total2023)[0];
  const max = Math.max(...data.ages.flatMap(a => Object.values(a.years)));
  box.innerHTML = `<section class="story-section">
    <div class="story-eyebrow">衛生局 · 急診治療人次</div>
    <h2>急診服務，哪些年齡組最常使用？</h2>
    <p class="lede">比較 2019 至 2023 年各歲組的急診治療人次。按下年份，看看分佈如何改變。</p>
    <div class="story-stats">
      <div><span>2023 年治療總人次</span><strong>${fmtNum(total["2023"])}</strong><small>人次</small></div>
      <div><span>較 2019 年</span><strong>${change >= 0 ? "+" : ""}${change.toFixed(1)}%</strong><small>${fmtNum(total["2019"])} → ${fmtNum(total["2023"])}</small></div>
      <div><span>2023 年最多人次的歲組</span><strong>${top.age.replace("≧", "≥")} 歲</strong><small>${fmtNum(top.total2023)} 人次</small></div>
    </div>
    <div class="story-layout">
      <div class="chart-card"><div class="chart-title">歷年急診治療總人次</div>
        <p class="chart-sub">2019–2023 年 · 人次</p><div class="chart-box" id="em-trend"></div></div>
      <div class="chart-card"><div class="chart-title">按歲組比較</div>
        <p class="chart-sub">長條長度代表該年齡組的治療人次</p>
        <div class="range" id="em-years"></div><div class="age-bars" id="em-bars"></div></div>
    </div>
    <div class="story-note">${data.note} 圖中各歲組是治療人次，不能解讀為每位居民的就診機率。資料來源：${data.source}。</div>
  </section>`;
  lineChart(box.querySelector("#em-trend"), {
    title: "急診治療總人次", unit: "人次",
    points: data.years.map(y => [`${y}年`, total[y]])
  }, { height: 280 });
  const choices = box.querySelector("#em-years");
  const bars = box.querySelector("#em-bars");
  choices.innerHTML = data.years.map(y => `<button type="button" class="chip" data-year="${y}" aria-pressed="${y === 2023}">${y}</button>`).join("");
  function paint(year) {
    choices.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.year === String(year)));
    bars.innerHTML = data.ages.map(a => {
      const v = a.years[year];
      return `<div class="age-row"><span>${a.age.replace("≧", "≥")}</span><div class="age-track"><i style="width:${(v / max * 100).toFixed(1)}%"></i></div><strong>${fmtNum(v)}</strong></div>`;
    }).join("");
  }
  choices.addEventListener("click", e => { if (e.target.dataset.year) paint(e.target.dataset.year); });
  paint(2023);
}
