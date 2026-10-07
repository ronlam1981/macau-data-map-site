import { parsePeriod } from './chart.js?v=5';

export const EDITORIAL = {
  '入境旅客': ['澳門一個月迎來幾多旅客？', '人來人往', '看旅客人次的季節變化；人次不等於不重複的人數。'],
  '不過夜入境旅客': ['來澳門，即日來回有幾普遍？', '人來人往', '不過夜旅客是當天離境的旅客，與留宿旅客分開統計。'],
  '外賣店場所': ['澳門有幾多間外賣店？', '食與生活', '只計本系列定義的外賣店場所，不等於所有提供外賣的餐廳。'],
  '飲食業場所': ['一座小城，容納幾多間食肆？', '食與生活', '查看飲食業場所數目的年度變化。'],
  '本地就業居民月工作收入中位數': ['澳門打工仔的收入中間線在哪？', '工作與城市', '中位數把有關就業居民分成兩半；它不是平均收入。'],
  '耗電量': ['澳門一個月用幾多電？', '城市日常', '月份長短和季節都會影響用量，先與去年同月比較。'],
  '用水量': ['澳門一個月用幾多水？', '城市日常', '這是整體用水量，不能直接當成居民家居用水量。'],
  '旅客平均逗留時間': ['旅客平均留在澳門幾耐？', '人來人往', '留宿與不過夜旅客都在整體平均數之內。'],
  '年終總人口': ['澳門的人口，怎樣一路改變？', '工作與城市', '保留官方指標名稱；各期人口定義以原始來源為準。'],
  '酒店入住率': ['澳門酒店，有幾多房住滿？', '人來人往', '入住率是期內統計，不是現在可以預訂的房間比例。'],
  '新成立公司': ['每個月有幾多間新公司誕生？', '工作與城市', '新成立數目不等於淨增數目，也未扣除解散公司。'],
  '公共圖書館': ['澳門有幾多間公共圖書館？', '文化與學習', '沿時間探索公共文化設施。'],
};

export function topicFor(series) {
  if (EDITORIAL[series.title]) return EDITORIAL[series.title][1];
  if (/飲食|外賣|食物|消費/.test(series.title)) return '食與生活';
  if (/旅遊|博彩/.test(series.theme)) return '人來人往';
  if (/教育|文化|體育/.test(series.theme)) return '文化與學習';
  if (/城市環境|公共交通/.test(series.theme)) return '城市日常';
  if (/住房|就業|創業|財政/.test(series.theme)) return '工作與城市';
  return '更多面向';
}

export function validPoints(points) {
  return (Array.isArray(points) ? points : [])
    .filter(p => Array.isArray(p) && typeof p[0] === 'string' && typeof p[1] === 'number'
      && Number.isFinite(p[1]) && Number.isFinite(parsePeriod(p[0]).t))
    .slice().sort((a, b) => parsePeriod(a[0]).t - parsePeriod(b[0]).t);
}

export function comparison(points, unit) {
  const last = points.at(-1);
  if (!last) return null;
  const year = last[0].match(/^\d{4}/);
  if (!year) return null;
  const previousPeriod = last[0].replace(/^\d{4}/, String(Number(year[0]) - 1));
  const previous = points.find(p => p[0] === previousPeriod);
  if (!previous) return null;
  const delta = last[1] - previous[1];
  // Percent rates compare in percentage points; negative/zero baselines use absolute change.
  const relative = unit !== '%' && previous[1] > 0;
  return { previous, delta, value: relative ? delta / previous[1] * 100 : delta,
    unit: unit === '%' ? '個百分點' : relative ? '%' : unit,
    direction: delta > 0 ? '增加' : delta < 0 ? '減少' : '持平' };
}

export function visitorShare(total, overnight) {
  const byPeriod = new Map(validPoints(overnight));
  const common = validPoints(total).filter(([p, n]) => n > 0 && byPeriod.has(p)
    && byPeriod.get(p) >= 0 && byPeriod.get(p) <= n);
  const latest = common.at(-1);
  if (!latest) return null;
  return { period: latest[0], total: latest[1], overnight: byPeriod.get(latest[0]),
    sameDay: latest[1] - byPeriod.get(latest[0]),
    share: (latest[1] - byPeriod.get(latest[0])) / latest[1] * 100 };
}

export function observationAge(sourceAt, now = Date.now()) {
  if (typeof sourceAt !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(sourceAt)) return null;
  const time = Date.parse(sourceAt.replace(' ', 'T') + '+08:00');
  return Number.isFinite(time) ? (now - time) / 60000 : null;
}
