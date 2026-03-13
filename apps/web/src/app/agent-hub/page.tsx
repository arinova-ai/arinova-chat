"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { Button } from "@/components/ui/button";
import {
  Search,
  Star,
  Sparkles,
  Download,
  Heart,
  Loader2,
  Check,
  X,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Terminal,
  ExternalLink,
} from "lucide-react";
import { ArinovaSpinner } from "@/components/ui/arinova-spinner";
import { PageTitle } from "@/components/ui/page-title";
import { useChatStore } from "@/store/chat-store";
import { cn } from "@/lib/utils";

// ===== Types =====

interface Skill {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  iconUrl: string | null;
  version: string;
  slashCommand: string | null;
  promptTemplate: string;
  isOfficial: boolean;
  isPublic: boolean;
  createdBy: string | null;
  installCount: number;
  sourceUrl?: string | null;
  isFavorited?: boolean;
  installedAgentIds?: string[];
  createdAt: string;
  updatedAt: string;
}

interface SkillDetail extends Skill {
  promptContent: string;
  parameters: unknown[];
}

interface Category {
  category: string;
  count: number;
}

interface InstalledSkill {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  iconUrl: string | null;
  version: string;
  slashCommand: string | null;
  isOfficial: boolean;
  isEnabled: boolean;
  config: Record<string, unknown>;
  installedAt: string;
}

// ===== Tabs =====

const TAB_KEYS = ["explore", "installed", "favorites"] as const;
type TabKey = (typeof TAB_KEYS)[number];

// ===== Main Content =====

function SkillsContent() {
  const { t } = useTranslation();
  const agents = useChatStore((s) => s.agents);
  const loadAgents = useChatStore((s) => s.loadAgents);
  const [activeTab, setActiveTab] = useState<TabKey>("explore");

  useEffect(() => {
    if (agents.length === 0) loadAgents();
  }, [agents.length, loadAgents]);

  return (
    <div className="app-dvh flex bg-background">
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="shrink-0 border-b border-border px-6 py-5">
          <PageTitle
            title={t("skills.title")}
            subtitle={t("skills.subtitle")}
            icon={Sparkles}
          />

          {/* Tab bar */}
          <div className="mt-3 flex items-center gap-1">
            {TAB_KEYS.map((key) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-xs font-medium transition-colors",
                  activeTab === key
                    ? "bg-brand text-white"
                    : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {t(`skills.tab.${key}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto pb-24 md:pb-0">
          {activeTab === "explore" && <ExploreTab agents={agents} />}
          {activeTab === "installed" && <InstalledTab agents={agents} />}
          {activeTab === "favorites" && <FavoritesTab agents={agents} />}
        </div>

        <MobileBottomNav />
      </div>
    </div>
  );
}

// ===== Explore Tab =====

function ExploreTab({ agents }: { agents: { id: string; name: string }[] }) {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("popular");
  const [page, setPage] = useState(1);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<SkillDetail | null>(null);
  const [installing, setInstalling] = useState(false);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  const limit = 20;

  // Load categories
  useEffect(() => {
    api<{ categories: Category[] }>("/api/skills/categories")
      .then((d) => setCategories(d.categories))
      .catch(() => {});
  }, []);

  const fetchSkills = useCallback(
    async (p: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (category) params.set("category", category);
        if (search.trim()) params.set("search", search.trim());
        params.set("sort", sort);
        params.set("page", String(p));
        params.set("limit", String(limit));
        const data = await api<{ skills: Skill[]; total: number; page: number }>(
          `/api/skills?${params.toString()}`,
        );
        setSkills((prev) => (p === 1 ? data.skills : [...prev, ...data.skills]));
        setTotal(data.total);
      } catch {
        // auto-handled
      } finally {
        setLoading(false);
      }
    },
    [category, search, sort],
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchSkills(1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, category, sort, fetchSkills]);

  useEffect(() => {
    if (page > 1) fetchSkills(page);
  }, [page, fetchSkills]);

  const toggleFavorite = async (skill: Skill) => {
    try {
      if (skill.isFavorited) {
        await api(`/api/skills/${skill.id}/favorite`, { method: "DELETE" });
      } else {
        await api(`/api/skills/${skill.id}/favorite`, { method: "POST" });
      }
      setSkills((prev) =>
        prev.map((s) =>
          s.id === skill.id ? { ...s, isFavorited: !s.isFavorited } : s,
        ),
      );
    } catch {
      // auto-handled
    }
  };

  const openDetail = async (skillId: string) => {
    try {
      const detail = await api<SkillDetail>(`/api/skills/${skillId}`);
      setSelectedSkill(detail);
    } catch {
      // auto-handled
    }
  };

  const doInstall = async () => {
    if (!selectedSkill || selectedAgentIds.length === 0) return;
    setInstalling(true);
    try {
      await api(`/api/skills/${selectedSkill.id}/install`, {
        method: "POST",
        body: JSON.stringify({ agentIds: selectedAgentIds }),
      });
      setShowInstallDialog(false);
      setSelectedAgentIds([]);
      // Refresh list to update installedAgentIds
      fetchSkills(1);
    } catch {
      // auto-handled
    } finally {
      setInstalling(false);
    }
  };

  // Skill detail view
  if (selectedSkill) {
    return (
      <div className="p-6">
        <button
          type="button"
          onClick={() => setSelectedSkill(null)}
          className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← {t("skills.backToList")}
        </button>

        <div className="max-w-2xl">
          <div className="flex items-start gap-4">
            {selectedSkill.iconUrl ? (
              <img src={selectedSkill.iconUrl} alt="" className="h-14 w-14 rounded-xl object-cover" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand/15 text-xl font-bold text-brand-text">
                {selectedSkill.name[0]}
              </div>
            )}
            <div className="flex-1">
              <h2 className="text-xl font-bold">{selectedSkill.name}</h2>
              <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="rounded-full bg-secondary px-2 py-0.5">{selectedSkill.category}</span>
                <span>v{selectedSkill.version}</span>
                <span className="flex items-center gap-1">
                  <Download className="h-3 w-3" /> {selectedSkill.installCount}
                </span>
                {selectedSkill.isOfficial && (
                  <span className="rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-medium text-brand-text">
                    {t("skills.official")}
                  </span>
                )}
              </div>
            </div>
          </div>

          <p className="mt-4 text-sm text-foreground/80 whitespace-pre-wrap">{selectedSkill.description}</p>

          {selectedSkill.slashCommand && (
            <div className="mt-4 rounded-lg border border-border bg-secondary/50 p-3">
              <div className="text-xs font-medium text-muted-foreground mb-1">{t("skills.slashCommand")}</div>
              <code className="text-sm font-mono text-brand-text">/{selectedSkill.slashCommand}</code>
            </div>
          )}

          {selectedSkill.sourceUrl && (
            <a
              href={selectedSkill.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-brand-text hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t("skills.sourceCode")}
            </a>
          )}

          {/* Install button */}
          <div className="mt-6">
            {showInstallDialog ? (
              <div className="rounded-lg border border-border p-4">
                <h4 className="text-sm font-semibold mb-2">{t("skills.selectAgents")}</h4>
                {agents.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("skills.noAgents")}</p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {agents.map((agent) => (
                      <label key={agent.id} className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5 hover:bg-muted/50">
                        <input
                          type="checkbox"
                          checked={selectedAgentIds.includes(agent.id)}
                          onChange={() =>
                            setSelectedAgentIds((prev) =>
                              prev.includes(agent.id)
                                ? prev.filter((id) => id !== agent.id)
                                : [...prev, agent.id],
                            )
                          }
                          className="rounded"
                        />
                        <span className="text-sm">{agent.name}</span>
                      </label>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={doInstall}
                    disabled={selectedAgentIds.length === 0 || installing}
                    className="brand-gradient-btn"
                  >
                    {installing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                    {t("skills.confirmInstall")} ({selectedAgentIds.length})
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowInstallDialog(false); setSelectedAgentIds([]); }}>
                    {t("common.cancel")}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                className="brand-gradient-btn gap-1.5"
                onClick={() => setShowInstallDialog(true)}
              >
                <Download className="h-4 w-4" />
                {t("skills.install")}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          placeholder={t("skills.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full max-w-md rounded-lg border-none bg-secondary pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Category pills */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setCategory("")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              !category
                ? "bg-brand text-white"
                : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {t("skills.allCategories")}
          </button>
          {categories.map((cat) => (
            <button
              key={cat.category}
              onClick={() => setCategory(cat.category)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                category === cat.category
                  ? "bg-brand text-white"
                  : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {cat.category} ({cat.count})
            </button>
          ))}
        </div>
      )}

      {/* Sort */}
      <div className="flex items-center gap-2 mb-4">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="h-8 rounded-lg border-none bg-secondary px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="popular">{t("skills.sort.popular")}</option>
          <option value="newest">{t("skills.sort.newest")}</option>
          <option value="name">{t("skills.sort.name")}</option>
        </select>
      </div>

      {/* Skills grid */}
      {loading && skills.length === 0 ? (
        <div className="flex h-40 items-center justify-center">
          <ArinovaSpinner size="sm" />
        </div>
      ) : skills.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Sparkles className="h-10 w-10 opacity-40 mb-2" />
          <p className="text-sm">{t("skills.empty")}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {skills.map((skill) => (
              <div
                key={skill.id}
                className="group relative flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-brand-border cursor-pointer"
                onClick={() => openDetail(skill.id)}
              >
                {/* Favorite button */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(skill); }}
                  className={cn(
                    "absolute top-3 right-3 rounded-full p-1 transition-colors",
                    skill.isFavorited
                      ? "text-yellow-500"
                      : "text-muted-foreground opacity-0 group-hover:opacity-100",
                  )}
                >
                  <Star className={cn("h-4 w-4", skill.isFavorited && "fill-yellow-500")} />
                </button>

                <div className="flex items-start gap-3">
                  {skill.iconUrl ? (
                    <img src={skill.iconUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/15 text-sm font-bold text-brand-text">
                      {skill.name[0]}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold">{skill.name}</h3>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{skill.description}</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="rounded-full bg-secondary px-2 py-0.5">{skill.category}</span>
                  <span className="flex items-center gap-0.5">
                    <Download className="h-3 w-3" /> {skill.installCount}
                  </span>
                  {skill.slashCommand && (
                    <span className="flex items-center gap-0.5 font-mono">
                      <Terminal className="h-3 w-3" /> /{skill.slashCommand}
                    </span>
                  )}
                  {skill.isOfficial && (
                    <span className="rounded bg-brand/15 px-1.5 py-0.5 font-medium text-brand-text">
                      {t("skills.official")}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {skills.length < total && (
            <div className="mt-8 flex justify-center">
              <Button variant="secondary" size="sm" onClick={() => setPage((p) => p + 1)}>
                {t("common.loadMore")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ===== Installed Tab =====

function InstalledTab({ agents }: { agents: { id: string; name: string }[] }) {
  const { t } = useTranslation();
  const [skillsByAgent, setSkillsByAgent] = useState<Record<string, InstalledSkill[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const result: Record<string, InstalledSkill[]> = {};
      for (const agent of agents) {
        try {
          const data = await api<{ skills: InstalledSkill[] }>(
            `/api/skills/installed?agentId=${agent.id}`,
          );
          if (data.skills.length > 0) {
            result[agent.id] = data.skills;
          }
        } catch {
          // skip
        }
      }
      setSkillsByAgent(result);
      setLoading(false);
    };
    if (agents.length > 0) load();
    else setLoading(false);
  }, [agents]);

  const toggleEnabled = async (agentId: string, skillId: string, currentEnabled: boolean) => {
    try {
      await api(`/api/agents/${agentId}/skills/${skillId}`, {
        method: "PATCH",
        body: JSON.stringify({ isEnabled: !currentEnabled }),
      });
      setSkillsByAgent((prev) => ({
        ...prev,
        [agentId]: prev[agentId].map((s) =>
          s.id === skillId ? { ...s, isEnabled: !currentEnabled } : s,
        ),
      }));
    } catch {
      // auto-handled
    }
  };

  const uninstall = async (agentId: string, skillId: string) => {
    try {
      await api(`/api/skills/${skillId}/uninstall?agentId=${agentId}`, { method: "DELETE" });
      setSkillsByAgent((prev) => ({
        ...prev,
        [agentId]: prev[agentId].filter((s) => s.id !== skillId),
      }));
    } catch {
      // auto-handled
    }
  };

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <ArinovaSpinner size="sm" />
      </div>
    );
  }

  const hasAny = Object.values(skillsByAgent).some((s) => s.length > 0);

  if (!hasAny) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Sparkles className="h-10 w-10 opacity-40 mb-2" />
        <p className="text-sm">{t("skills.noInstalled")}</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {agents.map((agent) => {
        const agentSkills = skillsByAgent[agent.id];
        if (!agentSkills || agentSkills.length === 0) return null;
        return (
          <div key={agent.id}>
            <h3 className="text-sm font-semibold mb-2">{agent.name}</h3>
            <div className="space-y-2">
              {agentSkills.map((skill) => (
                <div
                  key={skill.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
                >
                  {skill.iconUrl ? (
                    <img src={skill.iconUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/15 text-xs font-bold text-brand-text">
                      {skill.name[0]}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{skill.name}</div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      {skill.slashCommand && (
                        <span className="font-mono">/{skill.slashCommand}</span>
                      )}
                      <span className="rounded-full bg-secondary px-1.5 py-0.5">{skill.category}</span>
                    </div>
                  </div>

                  {/* Toggle enabled */}
                  <button
                    type="button"
                    onClick={() => toggleEnabled(agent.id, skill.id, skill.isEnabled)}
                    className={cn(
                      "transition-colors",
                      skill.isEnabled ? "text-brand-text" : "text-muted-foreground",
                    )}
                    title={skill.isEnabled ? t("skills.disable") : t("skills.enable")}
                  >
                    {skill.isEnabled ? (
                      <ToggleRight className="h-5 w-5" />
                    ) : (
                      <ToggleLeft className="h-5 w-5" />
                    )}
                  </button>

                  {/* Uninstall */}
                  <button
                    type="button"
                    onClick={() => uninstall(agent.id, skill.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    title={t("skills.uninstall")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ===== Favorites Tab =====

function FavoritesTab({ agents }: { agents: { id: string; name: string }[] }) {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSkill, setSelectedSkill] = useState<SkillDetail | null>(null);
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [installing, setInstalling] = useState(false);

  const fetchFavorites = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ skills: Skill[] }>("/api/skills/favorites");
      setSkills(data.skills);
    } catch {
      // auto-handled
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  const removeFavorite = async (skillId: string) => {
    try {
      await api(`/api/skills/${skillId}/favorite`, { method: "DELETE" });
      setSkills((prev) => prev.filter((s) => s.id !== skillId));
    } catch {
      // auto-handled
    }
  };

  const openDetail = async (skillId: string) => {
    try {
      const detail = await api<SkillDetail>(`/api/skills/${skillId}`);
      setSelectedSkill(detail);
    } catch {
      // auto-handled
    }
  };

  const doInstall = async () => {
    if (!selectedSkill || selectedAgentIds.length === 0) return;
    setInstalling(true);
    try {
      await api(`/api/skills/${selectedSkill.id}/install`, {
        method: "POST",
        body: JSON.stringify({ agentIds: selectedAgentIds }),
      });
      setShowInstallDialog(false);
      setSelectedAgentIds([]);
      fetchFavorites();
    } catch {
      // auto-handled
    } finally {
      setInstalling(false);
    }
  };

  // Detail view
  if (selectedSkill) {
    return (
      <div className="p-6">
        <button
          type="button"
          onClick={() => setSelectedSkill(null)}
          className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← {t("skills.backToFavorites")}
        </button>

        <div className="max-w-2xl">
          <div className="flex items-start gap-4">
            {selectedSkill.iconUrl ? (
              <img src={selectedSkill.iconUrl} alt="" className="h-14 w-14 rounded-xl object-cover" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand/15 text-xl font-bold text-brand-text">
                {selectedSkill.name[0]}
              </div>
            )}
            <div className="flex-1">
              <h2 className="text-xl font-bold">{selectedSkill.name}</h2>
              <p className="mt-2 text-sm text-foreground/80 whitespace-pre-wrap">{selectedSkill.description}</p>
            </div>
          </div>

          {selectedSkill.slashCommand && (
            <div className="mt-4 rounded-lg border border-border bg-secondary/50 p-3">
              <code className="text-sm font-mono text-brand-text">/{selectedSkill.slashCommand}</code>
            </div>
          )}

          {selectedSkill.sourceUrl && (
            <a
              href={selectedSkill.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-brand-text hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t("skills.sourceCode")}
            </a>
          )}

          <div className="mt-6">
            {showInstallDialog ? (
              <div className="rounded-lg border border-border p-4">
                <h4 className="text-sm font-semibold mb-2">{t("skills.selectAgents")}</h4>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {agents.map((agent) => (
                    <label key={agent.id} className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5 hover:bg-muted/50">
                      <input
                        type="checkbox"
                        checked={selectedAgentIds.includes(agent.id)}
                        onChange={() =>
                          setSelectedAgentIds((prev) =>
                            prev.includes(agent.id)
                              ? prev.filter((id) => id !== agent.id)
                              : [...prev, agent.id],
                          )
                        }
                        className="rounded"
                      />
                      <span className="text-sm">{agent.name}</span>
                    </label>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={doInstall}
                    disabled={selectedAgentIds.length === 0 || installing}
                    className="brand-gradient-btn"
                  >
                    {installing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                    {t("skills.confirmInstall")} ({selectedAgentIds.length})
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowInstallDialog(false); setSelectedAgentIds([]); }}>
                    {t("common.cancel")}
                  </Button>
                </div>
              </div>
            ) : (
              <Button className="brand-gradient-btn gap-1.5" onClick={() => setShowInstallDialog(true)}>
                <Download className="h-4 w-4" />
                {t("skills.install")}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <ArinovaSpinner size="sm" />
      </div>
    );
  }

  if (skills.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Heart className="h-10 w-10 opacity-40 mb-2" />
        <p className="text-sm">{t("skills.noFavorites")}</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {skills.map((skill) => (
          <div
            key={skill.id}
            className="group relative flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-brand-border cursor-pointer"
            onClick={() => openDetail(skill.id)}
          >
            {/* Remove favorite */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeFavorite(skill.id); }}
              className="absolute top-3 right-3 text-yellow-500 rounded-full p-1"
            >
              <Star className="h-4 w-4 fill-yellow-500" />
            </button>

            <div className="flex items-start gap-3">
              {skill.iconUrl ? (
                <img src={skill.iconUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/15 text-sm font-bold text-brand-text">
                  {skill.name[0]}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold">{skill.name}</h3>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{skill.description}</p>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="rounded-full bg-secondary px-2 py-0.5">{skill.category}</span>
              <span className="flex items-center gap-0.5">
                <Download className="h-3 w-3" /> {skill.installCount}
              </span>
              {skill.slashCommand && (
                <span className="font-mono">/{skill.slashCommand}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== Page Export =====

export default function SkillsPage() {
  return (
    <AuthGuard>
      <SkillsContent />
    </AuthGuard>
  );
}
