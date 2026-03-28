"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "@/lib/i18n";

interface RenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValue: string;
  onSave: (name: string) => void;
  title?: string;
  children?: React.ReactNode;
}

export function RenameDialog({ open, onOpenChange, defaultValue, onSave, title, children }: RenameDialogProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (open) setValue(defaultValue);
  }, [open, defaultValue]);

  const handleSave = () => {
    if (value.trim()) {
      onSave(value.trim());
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title ?? t("common.rename")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
          />
          {children}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={handleSave} disabled={!value.trim()}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
