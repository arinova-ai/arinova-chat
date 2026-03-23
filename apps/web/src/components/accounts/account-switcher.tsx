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
import { useAccountStore, type Account } from "@/store/account-store";
import { useTranslation } from "@/lib/i18n";
import { authClient } from "@/lib/auth-client";
import { assetUrl } from "@/lib/config";
import { CreateAccountDialog } from "./create-account-dialog";

export function AccountSwitcher() {
  const { t } = useTranslation();
  const accounts = useAccountStore((s) => s.accounts);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const setActiveAccount = useAccountStore((s) => s.setActiveAccount);
  const loadAccounts = useAccountStore((s) => s.loadAccounts);
  const [createOpen, setCreateOpen] = useState(false);
  const { data: session } = authClient.useSession();

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
            className="flex items-center rounded-full hover:ring-2 hover:ring-accent transition-all"
          >
            <Avatar className="h-9 w-9">
              <AvatarImage src={activeAccount?.avatar ? assetUrl(activeAccount.avatar) : session?.user?.image ? assetUrl(session.user.image) : undefined} />
              <AvatarFallback className="text-[10px]">
                {activeAccount ? activeAccount.name[0]?.toUpperCase() : (session?.user?.name?.[0]?.toUpperCase() ?? <User className="h-3.5 w-3.5" />)}
              </AvatarFallback>
            </Avatar>
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
              <span className="flex-1 truncate">{account.name}</span>
              {activeAccountId === account.id && (
                <span className="text-xs text-brand">✓</span>
              )}
            </DropdownMenuItem>
          ))}

          {(() => {
            const hasLounge = accounts.some((a) => a.type === "lounge");
            const hasOfficial = accounts.some((a) => a.type === "official");
            if (hasLounge && hasOfficial) return null;
            return (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  <span>{t("accounts.create")}</span>
                </DropdownMenuItem>
              </>
            );
          })()}
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateAccountDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        availableTypes={[
          ...(!accounts.some((a) => a.type === "lounge") ? ["lounge" as const] : []),
          ...(!accounts.some((a) => a.type === "official") ? ["official" as const] : []),
        ]}
      />
    </>
  );
}
