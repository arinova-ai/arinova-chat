"use client";

import { NotebookList } from "@/components/chat/notebook-list";

export default function MyNotesPage() {
  return (
    <div className="h-full">
      <NotebookList inline open />
    </div>
  );
}
