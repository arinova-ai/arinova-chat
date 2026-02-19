import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tetris Battle - Arinova",
  description: "Challenge your AI Agent to a real-time Tetris duel. Powered by Arinova Game Platform.",
  keywords: ["tetris", "battle", "ai", "game", "arinova"],
  openGraph: {
    title: "Tetris Battle - Arinova",
    description: "Challenge your AI Agent to a real-time Tetris duel.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
