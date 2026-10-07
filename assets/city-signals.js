// Published statistical series for the mixed-cadence "now" section.
// Keep one series per topic so the two rotating cards always cover different subjects.
export const CITY_SIGNALS = [
  { topic: '旅遊', question: '最近一期，有幾多人次來澳門？', id: '3546225a-2a34-4645-b01e-6752aed03993_4428' },
  { topic: '交通', question: '最近一期，交通意外有幾多宗？', id: 'c48b7dee-ac6f-4caa-934f-7e9071671dfc_4369' },
  { topic: '就業', question: '最近一期的總體失業率是多少？', id: '662fc6ea-d70a-4f18-9611-5dfbd6b88d52_4457' },
  { topic: '物價', question: '最近一期的通脹率是多少？', id: 'ec47d6b4-168d-4ba6-9dca-25cc192aa9c1_4416' },
  { topic: '樓市', question: '最近一期，有幾多個樓宇單位買賣？', id: '7580fa4d-f403-48b1-a8b6-6947df6040f6_4410', displayUnit: '個單位' },
  { topic: '住宿', question: '最近一期，有幾多酒店住客？', id: '00eae9c4-a51d-4fa2-bd36-7e2db18374a8_4384' },
  { topic: '治安', question: '最近一期，錄得幾多宗罪案？', id: 'f2075552-383e-4eba-aa22-a7f680caa86b_4946' },
];

export function pickCitySignals(previous = [], random = Math.random) {
  const previousIds = new Set(previous.map(item => item.id));
  const available = CITY_SIGNALS.filter(item => !previousIds.has(item.id));
  const pool = available.length >= 2 ? available : CITY_SIGNALS;
  const first = Math.min(pool.length - 1, Math.floor(random() * pool.length));
  const secondPool = pool.filter((_, index) => index !== first);
  const second = Math.min(secondPool.length - 1, Math.floor(random() * secondPool.length));
  return [pool[first], secondPool[second]];
}
