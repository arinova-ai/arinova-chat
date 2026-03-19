"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Save, Eye } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface Template { id: string; name: string; subject: string; bodyHtml: string; updatedAt: string }

export default function AdminEmailTemplatesPage() {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);

  const fetch_ = useCallback(async () => {
    try { const res = await api<{ templates: Template[] }>("/api/admin/email-templates"); setTemplates(res.templates); } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try { await api("/api/admin/email-templates", { method: "POST", body: JSON.stringify({ name, subject, bodyHtml }) }); setEditing(null); setName(""); setSubject(""); setBodyHtml(""); fetch_(); } catch {} finally { setSaving(false); }
  };

  const startEdit = (t: Template) => {
    setEditing(t); setName(t.name); setSubject(t.subject); setBodyHtml(t.bodyHtml); setPreview(false);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold flex-1">{t("admin.emailTemplates.title")}</h2>
        {!editing && <Button size="sm" onClick={() => { setEditing({} as Template); setName(""); setSubject(""); setBodyHtml(""); }}><Plus className="h-3.5 w-3.5 mr-1" />{t("admin.emailTemplates.new")}</Button>}
      </div>
      {editing ? (
        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("admin.emailTemplates.namePlaceholder")} />
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t("admin.emailTemplates.subjectPlaceholder")} />
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium">{t("admin.emailTemplates.bodyHtml")}</span>
            <Button variant="ghost" size="sm" onClick={() => setPreview(!preview)}><Eye className="h-3.5 w-3.5 mr-1" />{preview ? t("admin.emailTemplates.edit") : t("admin.emailTemplates.preview")}</Button>
          </div>
          {preview ? (
            <div className="rounded border border-border p-3 bg-white text-black min-h-[200px]" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
          ) : (
            <textarea value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} rows={10} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:ring-1 focus:ring-ring" />
          )}
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving || !name.trim()}><Save className="h-3.5 w-3.5 mr-1" />{t("common.save")}</Button>
            <Button variant="outline" onClick={() => setEditing(null)}>{t("common.cancel")}</Button>
          </div>
        </div>
      ) : loading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : (
        <div className="space-y-2">
          {templates.map((t) => (
            <button key={t.id} type="button" onClick={() => startEdit(t)} className="w-full text-left rounded-lg border border-border bg-card p-3 hover:bg-muted/50 transition-colors">
              <p className="font-medium text-sm">{t.name}</p>
              <p className="text-xs text-muted-foreground">Subject: {t.subject} · Updated: {t.updatedAt}</p>
            </button>
          ))}
          {templates.length === 0 && <p className="text-center text-muted-foreground py-8">{t("admin.emailTemplates.noTemplates")}</p>}
        </div>
      )}
    </div>
  );
}
