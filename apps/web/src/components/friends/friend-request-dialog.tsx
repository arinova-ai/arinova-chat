"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check } from "lucide-react";
import { UserSearch } from "./user-search";

interface FriendRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FriendRequestDialog({
  open,
  onOpenChange,
}: FriendRequestDialogProps) {
  const [lastSentUsername, setLastSentUsername] = useState<string | null>(null);

  const handleRequestSent = (username: string) => {
    setLastSentUsername(username);
    setTimeout(() => setLastSentUsername(null), 3000);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setLastSentUsername(null);
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Friend</DialogTitle>
        </DialogHeader>

        {lastSentUsername && (
          <div className="flex items-center gap-2 rounded-lg bg-green-500/10 px-4 py-2.5">
            <Check className="h-4 w-4 text-green-500 shrink-0" />
            <p className="text-sm">
              Request sent to <span className="font-medium">@{lastSentUsername}</span>!
            </p>
          </div>
        )}

        <UserSearch onRequestSent={handleRequestSent} />
      </DialogContent>
    </Dialog>
  );
}
