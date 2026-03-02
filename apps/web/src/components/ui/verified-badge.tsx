import { BadgeCheck } from "lucide-react";

export function VerifiedBadge({ className }: { className?: string }) {
  return (
    <BadgeCheck
      className={className ?? "h-4 w-4 shrink-0 text-blue-500"}
      aria-label="Verified"
    />
  );
}
