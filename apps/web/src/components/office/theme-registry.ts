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
    id: "starter-desk",
    name: "Starter Desk",
    description: "A cozy personal workspace with the Arinova mascot. Perfect for getting started.",
    previewUrl: "/themes/starter-desk/preview.png",
    price: "free",
    maxAgents: 1,
    tags: ["warm", "cozy", "starter"],
  },
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
    id: "default-office",
    name: "Modern Office",
    description: "A modern open-plan office with meeting room and lounge. Great for teams.",
    previewUrl: "/themes/default-office/preview.png",
    price: "free",
    maxAgents: 6,
    tags: ["modern", "dark", "open-plan"],
  },
  {
    id: "neon-lab",
    name: "Neon Lab",
    description: "A cyberpunk coding lab with neon glow. Supports 3 agents.",
    previewUrl: "/themes/neon-lab/preview.png",
    price: 99,
    maxAgents: 3,
    tags: ["cyberpunk", "neon", "premium"],
  },
  {
    id: "cloud-garden",
    name: "Cloud Garden",
    description: "A dreamy watercolor floating island. Supports 5 agents.",
    previewUrl: "/themes/cloud-garden/preview.png",
    price: 199,
    maxAgents: 5,
    tags: ["watercolor", "dream", "premium"],
  },
];
