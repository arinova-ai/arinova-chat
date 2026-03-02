// ---------------------------------------------------------------------------
// Users Dashboard — Mock Data
// ---------------------------------------------------------------------------

export interface DailyUsers {
  date: string;
  label: string;
  newUsers: number;
  returning: number;
}

export const TOTAL_USERS = 4542;
export const TOTAL_CHANGE = 22;
export const NEW_USERS_30D = 864;
export const RETURNING_30D = 3678;

function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function generateDailyData(days: number): DailyUsers[] {
  const data: DailyUsers[] = [];
  const now = new Date(2026, 2, 2);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const wf = isWeekend ? 0.7 : 1;
    const seed = d.getTime();
    data.push({
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      newUsers: Math.round((15 + seededRandom(seed + 20) * 40) * wf),
      returning: Math.round((80 + seededRandom(seed + 21) * 60) * wf),
    });
  }
  return data;
}

export const DAILY_DATA = generateDailyData(30);

export function aggregateWeekly(data: DailyUsers[]): DailyUsers[] {
  const weeks: DailyUsers[] = [];
  for (let i = 0; i < data.length; i += 7) {
    const chunk = data.slice(i, i + 7);
    if (chunk.length === 0) continue;
    weeks.push({
      date: chunk[0].date,
      label: `${chunk[0].label} – ${chunk[chunk.length - 1].label}`,
      newUsers: chunk.reduce((s, d) => s + d.newUsers, 0),
      returning: chunk.reduce((s, d) => s + d.returning, 0),
    });
  }
  return weeks;
}

export function aggregateMonthly(data: DailyUsers[]): DailyUsers[] {
  if (data.length === 0) return [];
  return [{
    date: data[0].date,
    label: "Feb – Mar 2026",
    newUsers: data.reduce((s, d) => s + d.newUsers, 0),
    returning: data.reduce((s, d) => s + d.returning, 0),
  }];
}
