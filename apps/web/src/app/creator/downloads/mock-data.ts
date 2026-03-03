// ---------------------------------------------------------------------------
// Downloads Dashboard — Mock Data
// ---------------------------------------------------------------------------

export interface DailyDownloads {
  date: string;
  label: string;
  sticker: number;
  agent: number;
  theme: number;
}

export interface DownloadSource {
  key: string;
  label: string;
  color: string;
  total: number;
  change: number;
}

export const DOWNLOAD_SOURCES: DownloadSource[] = [
  { key: "sticker", label: "Sticker Packs", color: "#a855f7", total: 2840, change: 14 },
  { key: "agent", label: "Agents", color: "#3b82f6", total: 1120, change: 9 },
  { key: "theme", label: "Themes", color: "#06b6d4", total: 563, change: 18 },
];

export const TOTAL_DOWNLOADS = DOWNLOAD_SOURCES.reduce((s, r) => s + r.total, 0);
export const TOTAL_CHANGE = 13;

function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function generateDailyData(days: number): DailyDownloads[] {
  const data: DailyDownloads[] = [];
  const now = new Date(2026, 2, 2);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const wf = isWeekend ? 0.6 : 1;
    const seed = d.getTime();
    data.push({
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      sticker: Math.round((60 + seededRandom(seed + 10) * 80) * wf),
      agent: Math.round((20 + seededRandom(seed + 11) * 50) * wf),
      theme: Math.round((10 + seededRandom(seed + 12) * 30) * wf),
    });
  }
  return data;
}

export const DAILY_DATA = generateDailyData(30);

export function aggregateWeekly(data: DailyDownloads[]): DailyDownloads[] {
  const weeks: DailyDownloads[] = [];
  for (let i = 0; i < data.length; i += 7) {
    const chunk = data.slice(i, i + 7);
    if (chunk.length === 0) continue;
    weeks.push({
      date: chunk[0].date,
      label: `${chunk[0].label} – ${chunk[chunk.length - 1].label}`,
      sticker: chunk.reduce((s, d) => s + d.sticker, 0),
      agent: chunk.reduce((s, d) => s + d.agent, 0),
      theme: chunk.reduce((s, d) => s + d.theme, 0),
    });
  }
  return weeks;
}

export function aggregateMonthly(data: DailyDownloads[]): DailyDownloads[] {
  if (data.length === 0) return [];
  return [{
    date: data[0].date,
    label: "Feb – Mar 2026",
    sticker: data.reduce((s, d) => s + d.sticker, 0),
    agent: data.reduce((s, d) => s + d.agent, 0),
    theme: data.reduce((s, d) => s + d.theme, 0),
  }];
}
