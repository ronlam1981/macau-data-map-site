import { parsePeriod, displaySeries, lineChart, fmtNum } from './chart.js?v=6';
import { comparison } from './story-data.js?v=3';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function ordered(points) {
  return (points || []).filter(p => Array.isArray(p) && Number.isFinite(parsePeriod(p[0]).t)).slice().sort((a,b) => parsePeriod(a[0]).t - parsePeriod(b[0]).t);
}
export function rangePoints(points, start, end) {
  const a = parsePeriod(start).t, b = parsePeriod(end).t;
  return ordered(points).filter(([p]) => parsePeriod(p).t >= a && parsePeriod(p).t <= b);
}
export function recentStart(points, years) {
  const end = parsePeriod(points.at(-1)[0]).t;
  return points.find(([p]) => parsePeriod(p).t > end - years)[0];
}
export function csvText(data, points, source) {
  const cell = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  return '\ufeff' + [['期間','原始數值','原始單位','指標','來源'], ...points.map(([p,v]) => [p,v,data.unit,data.title,source])].map(row=>row.map(cell).join(',')).join('\r\n') + '\r\n';
}
export function mountExplorer(root, raw, { source = '' } = {}) {
  const points = ordered(raw.points);
  root.classList.add('series-explorer');
  if (!points.length) { root.textContent = '沒有可用期間。'; return; }
  const options = points.map(([p]) => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
  root.innerHTML = `<div class="period-controls"><label>起期<select data-start>${options}</select></label><label>迄期<select data-end>${options}</select></label></div><div class="period-presets"><button type="button" data-years="0">全部</button><button type="button" data-years="5">近 5 年</button><button type="button" data-years="10">近 10 年</button><button type="button" data-reset>重設</button><button type="button" data-csv>下載所選 CSV</button></div><p class="muted">近年範圍按最新觀測期間計算；三連月以完整期間的結束月份排序。</p><p data-status role="status"></p><div class="chart-box" data-chart></div><label class="period-inspector">查看期間<select data-inspect></select></label><p data-value aria-live="polite" aria-atomic="true"></p><p class="muted">單位：${esc(displaySeries(raw).unit || '來源未標示')}。可點按圖表、使用左右鍵或期間選單查看數值。</p><details class="table-view"><summary>查看所選範圍數據表</summary><div class="scroll"><table class="data"><thead><tr><th>期間</th><th>數值（${esc(displaySeries(raw).unit || '來源未標示')}）</th></tr></thead><tbody></tbody></table></div></details>`;
  const q = s => root.querySelector(s), start=q('[data-start]'), end=q('[data-end]'), inspect=q('[data-inspect]');
  let selected=[], shown=[], chart;
  const describe = label => {
    inspect.value=label;
    const point=shown.find(p=>p[0]===label);
    const full=displaySeries({...raw, points});
    const change=point && comparison(full.points, full.unit, point);
    q('[data-value]').textContent=point ? `${label}：${fmtNum(point[1], full.unit==='億澳門元'?2:null)} ${full.unit || ''}；` + (change ? `較 ${change.previous[0]} ${change.direction} ${fmtNum(Math.abs(change.value))} ${change.unit || ''}` : '沒有可比較的去年同期數值') : '';
  };
  const render = () => {
    const invalid=parsePeriod(start.value).t > parsePeriod(end.value).t;
    start.setAttribute('aria-invalid',String(invalid)); end.setAttribute('aria-invalid',String(invalid));
    selected=rangePoints(points,start.value,end.value);
    const data=displaySeries({...raw,points:selected}); shown=data.points;
    q('[data-status]').textContent=invalid ? '起期不可晚於迄期，請調整期間。' : selected.length ? `${start.value} 至 ${end.value} · ${selected.length} 期` : '所選範圍沒有觀測記錄。';
    q('[data-csv]').disabled=!selected.length;
    inspect.innerHTML=selected.map(([p])=>`<option value="${esc(p)}">${esc(p)}</option>`).join(''); inspect.disabled=!selected.length;
    q('tbody').innerHTML=[...shown].reverse().map(([p,v])=>`<tr><td>${esc(p)}</td><td>${fmtNum(v,data.unit==='億澳門元'?2:null)}</td></tr>`).join('');
    chart=lineChart(q('[data-chart]'),data,{onSelect:describe});
    describe(selected.at(-1)?.[0]);
    root.querySelectorAll('[data-years]').forEach(b=>b.setAttribute('aria-pressed',String(end.value===points.at(-1)[0] && start.value===(+b.dataset.years ? recentStart(points,+b.dataset.years) : points[0][0]))));
  };
  start.addEventListener('change',render); end.addEventListener('change',render);
  inspect.addEventListener('change',()=>{ describe(inspect.value); chart?.select(inspect.value); });
  root.querySelectorAll('[data-years]').forEach(button=>button.addEventListener('click',()=>{
    start.value=+button.dataset.years ? recentStart(points,+button.dataset.years) : points[0][0]; end.value=points.at(-1)[0]; render();
  }));
  const reset=()=>{ start.value=points[0][0]; end.value=points.at(-1)[0]; render(); };
  q('[data-reset]').addEventListener('click',reset);
  q('[data-csv]').addEventListener('click',()=>{
    const url=URL.createObjectURL(new Blob([csvText(raw,selected,source)],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a'); link.href=url; link.download=`${raw.id || 'series'}-${start.selectedIndex}-${end.selectedIndex}.csv`; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  reset();
}
