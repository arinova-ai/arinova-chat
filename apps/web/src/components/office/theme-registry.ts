export interface ThemeEntry {
  id: string;
  name: string;
  description: string;
  previewUrl: string;
  price: "free" | number;
  maxAgents: number;
  tags: string[];
}

/** Check if a themeId exists in the registry. */
export function isKnownTheme(id: string): boolean {
  return THEME_REGISTRY.some((t) => t.id === id);
}

/** Check if a theme is free (exists in registry and price === "free"). */
export function isFreeTheme(id: string): boolean {
  const entry = THEME_REGISTRY.find((t) => t.id === id);
  return entry?.price === "free";
}

export const THEME_REGISTRY: ThemeEntry[] = [
  {
    id: "cozy-studio",
    name: "Cozy Studio",
    description: "A warm illustrated studio with wood floors, bookshelves, and cozy furniture.",
    previewUrl: "/themes/cozy-studio/preview.png",
    price: "free",
    maxAgents: 1,
    tags: ["warm", "cozy", "illustrated"],
  },
  {
    id: "avg-classroom",
    name: "AVG Classroom",
    description: "Anime classroom with 6 agent slots in visual-novel style.",
    previewUrl: "https://uploads.chat.arinova.ai/themes/avg-classroom/preview.png",
    price: 1000,
    maxAgents: 6,
    tags: ["anime", "classroom", "avg"],
  },
];
