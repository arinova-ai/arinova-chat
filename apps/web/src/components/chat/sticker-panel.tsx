"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Clock, Heart, Sparkles, X } from "lucide-react";
import { api } from "@/lib/api";
import { useChatStore } from "@/store/chat-store";
import { useTranslation } from "@/lib/i18n";

// ---------- Types ----------

interface StickerItem {
  id: string;
  filename: string;
  emoji: string;
  agentPrompt?: string | null;
}

interface StickerPack {
  packId: string;
  dir: string;
  name: string;
  agentCompatible: boolean;
  stickers: StickerItem[];
}

interface RecentSticker {
  packDir: string;
  filename: string;
  stickerId: string;
  packId: string;
  emoji: string;
  agentPrompt?: string | null;
  timestamp: number;
}

interface FavoriteSticker {
  id: string;
  packId: string;
  filename: string;
  emoji: string;
  agentPrompt?: string | null;
}

interface StickerPanelProps {
  open: boolean;
  onClose: () => void;
}

// ---------- localStorage helpers ----------

const RECENTS_KEY = "arinova_recent_stickers";
const MAX_RECENTS = 30;

function getRecents(): RecentSticker[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentSticker[];
  } catch {
    return [];
  }
}

function addRecent(sticker: Omit<RecentSticker, "timestamp">): void {
  const recents = getRecents().filter((r) => r.stickerId !== sticker.stickerId);
  recents.unshift({ ...sticker, timestamp: Date.now() });
  if (recents.length > MAX_RECENTS) recents.length = MAX_RECENTS;
  localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
}

// ---------- Tab types ----------

type TabId = "recents" | "favorites" | string; // string = packId

// ---------- Component ----------

export function StickerPanel({ open, onClose }: StickerPanelProps) {
  const { t } = useTranslation();
  const sendMessage = useChatStore((s) => s.sendMessage);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const conversations = useChatStore((s) => s.conversations);

  const [stickerPacks, setStickerPacks] = useState<StickerPack[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>("recents");
  const [recents, setRecents] = useState<RecentSticker[]>([]);
  const [favorites, setFavorites] = useState<FavoriteSticker[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [aiFilterOn, setAiFilterOn] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    stickerId: string;
    x: number;
    y: number;
    isFav: boolean;
  } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Determine if current conversation is an agent conversation
  const isAgentConversation = useMemo(() => {
    if (!activeConversationId) return false;
    const conv = conversations.find((c) => c.id === activeConversationId);
    return conv?.agentId != null;
  }, [activeConversationId, conversations]);

  // Fetch sticker packs
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api<{
      packs: Array<{
        id: string;
        name: string;
        coverImage?: string | null;
        agentCompatible?: boolean;
        stickers?: Array<{
          id: string;
          filename: string;
          emoji: string | null;
          agentPrompt?: string | null;
        }>;
      }>;
    }>("/api/user/stickers", { silent: true })
      .then((data) => {
        if (cancelled) return;
        const mapped: StickerPack[] = data.packs.map((p) => {
          const cover = p.coverImage ?? "";
          const parts = cover.split("/");
          const dir = parts.length >= 3 ? parts[parts.length - 2] : p.id;
          return {
            packId: p.id,
            dir,
            name: p.name,
            agentCompatible: p.agentCompatible ?? false,
            stickers: (p.stickers ?? []).map((s) => ({
              id: s.id,
              filename: s.filename,
              emoji: s.emoji ?? "",
              agentPrompt: s.agentPrompt ?? null,
            })),
          };
        });
        setStickerPacks(mapped);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Load recents from localStorage
  useEffect(() => {
    if (!open) return;
    setRecents(getRecents());
  }, [open]);

  // Fetch favorites from API
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api<{
      favorites: Array<{
        id: string;
        packId: string;
        filename: string;
        emoji: string | null;
        agentPrompt?: string | null;
      }>;
    }>("/api/user/stickers/favorites", { silent: true })
      .then((data) => {
        if (cancelled) return;
        const favs: FavoriteSticker[] = data.favorites.map((f) => ({
          id: f.id,
          packId: f.packId,
          filename: f.filename,
          emoji: f.emoji ?? "",
          agentPrompt: f.agentPrompt ?? null,
        }));
        setFavorites(favs);
        setFavoriteIds(new Set(favs.map((f) => f.id)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Build a map from packId to pack for quick lookup
  const packMap = useMemo(() => {
    const m = new Map<string, StickerPack>();
    for (const p of stickerPacks) m.set(p.packId, p);
    return m;
  }, [stickerPacks]);

  // Build a map from stickerId to its pack's agentCompatible flag
  const stickerAgentMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const p of stickerPacks) {
      for (const s of p.stickers) {
        m.set(s.id, p.agentCompatible);
      }
    }
    return m;
  }, [stickerPacks]);

  // Get directory for a sticker by looking up its pack
  const getDirForSticker = useCallback(
    (packId: string): string => {
      return packMap.get(packId)?.dir ?? packId;
    },
    [packMap]
  );

  // Send sticker immediately on click
  const handleStickerClick = useCallback(
    (sticker: { id: string; filename: string; emoji: string; agentPrompt?: string | null }, packId: string, packDir: string) => {
      if (!activeConversationId) return;
      sendMessage(`![sticker](/stickers/${packDir}/${sticker.filename})`);

      // Add to recents
      addRecent({
        packDir,
        filename: sticker.filename,
        stickerId: sticker.id,
        packId,
        emoji: sticker.emoji,
        agentPrompt: sticker.agentPrompt,
      });
      setRecents(getRecents());

      onClose();
    },
    [activeConversationId, sendMessage, onClose]
  );

  // Long press / right-click for favorites
  const handleContextAction = useCallback(
    (stickerId: string, x: number, y: number) => {
      const isFav = favoriteIds.has(stickerId);
      setContextMenu({ stickerId, x, y, isFav });
    },
    [favoriteIds]
  );

  const handleToggleFavorite = useCallback(
    async (stickerId: string) => {
      const isFav = favoriteIds.has(stickerId);
      setContextMenu(null);
      try {
        if (isFav) {
          await api(`/api/user/stickers/favorites/${stickerId}`, {
            method: "DELETE",
            silent: true,
          });
          setFavoriteIds((prev) => {
            const next = new Set(prev);
            next.delete(stickerId);
            return next;
          });
          setFavorites((prev) => prev.filter((f) => f.id !== stickerId));
        } else {
          await api("/api/user/stickers/favorites", {
            method: "POST",
            body: JSON.stringify({ stickerId }),
            headers: { "Content-Type": "application/json" },
            silent: true,
          });
          setFavoriteIds((prev) => new Set(prev).add(stickerId));
          // Re-fetch favorites to get full data
          const data = await api<{
            favorites: Array<{
              id: string;
              packId: string;
              filename: string;
              emoji: string | null;
              agentPrompt?: string | null;
            }>;
          }>("/api/user/stickers/favorites", { silent: true });
          setFavorites(
            data.favorites.map((f) => ({
              id: f.id,
              packId: f.packId,
              filename: f.filename,
              emoji: f.emoji ?? "",
              agentPrompt: f.agentPrompt ?? null,
            }))
          );
        }
      } catch {
        // silent
      }
    },
    [favoriteIds]
  );

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [contextMenu]);

  // Long press handlers
  const handlePointerDown = useCallback(
    (stickerId: string, e: React.PointerEvent) => {
      const x = e.clientX;
      const y = e.clientY;
      longPressTimerRef.current = setTimeout(() => {
        handleContextAction(stickerId, x, y);
      }, 500);
    },
    [handleContextAction]
  );

  const handlePointerUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // Filter stickers based on AI toggle
  const filterStickers = useCallback(
    <T extends { agentPrompt?: string | null }>(
      items: T[],
      getStickerAgentCompat?: (item: T) => boolean
    ): T[] => {
      if (!aiFilterOn) return items;
      if (getStickerAgentCompat) {
        return items.filter((item) => getStickerAgentCompat(item));
      }
      return items.filter((item) => item.agentPrompt != null && item.agentPrompt !== "");
    },
    [aiFilterOn]
  );

  // Get stickers to display based on active tab
  const displayStickers = useMemo(() => {
    if (activeTab === "recents") {
      let items = recents;
      if (aiFilterOn) {
        items = items.filter((r) => stickerAgentMap.get(r.stickerId) === true);
      }
      return items.map((r) => ({
        id: r.stickerId,
        filename: r.filename,
        emoji: r.emoji,
        agentPrompt: r.agentPrompt,
        packId: r.packId,
        packDir: r.packDir,
        isAgentCompat: stickerAgentMap.get(r.stickerId) ?? false,
      }));
    }

    if (activeTab === "favorites") {
      let items = favorites;
      if (aiFilterOn) {
        items = items.filter((f) => stickerAgentMap.get(f.id) === true);
      }
      return items.map((f) => ({
        id: f.id,
        filename: f.filename,
        emoji: f.emoji,
        agentPrompt: f.agentPrompt,
        packId: f.packId,
        packDir: getDirForSticker(f.packId),
        isAgentCompat: stickerAgentMap.get(f.id) ?? false,
      }));
    }

    // Pack tab
    const pack = stickerPacks.find((p) => p.packId === activeTab);
    if (!pack) return [];
    let stickers = pack.stickers;
    if (aiFilterOn && !pack.agentCompatible) return [];
    return stickers.map((s) => ({
      id: s.id,
      filename: s.filename,
      emoji: s.emoji,
      agentPrompt: s.agentPrompt,
      packId: pack.packId,
      packDir: pack.dir,
      isAgentCompat: pack.agentCompatible,
    }));
  }, [activeTab, recents, favorites, stickerPacks, aiFilterOn, stickerAgentMap, getDirForSticker]);

  // Filter packs for AI mode
  const visiblePacks = useMemo(() => {
    if (!aiFilterOn) return stickerPacks;
    return stickerPacks.filter((p) => p.agentCompatible);
  }, [stickerPacks, aiFilterOn]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="shrink-0 border-t border-border bg-background transition-all duration-300 ease-in-out"
      style={{ height: open ? "45vh" : "0", overflow: "hidden" }}
    >
      <div className="flex h-full flex-col">
        {/* Header with AI filter toggle */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t("chat.stickers")}
          </span>
          <div className="flex items-center gap-2">
            {/* AI filter toggle */}
            <button
              type="button"
              onClick={() => setAiFilterOn((prev) => !prev)}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
                aiFilterOn
                  ? "bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/40"
                  : "bg-secondary text-muted-foreground hover:bg-accent"
              }`}
              title="Filter Agent Compatible stickers"
            >
              <Sparkles className="h-3 w-3" />
              AI
            </button>
            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Sticker grid */}
        <div className="flex-1 overflow-y-auto p-2">
          {displayStickers.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted-foreground">
                {activeTab === "recents"
                  ? "No recent stickers"
                  : activeTab === "favorites"
                  ? "No favorite stickers"
                  : "No stickers"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-1">
              {displayStickers.map((s) => (
                <button
                  key={`${s.packId}-${s.id}`}
                  type="button"
                  onClick={() =>
                    handleStickerClick(
                      { id: s.id, filename: s.filename, emoji: s.emoji, agentPrompt: s.agentPrompt },
                      s.packId,
                      s.packDir
                    )
                  }
                  onContextMenu={(e) => {
                    e.preventDefault();
                    handleContextAction(s.id, e.clientX, e.clientY);
                  }}
                  onPointerDown={(e) => handlePointerDown(s.id, e)}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  className="relative rounded-lg p-1 transition-colors hover:bg-accent active:bg-accent/70"
                  title={s.emoji || undefined}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/stickers/${s.packDir}/${s.filename}`}
                    alt={s.emoji || s.id}
                    className="h-14 w-14 object-contain"
                    loading="lazy"
                  />
                  {/* AI badge */}
                  {s.isAgentCompat && (
                    <span className="absolute top-0 right-0 rounded-bl-md rounded-tr-lg bg-blue-500/80 px-1 py-px text-[9px] font-bold text-white leading-tight">
                      AI
                    </span>
                  )}
                  {/* Favorite indicator */}
                  {favoriteIds.has(s.id) && (
                    <Heart className="absolute bottom-0.5 left-0.5 h-3 w-3 fill-red-400 text-red-400" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Agent hint for AI stickers in agent conversations */}
        {isAgentConversation && aiFilterOn && (
          <div className="px-3 py-1 text-[10px] text-blue-400 bg-blue-500/5 border-t border-blue-500/10 text-center">
            These stickers will be understood by your agent
          </div>
        )}

        {/* Tab bar at bottom */}
        <div className="flex items-center gap-0.5 border-t border-border px-2 py-1.5 overflow-x-auto">
          {/* Recents tab */}
          <button
            type="button"
            onClick={() => setActiveTab("recents")}
            className={`shrink-0 rounded-md p-1.5 transition-colors ${
              activeTab === "recents"
                ? "bg-accent ring-2 ring-brand"
                : "hover:bg-accent/50"
            }`}
            title="Recents"
          >
            <Clock className="h-6 w-6 text-muted-foreground" />
          </button>

          {/* Favorites tab */}
          <button
            type="button"
            onClick={() => setActiveTab("favorites")}
            className={`shrink-0 rounded-md p-1.5 transition-colors ${
              activeTab === "favorites"
                ? "bg-accent ring-2 ring-brand"
                : "hover:bg-accent/50"
            }`}
            title="Favorites"
          >
            <Heart className="h-6 w-6 text-muted-foreground" />
          </button>

          {/* Separator */}
          <div className="mx-1 h-6 w-px bg-border shrink-0" />

          {/* Pack tabs */}
          {visiblePacks.map((pack) => (
            <button
              key={pack.packId}
              type="button"
              onClick={() => setActiveTab(pack.packId)}
              className={`shrink-0 rounded-md p-1 transition-colors ${
                activeTab === pack.packId
                  ? "bg-accent ring-2 ring-brand"
                  : "hover:bg-accent/50"
              }`}
              title={pack.name}
            >
              {pack.stickers[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/stickers/${pack.dir}/${pack.stickers[0].filename}`}
                  alt={pack.name}
                  className="h-7 w-7 object-contain"
                />
              ) : (
                <div className="h-7 w-7 rounded bg-secondary" />
              )}
              {/* AI badge on pack tab */}
              {pack.agentCompatible && (
                <span className="block text-[8px] font-bold text-blue-400 leading-none mt-0.5 text-center">
                  AI
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Context menu for favorites */}
      {contextMenu && (
        <div
          className="fixed z-[9999] rounded-lg border border-border bg-card shadow-lg py-1 min-w-[160px]"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 180),
            top: Math.max(contextMenu.y - 40, 10),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
            onClick={() => handleToggleFavorite(contextMenu.stickerId)}
          >
            <Heart
              className={`h-4 w-4 ${
                contextMenu.isFav ? "fill-red-400 text-red-400" : "text-muted-foreground"
              }`}
            />
            {contextMenu.isFav ? "Remove from Favorites" : "Add to Favorites"}
          </button>
        </div>
      )}
    </div>
  );
}
