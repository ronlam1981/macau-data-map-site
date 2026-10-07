// Every option is a measured field in the two SMG feeds, not an older data series.
export const LIVE_METRICS = {
  weather: {
    temperature: { label: '各區氣溫', title: '此刻哪區比較熱？', unit: '°C', note: '氣溫按各觀測站的來源時間顯示；不同位置與觀測時間會影響比較。' },
    humidity: { label: '各區相對濕度', title: '澳門哪區比較潮濕？', unit: '%', note: '相對濕度是觀測值；各站的位置與觀測時間可能不同。' },
    wind: { label: '各區風速', title: '哪個觀測站風比較大？', unit: 'km/h', note: '這是來源提供的風速，不是陣風或颱風警告。' },
    dailyHigh: { label: '當日最高氣溫', title: '今天哪區錄得最高溫？', unit: '°C', note: '這是當日截至來源時間的最高氣溫，不是此刻氣溫。' },
  },
  air: {
    pm25: { label: '微細懸浮粒子 PM2.5', title: '各區 PM2.5 相差幾多？', unit: 'µg/m³', note: '這是 PM2.5 濃度實測值，不是空氣質量指數或健康建議。' },
    pm10: { label: '可吸入懸浮粒子 PM10', title: '各區 PM10 相差幾多？', unit: 'µg/m³', note: '這是 PM10 濃度實測值，不是空氣質量指數或健康建議。' },
    no2: { label: '二氧化氮 NO₂', title: '哪個測站錄得較高 NO₂？', unit: 'µg/m³', note: '這是二氧化氮濃度實測值，不是空氣質量指數或健康建議。' },
    o3: { label: '臭氧 O₃', title: '各區臭氧濃度有何不同？', unit: 'µg/m³', note: '這是臭氧濃度實測值，不是空氣質量指數或健康建議。' },
  },
};

export function pickLivePair(previous = null, random = Math.random) {
  const pairs = Object.keys(LIVE_METRICS.weather).flatMap(weather =>
    Object.keys(LIVE_METRICS.air).map(air => ({ weather, air })));
  const options = pairs.filter(pair => pair.weather !== previous?.weather || pair.air !== previous?.air);
  return options[Math.min(options.length - 1, Math.floor(random() * options.length))];
}
