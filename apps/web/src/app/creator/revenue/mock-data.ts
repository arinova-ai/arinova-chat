// ---------------------------------------------------------------------------
// Revenue Dashboard — Mock Data
// ---------------------------------------------------------------------------

export interface RevenueSource {
  key: string;
  label: string;
  color: string;
  total: number;
  change: number; // percentage
}

export interface DailyRevenue {
  date: string; // YYYY-MM-DD
  label: string; // display label (e.g. "Mar 1")
  sticker: number;
  agent: number;
  theme: number;
  community: number;
  spaces: number;
}

export interface Transaction {
  id: string;
  date: string;
  source: string;
  description: string;
  amount: number;
}

// Revenue source definitions with chart colors
export const REVENUE_SOURCES: RevenueSource[] = [
  { key: "sticker", label: "Sticker Shop", color: "#a855f7", total: 4230, change: 12 },
  { key: "agent", label: "Agent Hub", color: "#3b82f6", total: 3510, change: 8 },
  { key: "theme", label: "Theme", color: "#06b6d4", total: 2840, change: 15 },
  { key: "community", label: "Community", color: "#f97316", total: 1450, change: 22 },
  { key: "spaces", label: "Spaces", color: "#22c55e", total: 1280, change: 5 },
];

// Total across all sources
export const TOTAL_REVENUE = REVENUE_SOURCES.reduce((s, r) => s + r.total, 0);
export const TOTAL_CHANGE = 11; // blended mock

// Seed-based pseudo-random for deterministic data
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function generateDailyData(days: number): DailyRevenue[] {
  const data: DailyRevenue[] = [];
  const now = new Date(2026, 2, 2); // March 2, 2026

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dayOfWeek = d.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const weekendFactor = isWeekend ? 0.55 : 1;
    const seed = d.getTime();

    const entry: DailyRevenue = {
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      sticker: Math.round((80 + seededRandom(seed + 1) * 100) * weekendFactor),
      agent: Math.round((60 + seededRandom(seed + 2) * 90) * weekendFactor),
      theme: Math.round((50 + seededRandom(seed + 3) * 70) * weekendFactor),
      community: Math.round((20 + seededRandom(seed + 4) * 50) * weekendFactor),
      spaces: Math.round((15 + seededRandom(seed + 5) * 45) * weekendFactor),
    };
    data.push(entry);
  }
  return data;
}

export const DAILY_DATA = generateDailyData(30);

// Aggregate helpers
export function aggregateWeekly(data: DailyRevenue[]): DailyRevenue[] {
  const weeks: DailyRevenue[] = [];
  for (let i = 0; i < data.length; i += 7) {
    const chunk = data.slice(i, i + 7);
    if (chunk.length === 0) continue;
    const agg: DailyRevenue = {
      date: chunk[0].date,
      label: `${chunk[0].label} – ${chunk[chunk.length - 1].label}`,
      sticker: chunk.reduce((s, d) => s + d.sticker, 0),
      agent: chunk.reduce((s, d) => s + d.agent, 0),
      theme: chunk.reduce((s, d) => s + d.theme, 0),
      community: chunk.reduce((s, d) => s + d.community, 0),
      spaces: chunk.reduce((s, d) => s + d.spaces, 0),
    };
    weeks.push(agg);
  }
  return weeks;
}

export function aggregateMonthly(data: DailyRevenue[]): DailyRevenue[] {
  // With 30 days of data, just return a single monthly aggregate
  if (data.length === 0) return [];
  return [
    {
      date: data[0].date,
      label: "Feb – Mar 2026",
      sticker: data.reduce((s, d) => s + d.sticker, 0),
      agent: data.reduce((s, d) => s + d.agent, 0),
      theme: data.reduce((s, d) => s + d.theme, 0),
      community: data.reduce((s, d) => s + d.community, 0),
      spaces: data.reduce((s, d) => s + d.spaces, 0),
    },
  ];
}

// Mock transactions
export const MOCK_TRANSACTIONS: Transaction[] = [
  { id: "tx-1", date: "2026-03-02", source: "Sticker Shop", description: "Cute Animals Pack ×3", amount: 14.97 },
  { id: "tx-2", date: "2026-03-02", source: "Agent Hub", description: "CodeHelper Pro subscription", amount: 9.99 },
  { id: "tx-3", date: "2026-03-01", source: "Theme", description: "Ocean Blue theme sale", amount: 4.99 },
  { id: "tx-4", date: "2026-03-01", source: "Community", description: "Premium badge unlock ×2", amount: 5.98 },
  { id: "tx-5", date: "2026-02-28", source: "Sticker Shop", description: "Emoji Remix Pack ×1", amount: 2.99 },
  { id: "tx-6", date: "2026-02-28", source: "Agent Hub", description: "StudyBuddy one-time", amount: 3.49 },
  { id: "tx-7", date: "2026-02-27", source: "Spaces", description: "Private room rental", amount: 7.50 },
  { id: "tx-8", date: "2026-02-27", source: "Sticker Shop", description: "Kawaii Faces Pack ×5", amount: 24.95 },
];
