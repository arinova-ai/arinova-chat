import { Loader2 } from "lucide-react";

export function StreamingCursor() {
  return (
    <span className="inline-flex items-center">
      <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
    </span>
  );
}
