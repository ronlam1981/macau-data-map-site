import { comparison, validPoints, visitorShare } from './story-data.js';

export const QUIZ_DEFINITIONS = [
  { id: 'visitor-stay', kind: 'visitor', sources: ['入境旅客', '留宿入境旅客'],
    heading: '來澳門的旅客，多數會過夜嗎？', intro: '留下住一晚，還是即日來回？' },
  { id: 'visitors-year', kind: 'year', sources: ['入境旅客'],
    heading: '來澳門的旅客，比去年同月多嗎？', intro: '同一個月份，旅客人次有甚麼變化？' },
  { id: 'hotel-occupancy', kind: 'year', sources: ['酒店入住率'],
    heading: '酒店入住率，比去年同月高嗎？', intro: '看看兩個同月份的入住率。' },
  { id: 'new-companies', kind: 'year', sources: ['新成立公司'],
    heading: '新成立的公司，比去年同月多嗎？', intro: '新成立數目不等於公司淨增數目。' },
  { id: 'electricity', kind: 'year', sources: ['耗電量'],
    heading: '澳門用電量，比去年同月多嗎？', intro: '按同一月份比較，減少季節影響。' },
  { id: 'water', kind: 'year', sources: ['用水量'],
    heading: '澳門用水量，比去年同月多嗎？', intro: '這是全澳用水量，不單是家居用水。' },
  { id: 'road-accidents', kind: 'year', sources: ['交通意外宗數'],
    heading: '交通意外宗數，比去年同月多嗎？', intro: '同月比較，看看道路上的變化。' },
  { id: 'food-places', kind: 'pair', sources: ['飲食業場所', '外賣店場所'],
    heading: '澳門的食肆，還是外賣店更多？', intro: '比較兩項場所統計的最近共同年份。', labels: ['飲食業場所', '外賣店場所'] },
  { id: 'population', kind: 'year', sources: ['年終總人口'],
    heading: '澳門人口，比去年同期多嗎？', intro: '沿用來源的人口指標及季度口徑。' },
  { id: 'income', kind: 'year', sources: ['本地就業居民月工作收入中位數'],
    heading: '打工仔收入中位數，比去年同期高嗎？', intro: '中位數不是平均收入。' },
  { id: 'cross-border-cars', kind: 'year', sources: ['跨境汽車流量'],
    heading: '跨境汽車流量，比去年同月多嗎？', intro: '比較同月錄得的跨境車次。' },
  { id: 'inflation', kind: 'year', sources: ['消費物價指數 – 通脹率'],
    heading: '通脹率，比去年同月高嗎？', intro: '比較的是通脹率，並非物價指數高低。' },
];

export function pickQuiz(definitions, previousId = null, random = Math.random) {
  const eligible = definitions.filter(definition => definition.id !== previousId);
  const pool = eligible.length ? eligible : definitions;
  if (!pool.length) return null;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}

export function buildQuiz(definition, records) {
  const sources = definition.sources.map(title => records[title]);
  if (sources.some(source => !source)) return null;
  let period, bars, note;
  if (definition.kind === 'visitor') {
    const share = visitorShare(sources[0].points, sources[1].points);
    if (!share) return null;
    period = share.period;
    bars = [
      { label: '即日來回', value: share.sameDay },
      { label: '留宿', value: share.overnight },
    ];
    note = `即日來回佔 ${share.share.toFixed(1)}%；由入境總人次減去留宿人次計算。人次並非獨立人數。`;
  } else if (definition.kind === 'pair') {
    const second = new Map(validPoints(sources[1].points));
    const latest = validPoints(sources[0].points).filter(([key]) => second.has(key)).at(-1);
    if (!latest) return null;
    period = latest[0];
    bars = [
      { label: definition.labels[0], value: latest[1] },
      { label: definition.labels[1], value: second.get(period) },
    ];
    note = '兩項場所統計各有自己的定義，只比較記錄的數目，不把兩者相加。';
  } else {
    const points = validPoints(sources[0].points);
    const latest = points.at(-1), previous = comparison(points, sources[0].unit)?.previous;
    if (!latest || !previous) return null;
    period = `${latest[0]} ／ ${previous[0]}`;
    bars = [
      { label: latest[0], value: latest[1] },
      { label: previous[0], value: previous[1] },
    ];
    note = sources[0].unit === '%'
      ? '比較兩個百分率的差距時，單位是百分點。'
      : '使用同一指標的去年相同月份或季度作比較。';
  }
  if (bars.some(bar => !Number.isFinite(bar.value) || bar.value < 0)) return null;
  const correct = bars[0].value > bars[1].value ? 'first'
    : bars[0].value < bars[1].value ? 'second' : 'equal';
  return { ...definition, period, bars, note, correct,
    unit: sources[0].unit || '',
    word: ['%', '澳門元'].includes(sources[0].unit) ? '較高' : '較多',
    sourceLinks: sources.map(source => ({ title: source.title, datasetId: source.datasetId })) };
}
