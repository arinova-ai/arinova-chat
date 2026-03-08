"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ChevronDown, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useOfficeStream } from "@/hooks/use-office-stream";

interface ActivityItem {
  id: string;
  agentId: string;
  agentName: string | null;
  activityType: string;
  title: string;
  detail: string | null;
  createdAt: string;
}

interface ActivityResponse {
  items: ActivityItem[];
  nextCursor: string | null;
}

const TYPE_ICONS: Record<string, string> = {
  status_change: "\u{1F504}",
  tool_use: "\u{1F6E0}\u{FE0F}",
  task_complete: "\u2705",
  message: "\u{1F4AC}",
  error: "\u274C",
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function OfficeActivityPage() {
  const stream = useOfficeStream();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filterAgent, setFilterAgent] = useState<string>("");

  const agents = useMemo(
    () => stream.agents.filter((a) => a.id && !a.id.startsWith("empty-")),
    [stream.agents],
  );

  const fetchActivity = useCallback(
    async (cursorVal?: string | null) => {
      const isMore = !!cursorVal;
      if (isMore) setLoadingMore(true);
      else setLoading(true);

      try {
        let url = "/api/office/activity?limit=30";
        if (filterAgent) url += `&agentId=${encodeURIComponent(filterAgent)}`;
        if (cursorVal) url += `&cursor=${encodeURIComponent(cursorVal)}`;

        const data = await api<ActivityResponse>(url, { silent: true });
        if (isMore) {
          setItems((prev) => [...prev, ...data.items]);
        } else {
          setItems(data.items);
        }
        setCursor(data.nextCursor);
      } catch { /* ignore */ }

      setLoading(false);
      setLoadingMore(false);
    },
    [filterAgent],
  );

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  const handleLoadMore = () => {
    if (cursor && !loadingMore) fetchActivity(cursor);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Filter bar */}
      <div className="shrink-0 border-b border-border px-4 py-2.5 flex items-center gap-3">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <select
          value={filterAgent}
          onChange={(e) => setFilterAgent(e.target.value)}
          className="rounded-md border border-border bg-muted/50 px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
        >
          <option value="">All agents</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.emoji} {a.name}
            </option>
          ))}
        </select>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-4">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600/15">
              <Activity className="h-7 w-7 text-blue-400" />
            </div>
            <p className="text-sm text-muted-foreground">No activity yet</p>
          </div>
        ) : (
          <div className="space-y-1">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/30 transition-colors"
              >
                <span className="mt-0.5 text-base shrink-0">
                  {TYPE_ICONS[item.activityType] ?? "\u{1F4CB}"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {item.agentName ?? item.agentId}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60">
                      {relativeTime(item.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{item.title}</p>
                  {item.detail && (
                    <p className="mt-0.5 text-xs text-muted-foreground/60 line-clamp-2">
                      {item.detail}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {/* Load more */}
            {cursor && (
              <div className="flex justify-center pt-4 pb-2">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
                >
                  {loadingMore ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                  Load more
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
