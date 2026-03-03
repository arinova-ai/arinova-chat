// ---------------------------------------------------------------------------
// Ratings Dashboard — Mock Data
// ---------------------------------------------------------------------------

export interface DailyRatings {
  date: string;
  label: string;
  star5: number;
  star4: number;
  star3: number;
  star2: number;
  star1: number;
}

export const AVG_RATING = 4.6;
export const TOTAL_REVIEWS = 89;
export const RATING_CHANGE = 3;

export const RATING_DISTRIBUTION = [
  { stars: 5, count: 52, pct: 58 },
  { stars: 4, count: 21, pct: 24 },
  { stars: 3, count: 9, pct: 10 },
  { stars: 2, count: 4, pct: 5 },
  { stars: 1, count: 3, pct: 3 },
];

function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function generateDailyData(days: number): DailyRatings[] {
  const data: DailyRatings[] = [];
  const now = new Date(2026, 2, 2);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const seed = d.getTime();
    data.push({
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      star5: Math.round(1 + seededRandom(seed + 30) * 4),
      star4: Math.round(seededRandom(seed + 31) * 3),
      star3: Math.round(seededRandom(seed + 32) * 1.5),
      star2: Math.round(seededRandom(seed + 33) * 0.8),
      star1: Math.round(seededRandom(seed + 34) * 0.5),
    });
  }
  return data;
}

export const DAILY_DATA = generateDailyData(30);

export function aggregateWeekly(data: DailyRatings[]): DailyRatings[] {
  const weeks: DailyRatings[] = [];
  for (let i = 0; i < data.length; i += 7) {
    const chunk = data.slice(i, i + 7);
    if (chunk.length === 0) continue;
    weeks.push({
      date: chunk[0].date,
      label: `${chunk[0].label} – ${chunk[chunk.length - 1].label}`,
      star5: chunk.reduce((s, d) => s + d.star5, 0),
      star4: chunk.reduce((s, d) => s + d.star4, 0),
      star3: chunk.reduce((s, d) => s + d.star3, 0),
      star2: chunk.reduce((s, d) => s + d.star2, 0),
      star1: chunk.reduce((s, d) => s + d.star1, 0),
    });
  }
  return weeks;
}

export function aggregateMonthly(data: DailyRatings[]): DailyRatings[] {
  if (data.length === 0) return [];
  return [{
    date: data[0].date,
    label: "Feb – Mar 2026",
    star5: data.reduce((s, d) => s + d.star5, 0),
    star4: data.reduce((s, d) => s + d.star4, 0),
    star3: data.reduce((s, d) => s + d.star3, 0),
    star2: data.reduce((s, d) => s + d.star2, 0),
    star1: data.reduce((s, d) => s + d.star1, 0),
  }];
}

export interface RecentReview {
  id: string;
  userName: string;
  rating: number;
  comment: string;
  product: string;
  date: string;
}

export const RECENT_REVIEWS: RecentReview[] = [
  { id: "r1", userName: "Alice", rating: 5, comment: "Love these stickers! So cute and expressive.", product: "Cute Animals Pack", date: "2026-03-02" },
  { id: "r2", userName: "Bob", rating: 4, comment: "Great agent, very helpful for coding tasks.", product: "CodeHelper Pro", date: "2026-03-01" },
  { id: "r3", userName: "Carol", rating: 5, comment: "Beautiful theme, my favorite color scheme!", product: "Ocean Blue", date: "2026-02-28" },
  { id: "r4", userName: "Dave", rating: 3, comment: "Good but could use more variety.", product: "Emoji Remix Pack", date: "2026-02-27" },
  { id: "r5", userName: "Eve", rating: 5, comment: "Best sticker pack on Arinova!", product: "Kawaii Faces", date: "2026-02-26" },
];
