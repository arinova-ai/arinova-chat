"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Plus, Building2, Mic, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAccountStore } from "@/store/account-store";
import { useTranslation } from "@/lib/i18n";
import { CreateAccountDialog } from "./create-account-dialog";

export function AccountSwitcher() {
  const { t } = useTranslation();
  const accounts = useAccountStore((s) => s.accounts);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const setActiveAccount = useAccountStore((s) => s.setActiveAccount);
  const loadAccounts = useAccountStore((s) => s.loadAccounts);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const activeAccount = accounts.find((a) => a.id === activeAccountId);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm hover:bg-accent/50 transition-colors"
          >
            <Avatar className="h-6 w-6">
              <AvatarImage src={activeAccount?.avatar ?? undefined} />
              <AvatarFallback className="text-[10px]">
                {activeAccount ? activeAccount.name[0] : <User className="h-3 w-3" />}
              </AvatarFallback>
            </Avatar>
            <span className="max-w-[80px] truncate text-xs font-medium">
              {activeAccount?.name ?? t("accounts.personal")}
            </span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {/* Personal account (default) */}
          <DropdownMenuItem onClick={() => setActiveAccount(null)}>
            <User className="mr-2 h-4 w-4" />
            <span>{t("accounts.personal")}</span>
            {!activeAccountId && (
              <span className="ml-auto text-xs text-brand">✓</span>
            )}
          </DropdownMenuItem>

          {accounts.length > 0 && <DropdownMenuSeparator />}

          {/* Account list */}
          {accounts.map((account) => (
            <DropdownMenuItem
              key={account.id}
              onClick={() => setActiveAccount(account.id)}
            >
              {account.type === "official" ? (
                <Building2 className="mr-2 h-4 w-4 text-blue-500" />
              ) : (
                <Mic className="mr-2 h-4 w-4 text-purple-500" />
              )}
              <span className="truncate">{account.name}</span>
              {activeAccountId === account.id && (
                <span className="ml-auto text-xs text-brand">✓</span>
              )}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />

          {/* Create new account */}
          <DropdownMenuItem onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            <span>{t("accounts.create")}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateAccountDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
