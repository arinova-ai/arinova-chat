"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { AuthGuard } from "@/components/auth-guard";
import { IconRail } from "@/components/chat/icon-rail";
import { MobileBottomNav } from "@/components/chat/mobile-bottom-nav";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Loader2,
  Star,
  MessageSquare,
  Coins,
  Cpu,
  User,
  Sparkles,
  Send,
} from "lucide-react";

interface AgentDetail {
  id: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  category: string;
  tags: string[];
  welcomeMessage: string | null;
  exampleConversations: { question: string; answer: string }[];
  modelProvider: string;
  modelId: string;
  pricePerMessage: number;
  freeTrialMessages: number;
  totalConversations: number;
  totalMessages: number;
  avgRating: number | null;
  reviewCount: number;
  creatorName: string;
  creatorImage: string | null;
}

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  userName: string;
  userImage: string | null;
}

function AgentDetailContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Reviews
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewTotal, setReviewTotal] = useState(0);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  const fetchReviews = useCallback(async () => {
    try {
      const data = await api<{ reviews: Review[]; total: number }>(
        `/api/marketplace/agents/${id}/reviews?limit=20`,
        { silent: true },
      );
      setReviews(data.reviews);
      setReviewTotal(data.total);
    } catch {
      // silent
    }
  }, [id]);

  useEffect(() => {
    (async () => {
      try {
        const data = await api<AgentDetail>(`/api/marketplace/agents/${id}`);
        setAgent(data);
      } catch {
        // auto-handled
      } finally {
        setLoading(false);
      }
    })();
    fetchReviews();
  }, [id, fetchReviews]);

  const submitReview = async () => {
    if (reviewRating === 0) return;
    setSubmittingReview(true);
    try {
      await api(`/api/marketplace/agents/${id}/reviews`, {
        method: "POST",
        body: JSON.stringify({
          rating: reviewRating,
          ...(reviewComment.trim() ? { comment: reviewComment.trim() } : {}),
        }),
      });
      setReviewRating(0);
      setReviewComment("");
      fetchReviews();
      // Refresh agent to get updated avgRating/reviewCount
      const updated = await api<AgentDetail>(`/api/marketplace/agents/${id}`);
      setAgent(updated);
    } catch {
      // auto-handled
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleStartChat = async () => {
    router.push(`/marketplace/chat/${id}`);
  };

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold text-muted-foreground">
            Agent not found
          </p>
          <Button variant="secondary" onClick={() => router.push("/marketplace")}>
            Back to Marketplace
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh bg-background">
      <div className="hidden h-full md:block">
        <IconRail />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="shrink-0 border-b border-border px-6 py-4">
          <button
            onClick={() => router.push("/marketplace")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Marketplace
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto pb-24 md:pb-6">
          <div className="mx-auto max-w-4xl p-6">
            <div className="flex flex-col gap-6 md:flex-row">
              {/* Left column: Info */}
              <div className="flex-1 min-w-0 space-y-6">
                {/* Agent header */}
                <div className="flex items-start gap-4">
                  {agent.avatarUrl ? (
                    <img
                      src={agent.avatarUrl}
                      alt={agent.name}
                      className="h-16 w-16 shrink-0 rounded-2xl object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand/15 text-2xl font-bold text-brand-text">
                      {agent.name[0]}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h1 className="text-2xl font-bold">{agent.name}</h1>
                    <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                        {agent.category}
                      </span>
                      {agent.avgRating !== null && (
                        <span className="flex items-center gap-0.5">
                          <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
                          {agent.avgRating.toFixed(1)} ({agent.reviewCount})
                        </span>
                      )}
                      <span>{agent.totalConversations} chats</span>
                    </div>
                  </div>
                </div>

                {/* Creator */}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {agent.creatorImage ? (
                    <img
                      src={agent.creatorImage}
                      alt={agent.creatorName}
                      className="h-6 w-6 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary">
                      <User className="h-3.5 w-3.5" />
                    </div>
                  )}
                  <span>by {agent.creatorName}</span>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    About
                  </h2>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {agent.description}
                  </p>
                </div>

                {/* Tags */}
                {agent.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {agent.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Example conversations */}
                {agent.exampleConversations.length > 0 && (
                  <div className="space-y-3">
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      Example Conversations
                    </h2>
                    <div className="space-y-3">
                      {agent.exampleConversations.map((ex, i) => (
                        <div
                          key={i}
                          className="rounded-xl border border-border bg-card p-4 space-y-2"
                        >
                          <div className="flex items-start gap-2">
                            <User className="mt-0.5 h-4 w-4 shrink-0 text-brand-text" />
                            <p className="text-sm">{ex.question}</p>
                          </div>
                          <div className="flex items-start gap-2">
                            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
                            <p className="text-sm text-muted-foreground">
                              {ex.answer}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Reviews */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      Reviews ({reviewTotal})
                    </h2>
                    {agent.avgRating !== null && (
                      <div className="flex items-center gap-1.5 text-sm">
                        <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                        <span className="font-semibold">{agent.avgRating.toFixed(1)}</span>
                        <span className="text-muted-foreground">({agent.reviewCount})</span>
                      </div>
                    )}
                  </div>

                  {/* Submit review form */}
                  <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                    <p className="text-xs font-medium text-muted-foreground">Leave a review</p>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setReviewRating(star)}
                          className="transition-colors"
                        >
                          <Star
                            className={`h-6 w-6 ${
                              star <= reviewRating
                                ? "fill-yellow-500 text-yellow-500"
                                : "text-muted-foreground/30"
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      placeholder="Write a comment (optional)..."
                      rows={2}
                      maxLength={2000}
                      className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <Button
                      size="sm"
                      disabled={reviewRating === 0 || submittingReview}
                      onClick={submitReview}
                      className="gap-1"
                    >
                      {submittingReview ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      Submit Review
                    </Button>
                  </div>

                  {/* Review list */}
                  {reviews.length === 0 ? (
                    <div className="rounded-xl border border-border bg-card p-6 text-center">
                      <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground/40" />
                      <p className="mt-2 text-sm text-muted-foreground">
                        No reviews yet. Be the first!
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {reviews.map((review) => (
                        <div
                          key={review.id}
                          className="rounded-xl border border-border bg-card p-4 space-y-2"
                        >
                          <div className="flex items-center gap-2">
                            {review.userImage ? (
                              <img
                                src={review.userImage}
                                alt={review.userName}
                                className="h-6 w-6 rounded-full object-cover"
                              />
                            ) : (
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary">
                                <User className="h-3.5 w-3.5" />
                              </div>
                            )}
                            <span className="text-sm font-medium">{review.userName}</span>
                            <div className="flex gap-0.5">
                              {[1, 2, 3, 4, 5].map((s) => (
                                <Star
                                  key={s}
                                  className={`h-3 w-3 ${
                                    s <= review.rating
                                      ? "fill-yellow-500 text-yellow-500"
                                      : "text-muted-foreground/20"
                                  }`}
                                />
                              ))}
                            </div>
                            <span className="ml-auto text-[10px] text-muted-foreground">
                              {new Date(review.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          {review.comment && (
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                              {review.comment}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right column: Pricing card */}
              <div className="w-full md:w-72 shrink-0">
                <div className="sticky top-6 rounded-xl border border-border bg-card p-5 space-y-4">
                  {/* Price */}
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Coins className="h-5 w-5 text-yellow-500" />
                      <span className="text-2xl font-bold">
                        {agent.pricePerMessage === 0
                          ? "Free"
                          : agent.pricePerMessage}
                      </span>
                      {agent.pricePerMessage > 0 && (
                        <span className="text-sm text-muted-foreground">
                          credits/message
                        </span>
                      )}
                    </div>
                    {agent.freeTrialMessages > 0 && (
                      <p className="mt-1 text-xs text-green-400">
                        {agent.freeTrialMessages} free trial messages
                      </p>
                    )}
                  </div>

                  {/* Model info */}
                  <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
                    <Cpu className="h-3.5 w-3.5" />
                    <span>
                      {agent.modelProvider} / {agent.modelId}
                    </span>
                  </div>

                  {/* Start Chat button */}
                  <Button
                    className="brand-gradient-btn w-full gap-2"
                    onClick={handleStartChat}
                  >
                    <MessageSquare className="h-4 w-4" />
                    Start Chat
                  </Button>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-2 text-center text-xs text-muted-foreground">
                    <div className="rounded-lg bg-secondary p-2">
                      <p className="text-base font-semibold text-foreground">
                        {agent.totalConversations}
                      </p>
                      <p>Chats</p>
                    </div>
                    <div className="rounded-lg bg-secondary p-2">
                      <p className="text-base font-semibold text-foreground">
                        {agent.totalMessages}
                      </p>
                      <p>Messages</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <MobileBottomNav />
      </div>
    </div>
  );
}

export default function AgentDetailPage() {
  return (
    <AuthGuard>
      <AgentDetailContent />
    </AuthGuard>
  );
}
