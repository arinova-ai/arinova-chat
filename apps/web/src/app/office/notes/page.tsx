"use client";

import { NotebookList } from "@/components/chat/notebook-list";

export default function MyNotesPage() {
  return (
    <div className="h-full">
      <NotebookList conversationId="" inline open />
    </div>
  );
}
