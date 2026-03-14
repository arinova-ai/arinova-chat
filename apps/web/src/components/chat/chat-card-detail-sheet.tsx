"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useChatStore } from "@/store/chat-store";
import {
  CardDetailSheet,
  type KanbanCardData,
  type CardCommitData,
} from "@/components/kanban/card-detail-sheet";

interface CardDetailResponse {
  card: KanbanCardData;
  cardNotes: Array<{ cardId: string; noteId: string; noteTitle: string }>;
  cardCommits: CardCommitData[];
  cardLabels: Array<{ cardId: string; labelId: string; labelName: string; labelColor: string }>;
  cardAgents: Array<{ cardId: string; agentId: string }>;
}

export function ChatCardDetailSheet() {
  const chatCardDetailId = useChatStore((s) => s.chatCardDetailId);
  const [card, setCard] = useState<KanbanCardData | null>(null);
  const [cardNotes, setCardNotes] = useState<Array<{ noteId: string; noteTitle: string }>>([]);
  const [cardCommits, setCardCommits] = useState<CardCommitData[]>([]);
  const [cardLabels, setCardLabels] = useState<Array<{ labelId: string; labelName: string; labelColor: string }>>([]);
  const [cardAgents, setCardAgents] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCard = useCallback(async (cardId: string) => {
    setLoading(true);
    try {
      const data = await api<CardDetailResponse>(
        `/api/kanban/cards/${cardId}`,
        { silent: true },
      );
      setCard(data.card);
      setCardNotes(data.cardNotes.map((n) => ({ noteId: n.noteId, noteTitle: n.noteTitle })));
      setCardCommits(data.cardCommits);
      setCardLabels(data.cardLabels.map((l) => ({ labelId: l.labelId, labelName: l.labelName, labelColor: l.labelColor })));
      setCardAgents(data.cardAgents.map((a) => a.agentId));
    } catch {
      // If fetch fails, close the sheet
      useChatStore.setState({ chatCardDetailId: null });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (chatCardDetailId) {
      fetchCard(chatCardDetailId);
    } else {
      setCard(null);
      setCardNotes([]);
      setCardCommits([]);
      setCardLabels([]);
      setCardAgents([]);
    }
  }, [chatCardDetailId, fetchCard]);

  const handleClose = () => {
    useChatStore.setState({ chatCardDetailId: null });
  };

  const handleUpdate = () => {
    if (chatCardDetailId) {
      fetchCard(chatCardDetailId);
    }
  };

  if (!chatCardDetailId) return null;

  if (loading && !card) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <CardDetailSheet
      card={card}
      onClose={handleClose}
      onUpdate={handleUpdate}
      cardAgents={cardAgents}
      cardNotes={cardNotes}
      cardCommits={cardCommits}
      cardLabels={cardLabels}
    />
  );
}
