import { MessageSquare } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
      <MessageSquare className="h-16 w-16 opacity-30" />
      <div className="text-center">
        <h2 className="text-lg font-medium">No conversation selected</h2>
        <p className="mt-1 text-sm">
          Choose a conversation from the sidebar to start chatting
        </p>
      </div>
    </div>
  );
}
