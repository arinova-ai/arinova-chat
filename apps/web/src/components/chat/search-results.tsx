"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Bot, Loader2, SearchX } from "lucide-react";
import { useChatStore } from "@/store/chat-store";
import { assetUrl } from "@/lib/config";

/** Highlight keyword matches in text, returning React elements */
function HighlightedSnippet({
  text,
  query,
  maxLen = 160,
}: {
  text: string;
  query: string;
  maxLen?: number;
}) {
  // Find first match position to center the snippet
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matchIdx = lowerText.indexOf(lowerQuery);

  let snippet: string;
  if (matchIdx === -1) {
    snippet = text.slice(0, maxLen);
  } else {
    const start = Math.max(0, matchIdx - 40);
    const end = Math.min(text.length, start + maxLen);
    snippet = (start > 0 ? "..." : "") + text.slice(start, end) + (end < text.length ? "..." : "");
  }

  // Split by query and interleave highlights
  const parts: React.ReactNode[] = [];
  const lowerSnippet = snippet.toLowerCase();
  let lastIdx = 0;
  let searchFrom = 0;

  while (searchFrom < lowerSnippet.length) {
    const idx = lowerSnippet.indexOf(lowerQuery, searchFrom);
    if (idx === -1) break;
    if (idx > lastIdx) {
      parts.push(snippet.slice(lastIdx, idx));
    }
    parts.push(
      <mark key={idx} className="bg-yellow-500/30 text-foreground rounded-sm px-0.5">
        {snippet.slice(idx, idx + query.length)}
      </mark>
    );
    lastIdx = idx + query.length;
    searchFrom = lastIdx;
  }
  if (lastIdx < snippet.length) {
    parts.push(snippet.slice(lastIdx));
  }

  return <span className="text-sm text-muted-foreground leading-relaxed">{parts}</span>;
}

export function SearchResults() {
  const searchResults = useChatStore((s) => s.searchResults);
  const searchTotal = useChatStore((s) => s.searchTotal);
  const searchLoading = useChatStore((s) => s.searchLoading);
  const searchQuery = useChatStore((s) => s.searchQuery);
  const clearSearch = useChatStore((s) => s.clearSearch);
  const jumpToMessage = useChatStore((s) => s.jumpToMessage);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex min-h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <Button variant="ghost" size="icon" onClick={clearSearch}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold truncate">
            Search: &quot;{searchQuery}&quot;
          </h2>
          {!searchLoading && (
            <p className="text-xs text-muted-foreground">
              {searchTotal} result{searchTotal !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {searchLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : searchResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
            <SearchX className="h-10 w-10" />
            <p className="text-sm">No messages found</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {searchResults.map((result) => (
              <button
                key={result.messageId}
                type="button"
                className="flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/50 border-b border-border/50"
                onClick={() => jumpToMessage(result.conversationId, result.messageId)}
              >
                {/* Avatar */}
                <Avatar className="mt-0.5 h-9 w-9 shrink-0">
                  {result.agentAvatarUrl ? (
                    <img
                      src={assetUrl(result.agentAvatarUrl)}
                      alt={result.agentName ?? ""}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <AvatarFallback className="bg-accent text-foreground/80 text-xs">
                      <Bot className="h-4 w-4" />
                    </AvatarFallback>
                  )}
                </Avatar>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium truncate">
                      {result.role === "user" ? "You" : (result.agentName ?? "Agent")}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {result.conversationTitle ?? "Untitled"}
                    </span>
                  </div>
                  <div className="mt-0.5">
                    <HighlightedSnippet text={result.content} query={searchQuery} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground/60">
                    {new Date(result.createdAt).toLocaleString()}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
