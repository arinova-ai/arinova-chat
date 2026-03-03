// ---------------------------------------------------------------------------
// Creator Sticker Management — Mock Data
// ---------------------------------------------------------------------------

export type PackStatus = "active" | "under_review" | "draft";

export interface StickerItem {
  id: string;
  filename: string;
  emoji: string;
  preview: string; // placeholder URL
}

export interface CreatorStickerPack {
  id: string;
  name: string;
  description: string;
  price: number; // 0 = free
  status: PackStatus;
  downloads: number;
  coverImage: string;
  stickers: StickerItem[];
  createdAt: string;
}

function placeholderImg(seed: number): string {
  const hue = (seed * 137) % 360;
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="hsl(${hue},60%,30%)"/><text x="60" y="68" text-anchor="middle" font-size="48" fill="white">${["😀", "🐱", "🌸", "🔥", "💎", "🎉", "🦊", "🍕"][seed % 8]}</text></svg>`
  )}`;
}

const EMOJIS = ["😀", "😂", "🥰", "😎", "🤔", "😴", "🐱", "🐶", "🌸", "🔥", "💎", "🎉"];

function makePack(
  id: string,
  name: string,
  desc: string,
  price: number,
  status: PackStatus,
  downloads: number,
  stickerCount: number,
  date: string,
): CreatorStickerPack {
  const stickers: StickerItem[] = [];
  for (let i = 0; i < stickerCount; i++) {
    const seed = id.charCodeAt(id.length - 1) * 10 + i;
    stickers.push({
      id: `${id}-s${i}`,
      filename: `sticker_${i + 1}.webp`,
      emoji: EMOJIS[seed % EMOJIS.length],
      preview: placeholderImg(seed),
    });
  }
  return {
    id,
    name,
    description: desc,
    price,
    status,
    downloads,
    coverImage: placeholderImg(id.charCodeAt(id.length - 1)),
    stickers,
    createdAt: date,
  };
}

export const MOCK_PACKS: CreatorStickerPack[] = [
  makePack("pack-1", "Cute Animals", "Adorable animal stickers for every mood", 499, "active", 1250, 12, "2026-01-15"),
  makePack("pack-2", "Emoji Remix", "Classic emojis with a twist", 0, "active", 3420, 8, "2026-02-01"),
  makePack("pack-3", "Kawaii Faces", "Cute Japanese-style face expressions", 299, "under_review", 0, 16, "2026-02-20"),
  makePack("pack-4", "Space Adventure", "Rockets, aliens, and cosmic fun", 399, "draft", 0, 6, "2026-03-01"),
];
