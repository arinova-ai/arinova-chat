"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { assetUrl } from "@/lib/config";
import { useTranslation } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Crown, Shield, Wrench, Bot } from "lucide-react";

interface MemberProfile {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  agents: { id: string; name: string; avatarUrl: string | null }[];
}

interface CommunityMemberSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityId: string;
  userId: string;
}

export function CommunityMemberSheet({ open, onOpenChange, communityId, userId }: CommunityMemberSheetProps) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !communityId || !userId) return;
    setLoading(true);
    api<MemberProfile>(`/api/communities/${communityId}/members/${userId}/profile`, { silent: true })
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, [open, communityId, userId]);

  const roleBadge = (role: string) => {
    switch (role) {
      case "creator":
        return <Badge className="gap-1 bg-amber-500/20 text-amber-400 border-amber-500/30"><Crown className="h-3 w-3" /> Creator</Badge>;
      case "admin":
      case "moderator":
        return <Badge className="gap-1 bg-blue-500/20 text-blue-400 border-blue-500/30"><Shield className="h-3 w-3" /> Admin</Badge>;
      default:
        return <Badge variant="secondary">Member</Badge>;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[70vh]">
        <SheetHeader className="sr-only">
          <SheetTitle>{t("communityMembers.profile")}</SheetTitle>
          <SheetDescription>{t("communityMembers.profile")}</SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          </div>
        ) : profile ? (
          <div className="flex flex-col items-center gap-4 py-4">
            {/* Avatar */}
            <div className="h-20 w-20 rounded-full bg-muted overflow-hidden flex items-center justify-center text-2xl font-bold text-muted-foreground">
              {profile.avatarUrl ? (
                <img src={assetUrl(profile.avatarUrl)} alt="" className="h-full w-full object-cover" />
              ) : (
                profile.displayName.charAt(0).toUpperCase()
              )}
            </div>

            {/* Name + role */}
            <div className="text-center">
              <h3 className="text-lg font-semibold">{profile.displayName}</h3>
              <div className="mt-1">{roleBadge(profile.role)}</div>
            </div>

            {/* Agent list */}
            {profile.agents.length > 0 && (
              <div className="w-full space-y-2 mt-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase">{t("communitySettings.agents")}</p>
                {profile.agents.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 rounded-lg px-3 py-2 bg-secondary/50">
                    <div className="h-8 w-8 rounded-full bg-muted overflow-hidden shrink-0">
                      {a.avatarUrl ? (
                        <img src={assetUrl(a.avatarUrl)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center"><Bot className="h-4 w-4 text-muted-foreground" /></div>
                      )}
                    </div>
                    <span className="text-sm font-medium">{a.name}</span>
                    <Badge variant="secondary" className="text-[10px] ml-auto">agent</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("communityMembers.profileNotFound")}</p>
        )}
      </SheetContent>
    </Sheet>
  );
}
