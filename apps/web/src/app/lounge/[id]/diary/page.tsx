"use client";

import { use, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Star,
  Pencil,
  Trash2,
  Save,
  X,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { useAccountStore, type DiaryEntry } from "@/store/account-store";
import { cn } from "@/lib/utils";

interface DiaryFormData {
  date: string;
  content: string;
  imageUrl: string;
  isImportant: boolean;
}

const emptyForm = (): DiaryFormData => ({
  date: new Date().toISOString().slice(0, 10),
  content: "",
  imageUrl: "",
  isImportant: false,
});

export default function DiaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: accountId } = use(params);
  const { t } = useTranslation();
  const router = useRouter();
  const { loadDiaries, createDiary, updateDiary, deleteDiary } =
    useAccountStore();

  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Create mode
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<DiaryFormData>(emptyForm);

  // Edit mode
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<DiaryFormData>(emptyForm);

  // Expand content
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const fetchEntries = useCallback(async () => {
    try {
      const data = await loadDiaries(accountId);
      setEntries(
        [...data].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        )
      );
    } catch {
      // handled by api helper
    } finally {
      setLoading(false);
    }
  }, [accountId, loadDiaries]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleCreate = async () => {
    if (!createForm.content.trim()) return;
    setSaving(true);
    try {
      await createDiary(accountId, {
        content: createForm.content,
        date: createForm.date || undefined,
        imageUrl: createForm.imageUrl || undefined,
        isImportant: createForm.isImportant,
      });
      setShowCreate(false);
      setCreateForm(emptyForm());
      await fetchEntries();
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (diaryId: string) => {
    if (!editForm.content.trim()) return;
    setSaving(true);
    try {
      await updateDiary(accountId, diaryId, {
        content: editForm.content,
        imageUrl: editForm.imageUrl || null,
        isImportant: editForm.isImportant,
      });
      setEditingId(null);
      await fetchEntries();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (diaryId: string) => {
    if (!confirm(t("lounge.diary.deleteConfirm"))) return;
    try {
      await deleteDiary(accountId, diaryId);
      await fetchEntries();
    } catch {
      // handled by api helper
    }
  };

  const startEdit = (entry: DiaryEntry) => {
    setEditingId(entry.id);
    setEditForm({
      date: entry.date.slice(0, 10),
      content: entry.content,
      imageUrl: entry.imageUrl ?? "",
      isImportant: entry.isImportant,
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
    });
  };

  const renderForm = (
    form: DiaryFormData,
    setForm: (f: DiaryFormData) => void,
    onSave: () => void,
    onCancel: () => void
  ) => (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      {/* Date picker */}
      <div className="space-y-1">
        <label className="text-sm font-medium">{t("lounge.diary.date")}</label>
        <input
          type="date"
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
          className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      {/* Content */}
      <div className="space-y-1">
        <label className="text-sm font-medium">
          {t("lounge.diary.content")}
        </label>
        <textarea
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
          placeholder={t("lounge.diary.contentPlaceholder")}
          rows={4}
          className="block w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      {/* Image URL */}
      <div className="space-y-1">
        <label className="text-sm font-medium">
          {t("lounge.diary.imageUrl")}
        </label>
        <input
          type="url"
          value={form.imageUrl}
          onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
          placeholder="https://..."
          className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      {/* Important toggle + actions */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setForm({ ...form, isImportant: !form.isImportant })}
          className="flex items-center gap-1.5 text-sm"
        >
          <Star
            className={cn(
              "h-4 w-4",
              form.isImportant
                ? "fill-yellow-400 text-yellow-400"
                : "text-muted-foreground"
            )}
          />
          <span
            className={cn(
              form.isImportant ? "text-yellow-600" : "text-muted-foreground"
            )}
          >
            {t("lounge.diary.important")}
          </span>
        </button>

        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
            <X className="mr-1 h-3.5 w-3.5" />
            {t("lounge.diary.cancel")}
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving}>
            <Save className="mr-1 h-3.5 w-3.5" />
            {t("lounge.diary.save")}
          </Button>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(`/lounge/${accountId}`)}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold truncate">
            {t("lounge.diary.title")}
          </h1>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setShowCreate(true);
            setCreateForm(emptyForm());
            setEditingId(null);
          }}
        >
          <Plus className="mr-1 h-4 w-4" />
          {t("lounge.diary.newEntry")}
        </Button>
      </div>

      <div className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-6">
        {/* Create form */}
        {showCreate &&
          renderForm(
            createForm,
            setCreateForm,
            handleCreate,
            () => setShowCreate(false)
          )}

        {/* Entries list */}
        {entries.length === 0 && !showCreate && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <p className="text-sm">{t("lounge.diary.noEntries")}</p>
          </div>
        )}

        {entries.map((entry) => {
          const isEditing = editingId === entry.id;
          const isExpanded = expandedIds.has(entry.id);

          if (isEditing) {
            return (
              <div key={entry.id}>
                {renderForm(
                  editForm,
                  setEditForm,
                  () => handleUpdate(entry.id),
                  () => setEditingId(null)
                )}
              </div>
            );
          }

          return (
            <div
              key={entry.id}
              className="group relative rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/30"
            >
              {/* Date header + star */}
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">
                  {formatDate(entry.date)}
                </span>
                {entry.isImportant && (
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                )}
              </div>

              {/* Content */}
              <div
                className={cn(
                  "text-sm text-muted-foreground whitespace-pre-wrap",
                  !isExpanded && "line-clamp-3"
                )}
              >
                {entry.content}
              </div>
              {entry.content.split("\n").length > 3 ||
              entry.content.length > 200 ? (
                <button
                  type="button"
                  onClick={() => toggleExpand(entry.id)}
                  className="mt-1 text-xs text-primary hover:underline"
                >
                  {isExpanded ? "Show less" : "Show more"}
                </button>
              ) : null}

              {/* Image thumbnail */}
              {entry.imageUrl && (
                <div className="mt-3">
                  <img
                    src={entry.imageUrl}
                    alt=""
                    className="h-24 w-24 rounded-md object-cover"
                  />
                </div>
              )}

              {/* Edit / Delete buttons */}
              <div className="mt-3 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => startEdit(entry)}
                >
                  <Pencil className="mr-1 h-3.5 w-3.5" />
                  {t("lounge.diary.edit")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => handleDelete(entry.id)}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  {t("lounge.diary.delete")}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
