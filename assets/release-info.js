/* A DSEC publication date is a timetable entry, not proof that data.gov.mo has updated. */

export const DSEC_TIMETABLE_URL = 'https://www.dsec.gov.mo/TimeTables.aspx?lang=zh-MO';

export const RELEASE_TOPICS = {
  'a9a2ce34-54fd-4789-a999-716526acdee0': '飲食業調查',
  '3546225a-2a34-4645-b01e-6752aed03993': '入境旅客',
  '662fc6ea-d70a-4f18-9611-5dfbd6b88d52': '就業調查',
  'ec47d6b4-168d-4ba6-9dca-25cc192aa9c1': '消費物價指數',
  'f02b334a-cc44-4433-b942-672de0fdad13': '旅客消費調查',
  '111c078e-729d-47af-b5f0-edd03444590e': '住宅樓價指數',
  '8812ecc5-e9ab-4e2f-b971-d3c16e46bd32': '旅行團及酒店入住率',
  '094324ef-45cb-4d5f-9004-77e6d82c1042': '公司統計',
  'f5576013-a007-410d-8924-70b4ce86c7a0': '零售業調查',
};

const inMacau = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Macau', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export function formatReleaseDate(date) {
  const [year, month, day] = String(date).split('-');
  return `${year}年${Number(month)}月${Number(day)}日`;
}

export function relevantRelease(datasetId, schedule, today = inMacau()) {
  const subject = RELEASE_TOPICS[datasetId];
  if (!subject || !Array.isArray(schedule?.events)) return null;
  const checkedDate = String(schedule.checkedAt || '').slice(0, 10);
  if (!checkedDate || (Date.parse(today) - Date.parse(checkedDate)) > 7 * 86400000) return null;
  const matches = schedule.events.filter(item => item.title?.endsWith(subject) && /^\d{4}-\d{2}-\d{2}$/.test(item.date));
  const next = matches.find(item => item.date >= today);
  if (next) return { ...next, kind: 'next' };
  const recent = matches.at(-1);
  if (recent && (Date.parse(today) - Date.parse(recent.date)) <= 7 * 86400000)
    return { ...recent, kind: 'recent' };
  return null;
}

let schedulePromise;
export function loadReleaseSchedule() {
  schedulePromise ||= fetch('data/release_schedule.json?v=1').then(response => {
    if (!response.ok) throw new Error(`Schedule HTTP ${response.status}`);
    return response.json();
  }).catch(() => null);
  return schedulePromise;
}

let statusPromise;
export function loadSeriesStatus() {
  statusPromise ||= fetch('data/series_status.json?v=1').then(response => {
    if (!response.ok) throw new Error(`Status HTTP ${response.status}`);
    return response.json();
  }).catch(() => ({}));
  return statusPromise;
}
