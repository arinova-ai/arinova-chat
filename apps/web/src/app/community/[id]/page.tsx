"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";

import { useTranslation } from "@/lib/i18n";
import { authClient } from "@/lib/auth-client";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Loader2,
  Coins,
  Users,
  Bot,
  X,
  BadgeCheck,
  MessageSquare,
  ShieldCheck,
  LayoutDashboard,
  Mic,
  Settings,
  BookText,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CommunitySettingsSheet } from "@/components/chat/community-settings";
import { DefaultAvatarPicker } from "@/components/ui/default-avatar-picker";
import { WikiPanel } from "@/components/chat/wiki-panel";
import { useChatStore } from "@/store/chat-store";
import { cn } from "@/lib/utils";


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Community {
  id: string;
  creatorId: string;
  name: string;
  description: string | null;
  type: "official" | "community" | "lounge";
  joinFee: number;
  monthlyFee: number;
  agentCallFee: number;
  status: string;
  memberCount: number;
  avatarUrl: string | null;
  coverImageUrl: string | null;
  category: string | null;
  verified: boolean;
  csMode: string | null;
  conversationId: string | null;
  requireApproval?: boolean;
  approvalQuestions?: string[];
  agentJoinPolicy?: string;
  createdAt: string;
}

interface Member {
  id: string;
  userId: string;
  role: string;
  joinedAt: string;
  subscriptionStatus: string | null;
  userName: string;
  userImage: string | null;
}

interface Agent {
  id: string;
  listingId: string;
  agentName: string;
  avatarUrl: string | null;
  description: string;
  model: string;
  addedAt: string;
}

// ---------------------------------------------------------------------------
// ApprovalForm (shown to non-members when community requires approval)
// ---------------------------------------------------------------------------

function ApprovalForm({ communityId, questions }: { communityId: string; questions: string[] }) {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<string[]>(questions.map(() => ""));
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleApply = async () => {
    setSubmitting(true);
    try {
      const answersPayload = questions.map((q, i) => ({ question: q, answer: answers[i]?.trim() || "" }));
      await api(`/api/communities/${communityId}/apply`, {
        method: "POST",
        body: JSON.stringify({ answers: answersPayload }),
      });
      setSubmitted(true);
    } catch { /* handled */ }
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center space-y-2">
        <p className="text-sm font-semibold">{t("community.detail.applicationSubmitted")}</p>
        <p className="text-xs text-muted-foreground">{t("community.detail.applicationSubmittedHint")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">{t("community.detail.applicationRequired")}</h3>
        <p className="text-xs text-muted-foreground mt-1">{t("community.detail.applicationRequiredHint")}</p>
      </div>
      {questions.map((question, i) => (
        <div key={i} className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">{question}</label>
          <textarea
            value={answers[i] || ""}
            onChange={(e) => {
              const next = [...answers];
              next[i] = e.target.value;
              setAnswers(next);
            }}
            rows={2}
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      ))}
      <Button
        className="brand-gradient-btn w-full"
        onClick={handleApply}
        disabled={submitting}
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("community.detail.submitApplication")}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function CommunityDetailContent() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id;

  // Data
  const [community, setCommunity] = useState<Community | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isMember, setIsMember] = useState(false);
  const [membershipChecked, setMembershipChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  // Sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileMembersOpen, setMobileMembersOpen] = useState(false);

  // Community settings sheet
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Wiki
  const [wikiOpen, setWikiOpen] = useState(false);

  // Join identity dialog
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [joinNickname, setJoinNickname] = useState("");
  const [joinAvatarUrl, setJoinAvatarUrl] = useState("");

  // Verification
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyForm, setVerifyForm] = useState({ businessName: "", businessRegistration: "", documentsUrl: "" });
  const [verifySubmitting, setVerifySubmitting] = useState(false);

  // ------ Load data ------

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Fetch community first — if it doesn't exist, show error immediately
      let communityData: Community;
      try {
        communityData = await api<Community>(`/api/communities/${id}`);
      } catch {
        // Retry once after a short delay (handles DB replication lag)
        await new Promise((r) => setTimeout(r, 800));
        try {
          communityData = await api<Community>(`/api/communities/${id}`);
        } catch {
          if (!cancelled) {
            setLoading(false);
          }
          return;
        }
      }
      if (cancelled) return;
      setCommunity(communityData);

      // Creator is always a member, regardless of API results or session timing
      const isCreator = !!currentUserId && communityData.creatorId === currentUserId;

      // Then fetch members and agents in parallel
      try {
        const [membersData, agentsData] = await Promise.all([
          api<{ members: Member[] }>(`/api/communities/${id}/members`),
          api<{ agents: Agent[] }>(`/api/communities/${id}/agents`),
        ]);
        if (cancelled) return;
        setMembers(membersData.members);
        setAgents(agentsData.agents);

        const userIsMember =
          isCreator ||
          (!!currentUserId && membersData.members.some((m) => m.userId === currentUserId));
        setIsMember(userIsMember);
        setMembershipChecked(true);

      } catch {
        // members/agents API may fail — still grant access to creator
        if (!cancelled && isCreator) {
          setIsMember(true);
          setMembershipChecked(true);
        }
      } finally {
        if (!cancelled) {
          setMembershipChecked(true);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, currentUserId]);

  // Members can view the community profile page (no auto-redirect)

  // ------ Join ------

  // Open identity dialog instead of joining directly
  const handleJoinClick = useCallback(() => {
    setJoinNickname("");
    setJoinAvatarUrl("");
    setJoinDialogOpen(true);
  }, []);

  const handleJoin = useCallback(async () => {
    if (!joinNickname.trim()) return;
    setJoining(true);
    setJoinDialogOpen(false);
    try {
      const joinRes = await api<{ conversationId?: string }>(`/api/communities/${id}/join`, {
        method: "POST",
        body: JSON.stringify({
          displayName: joinNickname.trim(),
          avatarUrl: joinAvatarUrl.trim() || null,
        }),
      });
      if (joinRes.conversationId) {
        useChatStore.getState().setActiveConversation(joinRes.conversationId);
        router.push(`/?c=${joinRes.conversationId}`);
        return;
      }
      // Fallback: reload page to pick up membership
      setIsMember(true);
      if (community) {
        setCommunity({ ...community, memberCount: community.memberCount + 1 });
      }
    } catch {
      // handled
    } finally {
      setJoining(false);
    }
  }, [id, community, router, joinNickname, joinAvatarUrl]);

  const handleSubmitVerification = useCallback(async () => {
    setVerifySubmitting(true);
    try {
      await api(`/api/communities/${id}/verify`, {
        method: "POST",
        body: JSON.stringify(verifyForm),
      });
      setVerifyOpen(false);
    } catch { /* handled */ } finally {
      setVerifySubmitting(false);
    }
  }, [id, verifyForm]);

  // ------ Render ------

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!community) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold text-muted-foreground">
            {t("community.detail.notFound")}
          </p>
          <Button
            variant="secondary"
            onClick={() => router.push("/community")}
          >
            {t("community.detail.backToCommunities")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-dvh flex bg-background">
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      <div className="flex flex-1 min-w-0">
        {/* Main chat area */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Header */}
          <div className="shrink-0 border-b border-border">
            <div className="flex min-h-14 items-center gap-3 px-4">
              <button
                onClick={() => router.back()}
                className="text-muted-foreground hover:text-foreground transition-colors md:hidden"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              {community.avatarUrl ? (
                <img
                  src={community.avatarUrl}
                  alt={community.name}
                  className="h-8 w-8 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/15 text-sm font-bold text-brand-text">
                  {community.name[0]}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold truncate">
                    {community.name}
                  </h2>
                  {community.verified && (
                    <BadgeCheck className="h-4 w-4 shrink-0 text-blue-500" />
                  )}
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                      community.type === "official"
                        ? "bg-blue-500/15 text-blue-400"
                        : community.type === "lounge"
                        ? "bg-amber-500/15 text-amber-400"
                        : "bg-purple-500/15 text-purple-400"
                    )}
                  >
                    {t(`community.type.${community.type === "community" ? "community" : community.type}`)}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground flex items-center gap-2">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {community.memberCount} {t("chat.header.members")}
                  </span>
                  {community.agentCallFee > 0 && (
                    <span className="flex items-center gap-1">
                      <Coins className="h-3 w-3 text-yellow-500" />
                      {community.agentCallFee}{t("community.detail.perCall")}
                    </span>
                  )}
                </p>
              </div>
              <div className="ml-auto flex items-center gap-1">
                {currentUserId === community.creatorId && community.type === "official" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => router.push(`/official/${community.id}/dashboard`)}
                    title={t("nav.dashboard")}
                  >
                    <LayoutDashboard className="h-4 w-4" />
                  </Button>
                )}
                {currentUserId === community.creatorId && !community.verified && community.type === "official" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setVerifyOpen(true)}
                    title={t("community.detail.applyVerification")}
                  >
                    <ShieldCheck className="h-4 w-4 text-blue-400" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("h-8 w-8", wikiOpen && "text-blue-400")}
                  onClick={() => setWikiOpen((v) => !v)}
                  title={t("wiki.title")}
                >
                  <BookText className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hidden md:inline-flex"
                  onClick={() => setSidebarOpen((v) => !v)}
                  title={t("chat.header.members")}
                >
                  <Users className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 md:hidden"
                  onClick={() => setMobileMembersOpen(true)}
                  title={t("chat.header.members")}
                >
                  <Users className="h-4 w-4" />
                </Button>
                {isMember && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setSettingsOpen(true)}
                    title={t("chat.header.settings")}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

          </div>

          {/* Community wiki */}
          {isMember && (
            <WikiPanel
              conversationId=""
              communityId={id}
              open={wikiOpen}
              onOpenChange={setWikiOpen}
            />
          )}

          {/* Community settings sheet */}
          {isMember && (
            <CommunitySettingsSheet
              open={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              communityId={id}
              conversationId={community?.conversationId ?? id}
            />
          )}

          {/* Verification form */}
          {verifyOpen && (
            <div className="shrink-0 border-b border-border bg-card/50 px-4 py-3 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">{t("community.detail.applyVerification")}</h3>
                <button onClick={() => setVerifyOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <input
                type="text"
                placeholder={t("community.detail.businessName")}
                value={verifyForm.businessName}
                onChange={(e) => setVerifyForm((f) => ({ ...f, businessName: e.target.value }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
              <input
                type="text"
                placeholder={t("community.detail.businessRegNumber")}
                value={verifyForm.businessRegistration}
                onChange={(e) => setVerifyForm((f) => ({ ...f, businessRegistration: e.target.value }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
              <input
                type="text"
                placeholder={t("community.detail.documentsUrl")}
                value={verifyForm.documentsUrl}
                onChange={(e) => setVerifyForm((f) => ({ ...f, documentsUrl: e.target.value }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
              <Button
                size="sm"
                className="brand-gradient-btn"
                disabled={!verifyForm.businessName.trim() || verifySubmitting}
                onClick={handleSubmitVerification}
              >
                {verifySubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("community.detail.submit")}
              </Button>
            </div>
          )}

          {/* Non-member: community detail view / Member: chat view */}
          {!membershipChecked ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !isMember ? (
            /* ---------- Non-member detail card ---------- */
            (() => {
              // Official and lounge types keep their special join flows
              if (community.type === "official") {
                return (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-2 text-center p-4">
                      <p className="text-sm font-medium">{t("community.detail.startConversation").replace("{name}", community.name)}</p>
                      <Button
                        className="brand-gradient-btn gap-2"
                        onClick={async () => {
                          try {
                            const res = await api<{ conversationId: string }>(`/api/communities/${community.id}/start-chat`, { method: "POST" });
                            useChatStore.getState().setActiveConversation(res.conversationId);
                            router.push(`/?c=${res.conversationId}`);
                          } catch { /* handled by api */ }
                        }}
                      >
                        <MessageSquare className="h-4 w-4" />
                        {t("community.detail.startChat")}
                      </Button>
                    </div>
                  </div>
                );
              }
              if (community.type === "lounge") {
                return (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-2 text-center p-4">
                      <p className="text-sm font-medium">{t("community.detail.voiceChat").replace("{name}", community.name)}</p>
                      <p className="text-xs text-muted-foreground">{t("community.detail.freeTier")}</p>
                      <Button
                        className="brand-gradient-btn gap-2"
                        onClick={async () => {
                          try {
                            const res = await api<{ conversationId: string }>(`/api/lounge/${community.id}/start-chat`, { method: "POST" });
                            useChatStore.getState().setActiveConversation(res.conversationId);
                            router.push(`/?c=${res.conversationId}`);
                          } catch { /* handled by api */ }
                        }}
                      >
                        <Mic className="h-4 w-4" />
                        {t("community.detail.startVoiceChat")}
                      </Button>
                    </div>
                  </div>
                );
              }
              // Community type: full detail card
              return (
                <div className="flex-1 overflow-y-auto pb-24 md:pb-6">
                  {/* Cover image */}
                  {community.coverImageUrl && (
                    <div className="relative h-48 w-full">
                      <img src={community.coverImageUrl} alt="" className="h-full w-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
                    </div>
                  )}

                  {/* Community info card */}
                  <div className="px-4 py-6 space-y-6 max-w-2xl mx-auto">
                    <div className="flex items-start gap-4">
                      {/* Avatar */}
                      {community.avatarUrl ? (
                        <img src={community.avatarUrl} alt={community.name} className="h-16 w-16 rounded-xl object-cover shrink-0" />
                      ) : (
                        <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-brand/15 text-2xl font-bold text-brand-text shrink-0">
                          {community.name[0]}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h2 className="text-xl font-bold">{community.name}</h2>
                          {community.verified && <BadgeCheck className="h-5 w-5 text-blue-500" />}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1"><Users className="h-4 w-4" />{community.memberCount} {t("community.detail.members")}</span>
                          {community.category && <span>{t(`community.category.${community.category}`)}</span>}
                        </div>
                      </div>
                    </div>

                    {community.description && (
                      <p className="text-sm text-foreground/80 whitespace-pre-wrap">{community.description}</p>
                    )}

                    {/* Fee info */}
                    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{t("community.detail.joinFee")}</span>
                        <span>{community.joinFee > 0 ? t("community.detail.coinsAmount", { amount: String(community.joinFee) }) : t("community.detail.free")}</span>
                      </div>
                      {community.monthlyFee > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{t("community.detail.monthlyFee")}</span>
                          <span>{t("community.detail.coinsPerMonth", { amount: String(community.monthlyFee) })}</span>
                        </div>
                      )}
                    </div>

                    {/* Join / Apply section */}
                    {community.requireApproval ? (
                      <ApprovalForm communityId={community.id} questions={community.approvalQuestions || []} />
                    ) : (
                      <Button
                        className="brand-gradient-btn w-full"
                        size="lg"
                        onClick={handleJoinClick}
                        disabled={joining}
                      >
                        {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : t("community.detail.joinCommunity")}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })()
          ) : community.conversationId ? (
            /* ---------- Member: community profile view ---------- */
            <div className="flex-1 overflow-y-auto">
              {/* Cover image */}
              <div className="relative h-48 w-full bg-muted">
                {community.coverImageUrl ? (
                  <img src={community.coverImageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-brand/20 to-brand/5" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
                {currentUserId === community.creatorId && (
                  <button
                    type="button"
                    className="absolute bottom-3 right-3 rounded-full bg-background/80 px-3 py-1.5 text-xs font-medium hover:bg-background transition-colors"
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = "image/*";
                      input.onchange = async () => {
                        const file = input.files?.[0];
                        if (!file) return;
                        try {
                          const form = new FormData();
                          form.append("file", file);
                          const { BACKEND_URL } = await import("@/lib/config");
                          const res = await fetch(`${BACKEND_URL}/api/communities/${community.id}/cover`, {
                            method: "POST",
                            body: form,
                            credentials: "include",
                          });
                          if (res.ok) {
                            const data = await res.json();
                            setCommunity((prev) => prev ? { ...prev, coverImageUrl: data.url || data.coverImageUrl } : prev);
                          } else {
                            // Fallback: use URL prompt
                            const url = prompt("Upload failed. Enter cover image URL:");
                            if (url) {
                              await api(`/api/communities/${community.id}`, {
                                method: "PATCH",
                                body: JSON.stringify({ coverImageUrl: url.trim() }),
                              });
                              setCommunity((prev) => prev ? { ...prev, coverImageUrl: url.trim() } : prev);
                            }
                          }
                        } catch {
                          // Fallback to URL
                          const url = prompt("Enter cover image URL:");
                          if (url) {
                            await api(`/api/communities/${community.id}`, {
                              method: "PATCH",
                              body: JSON.stringify({ coverImageUrl: url.trim() }),
                            });
                            setCommunity((prev) => prev ? { ...prev, coverImageUrl: url.trim() } : prev);
                          }
                        }
                      };
                      input.click();
                    }}
                  >
                    {t("community.detail.editCover")}
                  </button>
                )}
              </div>
              <div className="p-4 space-y-4">
                <div className="text-center space-y-2">
                  <p className="text-sm text-muted-foreground">{community.description || t("community.detail.noDescription")}</p>
                  <p className="text-xs text-muted-foreground">{members.length} {t("community.detail.members")}</p>
                </div>
                <Button
                  className="w-full gap-2"
                  onClick={() => {
                    useChatStore.getState().setActiveConversation(community.conversationId!);
                    router.push(`/?c=${community.conversationId}`);
                  }}
                >
                  <MessageSquare className="h-4 w-4" />
                  {t("community.detail.goToChat")}
                </Button>
              </div>
            </div>
          ) : (
            /* ---------- Member: no conversation linked yet ---------- */
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-2 p-4">
                <p className="text-sm font-medium">{t("community.detail.noChatYet")}</p>
                <p className="text-xs text-muted-foreground">{t("community.detail.noChatYetHint")}</p>
              </div>
            </div>
          )}

          {/* Join Identity Dialog */}
          <Dialog open={joinDialogOpen} onOpenChange={setJoinDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t("community.identity.joinTitle")}</DialogTitle>
                <DialogDescription>{t("community.identity.joinDesc")}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">{t("community.identity.nickname")}</label>
                  <Input
                    value={joinNickname}
                    onChange={(e) => setJoinNickname(e.target.value)}
                    placeholder={t("community.identity.nicknamePlaceholder")}
                    maxLength={50}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">{t("community.identity.avatar")}</label>
                  <DefaultAvatarPicker
                    selected={joinAvatarUrl}
                    onSelect={(url) => setJoinAvatarUrl(url)}
                  />
                </div>
                <Button
                  className="brand-gradient-btn w-full"
                  onClick={handleJoin}
                  disabled={!joinNickname.trim() || joining}
                >
                  {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : t("community.identity.create")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <MobileBottomNav />
        </div>

        {/* Sidebar */}
        {sidebarOpen && (
          <div className="hidden md:flex w-64 shrink-0 flex-col border-l border-border overflow-y-auto">
            {/* Members */}
            <div className="p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {t("community.detail.membersCount", { count: String(members.length) })}
              </h3>
              <div className="space-y-1.5">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-2">
                    {m.userImage ? (
                      <img
                        src={m.userImage}
                        alt=""
                        className="h-6 w-6 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/15 text-[10px] font-bold text-brand-text">
                        {m.userName[0]}
                      </div>
                    )}
                    <span className="text-xs truncate flex-1">
                      {m.userName}
                    </span>
                    {m.role !== "member" && (
                      <span className="text-[10px] text-muted-foreground capitalize">
                        {m.role}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Agents */}
            {agents.length > 0 && (
              <div className="p-4 border-t border-border">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {t("community.detail.aiAgentsCount", { count: String(agents.length) })}
                </h3>
                <div className="space-y-1.5">
                  {agents.map((a) => (
                    <div key={a.id} className="flex items-center gap-2">
                      {a.avatarUrl ? (
                        <img
                          src={a.avatarUrl}
                          alt=""
                          className="h-6 w-6 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-purple-500/15">
                          <Bot className="h-3 w-3 text-purple-400" />
                        </div>
                      )}
                      <span className="text-xs truncate flex-1">
                        {a.agentName}
                      </span>
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mobile Members Sheet */}
      <Sheet open={mobileMembersOpen} onOpenChange={setMobileMembersOpen}>
        <SheetContent side="right" className="w-80 sm:max-w-sm p-0 overflow-y-auto">
          <SheetHeader className="px-4 pt-4 pb-2">
            <SheetTitle className="text-base">{t("chat.header.members")}</SheetTitle>
          </SheetHeader>
          <div className="border-b border-border" />
          <div className="p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {t("community.detail.membersCount", { count: String(members.length) })}
            </h3>
            <div className="space-y-1.5">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-2">
                  {m.userImage ? (
                    <img src={m.userImage} alt="" className="h-6 w-6 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/15 text-[10px] font-bold text-brand-text">
                      {m.userName[0]}
                    </div>
                  )}
                  <span className="text-xs truncate flex-1">{m.userName}</span>
                  {m.role !== "member" && (
                    <span className="text-[10px] text-muted-foreground capitalize">{m.role}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
          {agents.length > 0 && (
            <div className="p-4 border-t border-border">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {t("community.detail.aiAgentsCount", { count: String(agents.length) })}
              </h3>
              <div className="space-y-1.5">
                {agents.map((a) => (
                  <div key={a.id} className="flex items-center gap-2">
                    {a.avatarUrl ? (
                      <img src={a.avatarUrl} alt="" className="h-6 w-6 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-purple-500/15">
                        <Bot className="h-3 w-3 text-purple-400" />
                      </div>
                    )}
                    <span className="text-xs truncate flex-1">{a.agentName}</span>
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default function CommunityDetailPage() {
  return (
    <AuthGuard>
      <CommunityDetailContent />
    </AuthGuard>
  );
}
