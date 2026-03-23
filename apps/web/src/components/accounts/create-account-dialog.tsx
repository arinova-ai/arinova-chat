"use client";

import { useState } from "react";
import { Building2, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAccountStore } from "@/store/account-store";
import { useTranslation } from "@/lib/i18n";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableTypes?: ("lounge" | "official")[];
}

export function CreateAccountDialog({ open, onOpenChange, availableTypes }: Props) {
  const { t } = useTranslation();
  const createAccount = useAccountStore((s) => s.createAccount);
  const [step, setStep] = useState<"type" | "form">("type");
  const [accountType, setAccountType] = useState<"official" | "lounge">("official");
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setStep("type");
    setName("");
    setBio("");
    setSubmitting(false);
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await createAccount({ name: name.trim(), type: accountType, bio: bio.trim() || undefined });
      handleClose(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("accounts.createTitle")}</DialogTitle>
        </DialogHeader>

        {step === "type" ? (
          <div className="grid grid-cols-2 gap-3 py-4">
            {(!availableTypes || availableTypes.includes("official")) && (
              <button
                type="button"
                onClick={() => { setAccountType("official"); setStep("form"); }}
                className="flex flex-col items-center gap-2 rounded-xl border-2 border-transparent bg-accent/30 p-6 hover:border-blue-500 transition-colors"
              >
                <Building2 className="h-10 w-10 text-blue-500" />
                <span className="text-sm font-medium">{t("accounts.typeOfficial")}</span>
                <span className="text-xs text-muted-foreground text-center">
                  {t("accounts.typeOfficialDesc")}
                </span>
              </button>
            )}
            {(!availableTypes || availableTypes.includes("lounge")) && (
              <button
                type="button"
                onClick={() => { setAccountType("lounge"); setStep("form"); }}
                className="flex flex-col items-center gap-2 rounded-xl border-2 border-transparent bg-accent/30 p-6 hover:border-purple-500 transition-colors"
              >
                <Mic className="h-10 w-10 text-purple-500" />
                <span className="text-sm font-medium">{t("accounts.typeLounge")}</span>
                <span className="text-xs text-muted-foreground text-center">
                  {t("accounts.typeLoungeDesc")}
                </span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium" htmlFor="account-name">
                {t("common.name")}
              </label>
              <input
                id="account-name"
                type="text"
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder={t("accounts.namePlaceholder")}
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="account-bio">
                {t("accounts.bio")}
              </label>
              <textarea
                id="account-bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                placeholder={t("accounts.bioPlaceholder")}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "form" && (
            <>
              <Button variant="ghost" onClick={() => setStep("type")}>
                {t("common.back")}
              </Button>
              <Button onClick={handleCreate} disabled={!name.trim() || submitting}>
                {submitting ? t("common.creating") : t("common.confirm")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
