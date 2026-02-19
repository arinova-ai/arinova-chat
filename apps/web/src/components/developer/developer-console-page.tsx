"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import {
  ArrowLeft,
  Plus,
  Loader2,
  Package,
  ExternalLink,
  Copy,
  RefreshCw,
  Trash2,
  Eye,
  EyeOff,
  BarChart3,
  Users,
  Zap,
  DollarSign,
  Check,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DevApp {
  id: string;
  name: string;
  description: string | null;
  category: string;
  externalUrl: string;
  iconUrl: string | null;
  status: "draft" | "published" | "suspended";
}

interface Credentials {
  clientId: string;
  redirectUris: string[];
}

interface AppStats {
  apiCalls: number;
  uniqueUsers: number;
  transactions: number;
  totalTransactionAmount: number;
}

const CATEGORIES = ["game", "strategy", "social", "puzzle", "tool", "other"];

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-yellow-500/20 text-yellow-400",
  published: "bg-green-500/20 text-green-400",
  suspended: "bg-red-500/20 text-red-400",
};

const CATEGORY_COLORS: Record<string, string> = {
  game: "bg-purple-500/20 text-purple-400",
  strategy: "bg-blue-500/20 text-blue-400",
  social: "bg-pink-500/20 text-pink-400",
  puzzle: "bg-amber-500/20 text-amber-400",
  tool: "bg-cyan-500/20 text-cyan-400",
  other: "bg-neutral-500/20 text-neutral-400",
};

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function DeveloperConsolePage() {
  const router = useRouter();
  const [apps, setApps] = useState<DevApp[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [detailApp, setDetailApp] = useState<DevApp | null>(null);

  const fetchApps = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ apps: DevApp[] }>("/api/developer/apps");
      setApps(data.apps);
    } catch {
      // handled by api()
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApps();
  }, [fetchApps]);

  return (
    <div className="flex h-dvh flex-col bg-background">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-neutral-800 px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-semibold">Developer Console</h1>
        <div className="flex-1" />
        <Button className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Create App
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : apps.length === 0 ? (
          <div className="flex h-60 flex-col items-center justify-center gap-4 text-muted-foreground">
            <Package className="h-12 w-12" />
            <p className="text-lg font-medium">Create your first app</p>
            <p className="text-sm">
              Build and publish apps for the Arinova platform.
            </p>
            <Button className="gap-2" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create App
            </Button>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl space-y-3">
            {apps.map((app) => (
              <button
                key={app.id}
                onClick={() => setDetailApp(app)}
                className="flex w-full items-center gap-4 rounded-lg border border-neutral-800 bg-card p-4 text-left transition-colors hover:border-neutral-700"
              >
                {app.iconUrl ? (
                  <img
                    src={app.iconUrl}
                    alt={app.name}
                    className="h-10 w-10 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-800">
                    <Package className="h-5 w-5 text-neutral-500" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{app.name}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
                        STATUS_BADGE[app.status] ?? STATUS_BADGE.draft
                      }`}
                    >
                      {app.status}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        CATEGORY_COLORS[app.category.toLowerCase()] ??
                        CATEGORY_COLORS.other
                      }`}
                    >
                      {app.category}
                    </span>
                    <span className="flex items-center gap-1 truncate">
                      <ExternalLink className="h-3 w-3" />
                      {app.externalUrl}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Create App Dialog */}
      <CreateAppDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          setCreateOpen(false);
          fetchApps();
        }}
      />

      {/* App Detail Dialog */}
      {detailApp && (
        <AppDetailDialog
          app={detailApp}
          open={!!detailApp}
          onOpenChange={(open) => {
            if (!open) setDetailApp(null);
          }}
          onUpdated={fetchApps}
          onDeleted={() => {
            setDetailApp(null);
            fetchApps();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Create App Dialog                                                  */
/* ------------------------------------------------------------------ */

function CreateAppDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("game");
  const [externalUrl, setExternalUrl] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName("");
    setDescription("");
    setCategory("game");
    setExternalUrl("");
    setIconUrl("");
  };

  const handleCreate = async () => {
    if (!name.trim() || !externalUrl.trim()) return;
    setSaving(true);
    try {
      await api("/api/developer/apps", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          category,
          externalUrl: externalUrl.trim(),
          iconUrl: iconUrl.trim() || undefined,
        }),
      });
      reset();
      onCreated();
    } catch {
      // handled
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create App</DialogTitle>
          <DialogDescription>
            Fill in the details to create a new app.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Name *
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Awesome App"
              className="bg-neutral-800 border-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Description
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short description of your app"
              className="bg-neutral-800 border-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Category *
            </label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full bg-neutral-800 border-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              External URL *
            </label>
            <Input
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              placeholder="https://myapp.example.com"
              className="bg-neutral-800 border-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Icon URL
            </label>
            <Input
              value={iconUrl}
              onChange={(e) => setIconUrl(e.target.value)}
              placeholder="https://example.com/icon.png"
              className="bg-neutral-800 border-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={saving || !name.trim() || !externalUrl.trim()}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  App Detail / Edit Dialog                                           */
/* ------------------------------------------------------------------ */

function AppDetailDialog({
  app,
  open,
  onOpenChange,
  onUpdated,
  onDeleted,
}: {
  app: DevApp;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onUpdated: () => void;
  onDeleted: () => void;
}) {
  // Edit form state
  const [name, setName] = useState(app.name);
  const [description, setDescription] = useState(app.description ?? "");
  const [category, setCategory] = useState(app.category);
  const [externalUrl, setExternalUrl] = useState(app.externalUrl);
  const [iconUrl, setIconUrl] = useState(app.iconUrl ?? "");
  const [saving, setSaving] = useState(false);

  // Credentials
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [loadingCreds, setLoadingCreds] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  // Stats
  const [stats, setStats] = useState<AppStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Delete
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Publishing
  const [publishing, setPublishing] = useState(false);

  // Clipboard feedback
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Reset form when app changes
  useEffect(() => {
    setName(app.name);
    setDescription(app.description ?? "");
    setCategory(app.category);
    setExternalUrl(app.externalUrl);
    setIconUrl(app.iconUrl ?? "");
    setNewSecret(null);
    setShowSecret(false);
    setConfirmDelete(false);
  }, [app]);

  // Fetch credentials & stats on open
  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoadingCreds(true);
      try {
        const creds = await api<Credentials>(
          `/api/developer/apps/${app.id}/credentials`
        );
        setCredentials(creds);
      } catch {
        // handled
      } finally {
        setLoadingCreds(false);
      }
    })();
    (async () => {
      setLoadingStats(true);
      try {
        const s = await api<AppStats>(
          `/api/developer/apps/${app.id}/stats`
        );
        setStats(s);
      } catch {
        // handled
      } finally {
        setLoadingStats(false);
      }
    })();
  }, [open, app.id]);

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api(`/api/developer/apps/${app.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          category,
          externalUrl: externalUrl.trim(),
          iconUrl: iconUrl.trim() || undefined,
        }),
      });
      onUpdated();
    } catch {
      // handled
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const action = app.status === "published" ? "unpublish" : "publish";
      await api(`/api/developer/apps/${app.id}/${action}`, {
        method: "POST",
      });
      onUpdated();
      onOpenChange(false);
    } catch {
      // handled
    } finally {
      setPublishing(false);
    }
  };

  const handleRegenerateSecret = async () => {
    setRegenerating(true);
    try {
      const data = await api<{ clientSecret: string }>(
        `/api/developer/apps/${app.id}/regenerate-secret`,
        { method: "POST" }
      );
      setNewSecret(data.clientSecret);
      setShowSecret(true);
    } catch {
      // handled
    } finally {
      setRegenerating(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api(`/api/developer/apps/${app.id}`, { method: "DELETE" });
      onDeleted();
    } catch {
      // handled
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>App Settings</DialogTitle>
          <DialogDescription>
            Manage your app configuration, credentials, and publishing.
          </DialogDescription>
        </DialogHeader>

        {/* ---- Edit Form ---- */}
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-neutral-800 border-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Description
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-neutral-800 border-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Category
            </label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full bg-neutral-800 border-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              External URL
            </label>
            <Input
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              className="bg-neutral-800 border-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Icon URL
            </label>
            <Input
              value={iconUrl}
              onChange={(e) => setIconUrl(e.target.value)}
              className="bg-neutral-800 border-none"
            />
          </div>
          <Button
            onClick={handleSave}
            disabled={saving || !name.trim() || !externalUrl.trim()}
            className="w-full"
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </div>

        <Separator className="my-2" />

        {/* ---- Credentials ---- */}
        <div>
          <h3 className="mb-3 text-sm font-semibold">Credentials</h3>
          {loadingCreds ? (
            <div className="flex h-16 items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : credentials ? (
            <div className="space-y-3">
              {/* Client ID */}
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  Client ID
                </label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-neutral-800 px-2 py-1.5 text-xs">
                    {credentials.clientId}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() =>
                      copyToClipboard(credentials.clientId, "clientId")
                    }
                  >
                    {copiedField === "clientId" ? (
                      <Check className="h-3 w-3 text-green-400" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Redirect URIs */}
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  Redirect URIs
                </label>
                {credentials.redirectUris.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No redirect URIs configured.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {credentials.redirectUris.map((uri, i) => (
                      <code
                        key={i}
                        className="block truncate rounded bg-neutral-800 px-2 py-1.5 text-xs"
                      >
                        {uri}
                      </code>
                    ))}
                  </div>
                )}
              </div>

              {/* Regenerate Secret */}
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-2"
                  onClick={handleRegenerateSecret}
                  disabled={regenerating}
                >
                  {regenerating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  Regenerate Secret
                </Button>
                {newSecret && (
                  <div className="mt-2 rounded border border-yellow-500/30 bg-yellow-500/10 p-2">
                    <p className="mb-1 text-[10px] font-semibold uppercase text-yellow-400">
                      Save this secret -- it will not be shown again
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 truncate text-xs">
                        {showSecret
                          ? newSecret
                          : newSecret.replace(/./g, "\u2022")}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => setShowSecret((v) => !v)}
                      >
                        {showSecret ? (
                          <EyeOff className="h-3 w-3" />
                        ) : (
                          <Eye className="h-3 w-3" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() =>
                          copyToClipboard(newSecret, "secret")
                        }
                      >
                        {copiedField === "secret" ? (
                          <Check className="h-3 w-3 text-green-400" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Could not load credentials.
            </p>
          )}
        </div>

        <Separator className="my-2" />

        {/* ---- Stats ---- */}
        <div>
          <h3 className="mb-3 text-sm font-semibold">Usage Stats</h3>
          {loadingStats ? (
            <div className="flex h-16 items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                icon={<Zap className="h-4 w-4 text-blue-400" />}
                label="API Calls"
                value={stats.apiCalls.toLocaleString()}
              />
              <StatCard
                icon={<Users className="h-4 w-4 text-green-400" />}
                label="Unique Users"
                value={stats.uniqueUsers.toLocaleString()}
              />
              <StatCard
                icon={<BarChart3 className="h-4 w-4 text-purple-400" />}
                label="Transactions"
                value={stats.transactions.toLocaleString()}
              />
              <StatCard
                icon={<DollarSign className="h-4 w-4 text-amber-400" />}
                label="Total Amount"
                value={`$${stats.totalTransactionAmount.toLocaleString()}`}
              />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Could not load stats.
            </p>
          )}
        </div>

        <Separator className="my-2" />

        {/* ---- Actions ---- */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="secondary"
            className="flex-1 gap-2"
            onClick={handlePublish}
            disabled={publishing}
          >
            {publishing && <Loader2 className="h-4 w-4 animate-spin" />}
            {app.status === "published" ? "Unpublish" : "Publish"}
          </Button>

          {!confirmDelete ? (
            <Button
              variant="ghost"
              className="gap-2 border border-red-900/60 text-red-200 hover:border-red-800/70 hover:bg-red-950/30"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          ) : (
            <Button
              variant="ghost"
              className="gap-2 border border-red-600 bg-red-950/50 text-red-300 hover:bg-red-950/70"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Confirm Delete
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Small stat card                                                    */
/* ------------------------------------------------------------------ */

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      {icon}
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}
