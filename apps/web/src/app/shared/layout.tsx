import type { ReactNode } from "react";

export default function SharedLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      {children}
    </div>
  );
}
