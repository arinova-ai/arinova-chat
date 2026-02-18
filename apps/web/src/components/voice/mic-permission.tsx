"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Mic } from "lucide-react";

interface MicPermissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAllow: () => void;
}

export function MicPermissionDialog({
  open,
  onOpenChange,
  onAllow,
}: MicPermissionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5" />
            需要麥克風權限
          </DialogTitle>
          <DialogDescription>
            語音通話需要使用麥克風。請在接下來的瀏覽器提示中允許麥克風存取。
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg bg-neutral-800 p-4 text-sm text-muted-foreground space-y-2">
          <p>1. 點擊「開始通話」後，瀏覽器會詢問麥克風權限</p>
          <p>2. 請點擊「允許」以啟用語音通話</p>
          <p>3. 如果不小心拒絕了，請在瀏覽器設定中重新啟用</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={onAllow}>
            開始通話
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
